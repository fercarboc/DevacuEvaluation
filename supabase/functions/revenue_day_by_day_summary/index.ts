// supabase/functions/revenue_day_by_day_summary/index.ts
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
  period_from?: string;
  period_to?: string;
  from?: string;
  to?: string;
  app_id?: string;
};

type EntitlementsRow = {
  org_id: string;
  customer_id: string | null;
  subscription_status: string | null;
  plan_code?: string | null;
};

type PropertyRow = {
  id: string;
  code?: string | null;
  name?: string | null;
  category?: string | null;
  rooms_total?: number | null;
};

type RevenueDailyRow = {
  stay_date: string;
  rooms_sold?: number | null;
  rooms_available?: number | null;
  revenue_rooms?: number | null;
  revenue_total?: number | null;
  adr?: number | null;
  revpar?: number | null;
};

type RevenueEventRow = {
  id: string;
  name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  event_type?: string | null;
  color?: string | null;
  priority?: number | null;
  is_active?: boolean | null;
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

async function resolveOrgIdOrThrow(
  admin: SupabaseClient,
  userId: string,
  requestedOrgId?: string | null,
): Promise<{ org_id: string; org_id_resolved_by: "requested" | "first_active" }> {
  const uid = String(userId);

  if (requestedOrgId) {
    const orgId = String(requestedOrgId).trim();
    if (!isUuid(orgId)) throw new Error("invalid_org_id");

    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id")
      .eq("org_id", orgId)
      .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
      .eq(MEMBERSHIP_STATUS_COLUMN, MEMBERSHIP_ACTIVE_VALUE)
      .maybeSingle();

    if (error) throw new Error(`membership_lookup_failed:${error.message}`);
    if (!data?.org_id) throw new Error("FORBIDDEN");

    return { org_id: String(data.org_id), org_id_resolved_by: "requested" };
  }

  const { data, error } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, created_at")
    .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
    .eq(MEMBERSHIP_STATUS_COLUMN, MEMBERSHIP_ACTIVE_VALUE)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`membership_lookup_failed:${error.message}`);
  if (!data?.org_id) throw new Error("FORBIDDEN");

  return { org_id: String(data.org_id), org_id_resolved_by: "first_active" };
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

async function loadPropertyOrThrow(
  admin: SupabaseClient,
  orgId: string,
  propertyId: string,
) {
  const { data, error } = await admin
    .from("debacu_eval_properties")
    .select("id, code, name, category, rooms_total")
    .eq("org_id", orgId)
    .eq("id", propertyId)
    .maybeSingle();

  if (error) throw new Error(`failed_load_property:${error.message}`);
  if (!data?.id) throw new Error("FORBIDDEN");

  const row = data as PropertyRow;

  const displayName =
    String(row.name ?? "").trim() ||
    String(row.category ?? "").trim() ||
    String(row.code ?? "").trim() ||
    "Sin nombre";

  return {
    id: String(row.id),
    name: displayName,
    roomsCount: toNumber(row.rooms_total),
  };
}

function pickEventForDate(events: RevenueEventRow[], date: string) {
  const matches = events.filter((e) => {
    const start = String(e.start_date ?? "");
    const end = String(e.end_date ?? "");
    return !!start && !!end && date >= start && date <= end;
  });

  if (matches.length === 0) return null;

  matches.sort((a, b) => toNumber(b.priority) - toNumber(a.priority));
  const event = matches[0];

  return {
    id: String(event.id),
    name: String(event.name ?? ""),
    type: String(event.event_type ?? "EVENTO").toUpperCase(),
    color: String(event.color ?? ""),
    priority: toNumber(event.priority),
  };
}

async function loadAllRevenueDailyRows(
  admin: SupabaseClient,
  orgId: string,
  propertyId: string,
  periodFrom: string,
  periodTo: string,
): Promise<RevenueDailyRow[]> {
  const pageSize = 1000;
  let offset = 0;
  const allRows: RevenueDailyRow[] = [];

  while (true) {
    const { data, error } = await admin
      .from("debacu_eval_revenue_daily")
      .select(
        "stay_date, rooms_sold, rooms_available, revenue_rooms, revenue_total, adr, revpar",
      )
      .eq("org_id", orgId)
      .eq("property_id", propertyId)
      .gte("stay_date", periodFrom)
      .lte("stay_date", periodTo)
      .order("stay_date", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`failed_load_revenue_daily:${error.message}`);

    const batch = (data ?? []) as RevenueDailyRow[];
    allRows.push(...batch);

    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return allRows;
}

export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "method_not_allowed" });
  }

  const admin = supabaseServiceClient();

  try {
    const user = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as ReqBody;

    const requestedOrgId = String(body?.org_id ?? body?.orgId ?? "").trim() || null;
    const propertyId = String(body?.property_id ?? body?.propertyId ?? "").trim();
    const periodFrom = String(body?.period_from ?? body?.from ?? "").trim();
    const periodTo = String(body?.period_to ?? body?.to ?? "").trim();
    const appId = String(body?.app_id ?? DEFAULT_APP_ID).trim() || DEFAULT_APP_ID;

    if (!propertyId) {
      return json(req, 400, { ok: false, error: "missing_property_id" });
    }
    if (!isUuid(propertyId)) {
      return json(req, 400, { ok: false, error: "invalid_property_id" });
    }
    if (!periodFrom || !periodTo) {
      return json(req, 400, { ok: false, error: "missing_period_from_to" });
    }
    if (!isISODate(periodFrom) || !isISODate(periodTo)) {
      return json(req, 400, { ok: false, error: "invalid_date_format" });
    }
    if (periodFrom > periodTo) {
      return json(req, 400, { ok: false, error: "invalid_period_range" });
    }

    const { org_id, org_id_resolved_by } = await resolveOrgIdOrThrow(
      admin,
      user.id,
      requestedOrgId,
    );

    const ent = await loadEntitlementsOrThrow(admin, org_id);
    assertPlanEnabledOrThrow(ent);

    const property = await loadPropertyOrThrow(admin, org_id, propertyId);

    const dailyRows = await loadAllRevenueDailyRows(
      admin,
      org_id,
      propertyId,
      periodFrom,
      periodTo,
    );

    const { data: eventRows, error: eventErr } = await admin
      .from("debacu_eval_revenue_events")
      .select("id, name, start_date, end_date, event_type, color, priority, is_active")
      .eq("org_id", org_id)
      .eq("property_id", propertyId)
      .eq("is_active", true)
      .lte("start_date", periodTo)
      .gte("end_date", periodFrom);

    if (eventErr) throw new Error(`failed_load_revenue_events:${eventErr.message}`);

    const grouped = new Map<
      string,
      {
        date: string;
        roomsSold: number;
        roomsAvailable: number;
        revenue: number;
        revparValue: number;
      }
    >();

    for (const row of dailyRows) {
      const date = String(row.stay_date);
      const current = grouped.get(date) ?? {
        date,
        roomsSold: 0,
        roomsAvailable: 0,
        revenue: 0,
        revparValue: 0,
      };

      const revenueRooms = toNumber(row.revenue_rooms);
      const revenueTotal = toNumber(row.revenue_total);

      current.roomsSold += toNumber(row.rooms_sold);
      current.roomsAvailable += toNumber(row.rooms_available);
      current.revenue += revenueRooms > 0 ? revenueRooms : revenueTotal;
      current.revparValue += toNumber(row.revpar);

      grouped.set(date, current);
    }

    const daily = Array.from(grouped.values())
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((row) => {
        const adr = row.roomsSold > 0 ? row.revenue / row.roomsSold : 0;

        let occ = 0;
        if (row.roomsAvailable > 0) {
          occ = (row.roomsSold / row.roomsAvailable) * 100;
        } else if (property.roomsCount > 0) {
          occ = (row.roomsSold / property.roomsCount) * 100;
        }

        const revpar =
          property.roomsCount > 0 ? row.revenue / property.roomsCount : row.revparValue;

        return {
          date: row.date,
          occ: round2(occ),
          roomsSold: row.roomsSold,
          adr: round2(adr),
          revenue: round2(row.revenue),
          revpar: round2(revpar),
          pvp: round2(adr),
          event: pickEventForDate((eventRows ?? []) as RevenueEventRow[], row.date),
        };
      });

    const dayCount = daily.length;
    const totalRevenue = daily.reduce((acc, row) => acc + row.revenue, 0);
    const totalRoomsSold = daily.reduce((acc, row) => acc + row.roomsSold, 0);

    // OJO:
    // La ocupación total del periodo se calcula contra roomsCount de la propiedad,
    // porque rooms_available en revenue_daily puede venir repetido por canal/segmento/tipo.
    const avgOcc =
      property.roomsCount > 0 && dayCount > 0
        ? (totalRoomsSold / (dayCount * property.roomsCount)) * 100
        : 0;

    const revpar =
      property.roomsCount > 0 && dayCount > 0
        ? totalRevenue / (dayCount * property.roomsCount)
        : 0;

    const adr = totalRoomsSold > 0 ? totalRevenue / totalRoomsSold : 0;

    return json(req, 200, {
      ok: true,
      period_from: periodFrom,
      period_to: periodTo,
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
        property,
        totals: {
          occ: round2(avgOcc),
          adr: round2(adr),
          revenue: round2(totalRevenue),
          revpar: round2(revpar),
          roomsSold: totalRoomsSold,
          days: dayCount,
        },
        daily,
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

    console.error("revenue_day_by_day_summary error:", msg);
    return json(req, 500, {
      ok: false,
      error: "request_failed",
      detail: "internal_error",
    });
  }
});