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

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://debacu.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // ✅ JWT-only, sin x-session-token
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8" },
  });
}

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
const SUPABASE_URL = mustEnv("SUPABASE_URL");
const ANON_KEY = mustEnv("SUPABASE_ANON_KEY");
const SERVICE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

function userClient(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function requireJwtUser(req: Request) {
  const sb = userClient(req);
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");
  return data.user;
}

/** ======================================================
 *  AuthZ: org membership -> customer_id (entitlements view -> org fallback)
 *  ====================================================== */
async function requireOrgMemberAndCustomerId(user_id: string) {
  const { data: mem, error: memErr } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, role, created_at")
    .eq("user_id", user_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memErr) throw new Error(`MEMBERSHIP_FAILED:${memErr.message}`);
  if (!mem?.org_id) throw new Error("FORBIDDEN_NO_ORG");

  const org_id = String(mem.org_id);

  let customer_id: string | null = null;

  // view (si existe)
  try {
    const { data: ent, error: entErr } = await admin
      .from("debacu_eval_org_entitlements_v")
      .select("customer_id")
      .eq("org_id", org_id)
      .maybeSingle();

    if (!entErr && ent?.customer_id) customer_id = String(ent.customer_id);
  } catch {
    // ignore
  }

  if (!customer_id) {
    const { data: org, error: orgErr } = await admin
      .from("debacu_eval_organizations")
      .select("customer_id")
      .eq("id", org_id)
      .maybeSingle();

    if (orgErr) throw new Error(`ORG_LOOKUP_FAILED:${orgErr.message}`);
    if (!org?.customer_id) throw new Error("FORBIDDEN_NO_CUSTOMER");
    customer_id = String(org.customer_id);
  }

  return { org_id, customer_id, role: mem.role ?? null };
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
export default Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  try {
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json(req, 401, { ok: false, error: "Missing Authorization Bearer token" });
    }

    const body = await req.json().catch(() => ({}));
    const appId = String(body?.app_id ?? body?.appId ?? "DEBACU_EVAL");

    const user = await requireJwtUser(req);
    const { customer_id: customerId } = await requireOrgMemberAndCustomerId(user.id);

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

    return json(req, 200, {
      ok: true,
      meta: { customer_id: customerId, app_id: appId },
      profile: profile ?? null,
      audit_ok: audit.audit_ok,
      missing_fields: audit.missing_fields,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const code =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg.startsWith("FORBIDDEN") || msg.startsWith("MEMBERSHIP_FAILED") || msg.startsWith("ORG_LOOKUP_FAILED")
        ? 403
        : msg.startsWith("DB_")
        ? 500
        : 500;

    console.error("debacu_eval_hotel_profile_get error:", e);
    return json(req, code, { ok: false, error: "request_failed", detail: msg });
  }
});
