// supabase/functions/debacu_eval_hotel_profile_upsert/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

/** ======================================================
 * Types
 * ====================================================== */
type Body = {
  org_id?: string | null;
  app_id?: string | null;
  appId?: string | null;

  hotel_name?: string | null;
  property_type?: string | null;
  hotel_category?: number | null;

  country?: string | null;
  province?: string | null;
  city?: string | null;
  address?: string | null;
  postal_code?: string | null;

  contact_email?: string | null;
  contact_phone?: string | null;
  contact_person?: string | null;
  contact_role?: string | null;

  monthly_stays_estimated?: any;
  adr_real?: any;
  season_mult_high?: any;
  season_mult_low?: any;
  currency?: string | null;

  occupancy_target?: any;
  cancellation_rate_target?: any;
  revpar_target?: any;

  timezone?: string | null;
  checkin_time?: string | null;
  checkout_time?: string | null;
  rooms_count?: any;
  max_occupancy?: any;

  monthly_revenue_estimate?: any;

  has_restaurant?: any;
  has_spa?: any;
  has_parking?: any;
  allows_pets?: any;
};

type AuditState = { audit_ok: boolean; missing_fields: string[] };

/** ======================================================
 * Errors
 * ====================================================== */
function err(code: string, detail?: string) {
  return { ok: false, error: "request_failed", detail: detail ? `${code}:${detail}` : code };
}

/** ======================================================
 * Helpers
 * ====================================================== */
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
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return Boolean(v);
}
function isHHMM(v: any) {
  const s = safeStr(v);
  if (!s) return true; // allow null/empty
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

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

/** ======================================================
 * Multi-org resolution
 * ====================================================== */
async function resolveOrgId(
  supabase: ReturnType<typeof supabaseServiceClient>,
  authUserId: string,
  orgIdFromBody: string | null | undefined,
): Promise<string | null> {
  const orgId = safeStr(orgIdFromBody);
  if (orgId) {
    const { data, error } = await supabase
      .from("debacu_eval_org_members")
      .select("org_id")
      .eq("org_id", orgId)
      .eq("auth_user_id", authUserId) // ⚠️ si tu columna es user_id, cambia aquí
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (error) return null;
    return data?.org_id ? String(data.org_id) : null;
  }

  const { data: rows, error } = await supabase
    .from("debacu_eval_org_members")
    .select("org_id, created_at")
    .eq("auth_user_id", authUserId) // ⚠️ si tu columna es user_id, cambia aquí
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) return null;
  return rows?.[0]?.org_id ? String(rows[0].org_id) : null;
}

async function resolveCustomerId(
  supabase: ReturnType<typeof supabaseServiceClient>,
  orgId: string,
): Promise<string | null> {
  try {
    const { data: ent, error: entErr } = await supabase
      .from("debacu_eval_org_entitlements_v")
      .select("customer_id")
      .eq("org_id", orgId)
      .maybeSingle();
    if (!entErr && ent?.customer_id) return String(ent.customer_id);
  } catch {
    // ignore (view may not exist)
  }

  const { data: org, error: orgErr } = await supabase
    .from("debacu_eval_organizations")
    .select("customer_id")
    .eq("id", orgId)
    .maybeSingle();

  if (orgErr) return null;
  return org?.customer_id ? String(org.customer_id) : null;
}

/** ======================================================
 * Handler
 * ====================================================== */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, err("method_not_allowed"));

  try {
    const user = await requireUser(req);

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return json(req, 400, err("invalid_json"));

    const appId = safeStr(body.app_id ?? body.appId) || "DEBACU_EVAL";
    const supabase = supabaseServiceClient();

    // ✅ multi-org
    const orgId = await resolveOrgId(supabase, user.id, body.org_id);
    if (!orgId) return json(req, 403, err("FORBIDDEN", "NO_ACTIVE_MEMBERSHIP"));

    const customerId = await resolveCustomerId(supabase, orgId);
    if (!customerId) return json(req, 403, err("FORBIDDEN", "NO_CUSTOMER_FOR_ORG"));

    // ---- validations / transforms
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
    if (!isHHMM(checkin_time)) return json(req, 400, err("invalid_checkin_time"));
    if (!isHHMM(checkout_time)) return json(req, 400, err("invalid_checkout_time"));

    const rooms_count = toIntOrNull(body?.rooms_count);
    const max_occupancy = toIntOrNull(body?.max_occupancy);

    const nowIso = new Date().toISOString();

    // Primera pasada: preparar campos principales
    const baseRow: any = {
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
      updated_by: user.id, // si no existe esta columna, quítala
    };

    // Upsert y obtener row
    const { data: upserted, error: upErr } = await supabase
      .from("debacu_eval_hotel_profile")
      .upsert(baseRow, { onConflict: "customer_id,app_id" })
      .select("*")
      .single();

    if (upErr) return json(req, 500, err("db_upsert_failed"));

    // Calcular audit sobre el resultado persistido
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

    // Flags en 1 write adicional SOLO si cambia (pero sin lógica frágil)
    const prevCompleted = Boolean(upserted?.profile_completed);
    const nextCompleted = audit.audit_ok;

    let nextCompletedAt: string | null = upserted?.profile_completed_at ?? null;
    if (nextCompleted && !prevCompleted) nextCompletedAt = nowIso;
    if (!nextCompleted) nextCompletedAt = null;

    let finalRow = upserted;

    const needPatch =
      prevCompleted !== nextCompleted ||
      String(upserted?.profile_completed_at ?? "") !== String(nextCompletedAt ?? "");

    if (needPatch) {
      const { data: patched, error: patchErr } = await supabase
        .from("debacu_eval_hotel_profile")
        .update({
          profile_completed: nextCompleted,
          profile_completed_at: nextCompletedAt,
          updated_at: nowIso,
          updated_by: user.id, // si no existe, quítala
        })
        .eq("customer_id", customerId)
        .eq("app_id", appId)
        .select("*")
        .single();

      if (patchErr) return json(req, 500, err("db_update_failed"));
      finalRow = patched;
    }

    return json(req, 200, {
      ok: true,
      meta: { org_id: orgId, customer_id: customerId, app_id: appId },
      profile: finalRow,
      audit_ok: audit.audit_ok,
      missing_fields: audit.missing_fields,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "");
    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return json(req, 401, err("UNAUTHENTICATED"));
    }
    return json(req, 500, err("internal_error"));
  }
});
