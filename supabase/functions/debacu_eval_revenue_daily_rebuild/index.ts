// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

/* ======================================================
 * Env + client
 * ====================================================== */
function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

function supabaseServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/* ======================================================
 * Response helpers
 * ====================================================== */
function ok(req: Request, data: unknown, status = 200) {
  return json(req, status, {
    ok: true,
    data,
  });
}

function fail(
  req: Request,
  status: number,
  detail: string,
  extra?: Record<string, unknown>,
) {
  return json(req, status, {
    ok: false,
    error: "request_failed",
    detail,
    ...(extra ?? {}),
  });
}

/* ======================================================
 * Helpers
 * ====================================================== */
function toNullableString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function normalizeDateInput(value: unknown): string | null {
  const s = toNullableString(value);
  if (!s) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(`invalid_date:${s}`);
  }

  return s;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    result.push(items.slice(i, i + chunkSize));
  }
  return result;
}

/* ======================================================
 * Auth / membership
 * ====================================================== */
async function resolveOrgForUser(
  sb: ReturnType<typeof supabaseServiceClient>,
  userId: string,
  orgIdInput?: string | null,
): Promise<string> {
  const requestedOrgId = String(orgIdInput ?? "").trim();

  if (requestedOrgId) {
    const { data, error } = await sb
      .from("debacu_eval_org_members")
      .select("org_id")
      .eq("user_id", userId)
      .eq("org_id", requestedOrgId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (error) throw new Error(`membership_check_failed:${error.message}`);
    if (!data?.org_id) throw new Error("FORBIDDEN");

    return String(data.org_id);
  }

  const { data, error } = await sb
    .from("debacu_eval_org_members")
    .select("org_id, created_at")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`membership_lookup_failed:${error.message}`);
  if (!data?.org_id) throw new Error("FORBIDDEN");

  return String(data.org_id);
}

/* ======================================================
 * Property resolution
 * ====================================================== */
type PropertyLite = {
  id: string;
  org_id: string;
  code: string;
  name: string;
 };

async function resolvePropertyOrThrow(
  sb: ReturnType<typeof supabaseServiceClient>,
  orgId: string,
  propertyId: string,
): Promise<PropertyLite> {
  const { data, error } = await sb
    .from("debacu_eval_properties")
    .select("id, org_id, code, name")
    .eq("id", propertyId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    throw new Error(`property_lookup_failed:${error.message}`);
  }

  if (!data?.id) {
    throw new Error("property_not_found");
  }

    return {
    id: String(data.id),
    org_id: String(data.org_id),
    code: String(data.code),
    name: String(data.name),
  };
}

async function resolveDateRangeFromStayNights(
  sb: ReturnType<typeof supabaseServiceClient>,
  orgId: string,
  propertyCode: string,
): Promise<{ dateFrom: string | null; dateTo: string | null }> {
  const { data, error } = await sb
    .from("debacu_eval_stay_nights")
    .select("stay_date")
    .eq("org_id", orgId)
    .eq("property_code", propertyCode)
    .order("stay_date", { ascending: true });

  if (error) {
    throw new Error(`stay_nights_range_lookup_failed:${error.message}`);
  }

  if (!data || data.length === 0) {
    return { dateFrom: null, dateTo: null };
  }

  const first = data[0]?.stay_date ? String(data[0].stay_date) : null;
  const last = data[data.length - 1]?.stay_date
    ? String(data[data.length - 1].stay_date)
    : null;

  return {
    dateFrom: first,
    dateTo: last,
  };
}

/* ======================================================
 * Aggregation
 * ====================================================== */
type StayNightRow = {
  stay_date: string;
  channel: string | null;
  segment: string | null;
  rooms: number | null;
  room_nights: number | null;
  allocated_gross_revenue: number | null;
  allocated_net_revenue: number | null;
};

type RevenueDailyInsertRow = {
  org_id: string;
  property_id: string;
  room_type_id: string | null;
  stay_date: string;
  channel: string | null;
  segment: string | null;
  rooms_sold: number;
  rooms_available: number | null;
  revenue_rooms: number;
  revenue_total: number;
  adr: number | null;
  revpar: number | null;
  source: string;
};

