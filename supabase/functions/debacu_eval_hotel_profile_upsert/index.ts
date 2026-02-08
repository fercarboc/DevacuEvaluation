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

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
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

    // ---- location (customers) ----
    const country = body?.country ?? null;
    const province = body?.province ?? null;
    const city = body?.city ?? null;

    const { error: custUpdErr } = await admin
      .from("customers")
      .update({
        country,
        province,
        city,
        updated_at: new Date().toISOString(), // quita si no existe
      })
      .eq("id", customerId);

    if (custUpdErr) throw new Error(`DB_CUSTOMERS_UPDATE:${custUpdErr.message}`);

    // ---- profile (hotel_profile) ----
    const hotel_category = clamp(Number(body?.hotel_category ?? 3), 1, 5);

    const occupancy_target =
      body?.occupancy_target === null || body?.occupancy_target === undefined
        ? null
        : clamp(Number(body.occupancy_target), 0, 1);

    const cancellation_rate_target =
      body?.cancellation_rate_target === null || body?.cancellation_rate_target === undefined
        ? null
        : clamp(Number(body.cancellation_rate_target), 0, 1);

    const row = {
      customer_id: customerId,
      app_id: appId,

      hotel_name: body?.hotel_name ?? null,
      property_type: body?.property_type ?? null,
      hotel_category,

      monthly_stays_estimated: body?.monthly_stays_estimated ?? null,
      adr_real: body?.adr_real ?? null,
      season_mult_high: body?.season_mult_high ?? null,
      season_mult_low: body?.season_mult_low ?? null,
      currency: body?.currency ?? "EUR",

      occupancy_target,
      cancellation_rate_target,
      revpar_target: body?.revpar_target ?? null,

      updated_at: new Date().toISOString(),
    };

    const { data, error } = await admin
      .from("debacu_eval_hotel_profile")
      .upsert(row, { onConflict: "customer_id,app_id" })
      .select("*")
      .single();

    if (error) throw new Error(`DB_UPSERT:${error.message}`);

    return json(origin, 200, {
      ok: true,
      profile: data,
      location: { country, province, city },
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
