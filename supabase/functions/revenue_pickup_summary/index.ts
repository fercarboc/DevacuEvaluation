// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

const DEFAULT_APP_ID = "DEBACU_EVAL";
const MEMBERSHIP_ACTIVE_VALUE = "ACTIVE";

type ReqBody = {
  org_id?: string | null;
  orgId?: string | null;
  property_id?: string | null;
  propertyId?: string | null;
  window_days?: number | null;
  daysAgo?: number | null;
  app_id?: string | null;
};

type PropertyRow = {
  id: string;
  org_id: string;
  code?: string | null;
  name?: string | null;
  rooms_total?: number | null;
};

type ReservationRow = {
  booking_date: string;
  checkin_date: string;
  checkout_date: string;
  reservation_status: string | null;
  gross_revenue: number | string | null;
  net_revenue: number | string | null;
  commission_amount: number | string | null;
  rooms: number | string | null;
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

function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDays(from: string, to: string) {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

function dateKey(date: string) {
  return date;
}

async function resolveOrgIdOrThrow(
  admin: SupabaseClient,
  userId: string,
  requestedOrgId?: string | null,
): Promise<string> {
  const uid = String(userId);

  if (requestedOrgId) {
    const orgId = String(requestedOrgId).trim();
    if (!isUuid(orgId)) throw new Error("invalid_org_id");

    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id")
      .eq("org_id", orgId)
      .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
      .eq("status", MEMBERSHIP_ACTIVE_VALUE)
      .maybeSingle();

    if (error) throw new Error(`membership_lookup_failed:${error.message}`);
    if (!data?.org_id) throw new Error("FORBIDDEN");

    return String(data.org_id);
  }

  const { data, error } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, created_at")
    .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
    .eq("status", MEMBERSHIP_ACTIVE_VALUE)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`membership_lookup_failed:${error.message}`);
  if (!data?.org_id) throw new Error("FORBIDDEN");

  return String(data.org_id);
}

async function loadPropertyOrThrow(
  admin: SupabaseClient,
  orgId: string,
  propertyId: string,
) {
  const { data, error } = await admin
    .from("debacu_eval_properties")
    .select("id, org_id, code, name, rooms_total")
    .eq("org_id", orgId)
    .eq("id", propertyId)
    .maybeSingle();

  if (error) throw new Error(`failed_load_property:${error.message}`);
  if (!data?.id) throw new Error("PROPERTY_NOT_FOUND");

  const row = data as PropertyRow;

  return {
    id: String(row.id),
    code: String(row.code ?? ""),
    name: String(row.name ?? row.code ?? "Sin nombre"),
    roomsCount: toNumber(row.rooms_total),
  };
}

async function loadReservations(
  admin: SupabaseClient,
  orgId: string,
  propertyCode: string,
  bookingFrom: string,
  bookingTo: string,
) {
  const pageSize = 1000;
  let offset = 0;
  const allRows: ReservationRow[] = [];

  while (true) {
    const { data, error } = await admin
      .from("debacu_eval_reservations")
      .select(
        "booking_date, checkin_date, checkout_date, reservation_status, gross_revenue, net_revenue, commission_amount, rooms",
      )
      .eq("org_id", orgId)
      .eq("property_code", propertyCode)
      .gte("booking_date", bookingFrom)
      .lte("booking_date", bookingTo)
      .order("booking_date", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`failed_load_reservations:${error.message}`);

    const batch = (data ?? []) as ReservationRow[];
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
    const windowDays = Number(body?.window_days ?? body?.daysAgo ?? 30);
    const appId = String(body?.app_id ?? DEFAULT_APP_ID).trim() || DEFAULT_APP_ID;

    if (appId !== DEFAULT_APP_ID) {
      return json(req, 400, { ok: false, error: "invalid_app_id" });
    }

    if (!propertyId || !isUuid(propertyId)) {
      return json(req, 400, { ok: false, error: "invalid_property_id" });
    }

    if (![7, 15, 30].includes(windowDays)) {
      return json(req, 400, { ok: false, error: "invalid_window_days" });
    }

    const orgId = await resolveOrgIdOrThrow(admin, user.id, requestedOrgId);
    const property = await loadPropertyOrThrow(admin, orgId, propertyId);

    const today = new Date().toISOString().slice(0, 10);
    const windowStart = addDays(today, -windowDays);

    const currentRows = await loadReservations(
      admin,
      orgId,
      property.code,
      windowStart,
      today,
    );

    const compareWindowEnd = addDays(windowStart, -1);
    const compareWindowStart = addDays(compareWindowEnd, -(windowDays - 1));

    const compareRowsRaw = await loadReservations(
      admin,
      orgId,
      property.code,
      compareWindowStart,
      compareWindowEnd,
    );

    const validStatuses = new Set(["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"]);

    const arrivalMap = new Map<
      string,
      {
        date: string;
        rn: number;
        revenue: number;
        netRevenue: number;
        count: number;
        leadTimeTotal: number;
      }
    >();

    let totalPickupRN = 0;
    let totalPickupRevenue = 0;
    let totalPickupNetRevenue = 0;
    let totalLeadTime = 0;
    let totalPickupCount = 0;

    for (const res of currentRows) {
      const status = String(res.reservation_status ?? "").toUpperCase();
      if (!validStatuses.has(status)) continue;

      const bookingDate = String(res.booking_date ?? "");
      const arrivalDate = String(res.checkin_date ?? "");

      if (!isISODate(bookingDate) || !isISODate(arrivalDate)) continue;

      const checkoutDate = String(res.checkout_date ?? "");
      const rooms = Math.max(0, toNumber(res.rooms) || 1);
      const nights =
        isISODate(checkoutDate) && checkoutDate > arrivalDate
          ? diffDays(arrivalDate, checkoutDate)
          : 1;

      const rn = rooms * nights;
      const grossRevenue = toNumber(res.gross_revenue);
      const netRevenueRaw = toNumber(res.net_revenue);
      const commissionAmount = toNumber(res.commission_amount);
      const netRevenue =
        netRevenueRaw > 0 ? netRevenueRaw : Math.max(0, grossRevenue - commissionAmount);

      const lead = diffDays(bookingDate, arrivalDate);

      const existing = arrivalMap.get(arrivalDate) ?? {
        date: arrivalDate,
        rn: 0,
        revenue: 0,
        netRevenue: 0,
        count: 0,
        leadTimeTotal: 0,
      };

      existing.rn += rn;
      existing.revenue += grossRevenue;
      existing.netRevenue += netRevenue;
      existing.count += 1;
      existing.leadTimeTotal += lead;

      arrivalMap.set(arrivalDate, existing);

      totalPickupRN += rn;
      totalPickupRevenue += grossRevenue;
      totalPickupNetRevenue += netRevenue;
      totalPickupCount += 1;
      totalLeadTime += lead;
    }

    const compareArrivalMap = new Map<string, { revenue: number; rn: number }>();

    for (const res of compareRowsRaw) {
      const status = String(res.reservation_status ?? "").toUpperCase();
      if (!validStatuses.has(status)) continue;

      const arrivalDate = String(res.checkin_date ?? "");
      const checkoutDate = String(res.checkout_date ?? "");
      if (!isISODate(arrivalDate)) continue;

      const rooms = Math.max(0, toNumber(res.rooms) || 1);
      const nights =
        isISODate(checkoutDate) && checkoutDate > arrivalDate
          ? diffDays(arrivalDate, checkoutDate)
          : 1;

      const rn = rooms * nights;
      const grossRevenue = toNumber(res.gross_revenue);

      const existing = compareArrivalMap.get(arrivalDate) ?? { revenue: 0, rn: 0 };
      existing.revenue += grossRevenue;
      existing.rn += rn;
      compareArrivalMap.set(arrivalDate, existing);
    }

    const pickupByArrival = Array.from(arrivalMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => {
        const compare = compareArrivalMap.get(row.date) ?? { revenue: 0, rn: 0 };

        return {
          date: row.date,
          rn: round2(row.rn),
          revenue: round2(row.revenue),
          netRevenue: round2(row.netRevenue),
          adr: row.rn > 0 ? round2(row.revenue / row.rn) : 0,
          leadTime: row.count > 0 ? round2(row.leadTimeTotal / row.count) : 0,
          paceRevenue: round2(compare.revenue),
          paceRN: round2(compare.rn),
        };
      });

    const groupedPickupAnalysis = pickupByArrival.map((row) => ({
      date: row.date,
      currentRevenue: row.revenue,
      currentRN: row.rn,
      compareRevenue: row.paceRevenue,
      compareRN: row.paceRN,
      deltaRevenue: round2(row.revenue - row.paceRevenue),
      deltaRevenuePct:
        row.paceRevenue > 0 ? round2(((row.revenue - row.paceRevenue) / row.paceRevenue) * 100) : 0,
      deltaRN: round2(row.rn - row.paceRN),
      deltaRNPct: row.paceRN > 0 ? round2(((row.rn - row.paceRN) / row.paceRN) * 100) : 0,
    }));

    return json(req, 200, {
      ok: true,
      data: {
        property,
        range: {
          booking_from: windowStart,
          booking_to: today,
          compare_from: compareWindowStart,
          compare_to: compareWindowEnd,
        },
        summary: {
          totalPickupRN: round2(totalPickupRN),
          totalPickupRevenue: round2(totalPickupRevenue),
          totalPickupNetRevenue: round2(totalPickupNetRevenue),
          avgLeadTime: totalPickupCount > 0 ? round2(totalLeadTime / totalPickupCount) : 0,
          pickupADR: totalPickupRN > 0 ? round2(totalPickupRevenue / totalPickupRN) : 0,
        },
        pickupByArrival,
        pickupComparison: groupedPickupAnalysis,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return json(req, 401, { ok: false, error: "UNAUTHENTICATED" });
    }
    if (msg === "FORBIDDEN") {
      return json(req, 403, { ok: false, error: "FORBIDDEN" });
    }
    if (msg === "PROPERTY_NOT_FOUND") {
      return json(req, 404, { ok: false, error: "PROPERTY_NOT_FOUND" });
    }
    if (
      msg === "invalid_org_id" ||
      msg === "invalid_property_id" ||
      msg === "invalid_window_days" ||
      msg === "invalid_app_id"
    ) {
      return json(req, 400, { ok: false, error: msg });
    }

    console.error("revenue_pickup_summary error:", msg);

    return json(req, 500, {
      ok: false,
      error: "request_failed",
      detail: "internal_error",
    });
  }
});