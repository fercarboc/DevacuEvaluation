// supabase/functions/revenue_day_breakdown/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

const DEFAULT_APP_ID = "DEBACU_EVAL";
const MEMBERSHIP_STATUS_COLUMN = "status";
const MEMBERSHIP_ACTIVE_VALUE = "ACTIVE";

type ReqBody = {
  org_id?: string;
  orgId?: string;
  property_id?: string;
  propertyId?: string;
  date?: string;
  app_id?: string;
};

type EntitlementsRow = {
  org_id: string;
  customer_id: string | null;
  subscription_status: string | null;
  plan_code?: string | null;
};

type DailyBreakdownRow = {
  channel?: string | null;
  segment?: string | null;
  rooms_sold?: number | null;
  revenue_rooms?: number | null;
  revenue_total?: number | null;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function isISODate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeText(v: unknown, fallback: string) {
  const s = String(v ?? "").trim();
  return s ? s.toUpperCase() : fallback;
}

async function resolveOrgIdOrThrow(
  admin: SupabaseClient,
  userId: string,
  requestedOrgId?: string | null,
): Promise<{ org_id: string; org_id_resolved_by: "requested" | "first_active" | "first_any" }> {
  const uid = String(userId);

  if (requestedOrgId) {
    const orgId = String(requestedOrgId).trim();
    if (!isUuid(orgId)) throw new Error("invalid_org_id");

    try {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id")
        .eq("org_id", orgId)
        .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
        .eq(MEMBERSHIP_STATUS_COLUMN, MEMBERSHIP_ACTIVE_VALUE)
        .maybeSingle();

      if (error) throw error;
      if (!data?.org_id) throw new Error("FORBIDDEN");
      return { org_id: String(data.org_id), org_id_resolved_by: "requested" };
    } catch {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id")
        .eq("org_id", orgId)
        .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
        .maybeSingle();

      if (error || !data?.org_id) throw new Error("FORBIDDEN");
      return { org_id: String(data.org_id), org_id_resolved_by: "requested" };
    }
  }

  try {
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, created_at")
      .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
      .eq(MEMBERSHIP_STATUS_COLUMN, MEMBERSHIP_ACTIVE_VALUE)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data?.org_id) throw new Error("FORBIDDEN");
    return { org_id: String(data.org_id), org_id_resolved_by: "first_active" };
  } catch {
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, created_at")
      .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data?.org_id) throw new Error("FORBIDDEN");
    return { org_id: String(data.org_id), org_id_resolved_by: "first_any" };
  }
}

async function loadEntitlementsOrThrow(admin: SupabaseClient, orgId: string) {
  const { data, error } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, subscription_status, plan_code")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error || !data?.org_id) throw new Error("FORBIDDEN");
  return data as EntitlementsRow;
}

function assertPlanEnabledOrThrow(ent: EntitlementsRow) {
  const st = String(ent.subscription_status ?? "").toUpperCase();
  if (st !== "ACTIVE" && st !== "TRIAL_ACTIVE") throw new Error("PLAN_NOT_ACTIVE");
  if (!ent.customer_id) throw new Error("FORBIDDEN");
}

async function assertPropertyBelongsToOrgOrThrow(
  admin: SupabaseClient,
  orgId: string,
  propertyId: string,
) {
  const { data, error } = await admin
    .from("debacu_eval_properties")
    .select("id")
    .eq("org_id", orgId)
    .eq("id", propertyId)
    .maybeSingle();

  if (error) throw new Error(`failed_validate_property:${error.message}`);
  if (!data?.id) throw new Error("FORBIDDEN");
}

export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  const admin = supabaseServiceClient();

  try {
    const user = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as ReqBody;

    const requestedOrgId = String(body?.org_id ?? body?.orgId ?? "").trim() || null;
    const propertyId = String(body?.property_id ?? body?.propertyId ?? "").trim();
    const date = String(body?.date ?? "").trim();
    const appId = String(body?.app_id ?? DEFAULT_APP_ID).trim() || DEFAULT_APP_ID;

    if (!propertyId) return json(req, 400, { ok: false, error: "missing_property_id" });
    if (!isUuid(propertyId)) return json(req, 400, { ok: false, error: "invalid_property_id" });
    if (!date) return json(req, 400, { ok: false, error: "missing_date" });
    if (!isISODate(date)) return json(req, 400, { ok: false, error: "invalid_date_format" });

    const { org_id, org_id_resolved_by } = await resolveOrgIdOrThrow(admin, user.id, requestedOrgId);
    const ent = await loadEntitlementsOrThrow(admin, org_id);
    assertPlanEnabledOrThrow(ent);

    await assertPropertyBelongsToOrgOrThrow(admin, org_id, propertyId);

    const { data: rows, error } = await admin
      .from("debacu_eval_revenue_daily")
      .select("channel, segment, rooms_sold, revenue_rooms, revenue_total")
      .eq("org_id", org_id)
      .eq("property_id", propertyId)
      .eq("stay_date", date);

    if (error) throw new Error(`failed_load_revenue_daily:${error.message}`);

    const normalized = ((rows ?? []) as DailyBreakdownRow[])
      .map((row) => {
        const roomsSold = toNumber(row.rooms_sold);
        const revenue = toNumber(row.revenue_rooms) || toNumber(row.revenue_total);

        return {
          channel: normalizeText(row.channel, "SIN_CANAL"),
          segment: normalizeText(row.segment, "SIN_SEGMENTO"),
          roomsSold,
          revenue: round2(revenue),
          adr: roomsSold > 0 ? round2(revenue / roomsSold) : 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = normalized.reduce((acc, row) => acc + row.revenue, 0);
    const totalRoomsSold = normalized.reduce((acc, row) => acc + row.roomsSold, 0);
    const adr = totalRoomsSold > 0 ? totalRevenue / totalRoomsSold : 0;

    return json(req, 200, {
      ok: true,
      date,
      meta: {
        app_id: appId,
        org_id,
        org_id_resolved_by,
        property_id: propertyId,
        customer_id: String(ent.customer_id),
        plan_code: ent.plan_code ?? null,
        subscription_status: ent.subscription_status ?? null,
        source_table: "debacu_eval_revenue_daily",
      },
      data: {
        totals: {
          roomsSold: totalRoomsSold,
          revenue: round2(totalRevenue),
          adr: round2(adr),
        },
        rows: normalized,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return json(req, 401, { ok: false, error: "UNAUTHENTICATED" });
    }
    if (msg === "PLAN_NOT_ACTIVE") {
      return json(req, 402, { ok: false, error: "PLAN_NOT_ACTIVE" });
    }
    if (
      msg === "invalid_org_id" ||
      msg === "invalid_property_id" ||
      msg.startsWith("missing_") ||
      msg.startsWith("invalid_")
    ) {
      return json(req, 400, { ok: false, error: msg });
    }
    if (msg === "FORBIDDEN" || msg.startsWith("forbidden_")) {
      return json(req, 403, { ok: false, error: "FORBIDDEN" });
    }

    console.error("revenue_day_breakdown error:", msg);
    return json(req, 500, { ok: false, error: "request_failed", detail: "internal_error" });
  }
});