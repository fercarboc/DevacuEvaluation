// supabase/functions/debacu_eval_account_update_profile/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/** ======================================================
 *  CORS
 *  ====================================================== */
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

function corsHeaders(origin: string | null) {
  const o = origin ?? "";
  const allowOrigin = ALLOWED_ORIGINS.has(o) ? o : "https://debacu.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    Vary: "Origin",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-session-token, x-debacu-session-token, x-debacu-eval-session-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function readSessionToken(req: Request) {
  return (
    safeStr(req.headers.get("x-session-token")) ||
    safeStr(req.headers.get("x-debacu-session-token")) ||
    safeStr(req.headers.get("x-debacu-eval-session-token"))
  );
}

async function readJson(req: Request) {
  const t = await req.text();
  if (!t) return {};
  try {
    return JSON.parse(t);
  } catch {
    return {};
  }
}

/** ======================================================
 *  Types
 *  ====================================================== */
type ReqBody = {
  customer_id: string;
  app_id?: string;
  patch: {
    name?: string | null;
    nif?: string | null;
    address?: string | null;
    postal_code?: string | null;
    city?: string | null;
    province?: string | null;
    country?: string | null;
    phone?: string | null;
    email?: string | null;

    // opcionales (si los usas después)
    commercial_name?: string | null;
    legal_name?: string | null;
    billing_email?: string | null;
    billing_phone?: string | null;
    contact_person?: string | null;
    contact_role?: string | null;
  };
};

/** ======================================================
 *  Helpers: build update patch (NO pisa con null si no viene)
 *  - undefined => no tocar columna
 *  - null => borrar columna
 * ====================================================== */
function buildCustomerUpdate(patch: ReqBody["patch"]) {
  const u: Record<string, any> = {};

  const setIfDefined = (key: string, value: any) => {
    if (value !== undefined) u[key] = value;
  };

  // UI manda "name" como nombre comercial: guardo ambos
  if (patch.name !== undefined) {
    setIfDefined("name", patch.name);
    setIfDefined("commercial_name", patch.name);
  }

  setIfDefined("nif", patch.nif);
  setIfDefined("address", patch.address);
  setIfDefined("postal_code", patch.postal_code);
  setIfDefined("city", patch.city);
  setIfDefined("province", patch.province);

  if (patch.country !== undefined) {
    const c = typeof patch.country === "string" ? patch.country.trim() : patch.country;
    setIfDefined("country", typeof c === "string" ? c.toUpperCase() : c);
  }

  setIfDefined("phone", patch.phone);
  setIfDefined("email", patch.email);

  // Extras (por si los usas)
  setIfDefined("commercial_name", patch.commercial_name);
  setIfDefined("legal_name", patch.legal_name);
  setIfDefined("billing_email", patch.billing_email);
  setIfDefined("billing_phone", patch.billing_phone);
  setIfDefined("contact_person", patch.contact_person);
  setIfDefined("contact_role", patch.contact_role);

  return u;
}

function isMissingColumnError(message: string) {
  // PostgREST suele decir: "column <x> does not exist"
  return /column .* does not exist/i.test(message);
}

/** ======================================================
 *  Handler
 *  ====================================================== */
Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return json(origin, 405, { error: "Method not allowed" });
  }

  try {
    const SUPABASE_URL = mustEnv("SUPABASE_URL");
    const SERVICE_ROLE = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) JWT obligatorio
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) return json(origin, 401, { error: "Missing Authorization" });

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user?.id) return json(origin, 401, { error: "Invalid session" });

    const userId = userData.user.id;

    // 2) Body
    const body = (await readJson(req)) as Partial<ReqBody>;
    const customerId = safeStr(body?.customer_id);
    const appId = safeStr(body?.app_id) || "DEBACU_EVAL";
    if (!customerId) return json(origin, 400, { error: "customer_id required" });

    // 3) x-session-token obligatorio
    const sessionToken = readSessionToken(req);
    if (!sessionToken) return json(origin, 401, { error: "Missing x-session-token" });

    // 4) Validar sesión Debacu (token+customer+app y no revocada/expirada)
    const nowIso = new Date().toISOString();

    // Intento 1: si la tabla tiene user_id (lo ideal)
    let sess: any = null;

    const q1 = await admin
      .from("debacu_eval_sessions")
      .select("token, customer_id, app_code, expires_at, revoked_at, user_id")
      .eq("token", sessionToken)
      .eq("customer_id", customerId)
      .eq("app_code", appId)
      .is("revoked_at", null)
      .maybeSingle();

    if (q1.error && isMissingColumnError(q1.error.message)) {
      // Fallback: tabla sin user_id todavía
      const q2 = await admin
        .from("debacu_eval_sessions")
        .select("token, customer_id, app_code, expires_at, revoked_at")
        .eq("token", sessionToken)
        .eq("customer_id", customerId)
        .eq("app_code", appId)
        .is("revoked_at", null)
        .maybeSingle();

      if (q2.error) return json(origin, 500, { error: "SESSION_CHECK_FAILED", detail: q2.error.message });
      sess = q2.data;
    } else {
      if (q1.error) return json(origin, 500, { error: "SESSION_CHECK_FAILED", detail: q1.error.message });
      sess = q1.data;
    }

    if (!sess) return json(origin, 401, { error: "SESSION_INVALID" });
    if (sess.expires_at && String(sess.expires_at) <= nowIso) return json(origin, 401, { error: "SESSION_EXPIRED" });

    // 🔐 Si existe sess.user_id, debe coincidir con el auth.uid
    if (sess.user_id && String(sess.user_id) !== String(userId)) {
      return json(origin, 403, { error: "Not allowed" });
    }

    // 5) Whitelist patch
    const patch = (body?.patch ?? {}) as ReqBody["patch"];
    const update = buildCustomerUpdate(patch);

    if (Object.keys(update).length === 0) {
      return json(origin, 400, { error: "patch is empty" });
    }

    // 6) Update customers
    const { error: updErr } = await admin.from("customers").update(update).eq("id", customerId);
    if (updErr) return json(origin, 500, { error: "DB_UPDATE_FAILED", detail: updErr.message });

    return json(origin, 200, { ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json(origin, 500, { error: "Request failed", detail: msg });
  }
});
