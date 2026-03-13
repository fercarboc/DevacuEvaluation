import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

const MEMBERSHIP_ACTIVE_VALUE = "ACTIVE";

type ReqBody = {
  action?: "PREVIEW" | "GENERATE";
  org_id?: string | null;
  property_id?: string | null;
  date_from?: string | null;
  date_to?: string | null;
};

type EntitlementsRow = {
  org_id: string;
  customer_id: string | null;
  subscription_status: string | null;
  plan_code: string | null;
  max_users: number | null;
  seats_used: number | null;
};

type PropertyRow = {
  id: string;
  org_id: string;
};

type RevenueDailyRow = {
  org_id: string;
  property_id: string;
  stay_date: string;
  rooms_sold: number | null;
  rooms_available: number | null;
  occupancy_pct: number | null;
  revenue_rooms: number | null;
  adr: number | null;
  revpar: number | null;
};

type AlertCandidate = {
  org_id: string;
  property_id: string;
  stay_date: string;
  alert_type: string;
  severity: string;
  metric_value: number | null;
  threshold_value: number | null;
  title: string;
  description: string;
  source: string;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function safeUpper(v?: string | null) {
  return String(v ?? "").trim().toUpperCase();
}

function isValidDate(v?: string | null) {
  if (!v) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function resolveOrgIdOrThrow(
  sb: ReturnType<typeof supabaseServiceClient>,
  authUserId: string,
  requestedOrgId?: string | null,
) {
  if (requestedOrgId) {
    const orgId = String(requestedOrgId).trim();
    if (!isUuid(orgId)) throw new Error("invalid_org_id");

    const { data, error } = await sb
      .from("debacu_eval_org_members")
      .select("org_id")
      .eq("auth_user_id", authUserId)
      .eq("org_id", orgId)
      .eq("status", MEMBERSHIP_ACTIVE_VALUE)
      .maybeSingle();

    if (error) throw new Error(`membership_lookup_failed:${error.message}`);
    if (!data?.org_id) throw new Error("NO_ORG_MEMBERSHIP");
    return orgId;
  }

  const { data, error } = await sb
    .from("debacu_eval_org_members")
    .select("org_id, created_at")
    .eq("auth_user_id", authUserId)
    .eq("status", MEMBERSHIP_ACTIVE_VALUE)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`membership_lookup_failed:${error.message}`);
  if (!data?.org_id) throw new Error("NO_ORG_MEMBERSHIP");
  return String(data.org_id);
}

async function assertOrgAdminOrThrow(
  sb: ReturnType<typeof supabaseServiceClient>,
  authUserId: string,
  orgId: string,
) {
  const { data, error } = await sb
    .from("debacu_eval_org_members")
    .select("role, status")
    .eq("auth_user_id", authUserId)
    .eq("org_id", orgId)
    .eq("status", MEMBERSHIP_ACTIVE_VALUE)
    .maybeSingle();

  if (error) throw new Error(`org_admin_check_failed:${error.message}`);
  if (!data) throw new Error("NO_ORG_MEMBERSHIP");

  const role = safeUpper(data.role);
  if (role !== "OWNER" && role !== "ADMIN") throw new Error("ORG_ADMIN_REQUIRED");
}

async function loadEntitlementsOrThrow(
  sb: ReturnType<typeof supabaseServiceClient>,
  orgId: string,
) {
  const { data, error } = await sb
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, subscription_status, plan_code, max_users, seats_used")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`entitlements_failed:${error.message}`);
  if (!data?.customer_id) throw new Error("NO_ENTITLEMENTS");
  return data as EntitlementsRow;
}

function assertPlanActiveOrThrow(ent: EntitlementsRow) {
  const st = safeUpper(ent.subscription_status);
  if (st !== "ACTIVE" && st !== "TRIAL_ACTIVE") throw new Error("PLAN_NOT_ACTIVE");
}

async function getPropertyOrThrow(
  sb: ReturnType<typeof supabaseServiceClient>,
  orgId: string,
  propertyId?: string | null,
) {
  const id = String(propertyId ?? "").trim();
  if (!id || !isUuid(id)) throw new Error("invalid_property_id");

  const { data, error } = await sb
    .from("debacu_eval_properties")
    .select("id, org_id")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`property_lookup_failed:${error.message}`);
  if (!data?.id) throw new Error("PROPERTY_NOT_FOUND");
  return data as PropertyRow;
}

