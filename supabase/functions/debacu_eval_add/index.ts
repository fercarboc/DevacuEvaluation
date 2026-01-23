import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    // ✅ añadimos x-session-token
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-session-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}

async function requireSession(token: string, app_code: string) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("debacu_eval_sessions")
    .select("*")
    .eq("token", token)
    .eq("app_code", app_code)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .maybeSingle();

  if (error) return null;
  return data ?? null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function pickString(v: unknown) {
  return String(v ?? "").trim();
}

serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json(origin, 405, { error: "Method not allowed" });

  try {
    // ✅ Token de sesión propia (NO usamos Authorization porque ahí va el ANON key)
    const token = (req.headers.get("x-session-token") || "").trim();
    if (!token) return json(origin, 401, { error: "Missing token" });

    // ✅ Esperamos body: { app_code, accept_declaration, input }
    const body = await req.json().catch(() => null);
    if (!body) return json(origin, 400, { error: "Invalid JSON body" });

    const app_code = pickString(body.app_code ?? body.appCode);
    const accept_declaration = body.accept_declaration ?? body.acceptDeclaration;
    const input = body.input;

    if (!app_code || !input) return json(origin, 400, { error: "Missing app_code/input" });
    if (accept_declaration !== true) {
      return json(origin, 400, { error: "Debes aceptar la declaración de veracidad." });
    }

    const session = await requireSession(token, app_code);
    if (!session) return json(origin, 401, { error: "Invalid/expired session" });

    // ✅ Snake_case input esperado (permitimos también camelCase por compat temporal)
    const document = pickString(input.document);
    const full_name = pickString(input.full_name ?? input.fullName);
    const rating = Number(input.rating ?? 0);

    if (!document || !full_name) {
      return json(origin, 400, { error: "document y full_name son obligatorios." });
    }
    if (!(rating >= 1 && rating <= 5)) {
      return json(origin, 400, { error: "rating debe ser 1..5" });
    }

    const payload = {
      document,
      full_name,
      nationality: pickString(input.nationality) || null,
      phone: pickString(input.phone) || null,
      email: pickString(input.email).toLowerCase() || null,
      rating,
      comment: pickString(input.comment).slice(0, 240) || null,
      platform: pickString(input.platform) || "DEBACU_EVAL",
      evaluation_date:
        pickString(input.evaluation_date ?? input.evaluationDate) || todayISO(),
      creator_customer_id: session.customer_id ?? null,
      creator_customer_name: session.customer_name ?? null,
    };

    const { data, error } = await supabase
      .from("debacu_evaluations")
      .insert(payload) // ✅ objeto (supabase-js acepta objeto o array)
      .select(
        "id, document, full_name, phone, email, nationality, rating, comment, platform, evaluation_date, creator_customer_id, creator_customer_name, created_at"
      )
      .single();

    if (error) {
      return json(origin, 500, {
        error: "Insert error",
        details: error.message,
        hint: (error as any).hint,
        code: (error as any).code,
      });
    }

    return json(origin, 200, { ok: true, row: data });
  } catch (e: any) {
    return json(origin, 500, {
      error: "Unexpected error",
      details: String(e?.message ?? e),
    });
  }
});
