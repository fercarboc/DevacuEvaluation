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
 *  Completeness / Audit
 *  ====================================================== */
type AuditState = { audit_ok: boolean; missing_fields: string[] };

function computeAudit(params: {
  country: string | null;
  province: string | null;
  city: string | null;

  property_type: string | null;
  hotel_category: number | null;
  currency: string | null;
  timezone: string | null;
  rooms_count: number | null;
}): AuditState {
  const miss: string[] = [];

  const country = safeStr(params.country) || null;
  const province = safeStr(params.province) || null;
  const city = safeStr(params.city) || null;

  const property_type = safeStr(params.property_type) || null;
  const currency = safeStr(params.currency) || null;
  const timezone = safeStr(params.timezone) || null;

  const hotel_category = params.hotel_category ?? null;
  const rooms_count = params.rooms_count ?? null;

  if (!property_type) miss.push("property_type");
  if (!country) miss.push("country");
  if (!province) miss.push("province");
  if (!city) miss.push("city");

  if (hotel_category === null || !Number.isFinite(Number(hotel_category))) miss.push("hotel_category");
  if (!currency) miss.push("currency");
  if (!timezone) miss.push("timezone");
  if (rooms_count === null || rooms_count <= 0) miss.push("rooms_count");

  return { audit_ok: miss.length === 0, missing_fields: miss };
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

    // ✅ TODO desde debacu_eval_hotel_profile (sin customers)
    const { data: profile, error: pErr } = await admin
      .from("debacu_eval_hotel_profile")
      .select("*")
      .eq("customer_id", customerId)
      .eq("app_id", appId)
      .maybeSingle();

    if (pErr) throw new Error(`DB_PROFILE_GET:${pErr.message}`);

    const audit = computeAudit({
      country: (profile as any)?.country ?? null,
      province: (profile as any)?.province ?? null,
      city: (profile as any)?.city ?? null,

      property_type: (profile as any)?.property_type ?? null,
      hotel_category: (profile as any)?.hotel_category ?? null,
      currency: (profile as any)?.currency ?? null,
      timezone: (profile as any)?.timezone ?? null,
      rooms_count: (profile as any)?.rooms_count ?? null,
    });

    return json(origin, 200, {
      ok: true,
      meta: { customer_id: customerId, app_id: appId },
      profile: profile ?? null,
      audit_ok: audit.audit_ok,
      missing_fields: audit.missing_fields,
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
