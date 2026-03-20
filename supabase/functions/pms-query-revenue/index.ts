// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

// ============================================================
// pms-query-revenue
// Analytics de revenue desde tablas canónicas PMS:
// ADR, RevPAR, Ocupación, Pickup, Channel Mix, Segment Mix
// Comparativa vs período anterior opcional
// ============================================================

type ReqBody = {
  property_id: string;
  date_from: string;   // YYYY-MM-DD
  date_to: string;     // YYYY-MM-DD
  compare_with?: {
    date_from: string;
    date_to: string;
  } | null;
  rooms_total?: number | null; // override del número de habitaciones
};

function clean(v?: string | null): string {
  return String(v ?? "").trim();
}

function daysBetween(from: string, to: string): number {
  const f = new Date(from).getTime();
  const t = new Date(to).getTime();
  return Math.max(1, Math.ceil((t - f) / (1000 * 60 * 60 * 24)) + 1);
}

function pctChange(current: number, prev: number): string | null {
  if (!prev || prev === 0) return null;
  const pct = ((current - prev) / Math.abs(prev)) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function firstDayOfPrevPeriod(dateFrom: string, dateTo: string): { from: string; to: string } {
  const days = daysBetween(dateFrom, dateTo);
  const fromDate = new Date(dateFrom);
  const prevTo = new Date(fromDate);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - days + 1);
  return {
    from: prevFrom.toISOString().substring(0, 10),
    to: prevTo.toISOString().substring(0, 10),
  };
}