function buildRevenueKey(row: {
  stay_date: string;
  channel: string | null;
  segment: string | null;
}) {
  return [
    row.stay_date,
    row.channel ?? "__NULL__",
    row.segment ?? "__NULL__",
  ].join("|");
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function aggregateStayNightsToRevenueDaily(params: {
  orgId: string;
  propertyId: string;
  roomsAvailable: number | null;
  rows: StayNightRow[];
}): RevenueDailyInsertRow[] {
  const { orgId, propertyId, roomsAvailable, rows } = params;

  const map = new Map<string, RevenueDailyInsertRow>();

  for (const row of rows) {
    const stayDate = String(row.stay_date);
    const channel = toNullableString(row.channel);
    const segment = toNullableString(row.segment);

    const roomNights =
      typeof row.room_nights === "number"
        ? row.room_nights
        : Number(row.room_nights ?? 0);

    const allocatedGross =
      typeof row.allocated_gross_revenue === "number"
        ? row.allocated_gross_revenue
        : Number(row.allocated_gross_revenue ?? 0);

    const key = buildRevenueKey({
      stay_date: stayDate,
      channel,
      segment,
    });

    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        org_id: orgId,
        property_id: propertyId,
        room_type_id: null,
        stay_date: stayDate,
        channel,
        segment,
        rooms_sold: roomNights,
        rooms_available: roomsAvailable,
        revenue_rooms: allocatedGross,
        revenue_total: allocatedGross,
        adr: null,
        revpar: null,
        source: "CSV_IMPORT",
      });
      continue;
    }

    existing.rooms_sold += roomNights;
    existing.revenue_rooms += allocatedGross;
    existing.revenue_total += allocatedGross;
  }

  const result = Array.from(map.values()).map((row) => {
    const adr =
      row.rooms_sold > 0 ? round2(row.revenue_rooms / row.rooms_sold) : 0;

    const revpar =
      row.rooms_available && row.rooms_available > 0
        ? round2(row.revenue_rooms / row.rooms_available)
        : 0;

    return {
      ...row,
      rooms_sold: round2(row.rooms_sold),
      revenue_rooms: round2(row.revenue_rooms),
      revenue_total: round2(row.revenue_total),
      adr,
      revpar,
    };
  });

  result.sort((a, b) => {
    if (a.stay_date !== b.stay_date) return a.stay_date.localeCompare(b.stay_date);
    if ((a.channel ?? "") !== (b.channel ?? "")) {
      return (a.channel ?? "").localeCompare(b.channel ?? "");
    }
    return (a.segment ?? "").localeCompare(b.segment ?? "");
  });

  return result;
}

/* ======================================================
 * DB batch helpers
 * ====================================================== */
async function fetchStayNightRows(
  sb: ReturnType<typeof supabaseServiceClient>,
  params: {
    orgId: string;
    propertyCode: string;
    dateFrom: string;
    dateTo: string;
  },
): Promise<StayNightRow[]> {
  const { orgId, propertyCode, dateFrom, dateTo } = params;

  const { data, error } = await sb
    .from("debacu_eval_stay_nights")
    .select(
      "stay_date, channel, segment, rooms, room_nights, allocated_gross_revenue, allocated_net_revenue",
    )
    .eq("org_id", orgId)
    .eq("property_code", propertyCode)
    .gte("stay_date", dateFrom)
    .lte("stay_date", dateTo)
    .order("stay_date", { ascending: true });

  if (error) {
    throw new Error(`stay_nights_fetch_failed:${error.message}`);
  }

  return (data ?? []) as StayNightRow[];
}

