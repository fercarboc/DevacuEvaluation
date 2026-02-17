import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://debacu.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    Vary: "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function userClient(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: auth } },
  });
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function readBody(req: Request) {
  const t = await req.text();
  if (!t) return {};
  try { return JSON.parse(t); } catch { return {}; }
}

function safeLowerEmail(v: any) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
      return json(req, 500, { error: "Server misconfigured" });
    }

    const sbUser = userClient(req);
    const { data: u, error: uErr } = await sbUser.auth.getUser();
    if (uErr || !u?.user) return json(req, 401, { error: "UNAUTHENTICATED" });

    const auth_user_id = u.user.id;
    const email = safeLowerEmail(u.user.email);
    if (!email) return json(req, 400, { error: "Missing user email" });

    const body = await readBody(req);
    const org_id = (body?.orgId ?? body?.org_id ?? null) as string | null;

    // Si te pasan org_id, lo usamos para acotar; si no, buscamos por invited_email
    let q = admin
      .from("debacu_eval_org_members")
      .select("id, org_id, status, role, invited_email, auth_user_id")
      .eq("status", "INVITED")
      .eq("invited_email", email);

    if (org_id) q = q.eq("org_id", org_id);

    const { data: member, error: mErr } = await q.order("created_at", { ascending: true }).limit(1).maybeSingle();

    if (mErr) return json(req, 500, { error: "DB error (find invite)", detail: mErr.message });
    if (!member?.id) {
      // idempotencia: si ya está activo, no petar
      const { data: active } = await admin
        .from("debacu_eval_org_members")
        .select("id, org_id, status")
        .eq("status", "ACTIVE")
        .eq("auth_user_id", auth_user_id)
        .limit(1)
        .maybeSingle();

      if (active?.id) return json(req, 200, { ok: true, mode: "ALREADY_ACTIVE", org_id: active.org_id });
      return json(req, 404, { error: "No INVITED membership found for this email" });
    }

    const now = new Date().toISOString();

    const { error: updErr } = await admin
      .from("debacu_eval_org_members")
      .update({
        status: "ACTIVE",
        auth_user_id,
        updated_at: now,
      })
      .eq("id", member.id);

    if (updErr) {
      // si tu unique partial de ACTIVE por auth_user_id salta, aquí lo verás
      return json(req, 409, { error: "ACTIVATION_FAILED", detail: updErr.message });
    }

    return json(req, 200, { ok: true, mode: "ACTIVATED", org_id: member.org_id });
  } catch (e: any) {
    return json(req, 500, { error: "Unexpected", detail: e?.message ?? String(e) });
  }
});
