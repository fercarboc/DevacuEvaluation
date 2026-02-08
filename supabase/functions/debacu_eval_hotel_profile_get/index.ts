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
    "Vary": "Origin",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-session-token",
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

/** ======================================================
 *  Utils
 *  ====================================================== */
function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

/** ======================================================
 *  Clients
 *  ====================================================== */
function userClient(req: Request, supabaseUrl: string, anonKey: string) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
}

function adminClient(supabaseUrl: string, serviceKey: string) {
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** ======================================================
 *  Auth
 *  ====================================================== */
async function requireJwtUser(sbUser: ReturnType<typeof createClient>) {
  const { data, error } = await sbUser.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");
  return data.user;
}

async function requireEvalSession(params: {
  admin: ReturnType<typeof createClient>;
  token: string;
  app_code?: string;
}) {
  const { admin, token, app_code } = params;
  const now = Date.now();

  const { data, error } = await admin
    .from("debacu_eval_sessions")
    .select("customer_id, app_code, revoked_at, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (error) throw new Error(`SESSION_CHECK_FAILED:${error.message}`);
  if (!data) throw new Error("SESSION_INVALID");
  if (data.revoked_at) throw new Error("SESSION_REVOKED");

  if (app_code && String(data.app_code ?? "") !== String(app_code)) {
    throw new Error("SESSION_APP_MISMATCH");
  }

  if (data.expires_at) {
    const exp = new Date(String(data.expires_at)).getTime();
    if (!Number.isFinite(exp) || exp < now) throw new Error("SESSION_EXPIRED");
  }

  const customerId = String(data.customer_id ?? "");
  if (!customerId) throw new Error("SESSION_NO_CUSTOMER");

  return { customerId };
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
    return json(origin, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const SUPABASE_URL = mustEnv("SUPABASE_URL");
    const ANON_KEY = mustEnv("SUPABASE_ANON_KEY");
    const SERVICE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json(origin, 401, { ok: false, error: "Missing Authorization Bearer token" });
    }

    const sessionToken = safeStr(req.headers.get("x-session-token"));
    if (!sessionToken) {
      return json(origin, 401, { ok: false, error: "Missing x-session-token" });
    }

    const body = await req.json().catch(() => ({}));
    const appId = String(body?.app_id ?? body?.appId ?? "DEBACU_EVAL");

    const admin = adminClient(SUPABASE_URL, SERVICE_KEY);
    const sbUser = userClient(req, SUPABASE_URL, ANON_KEY);

    await requireJwtUser(sbUser);

    const { customerId } = await requireEvalSession({
      admin,
      token: sessionToken,
      app_code: appId,
    });

    // 1) location desde customers
    const { data: cust, error: custErr } = await admin
      .from("customers")
      .select("id, country, province, city")
      .eq("id", customerId)
      .maybeSingle();

    if (custErr) throw new Error(`DB_CUSTOMERS_GET:${custErr.message}`);

    // 2) profile desde debacu_eval_hotel_profile
    const { data: profile, error: pErr } = await admin
      .from("debacu_eval_hotel_profile")
      .select("*")
      .eq("customer_id", customerId)
      .eq("app_id", appId)
      .maybeSingle();

    if (pErr) throw new Error(`DB_PROFILE_GET:${pErr.message}`);

    return json(origin, 200, {
      ok: true,
      meta: { customer_id: customerId, app_id: appId },
      profile: profile ?? null,
      location: {
        country: cust?.country ?? null,
        province: cust?.province ?? null,
        city: cust?.city ?? null,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    const status =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg.startsWith("SESSION_")
        ? 401
        : msg.startsWith("DB_")
        ? 500
        : 500;

    return json(origin, status, { ok: false, error: "Request failed", detail: msg });
  }
});
