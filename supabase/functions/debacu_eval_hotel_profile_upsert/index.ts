import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/** CORS */
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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function toNumOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toIntOrNull(v: any): number | null {
  const n = toNumOrNull(v);
  if (n === null) return null;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toBool(v: any): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return Boolean(v);
}

function isHHMM(v: any) {
  const s = safeStr(v);
  if (!s) return true;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** Clients */
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
  try {
    const { data: ent, error: entErr } = await admin
      .from("debacu_eval_org_entitlements_v")
      .select("customer_id")
      .eq("org_id", org_id)
      .maybeSingle();
    if (!entErr && ent?.customer_id) customer_id = String(ent.customer_id);
  } catch {}

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

/** Audit */
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
  const hotel_category = params.hotel_category ?? null;
  const currency = safeStr(params.currency) || null;
  const timezone = safeStr(params.timezone) || null;
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

/** Handler */
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

    const hotel_category = clamp(Number(body?.hotel_category ?? 3), 1, 5);

    const occupancy_target =
      body?.occupancy_target === null || body?.occupancy_target === undefined
        ? null
        : clamp(Number(body.occupancy_target), 0, 1);

    const cancellation_rate_target =
      body?.cancellation_rate_target === null || body?.cancellation_rate_target === undefined
        ? null
        : clamp(Number(body.cancellation_rate_target), 0, 1);

    const revpar_target = toNumOrNull(body?.revpar_target);

    const checkin_time = body?.checkin_time ?? null;
    const checkout_time = body?.checkout_time ?? null;
    if (!isHHMM(checkin_time)) throw new Error("VALIDATION_CHECKIN_TIME");
    if (!isHHMM(checkout_time)) throw new Error("VALIDATION_CHECKOUT_TIME");

    const rooms_count = toIntOrNull(body?.rooms_count);
    const max_occupancy = toIntOrNull(body?.max_occupancy);

    const nowIso = new Date().toISOString();

    const row: any = {
      customer_id: customerId,
      app_id: appId,

      hotel_name: body?.hotel_name ?? null,
      property_type: body?.property_type ?? null,
      hotel_category,

      country: body?.country ?? null,
      province: body?.province ?? null,
      city: body?.city ?? null,
      address: body?.address ?? null,
      postal_code: body?.postal_code ?? null,

      contact_email: body?.contact_email ?? null,
      contact_phone: body?.contact_phone ?? null,
      contact_person: body?.contact_person ?? null,
      contact_role: body?.contact_role ?? null,

      monthly_stays_estimated: toNumOrNull(body?.monthly_stays_estimated),
      adr_real: toNumOrNull(body?.adr_real),
      season_mult_high: toNumOrNull(body?.season_mult_high),
      season_mult_low: toNumOrNull(body?.season_mult_low),
      currency: body?.currency ?? "EUR",

      occupancy_target,
      cancellation_rate_target,
      revpar_target,

      timezone: body?.timezone ?? null,
      checkin_time,
      checkout_time,
      rooms_count,
      max_occupancy,

      monthly_revenue_estimate: toNumOrNull(body?.monthly_revenue_estimate),

      has_restaurant: toBool(body?.has_restaurant),
      has_spa: toBool(body?.has_spa),
      has_parking: toBool(body?.has_parking),
      allows_pets: toBool(body?.allows_pets),

      updated_at: nowIso,
    };

    const { data: upserted, error: upErr } = await admin
      .from("debacu_eval_hotel_profile")
      .upsert(row, { onConflict: "customer_id,app_id" })
      .select("*")
      .single();

    if (upErr) throw new Error(`DB_UPSERT:${upErr.message}`);

    const audit = computeAudit({
      country: upserted?.country ?? null,
      province: upserted?.province ?? null,
      city: upserted?.city ?? null,
      property_type: upserted?.property_type ?? null,
      hotel_category: upserted?.hotel_category ?? null,
      currency: upserted?.currency ?? null,
      timezone: upserted?.timezone ?? null,
      rooms_count: upserted?.rooms_count ?? null,
    });

    // flags profile_completed/profile_completed_at
    const prevCompleted = Boolean(upserted?.profile_completed);
    const nextCompleted = audit.audit_ok;

    let nextCompletedAt: string | null = upserted?.profile_completed_at ?? null;
    if (nextCompleted && !prevCompleted) nextCompletedAt = nowIso;
    if (!nextCompleted) nextCompletedAt = null;

    let finalRow = upserted;

    if (
      prevCompleted !== nextCompleted ||
      String(upserted?.profile_completed_at ?? "") !== String(nextCompletedAt ?? "")
    ) {
      const { data: patched, error: patchErr } = await admin
        .from("debacu_eval_hotel_profile")
        .update({
          profile_completed: nextCompleted,
          profile_completed_at: nextCompletedAt,
          updated_at: nowIso,
        })
        .eq("customer_id", customerId)
        .eq("app_id", appId)
        .select("*")
        .single();

      if (patchErr) throw new Error(`DB_PROFILE_FLAGS_UPDATE:${patchErr.message}`);
      finalRow = patched;
    }

    return json(req, 200, {
      ok: true,
      profile: finalRow,
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
        : msg.startsWith("VALIDATION_")
        ? 400
        : msg.startsWith("DB_")
        ? 500
        : 500;

    console.error("debacu_eval_hotel_profile_upsert error:", e);
    return json(req, code, { ok: false, error: "request_failed", detail: msg });
  }
});