async function calcMetrics(
  sb: ReturnType<typeof import("../../../_shared/auth.ts").supabaseServiceClient>,
  propertyId: string,
  orgId: string,
  dateFrom: string,
  dateTo: string,
  roomsTotal: number,
) {
  const days = daysBetween(dateFrom, dateTo);

  // Reservas del período (checkout_date en el rango para revenue real)
  // Usamos check_in_date en el rango para ocupación forward-looking
  const { data: reservations, error } = await sb
    .from("pms_reservations")
    .select(`
      external_reservation_id,
      status,
      check_in_date,
      check_out_date,
      nights,
      adults,
      channel_code,
      channel_name,
      segment_code,
      segment_name,
      rate_plan_code,
      rate_plan_name,
      currency_code,
      room_revenue_amount,
      total_amount,
      booked_at
    `)
    .eq("property_id", propertyId)
    .eq("org_id", orgId)
    .gte("check_in_date", dateFrom)
    .lte("check_in_date", dateTo)
    .not("status", "in", '("CANCELLED","NO_SHOW")')
    .order("check_in_date", { ascending: true });

  if (error) throw new Error(`REVENUE_QUERY_FAILED: ${error.message}`);

  const resList = reservations ?? [];

  // Métricas base
  const totalRoomRevenue = resList.reduce((sum, r) => sum + (r.room_revenue_amount ?? 0), 0);
  const totalRevenue = resList.reduce((sum, r) => sum + (r.total_amount ?? 0), 0);
  const totalNights = resList.reduce((sum, r) => sum + (r.nights ?? 1), 0);
  const totalRooms = resList.length;

  const availableRoomNights = roomsTotal * days;

  const adr = totalNights > 0 ? totalRoomRevenue / totalNights : 0;
  const revpar = availableRoomNights > 0 ? totalRoomRevenue / availableRoomNights : 0;
  const occupancy = availableRoomNights > 0 ? (totalNights / availableRoomNights) * 100 : 0;

  // Pickup — reservas nuevas por día (booked_at en el período)
  const pickupMap = new Map<string, { newReservations: number; newRevenue: number }>();
  resList.forEach((r) => {
    if (!r.booked_at) return;
    const day = r.booked_at.substring(0, 10);
    if (day < dateFrom || day > dateTo) return;
    if (!pickupMap.has(day)) pickupMap.set(day, { newReservations: 0, newRevenue: 0 });
    const entry = pickupMap.get(day)!;
    entry.newReservations++;
    entry.newRevenue += r.total_amount ?? 0;
  });

  const pickup = [...pickupMap.entries()]
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Pickup acumulado (pace)
  let cumRevenue = 0;
  let cumReservations = 0;
  const pickupWithCumulative = pickup.map((p) => {
    cumRevenue += p.newRevenue;
    cumReservations += p.newReservations;
    return { ...p, cumulativeRevenue: cumRevenue, cumulativeReservations: cumReservations };
  });

  // Channel mix
  const channelMixMap = new Map<string, { reservations: number; revenue: number; nights: number }>();
  resList.forEach((r) => {
    const ch = r.channel_code ?? "UNKNOWN";
    if (!channelMixMap.has(ch)) channelMixMap.set(ch, { reservations: 0, revenue: 0, nights: 0 });
    const e = channelMixMap.get(ch)!;
    e.reservations++;
    e.revenue += r.total_amount ?? 0;
    e.nights += r.nights ?? 1;
  });

  const channelMix = [...channelMixMap.entries()]
    .map(([channelCode, data]) => ({
      channelCode,
      channelName: resList.find((r) => r.channel_code === channelCode)?.channel_name ?? channelCode,
      reservations: data.reservations,
      revenue: data.revenue,
      nights: data.nights,
      adr: data.nights > 0 ? data.revenue / data.nights : 0,
      pct: totalRooms > 0 ? Math.round((data.reservations / totalRooms) * 1000) / 10 : 0,
      revenuePct: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Segment mix
  const segmentMixMap = new Map<string, { reservations: number; revenue: number; nights: number }>();
  resList.forEach((r) => {
    const seg = r.segment_code ?? r.segment_name ?? "UNKNOWN";
    if (!segmentMixMap.has(seg)) segmentMixMap.set(seg, { reservations: 0, revenue: 0, nights: 0 });
    const e = segmentMixMap.get(seg)!;
    e.reservations++;
    e.revenue += r.total_amount ?? 0;
    e.nights += r.nights ?? 1;
  });

  const segmentMix = [...segmentMixMap.entries()]
    .map(([segmentCode, data]) => ({
      segmentCode,
      reservations: data.reservations,
      revenue: data.revenue,
      nights: data.nights,
      adr: data.nights > 0 ? data.revenue / data.nights : 0,
      pct: totalRooms > 0 ? Math.round((data.reservations / totalRooms) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Rate plan mix
  const ratePlanMap = new Map<string, { reservations: number; revenue: number }>();
  resList.forEach((r) => {
    const rp = r.rate_plan_code ?? "UNKNOWN";
    if (!ratePlanMap.has(rp)) ratePlanMap.set(rp, { reservations: 0, revenue: 0 });
    const e = ratePlanMap.get(rp)!;
    e.reservations++;
    e.revenue += r.total_amount ?? 0;
  });

  const ratePlanMix = [...ratePlanMap.entries()]
    .map(([ratePlanCode, data]) => ({
      ratePlanCode,
      ratePlanName: resList.find((r) => r.rate_plan_code === ratePlanCode)?.rate_plan_name ?? ratePlanCode,
      reservations: data.reservations,
      revenue: data.revenue,
      pct: totalRooms > 0 ? Math.round((data.reservations / totalRooms) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Distribución de llegadas por día
  const arrivalsByDay = new Map<string, { reservations: number; adults: number; revenue: number }>();
  resList.forEach((r) => {
    if (!r.check_in_date) return;
    if (!arrivalsByDay.has(r.check_in_date)) {
      arrivalsByDay.set(r.check_in_date, { reservations: 0, adults: 0, revenue: 0 });
    }
    const e = arrivalsByDay.get(r.check_in_date)!;
    e.reservations++;
    e.adults += r.adults ?? 1;
    e.revenue += r.total_amount ?? 0;
  });

  const arrivalCalendar = [...arrivalsByDay.entries()]
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    metrics: {
      adr: Math.round(adr * 100) / 100,
      revpar: Math.round(revpar * 100) / 100,
      occupancy: Math.round(occupancy * 10) / 10,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalRoomRevenue: Math.round(totalRoomRevenue * 100) / 100,
      totalReservations: totalRooms,
      totalNights,
      availableRoomNights,
      avgNightsPerStay: totalRooms > 0 ? Math.round((totalNights / totalRooms) * 10) / 10 : 0,
    },
    pickup: pickupWithCumulative,
    channelMix,
    segmentMix,
    ratePlanMix,
    arrivalCalendar,
    currencyCode: resList[0]?.currency_code ?? "EUR",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "method_not_allowed" });
  }

  const sb = supabaseServiceClient();

  try {
    const user = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as ReqBody;

    const propertyId = clean(body.property_id);
    const dateFrom = clean(body.date_from);
    const dateTo = clean(body.date_to);

    if (!propertyId) throw new Error("PROPERTY_ID_REQUIRED");
    if (!dateFrom || !dateTo) throw new Error("DATE_RANGE_REQUIRED");

    // Verificar acceso
    const { data: property, error: propErr } = await sb
      .from("debacu_eval_properties")
      .select("id, org_id, name, rooms_count")
      .eq("id", propertyId)
      .single();

    if (propErr || !property) throw new Error("PROPERTY_NOT_FOUND");

    const { data: membership } = await sb
      .from("debacu_eval_org_members")
      .select("id")
      .eq("org_id", property.org_id)
      .eq("user_id", user.id)
      .eq("status", "ACTIVE")
      .single();

    if (!membership) throw new Error("NO_ORG_MEMBERSHIP");

    // Verificar conexión PMS
    const { data: connection } = await sb
      .from("pms_connections")
      .select("id, provider_code, last_sync_at")
      .eq("property_id", propertyId)
      .eq("status", "ACTIVE")
      .limit(1)
      .single();

    if (!connection) {
      return json(req, 200, {
        ok: true,
        data: { propertyId, connectionStatus: "NO_CONNECTION" },
      });
    }

    const roomsTotal = body.rooms_total ?? property.rooms_count ?? 10;

    // Período actual
    const current = await calcMetrics(
      sb, propertyId, property.org_id, dateFrom, dateTo, roomsTotal,
    );

    // Período de comparación (automático o manual)
    const comparePeriod = body.compare_with ?? firstDayOfPrevPeriod(dateFrom, dateTo);
    const previous = await calcMetrics(
      sb, propertyId, property.org_id, comparePeriod.from, comparePeriod.to, roomsTotal,
    );

    // Calcular variaciones
    const variations = {
      adr: pctChange(current.metrics.adr, previous.metrics.adr),
      revpar: pctChange(current.metrics.revpar, previous.metrics.revpar),
      occupancy: pctChange(current.metrics.occupancy, previous.metrics.occupancy),
      totalRevenue: pctChange(current.metrics.totalRevenue, previous.metrics.totalRevenue),
      totalReservations: pctChange(current.metrics.totalReservations, previous.metrics.totalReservations),
    };

    const days = daysBetween(dateFrom, dateTo);

    return json(req, 200, {
      ok: true,
      data: {
        propertyId,
        propertyName: property.name,
        connectionStatus: "CONNECTED",
        providerCode: connection.provider_code,
        lastSyncAt: connection.last_sync_at,
        roomsTotal,
        period: { from: dateFrom, to: dateTo, days },
        comparePeriod: { from: comparePeriod.from, to: comparePeriod.to },

        // Métricas actuales con variaciones
        metrics: {
          adr: { value: current.metrics.adr, currency: current.currencyCode, vs_prev: variations.adr },
          revpar: { value: current.metrics.revpar, currency: current.currencyCode, vs_prev: variations.revpar },
          occupancy: { value: current.metrics.occupancy, unit: "%", vs_prev: variations.occupancy },
          totalRevenue: { value: current.metrics.totalRevenue, currency: current.currencyCode, vs_prev: variations.totalRevenue },
          totalReservations: { value: current.metrics.totalReservations, vs_prev: variations.totalReservations },
          totalNights: current.metrics.totalNights,
          avgNightsPerStay: current.metrics.avgNightsPerStay,
          availableRoomNights: current.metrics.availableRoomNights,
        },

        // Período anterior (para comparación detallada)
        previousMetrics: {
          adr: previous.metrics.adr,
          revpar: previous.metrics.revpar,
          occupancy: previous.metrics.occupancy,
          totalRevenue: previous.metrics.totalRevenue,
        },

        // Análisis detallado
        pickup: current.pickup,
        channelMix: current.channelMix,
        segmentMix: current.segmentMix,
        ratePlanMix: current.ratePlanMix,
        arrivalCalendar: current.arrivalCalendar,
        currencyCode: current.currencyCode,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg === "UNAUTHENTICATED") return json(req, 401, { ok: false, error: "UNAUTHENTICATED" });
    if (msg === "NO_ORG_MEMBERSHIP") return json(req, 403, { ok: false, error: "NO_ORG_MEMBERSHIP" });
    if (msg === "PROPERTY_NOT_FOUND") return json(req, 404, { ok: false, error: "PROPERTY_NOT_FOUND" });
    if (["PROPERTY_ID_REQUIRED", "DATE_RANGE_REQUIRED"].includes(msg)) {
      return json(req, 400, { ok: false, error: msg });
    }

    console.error("pms-query-revenue error:", msg);
    return json(req, 500, { ok: false, error: "internal_error", detail: msg });
  }
});