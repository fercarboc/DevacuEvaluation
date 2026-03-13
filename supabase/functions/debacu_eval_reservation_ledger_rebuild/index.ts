 // deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

const DEFAULT_APP_ID = "DEBACU_EVAL";
const MEMBERSHIP_STATUS_COLUMN = "status";
const MEMBERSHIP_ACTIVE_VALUE = "ACTIVE";

type ReqBody = {
  org_id?: string | null;
  orgId?: string | null;
  property_code?: string | null;
  propertyCode?: string | null;
  from?: string | null;
  to?: string | null;
  app_id?: string | null;
};

type EntitlementsRow = {
  org_id: string;
  customer_id: string | null;
  subscription_status: string | null;
  plan_code?: string | null;
};

type PropertyRow = {
  id: string;
  org_id: string;
  code?: string | null;
  name?: string | null;
  category?: string | null;
  rooms_total?: number | null;
};

type ReservationRow = {
  org_id: string;
  property_code: string;
  reservation_id: string | null;
  booking_date: string | null;
  checkin_date: string | null;
  checkout_date: string | null;
  reservation_status: string | null;
  gross_revenue: number | string | null;
  rooms: number | string | null;
};

type LedgerInsertRow = {
  org_id: string;
  property_code: string;
  reservation_id: string;
  stay_date: string;
  rooms: number;
  revenue: number;
  booking_date: string | null;
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

function round6(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
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

function eachStayDate(checkin: string, checkout: string): string[] {
  const nights = diffDays(checkin, checkout);
  if (nights <= 0) return [checkin];

  const out: string[] = [];
  for (let i = 0; i < nights; i += 1) {
    out.push(addDays(checkin, i));
  }
  return out;
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

async function loadPropertyByCodeOrThrow(
  admin: SupabaseClient,
  orgId: string,
  propertyCode: string,
) {
  const { data, error } = await admin
    .from("debacu_eval_properties")
    .select("id, org_id, code, name, category, rooms_total")
    .eq("org_id", orgId)
    .eq("code", propertyCode)
    .maybeSingle();

  if (error) throw new Error(`failed_load_property:${error.message}`);
  if (!data?.id) throw new Error("PROPERTY_NOT_FOUND");

  const row = data as PropertyRow;

  return {
    id: String(row.id),
    code: String(row.code ?? "").trim(),
    name:
      String(row.name ?? "").trim() ||
      String(row.category ?? "").trim() ||
      String(row.code ?? "").trim() ||
      "Sin nombre",
    roomsCount: toNumber(row.rooms_total),
  };
}

async function loadReservationsForRange(
  admin: SupabaseClient,
  orgId: string,
  propertyCode: string,
  from: string,
  to: string,
): Promise<ReservationRow[]> {
  const pageSize = 1000;
  let offset = 0;
  const allRows: ReservationRow[] = [];

  while (true) {
    const { data, error } = await admin
      .from("debacu_eval_reservations")
      .select(
        "org_id, property_code, reservation_id, booking_date, checkin_date, checkout_date, reservation_status, gross_revenue, rooms",
      )
      .eq("org_id", orgId)
      .eq("property_code", propertyCode)
      .in("reservation_status", ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"])
      .lte("checkin_date", to)
      .gt("checkout_date", from)
      .order("checkin_date", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`failed_load_reservations:${error.message}`);

    const batch = (data ?? []) as ReservationRow[];
    allRows.push(...batch);

    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return allRows;
}

function buildLedgerRows(
  reservations: ReservationRow[],
  from: string,
  to: string,
): LedgerInsertRow[] {
  const rows: LedgerInsertRow[] = [];

  for (const r of reservations) {
    const reservationId = String(r.reservation_id ?? "").trim();
    const propertyCode = String(r.property_code ?? "").trim();
    const bookingDate = r.booking_date ? String(r.booking_date).trim() : null;
    const checkinDate = String(r.checkin_date ?? "").trim();
    const checkoutDate = String(r.checkout_date ?? "").trim();

    if (!reservationId) continue;
    if (!propertyCode) continue;
    if (!isISODate(checkinDate)) continue;

    const rooms = Math.max(1, Math.trunc(toNumber(r.rooms) || 1));
    const grossRevenue = toNumber(r.gross_revenue);

    let stayDates: string[] = [];

    if (isISODate(checkoutDate) && checkoutDate > checkinDate) {
      stayDates = eachStayDate(checkinDate, checkoutDate);
    } else {
      stayDates = [checkinDate];
    }

    const filteredStayDates = stayDates.filter((d) => d >= from && d <= to);
    if (filteredStayDates.length === 0) continue;

    const revenuePerStayDate =
      filteredStayDates.length > 0 ? round6(grossRevenue / stayDates.length) : 0;

    for (const stayDate of filteredStayDates) {
      rows.push({
        org_id: String(r.org_id),
        property_code: propertyCode,
        reservation_id: reservationId,
        stay_date: stayDate,
        rooms,
        revenue: revenuePerStayDate,
        booking_date: bookingDate && isISODate(bookingDate) ? bookingDate : null,
      });
    }
  }

  return rows;
}

async function deleteLedgerRange(
  admin: SupabaseClient,
  orgId: string,
  propertyCode: string,
  from: string,
  to: string,
) {
  const { error } = await admin
    .from("debacu_eval_reservation_daily_ledger")
    .delete()
    .eq("org_id", orgId)
    .eq("property_code", propertyCode)
    .gte("stay_date", from)
    .lte("stay_date", to);

  if (error) throw new Error(`failed_delete_ledger_range:${error.message}`);
}

async function insertLedgerRows(
  admin: SupabaseClient,
  rows: LedgerInsertRow[],
) {
  if (rows.length === 0) return { inserted: 0 };

  const batchSize = 1000;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    const { error } = await admin
      .from("debacu_eval_reservation_daily_ledger")
      .insert(batch);

    if (error) throw new Error(`failed_insert_ledger_rows:${error.message}`);
    inserted += batch.length;
  }

  return { inserted };
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
    const propertyCode = String(body?.property_code ?? body?.propertyCode ?? "").trim();
    const from = String(body?.from ?? "").trim();
    const to = String(body?.to ?? "").trim();
    const appId = String(body?.app_id ?? DEFAULT_APP_ID).trim() || DEFAULT_APP_ID;

    if (appId !== DEFAULT_APP_ID) {
      return json(req, 400, { ok: false, error: "invalid_app_id" });
    }

    if (!propertyCode) {
      return json(req, 400, { ok: false, error: "missing_property_code" });
    }

    if (!from || !to) {
      return json(req, 400, { ok: false, error: "missing_from_to" });
    }

    if (!isISODate(from) || !isISODate(to)) {
      return json(req, 400, { ok: false, error: "invalid_date_format" });
    }

    if (from > to) {
      return json(req, 400, { ok: false, error: "invalid_range" });
    }

    const { org_id, org_id_resolved_by } = await resolveOrgIdOrThrow(
      admin,
      user.id,
      requestedOrgId,
    );

    const ent = await loadEntitlementsOrThrow(admin, org_id);
    assertPlanEnabledOrThrow(ent);

    const property = await loadPropertyByCodeOrThrow(admin, org_id, propertyCode);

    const reservations = await loadReservationsForRange(
      admin,
      org_id,
      property.code,
      from,
      to,
    );

    await deleteLedgerRange(admin, org_id, property.code, from, to);

    const ledgerRows = buildLedgerRows(reservations, from, to);
    const { inserted } = await insertLedgerRows(admin, ledgerRows);

    const reservationsRead = reservations.length;
    const affectedReservationIds = new Set(
      reservations
        .map((r) => String(r.reservation_id ?? "").trim())
        .filter(Boolean),
    );

    return json(req, 200, {
      ok: true,
      meta: {
        app_id: appId,
        org_id,
        org_id_resolved_by,
        customer_id: String(ent.customer_id),
        plan_code: ent.plan_code ?? null,
        subscription_status: ent.subscription_status ?? null,
        source_table: "debacu_eval_reservations",
        target_table: "debacu_eval_reservation_daily_ledger",
      },
      data: {
        property: {
          id: property.id,
          code: property.code,
          name: property.name,
          roomsCount: property.roomsCount,
        },
        range: {
          from,
          to,
        },
        stats: {
          reservationsRead,
          affectedReservations: affectedReservationIds.size,
          ledgerRowsInserted: inserted,
        },
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
      msg === "invalid_app_id" ||
      msg === "missing_property_code" ||
      msg === "missing_from_to" ||
      msg === "invalid_date_format" ||
      msg === "invalid_range"
    ) {
      return json(req, 400, { ok: false, error: msg });
    }

    if (msg === "FORBIDDEN") {
      return json(req, 403, { ok: false, error: "FORBIDDEN" });
    }

    if (msg === "PROPERTY_NOT_FOUND") {
      return json(req, 404, { ok: false, error: "PROPERTY_NOT_FOUND" });
    }

    console.error("debacu_eval_reservation_ledger_rebuild error:", msg);

    return json(req, 500, {
      ok: false,
      error: "request_failed",
      detail: "internal_error",
    });
  }
});