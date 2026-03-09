// supabase/functions/revenue_monthly_summary/index.ts
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
  compare_from?: string;
  compare_to?: string;
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

type RevenueDailyPropertyRow = {
  stay_date: string;
  rooms_sold?: number | null;
  rooms_available?: number | null;
  revenue?: number | null;
  adr?: number | null;
  revpar?: number | null;
  occ?: number | null;
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

function monthKey(date: string) {
  return String(date).slice(5, 7);
}

function monthLabel(dateOrMonth: string) {
  const month = String(dateOrMonth).slice(5, 7);
  const labels: Record<string, string> = {
    "01": "Ene",
    "02": "Feb",
    "03": "Mar",
    "04": "Abr",
    "05": "May",
    "06": "Jun",
    "07": "Jul",
    "08": "Ago",
    "09": "Sep",
    "10": "Oct",
    "11": "Nov",
    "12": "Dic",
  };
  return labels[month] ?? month;
}

function deltaPct(current: number, compare: number) {
  if (compare === 0) return current === 0 ? 0 : 100;
  return ((current - compare) / compare) * 100;
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

async function loadAllRevenueDailyPropertyRows(
  admin: SupabaseClient,
  orgId: string,
  propertyId: string,
  periodFrom: string,
  periodTo: string,
): Promise<RevenueDailyPropertyRow[]> {
  const pageSize = 1000;
  let offset = 0;
  const allRows: RevenueDailyPropertyRow[] = [];

  while (true) {
    const { data, error } = await admin
      .from("debacu_eval_revenue_daily_property_v")
      .select("stay_date, rooms_sold, rooms_available, revenue, adr, revpar, occ")
      .eq("org_id", orgId)
      .eq("property_id", propertyId)
      .gte("stay_date", periodFrom)
      .lte("stay_date", periodTo)
      .order("stay_date", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`failed_load_revenue_daily_property_v:${error.message}`);

    const batch = (data ?? []) as RevenueDailyPropertyRow[];
    allRows.push(...batch);

    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return allRows;
}

function aggregateMonths(rows: RevenueDailyPropertyRow[]) {
  const grouped = new Map<
    string,
    {
      month: string;
      days: number;
      roomsSold: number;
      roomsAvailable: number;
      revenue: number;
    }
  >();

  for (const row of rows) {
    const month = String(row.stay_date).slice(0, 7);
    const current = grouped.get(month) ?? {
      month,
      days: 0,
      roomsSold: 0,
      roomsAvailable: 0,
      revenue: 0,
    };

    current.days += 1;
    current.roomsSold += toNumber(row.rooms_sold);
    current.roomsAvailable += toNumber(row.rooms_available);
    current.revenue += toNumber(row.revenue);

    grouped.set(month, current);
  }

  return Array.from(grouped.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((row) => {
      const adr = row.roomsSold > 0 ? row.revenue / row.roomsSold : 0;
      const revpar = row.roomsAvailable > 0 ? row.revenue / row.roomsAvailable : 0;
      const occ = row.roomsAvailable > 0 ? (row.roomsSold / row.roomsAvailable) * 100 : 0;

      return {
        month: row.month,
        monthKey: monthKey(row.month),
        label: monthLabel(row.month),
        occ: round2(occ),
        rn: row.roomsSold,
        adr: round2(adr),
        revenue: round2(row.revenue),
        revpar: round2(revpar),
        days: row.days,
      };
    });
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
    const compareFrom = String(body?.compare_from ?? "").trim();
    const compareTo = String(body?.compare_to ?? "").trim();
    const appId = String(body?.app_id ?? DEFAULT_APP_ID).trim() || DEFAULT_APP_ID;

    if (!propertyId) return json(req, 400, { ok: false, error: "missing_property_id" });
    if (!isUuid(propertyId)) return json(req, 400, { ok: false, error: "invalid_property_id" });
    if (!periodFrom || !periodTo) return json(req, 400, { ok: false, error: "missing_period_from_to" });
    if (!isISODate(periodFrom) || !isISODate(periodTo)) {
      return json(req, 400, { ok: false, error: "invalid_date_format" });
    }
    if (periodFrom > periodTo) {
      return json(req, 400, { ok: false, error: "invalid_period_range" });
    }
    if ((compareFrom && !isISODate(compareFrom)) || (compareTo && !isISODate(compareTo))) {
      return json(req, 400, { ok: false, error: "invalid_compare_date_format" });
    }
    if ((compareFrom && !compareTo) || (!compareFrom && compareTo)) {
      return json(req, 400, { ok: false, error: "missing_compare_period_from_to" });
    }
    if (compareFrom && compareTo && compareFrom > compareTo) {
      return json(req, 400, { ok: false, error: "invalid_compare_period_range" });
    }

    const { org_id, org_id_resolved_by } = await resolveOrgIdOrThrow(
      admin,
      user.id,
      requestedOrgId,
    );

    const ent = await loadEntitlementsOrThrow(admin, org_id);
    assertPlanEnabledOrThrow(ent);

    const property = await loadPropertyOrThrow(admin, org_id, propertyId);

    const currentRows = await loadAllRevenueDailyPropertyRows(
      admin,
      org_id,
      propertyId,
      periodFrom,
      periodTo,
    );

    const currentMonths = aggregateMonths(currentRows);

    const currentRevenue = currentMonths.reduce((acc, row) => acc + row.revenue, 0);
    const currentRn = currentMonths.reduce((acc, row) => acc + row.rn, 0);
    const currentDays = currentMonths.reduce((acc, row) => acc + row.days, 0);
    const currentRoomsAvailable = currentRows.reduce(
      (acc, row) => acc + toNumber(row.rooms_available),
      0,
    );

    const currentTotals = {
      occ: round2(currentRoomsAvailable > 0 ? (currentRn / currentRoomsAvailable) * 100 : 0),
      rn: currentRn,
      adr: round2(currentRn > 0 ? currentRevenue / currentRn : 0),
      revenue: round2(currentRevenue),
      revpar: round2(currentRoomsAvailable > 0 ? currentRevenue / currentRoomsAvailable : 0),
      days: currentDays,
      months: currentMonths.length,
    };

    let compareMonths: any[] = [];
    let compareTotals: any = null;
    let comparisonRows: any[] = [];

    if (compareFrom && compareTo) {
      const compareRowsRaw = await loadAllRevenueDailyPropertyRows(
        admin,
        org_id,
        propertyId,
        compareFrom,
        compareTo,
      );

      compareMonths = aggregateMonths(compareRowsRaw);

      const compareRevenue = compareMonths.reduce((acc, row) => acc + row.revenue, 0);
      const compareRn = compareMonths.reduce((acc, row) => acc + row.rn, 0);
      const compareDays = compareMonths.reduce((acc, row) => acc + row.days, 0);
      const compareRoomsAvailable = compareRowsRaw.reduce(
        (acc, row) => acc + toNumber(row.rooms_available),
        0,
      );

      compareTotals = {
        occ: round2(compareRoomsAvailable > 0 ? (compareRn / compareRoomsAvailable) * 100 : 0),
        rn: compareRn,
        adr: round2(compareRn > 0 ? compareRevenue / compareRn : 0),
        revenue: round2(compareRevenue),
        revpar: round2(compareRoomsAvailable > 0 ? compareRevenue / compareRoomsAvailable : 0),
        days: compareDays,
        months: compareMonths.length,
      };

      const currentByKey = new Map(currentMonths.map((row) => [row.monthKey, row]));
      const compareByKey = new Map(compareMonths.map((row) => [row.monthKey, row]));
      const keys = Array.from(new Set([...currentByKey.keys(), ...compareByKey.keys()])).sort();

      comparisonRows = keys.map((key) => {
        const current = currentByKey.get(key) ?? {
          month: "",
          monthKey: key,
          label: monthLabel(`2000-${key}`),
          occ: 0,
          rn: 0,
          adr: 0,
          revenue: 0,
          revpar: 0,
          days: 0,
        };

        const compare = compareByKey.get(key) ?? {
          month: "",
          monthKey: key,
          label: monthLabel(`2000-${key}`),
          occ: 0,
          rn: 0,
          adr: 0,
          revenue: 0,
          revpar: 0,
          days: 0,
        };

        return {
          monthKey: key,
          label: current.label || compare.label,
          current,
          compare,
          delta: {
            revenueAbs: round2(current.revenue - compare.revenue),
            revenuePct: round2(deltaPct(current.revenue, compare.revenue)),
            adrAbs: round2(current.adr - compare.adr),
            adrPct: round2(deltaPct(current.adr, compare.adr)),
            revparAbs: round2(current.revpar - compare.revpar),
            revparPct: round2(deltaPct(current.revpar, compare.revpar)),
            occAbs: round2(current.occ - compare.occ),
            occPct: round2(deltaPct(current.occ, compare.occ)),
            rnAbs: current.rn - compare.rn,
            rnPct: round2(deltaPct(current.rn, compare.rn)),
          },
        };
      });
    }

    return json(req, 200, {
      ok: true,
      period_from: periodFrom,
      period_to: periodTo,
      compare_from: compareFrom || null,
      compare_to: compareTo || null,
      meta: {
        app_id: appId,
        org_id,
        org_id_resolved_by,
        property_id: propertyId,
        customer_id: String(ent.customer_id),
        plan_code: ent.plan_code ?? null,
        subscription_status: ent.subscription_status ?? null,
        source_table: "debacu_eval_revenue_daily_property_v",
      },
      data: {
        property,
        totals: currentTotals,
        months: currentMonths,
        compareTotals,
        compareMonths,
        comparisonRows,
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

    console.error("revenue_monthly_summary error:", msg);
    return json(req, 500, {
      ok: false,
      error: "request_failed",
      detail: "internal_error",
    });
  }
});