function buildAlerts(row: RevenueDailyRow): AlertCandidate[] {
  const alerts: AlertCandidate[] = [];

  const occupancyPct = toNum(row.occupancy_pct);
  const adr = toNum(row.adr);

  if (occupancyPct !== null && occupancyPct < 20) {
    alerts.push({
      org_id: row.org_id,
      property_id: row.property_id,
      stay_date: row.stay_date,
      alert_type: "LOW_OCCUPANCY",
      severity: occupancyPct < 10 ? "HIGH" : "MEDIUM",
      metric_value: occupancyPct,
      threshold_value: 20,
      title: "Ocupación baja detectada",
      description: `La ocupación para ${row.stay_date} es ${occupancyPct.toFixed(2)}%, por debajo del umbral del 20.00%.`,
      source: "RULE_ENGINE",
    });
  }

  if (adr !== null && adr < 70) {
    alerts.push({
      org_id: row.org_id,
      property_id: row.property_id,
      stay_date: row.stay_date,
      alert_type: "LOW_ADR",
      severity: adr < 60 ? "HIGH" : "MEDIUM",
      metric_value: adr,
      threshold_value: 70,
      title: "ADR bajo detectado",
      description: `El ADR para ${row.stay_date} es ${adr.toFixed(2)}€, por debajo del umbral de 70.00€.`,
      source: "RULE_ENGINE",
    });
  }

  if (occupancyPct !== null && adr !== null && occupancyPct >= 60 && adr < 80) {
    alerts.push({
      org_id: row.org_id,
      property_id: row.property_id,
      stay_date: row.stay_date,
      alert_type: "HIGH_OCCUPANCY_LOW_ADR",
      severity: "HIGH",
      metric_value: adr,
      threshold_value: 80,
      title: "Alta ocupación con ADR bajo",
      description: `La fecha ${row.stay_date} combina ocupación ${occupancyPct.toFixed(2)}% con ADR ${adr.toFixed(2)}€, señal de posible venta barata.`,
      source: "RULE_ENGINE",
    });
  }

  return alerts;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);

  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "request_failed", detail: "method_not_allowed" });
  }

  const sb = supabaseServiceClient();

  try {
    const user = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as ReqBody;

    const action = safeUpper(body.action);
    if (action !== "PREVIEW" && action !== "GENERATE") {
      return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_action" });
    }

    if (!isValidDate(body.date_from)) {
      return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_date_from" });
    }
    if (!isValidDate(body.date_to)) {
      return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_date_to" });
    }

    const orgId = await resolveOrgIdOrThrow(sb, user.id, body.org_id ?? null);
    await assertOrgAdminOrThrow(sb, user.id, orgId);

    const ent = await loadEntitlementsOrThrow(sb, orgId);
    assertPlanActiveOrThrow(ent);

    const property = await getPropertyOrThrow(sb, orgId, body.property_id);

    const { data, error } = await sb
      .from("debacu_eval_revenue_daily_property_with_inventory_v")
      .select("org_id, property_id, stay_date, rooms_sold, rooms_available, occupancy_pct, revenue_rooms, adr, revpar")
      .eq("org_id", orgId)
      .eq("property_id", property.id)
      .gte("stay_date", String(body.date_from))
      .lte("stay_date", String(body.date_to))
      .order("stay_date", { ascending: true });

    if (error) throw new Error(`revenue_daily_read_failed:${error.message}`);

    const rows = (data ?? []) as RevenueDailyRow[];
    const alerts = rows.flatMap(buildAlerts);

    if (action === "PREVIEW") {
      return json(req, 200, {
        ok: true,
        data: alerts,
        meta: {
          orgId,
          propertyId: property.id,
          dateFrom: body.date_from,
          dateTo: body.date_to,
          rowsRead: rows.length,
          alertsDetected: alerts.length,
          action,
        },
      });
    }

    if (!alerts.length) {
      return json(req, 200, {
        ok: true,
        data: [],
        meta: {
          orgId,
          propertyId: property.id,
          dateFrom: body.date_from,
          dateTo: body.date_to,
          rowsRead: rows.length,
          alertsInserted: 0,
          action,
        },
      });
    }

    const deduped = alerts.map((a) => ({
      org_id: a.org_id,
      property_id: a.property_id,
      stay_date: a.stay_date,
      alert_type: a.alert_type,
      severity: a.severity,
      metric_value: a.metric_value,
      threshold_value: a.threshold_value,
      title: a.title,
      description: a.description,
      source: a.source,
      status: "OPEN",
    }));

    const { data: inserted, error: insertError } = await sb
      .from("debacu_eval_alerts")
      .insert(deduped)
      .select("id, org_id, property_id, stay_date, alert_type, severity, title, status, created_at");

    if (insertError) throw new Error(`alerts_insert_failed:${insertError.message}`);

    return json(req, 200, {
      ok: true,
      data: inserted ?? [],
      meta: {
        orgId,
        propertyId: property.id,
        dateFrom: body.date_from,
        dateTo: body.date_to,
        rowsRead: rows.length,
        alertsInserted: (inserted ?? []).length,
        action,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return json(req, 401, { ok: false, error: "request_failed", detail: "UNAUTHENTICATED" });
    }
    if (msg === "PLAN_NOT_ACTIVE") {
      return json(req, 402, { ok: false, error: "request_failed", detail: "PLAN_NOT_ACTIVE" });
    }
    if (msg === "NO_ORG_MEMBERSHIP") {
      return json(req, 403, { ok: false, error: "request_failed", detail: "NO_ORG_MEMBERSHIP" });
    }
    if (msg === "NO_ENTITLEMENTS") {
      return json(req, 403, { ok: false, error: "request_failed", detail: "NO_ENTITLEMENTS" });
    }
    if (msg === "ORG_ADMIN_REQUIRED") {
      return json(req, 403, { ok: false, error: "request_failed", detail: "ORG_ADMIN_REQUIRED" });
    }
    if (msg === "PROPERTY_NOT_FOUND") {
      return json(req, 404, { ok: false, error: "request_failed", detail: "PROPERTY_NOT_FOUND" });
    }
    if (msg.startsWith("invalid_")) {
      return json(req, 400, { ok: false, error: "request_failed", detail: msg });
    }

    console.error("debacu_eval_revenue_alerts_generate error:", msg);
    return json(req, 500, { ok: false, error: "request_failed", detail: "internal_error" });
  }
});