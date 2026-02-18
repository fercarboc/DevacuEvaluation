// supabase/functions/debacu_eval_hotel_profile_get/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

/** ======================================================
 * Types
 * ====================================================== */
type Body = {
  org_id?: string | null; // ✅ multi-org (recomendado)
  app_id?: string | null;
  appId?: string | null;
};

type AuditState = { audit_ok: boolean; missing_fields: string[] };

/** ======================================================
 * Helpers
 * ====================================================== */
function err(code: string, detail?: string) {
  return { ok: false, error: "request_failed", detail: detail ? `${code}:${detail}` : code };
}

function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
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

/**
 * ✅ multi-org:
 * - si viene org_id: validar membership ACTIVE
 * - si no viene: fallback determinista a primera ACTIVE (created_at asc)
 */
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
      .eq("auth_user_id", authUserId) // ⚠️ si tu columna es user_id, cámbiala aquí
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (error) return null;
    return data?.org_id ? String(data.org_id) : null;
  }

  const { data: rows, error } = await supabase
    .from("debacu_eval_org_members")
    .select("org_id, created_at")
    .eq("auth_user_id", authUserId) // ⚠️ si tu columna es user_id, cámbiala aquí
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) return null;
  return rows?.[0]?.org_id ? String(rows[0].org_id) : null;
}

/**
 * Resolver customer_id:
 * - prefer view entitlements
 * - fallback organizations.customer_id
 */
async function resolveCustomerId(
  supabase: ReturnType<typeof supabaseServiceClient>,
  orgId: string,
): Promise<string | null> {
  // 1) entitlements view (si existe)
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

  // 2) organizations fallback
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
    // ✅ JWT-only
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

    // ✅ read profile (service role)
    const { data: profile, error: pErr } = await supabase
      .from("debacu_eval_hotel_profile")
      .select("*")
      .eq("customer_id", customerId)
      .eq("app_id", appId)
      .maybeSingle();

    if (pErr) return json(req, 500, err("db_read_failed"));

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
      meta: { org_id: orgId, customer_id: customerId, app_id: appId },
      profile: profile ?? null,
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
