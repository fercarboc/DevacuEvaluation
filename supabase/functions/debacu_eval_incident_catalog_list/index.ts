// supabase/functions/debacu_eval_incident_catalog_list/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

/** ======================================================
 * Const
 * ====================================================== */
const APP_ID = "DEBACU_EVAL";

/** ======================================================
 * Types
 * ====================================================== */
type Body = {
  org_id?: string | null; // ✅ recomendado
  app_id?: string | null;
  appId?: string | null;
};

type BaseIncident = {
  incident_type: string;
  title: string | null;
  description: string | null;
  severity: number | null;
  default_gross_min: number | null;
  default_gross_max: number | null;
  default_recovery_pct: number | null;
  suggested_actions: string | null;
  is_active: boolean;
};

type HotelOverride = {
  incident_type: string;
  is_active: boolean | null;

  severity_override: number | null;
  default_gross_min_override: number | null;
  default_gross_max_override: number | null;
  default_recovery_pct_override: number | null;

  title_override: string | null;
  description_override: string | null;
  suggested_actions_override: string | null;
};

/** ======================================================
 * Errors
 * ====================================================== */
function err(code: string, detail?: string) {
  return { ok: false, error: "request_failed", detail: detail ? `${code}:${detail}` : code };
}
function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

/** ======================================================
 * Multi-org helpers
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
  // 1) entitlements view (si existe)
  try {
    const { data: ent, error: entErr } = await supabase
      .from("debacu_eval_org_entitlements_v")
      .select("customer_id")
      .eq("org_id", orgId)
      .maybeSingle();

    if (!entErr && ent?.customer_id) return String(ent.customer_id);
  } catch {
    // ignore
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
    const user = await requireUser(req);
    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return json(req, 400, err("invalid_json"));

    const appId = safeStr(body.app_id ?? body.appId) || APP_ID;

    const supabase = supabaseServiceClient();

    // ✅ multi-org
    const orgId = await resolveOrgId(supabase, user.id, body.org_id);
    if (!orgId) return json(req, 403, err("FORBIDDEN", "NO_ACTIVE_MEMBERSHIP"));

    const customerId = await resolveCustomerId(supabase, orgId);
    if (!customerId) return json(req, 403, err("FORBIDDEN", "NO_CUSTOMER_FOR_ORG"));

    // 1) Catálogo base global activo
    const { data: base, error: e1 } = await supabase
      .from("debacu_incident_catalog")
      .select(
        "incident_type,title,description,severity,default_gross_min,default_gross_max,default_recovery_pct,suggested_actions,is_active",
      )
      .eq("is_active", true)
      .order("incident_type", { ascending: true });

    if (e1) return json(req, 500, err("db_read_failed"));

    // 2) Overrides del hotel (incluye is_active=false)
    const { data: overrides, error: e2 } = await supabase
      .from("debacu_hotel_incident_overrides")
      .select(
        "incident_type,is_active,severity_override,default_gross_min_override,default_gross_max_override,default_recovery_pct_override,title_override,description_override,suggested_actions_override",
      )
      .eq("customer_id", customerId);

    if (e2) return json(req, 500, err("db_read_failed"));

    const overrideByType = new Map<string, HotelOverride>();
    for (const row of (overrides ?? []) as any[]) {
      const k = safeStr(row?.incident_type);
      if (!k) continue;
      overrideByType.set(k, {
        incident_type: k,
        is_active: row?.is_active ?? null,
        severity_override: row?.severity_override ?? null,
        default_gross_min_override: row?.default_gross_min_override ?? null,
        default_gross_max_override: row?.default_gross_max_override ?? null,
        default_recovery_pct_override: row?.default_recovery_pct_override ?? null,
        title_override: row?.title_override ?? null,
        description_override: row?.description_override ?? null,
        suggested_actions_override: row?.suggested_actions_override ?? null,
      });
    }

    // 3) Merge effective
    const items = ((base ?? []) as any[])
      .map((b) => {
        const g: BaseIncident = {
          incident_type: String(b.incident_type),
          title: b.title ?? null,
          description: b.description ?? null,
          severity: b.severity ?? null,
          default_gross_min: b.default_gross_min ?? null,
          default_gross_max: b.default_gross_max ?? null,
          default_recovery_pct: b.default_recovery_pct ?? null,
          suggested_actions: b.suggested_actions ?? null,
          is_active: !!b.is_active,
        };

        const ov = overrideByType.get(g.incident_type) ?? null;

        // is_active efectivo
        const isActive = ov ? (ov.is_active ?? true) : g.is_active;
        if (!isActive) return null;

        return {
          incident_type: g.incident_type,
          title: ov?.title_override ?? g.title,
          description: ov?.description_override ?? g.description,
          severity: ov?.severity_override ?? g.severity,
          default_gross_min: ov?.default_gross_min_override ?? g.default_gross_min,
          default_gross_max: ov?.default_gross_max_override ?? g.default_gross_max,
          default_recovery_pct: ov?.default_recovery_pct_override ?? g.default_recovery_pct,
          suggested_actions: ov?.suggested_actions_override ?? g.suggested_actions,
          is_active: true,
          source: ov ? "OVERRIDE" : "GLOBAL",
        };
      })
      .filter(Boolean) as any[];

    items.sort((a: any, b: any) => String(a.incident_type).localeCompare(String(b.incident_type)));

    return json(req, 200, {
      ok: true,
      appId,
      meta: { org_id: orgId, customer_id: customerId, app_id: APP_ID },
      items,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "");
    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return json(req, 401, err("UNAUTHENTICATED"));
    }
    return json(req, 500, err("internal_error"));
  }
});
