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
  snapshot_date?: string | null;
  snapshotDate?: string | null;
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

type LedgerRow = {
  org_id: string;
  property_code: string;
  reservation_id: string | null;
  stay_date: string;
  rooms: number | string | null;
  revenue: number | string | null;
  booking_date: string | null;
};

type PickupSnapshotInsertRow = {
  org_id: string;
  property_code: string;
  snapshot_date: string;
  stay_date: string;
  rooms_sold: number;
  room_nights: number;
  revenue_rooms: number;
  reservations_count: number;
  created_at?: string;
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

async function loadLedgerRowsForSnapshot(
  admin: SupabaseClient,
  orgId: string,
  propertyCode: string,
  snapshotDate: string,
  from: string,
  to: string,
): Promise<LedgerRow[]> {
  const pageSize = 1000;
  let offset = 0;
  const allRows: LedgerRow[] = [];

  while (true) {
    const { data, error } = await admin
      .from("debacu_eval_reservation_daily_ledger")
      .select("org_id, property_code, reservation_id, stay_date, rooms, revenue, booking_date")
      .eq("org_id", orgId)
      .eq("property_code", propertyCode)
      .gte("stay_date", from)
      .lte("stay_date", to)
      .lte("booking_date", snapshotDate)
      .order("stay_date", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`failed_load_ledger_rows:${error.message}`);

    const batch = (data ?? []) as LedgerRow[];
    allRows.push(...batch);

    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return allRows;
}

function aggregatePickupSnapshots(
  rows: LedgerRow[],
  snapshotDate: string,
): PickupSnapshotInsertRow[] {
  const grouped = new Map<
    string,
    {
      stay_date: string;
      rooms_sold: number;
      room_nights: number;
      revenue_rooms: number;
      reservationIds: Set<string>;
    }
  >();

  for (const row of rows) {
    const stayDate = String(row.stay_date ?? "").trim();
    if (!isISODate(stayDate)) continue;

    const rooms = Math.max(0, toNumber(row.rooms));
    const revenue = toNumber(row.revenue);
    const reservationId = String(row.reservation_id ?? "").trim();

    const current = grouped.get(stayDate) ?? {
      stay_date: stayDate,
      rooms_sold: 0,
      room_nights: 0,
      revenue_rooms: 0,
      reservationIds: new Set<string>(),
    };

    current.rooms_sold += rooms;
    current.room_nights += rooms;
    current.revenue_rooms += revenue;

    if (reservationId) {
      current.reservationIds.add(reservationId);
    }

    grouped.set(stayDate, current);
  }

  return Array.from(grouped.values())
    .sort((a, b) => a.stay_date.localeCompare(b.stay_date))
    .map((row) => ({
      org_id: "",
      property_code: "",
      snapshot_date: snapshotDate,
      stay_date: row.stay_date,
      rooms_sold: round6(row.rooms_sold),
      room_nights: round6(row.room_nights),
      revenue_rooms: round6(row.revenue_rooms),
      reservations_count: row.reservationIds.size,
    }));
}

async function deleteSnapshotRange(
  admin: SupabaseClient,
  orgId: string,
  propertyCode: string,
  snapshotDate: string,
  from: string,
  to: string,
) {
  const { error } = await admin
    .from("debacu_eval_revenue_pickup_snapshots")
    .delete()
    .eq("org_id", orgId)
    .eq("property_code", propertyCode)
    .eq("snapshot_date", snapshotDate)
    .gte("stay_date", from)
    .lte("stay_date", to);

  if (error) throw new Error(`failed_delete_pickup_snapshots:${error.message}`);
}

async function insertSnapshotRows(
  admin: SupabaseClient,
  rows: PickupSnapshotInsertRow[],
) {
  if (rows.length === 0) return { inserted: 0 };

  const batchSize = 1000;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    const { error } = await admin
      .from("debacu_eval_revenue_pickup_snapshots")
      .insert(batch);

    if (error) throw new Error(`failed_insert_pickup_snapshots:${error.message}`);
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
    const snapshotDate =
      String(body?.snapshot_date ?? body?.snapshotDate ?? "").trim() ||
      new Date().toISOString().slice(0, 10);
    const from = String(body?.from ?? "").trim();
    const to = String(body?.to ?? "").trim();
    const appId = String(body?.app_id ?? DEFAULT_APP_ID).trim() || DEFAULT_APP_ID;

    if (appId !== DEFAULT_APP_ID) {
      return json(req, 400, { ok: false, error: "invalid_app_id" });
    }

    if (!propertyCode) {
      return json(req, 400, { ok: false, error: "missing_property_code" });
    }

    if (!snapshotDate || !isISODate(snapshotDate)) {
      return json(req, 400, { ok: false, error: "invalid_snapshot_date" });
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

    const ledgerRows = await loadLedgerRowsForSnapshot(
      admin,
      org_id,
      property.code,
      snapshotDate,
      from,
      to,
    );

    await deleteSnapshotRange(
      admin,
      org_id,
      property.code,
      snapshotDate,
      from,
      to,
    );

    const aggregatedRows = aggregatePickupSnapshots(ledgerRows, snapshotDate).map((row) => ({
      ...row,
      org_id,
      property_code: property.code,
    }));

    const { inserted } = await insertSnapshotRows(admin, aggregatedRows);

    return json(req, 200, {
      ok: true,
      meta: {
        app_id: appId,
        org_id,
        org_id_resolved_by,
        customer_id: String(ent.customer_id),
        plan_code: ent.plan_code ?? null,
        subscription_status: ent.subscription_status ?? null,
        source_table: "debacu_eval_reservation_daily_ledger",
        target_table: "debacu_eval_revenue_pickup_snapshots",
      },
      data: {
        property: {
          id: property.id,
          code: property.code,
          name: property.name,
          roomsCount: property.roomsCount,
        },
        snapshot: {
          snapshot_date: snapshotDate,
          from,
          to,
        },
        stats: {
          ledgerRowsRead: ledgerRows.length,
          snapshotRowsInserted: inserted,
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
      msg === "invalid_range" ||
      msg === "invalid_snapshot_date"
    ) {
      return json(req, 400, { ok: false, error: msg });
    }

    if (msg === "FORBIDDEN") {
      return json(req, 403, { ok: false, error: "FORBIDDEN" });
    }

    if (msg === "PROPERTY_NOT_FOUND") {
      return json(req, 404, { ok: false, error: "PROPERTY_NOT_FOUND" });
    }

    console.error("revenue_pickup_snapshot_rebuild error:", msg);

    return json(req, 500, {
      ok: false,
      error: "request_failed",
      detail: "internal_error",
    });
  }
});