async function deleteRevenueDailyRange(
  sb: ReturnType<typeof supabaseServiceClient>,
  params: {
    orgId: string;
    propertyId: string;
    dateFrom: string;
    dateTo: string;
  },
) {
  const { orgId, propertyId, dateFrom, dateTo } = params;

  const { error } = await sb
    .from("debacu_eval_revenue_daily")
    .delete()
    .eq("org_id", orgId)
    .eq("property_id", propertyId)
    .gte("stay_date", dateFrom)
    .lte("stay_date", dateTo);

  if (error) {
    throw new Error(`revenue_daily_delete_failed:${error.message}`);
  }
}

async function insertRevenueDailyRows(
  sb: ReturnType<typeof supabaseServiceClient>,
  rows: RevenueDailyInsertRow[],
) {
  if (rows.length === 0) return;

  const payload = rows.map((row) => ({
    ...row,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  for (const chunk of chunkArray(payload, 500)) {
    const { error } = await sb
      .from("debacu_eval_revenue_daily")
      .insert(chunk);

    if (error) {
      throw new Error(`revenue_daily_insert_failed:${error.message}`);
    }
  }
}

/* ======================================================
 * Main
 * ====================================================== */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed");

  try {
    const user = await requireUser(req);
    const sb = supabaseServiceClient();

    const body = await req.json().catch(() => ({}));

    const orgIdInput = toNullableString(body.org_id);
    const propertyId = toNullableString(body.property_id);
    const dateFromInput = normalizeDateInput(body.date_from);
    const dateToInput = normalizeDateInput(body.date_to);

    if (!propertyId) {
      return fail(req, 400, "property_id_required");
    }

    const orgId = await resolveOrgForUser(
      sb,
      String((user as any).id),
      orgIdInput,
    );

    const property = await resolvePropertyOrThrow(sb, orgId, propertyId);

    let dateFrom = dateFromInput;
    let dateTo = dateToInput;

    if (!dateFrom || !dateTo) {
      const detectedRange = await resolveDateRangeFromStayNights(
        sb,
        orgId,
        property.code,
      );

      dateFrom = dateFrom ?? detectedRange.dateFrom;
      dateTo = dateTo ?? detectedRange.dateTo;
    }

    if (!dateFrom || !dateTo) {
      return ok(req, {
        status: "ok",
        org_id: orgId,
        property_id: property.id,
        property_code: property.code,
        property_name: property.name,
        date_from: null,
        date_to: null,
        deleted_rows_range: 0,
        inserted_rows: 0,
        message: "No hay stay_nights para reconstruir revenue_daily en esta propiedad.",
      });
    }

    if (dateFrom > dateTo) {
      return fail(req, 400, "invalid_date_range");
    }

    const stayNightRows = await fetchStayNightRows(sb, {
      orgId,
      propertyCode: property.code,
      dateFrom,
      dateTo,
    });

    await deleteRevenueDailyRange(sb, {
      orgId,
      propertyId: property.id,
      dateFrom,
      dateTo,
    });

        const aggregatedRows = aggregateStayNightsToRevenueDaily({
      orgId,
      propertyId: property.id,
      roomsAvailable: null,
      rows: stayNightRows,
    });

    await insertRevenueDailyRows(sb, aggregatedRows);

    return ok(req, {
      status: "ok",
      org_id: orgId,
      property_id: property.id,
      property_code: property.code,
      property_name: property.name,
      date_from: dateFrom,
      date_to: dateTo,
      source_rows: stayNightRows.length,
      inserted_rows: aggregatedRows.length,
      rooms_available_strategy: "property.rooms_count",
      room_type_strategy: "null_grouped",
      source: "CSV_IMPORT",
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return fail(req, 401, "UNAUTHORIZED");
    }

    if (msg === "FORBIDDEN") {
      return fail(req, 403, "FORBIDDEN");
    }

    if (msg === "property_not_found") {
      return fail(req, 404, "property_not_found");
    }

    if (msg === "property_id_required") {
      return fail(req, 400, "property_id_required");
    }

    if (msg === "invalid_date_range") {
      return fail(req, 400, "invalid_date_range");
    }

    if (msg.startsWith("invalid_date:")) {
      return fail(req, 400, msg);
    }

    return fail(req, 500, "internal_error", {
      detail_message: extractErrorMessage(e),
    });
  }
});