// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

// ============================================================
// pms-query-future-reservations
// Pre-screening de reservas futuras con cruce de riesgo
// Lee de pms_reservations + pms_guests + debacu_eval_identity_risk_state
// ============================================================

type ReqBody = {
  property_id: string;
  date_from?: string | null;  // YYYY-MM-DD, default = hoy
  date_to?: string | null;    // YYYY-MM-DD, default = fin de año
  statuses?: string[];
  limit?: number;
};

function clean(v?: string | null): string {
  return String(v ?? "").trim();
}

function todayStr(): string {
  return new Date().toISOString().substring(0, 10);
}

function endOfYearStr(): string {
  return `${new Date().getFullYear()}-12-31`;
}

function normalizeRiskLevel(v?: string | null): string {
  const s = (v ?? "").toUpperCase();
  if (s === "HIGH" || s === "ALTO" || s === "CRITICAL") return "HIGH";
  if (s === "MEDIUM" || s === "MEDIO") return "MEDIUM";
  if (s === "LOW" || s === "BAJO") return "LOW";
  if (s === "NONE" || s === "SIN_SEÑALES") return "NONE";
  return "UNKNOWN";
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
    if (!propertyId) throw new Error("PROPERTY_ID_REQUIRED");

    const dateFrom = clean(body.date_from) || todayStr();
    const dateTo = clean(body.date_to) || endOfYearStr();
    const limitRows = Math.min(body.limit ?? 500, 1000);

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
        data: {
          propertyId,
          propertyName: property.name,
          connectionStatus: "NO_CONNECTION",
          period: { from: dateFrom, to: dateTo },
          totalReservations: 0,
          riskSummary: { HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0, UNKNOWN: 0 },
          upcomingAlerts: [],
          reservations: [],
          channelMix: [],
          lastSyncAt: null,
        },
      });
    }

    // 1. Obtener reservas futuras
    const { data: reservations, error: resErr } = await sb
      .from("pms_reservations")
      .select(`
        external_reservation_id,
        external_confirmation_code,
        external_guest_id,
        external_primary_room_type_id,
        status,
        raw_status,
        check_in_date,
        check_out_date,
        nights,
        adults,
        children,
        channel_code,
        channel_name,
        segment_code,
        segment_name,
        rate_plan_code,
        rate_plan_name,
        currency_code,
        room_revenue_amount,
        total_amount,
        booked_at,
        source_updated_at
      `)
      .eq("property_id", propertyId)
      .eq("org_id", property.org_id)
      .gte("check_in_date", dateFrom)
      .lte("check_in_date", dateTo)
      .in("status", ["CONFIRMED", "PENDING", "IN_HOUSE"])
      .order("check_in_date", { ascending: true })
      .limit(limitRows);

    if (resErr) throw new Error(`RESERVATIONS_QUERY_FAILED: ${resErr.message}`);

    const resList = reservations ?? [];

    if (resList.length === 0) {
      return json(req, 200, {
        ok: true,
        data: {
          propertyId,
          propertyName: property.name,
          connectionStatus: "CONNECTED",
          providerCode: connection.provider_code,
          lastSyncAt: connection.last_sync_at,
          period: { from: dateFrom, to: dateTo },
          totalReservations: 0,
          riskSummary: { HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0, UNKNOWN: 0 },
          upcomingAlerts: [],
          reservations: [],
          channelMix: [],
        },
      });
    }

    // 2. Obtener perfiles de huéspedes
    const guestIds = resList
      .map((r) => r.external_guest_id)
      .filter(Boolean) as string[];

    let guestMap = new Map<string, {
      email_key: string | null;
      document_key: string | null;
      name_key: string | null;
      nationality_code: string | null;
      country_code: string | null;
    }>();

    if (guestIds.length > 0) {
      // Deduplicar
      const uniqueGuestIds = [...new Set(guestIds)];
      const { data: guests } = await sb
        .from("pms_guests")
        .select("external_guest_id, email_key, document_key, name_key, nationality_code, country_code")
        .eq("org_id", property.org_id)
        .in("external_guest_id", uniqueGuestIds);

      (guests ?? []).forEach((g) => guestMap.set(g.external_guest_id, g));
    }

    // 3. Cruzar con motor de riesgo
    const identityKeys = [...guestMap.values()]
      .map((g) => g.email_key ?? g.document_key ?? g.name_key)
      .filter(Boolean) as string[];

    let riskMap = new Map<string, {
      risk_level: string | null;
      risk_score: number | null;
      incidents_total: number | null;
      incidents_high: number | null;
      distinct_orgs_count: number | null;
      last_incident_at: string | null;
    }>();

    if (identityKeys.length > 0) {
      const uniqueKeys = [...new Set(identityKeys)];
      const { data: riskStates } = await sb
        .from("debacu_eval_identity_risk_state")
        .select(`
          identity_key, risk_level, risk_score, incidents_total,
          incidents_high, distinct_orgs_count, last_incident_at
        `)
        .in("identity_key", uniqueKeys);

      (riskStates ?? []).forEach((r) => riskMap.set(r.identity_key, r));
    }

    // 4. Construir resultado enriquecido
    const enrichedReservations = resList.map((res) => {
      const guest = guestMap.get(res.external_guest_id ?? "");
      const identityKey = guest?.email_key ?? guest?.document_key ?? guest?.name_key ?? null;
      const riskState = identityKey ? riskMap.get(identityKey) : null;
      const riskLevel = normalizeRiskLevel(riskState?.risk_level);

      const alertType = riskLevel === "HIGH"
        ? "HIGH_RISK_ARRIVAL"
        : riskLevel === "MEDIUM"
        ? "MEDIUM_RISK_ARRIVAL"
        : null;

      return {
        reservationId: res.external_reservation_id,
        confirmationCode: res.external_confirmation_code,
        status: res.status,
        rawStatus: res.raw_status,

        // Fechas
        checkInDate: res.check_in_date,
        checkOutDate: res.check_out_date,
        nights: res.nights,
        bookedAt: res.booked_at,

        // Ocupación
        adults: res.adults,
        children: res.children,

        // Canal y segmento
        channelCode: res.channel_code,
        channelName: res.channel_name,
        segmentCode: res.segment_code,
        segmentName: res.segment_name,
        ratePlanCode: res.rate_plan_code,
        ratePlanName: res.rate_plan_name,

        // Revenue
        currencyCode: res.currency_code,
        roomRevenueAmount: res.room_revenue_amount,
        totalAmount: res.total_amount,

        // Identidad (sin PII)
        hasIdentity: !!identityKey,
        nationalityCode: guest?.nationality_code ?? null,
        countryCode: guest?.country_code ?? null,

        // Riesgo
        riskLevel,
        riskScore: riskState?.risk_score ?? null,
        incidentsTotal: riskState?.incidents_total ?? null,
        incidentsHigh: riskState?.incidents_high ?? null,
        distinctOrgsCount: riskState?.distinct_orgs_count ?? null,
        lastIncidentAt: riskState?.last_incident_at ?? null,
        hasRiskSignals: riskLevel === "HIGH" || riskLevel === "MEDIUM",
        alertType,
      };
    });

    // 5. Risk summary
    const riskSummary = {
      HIGH: enrichedReservations.filter((r) => r.riskLevel === "HIGH").length,
      MEDIUM: enrichedReservations.filter((r) => r.riskLevel === "MEDIUM").length,
      LOW: enrichedReservations.filter((r) => r.riskLevel === "LOW").length,
      NONE: enrichedReservations.filter((r) => r.riskLevel === "NONE").length,
      UNKNOWN: enrichedReservations.filter((r) => r.riskLevel === "UNKNOWN").length,
    };

    // 6. Alertas prioritarias (HIGH + MEDIUM)
    const upcomingAlerts = enrichedReservations
      .filter((r) => r.hasRiskSignals)
      .slice(0, 50);

    // 7. Channel mix
    const channelMixMap = new Map<string, { reservations: number; revenue: number }>();
    let totalRevenue = 0;

    resList.forEach((r) => {
      const ch = r.channel_code ?? "UNKNOWN";
      const rev = r.total_amount ?? 0;
      totalRevenue += rev;
      if (!channelMixMap.has(ch)) {
        channelMixMap.set(ch, { reservations: 0, revenue: 0 });
      }
      const entry = channelMixMap.get(ch)!;
      entry.reservations++;
      entry.revenue += rev;
    });

    const channelMix = [...channelMixMap.entries()]
      .map(([channelCode, data]) => ({
        channelCode,
        reservations: data.reservations,
        revenue: data.revenue,
        pct: resList.length > 0
          ? Math.round((data.reservations / resList.length) * 1000) / 10
          : 0,
        revenuePct: totalRevenue > 0
          ? Math.round((data.revenue / totalRevenue) * 1000) / 10
          : 0,
      }))
      .sort((a, b) => b.reservations - a.reservations);

    // 8. Segment mix
    const segmentMixMap = new Map<string, { reservations: number; revenue: number }>();
    resList.forEach((r) => {
      const seg = r.segment_code ?? r.segment_name ?? "UNKNOWN";
      const rev = r.total_amount ?? 0;
      if (!segmentMixMap.has(seg)) segmentMixMap.set(seg, { reservations: 0, revenue: 0 });
      const entry = segmentMixMap.get(seg)!;
      entry.reservations++;
      entry.revenue += rev;
    });

    const segmentMix = [...segmentMixMap.entries()]
      .map(([segmentCode, data]) => ({
        segmentCode,
        reservations: data.reservations,
        revenue: data.revenue,
        pct: resList.length > 0
          ? Math.round((data.reservations / resList.length) * 1000) / 10
          : 0,
      }))
      .sort((a, b) => b.reservations - a.reservations);

    return json(req, 200, {
      ok: true,
      data: {
        propertyId,
        propertyName: property.name,
        connectionStatus: "CONNECTED",
        providerCode: connection.provider_code,
        lastSyncAt: connection.last_sync_at,
        period: { from: dateFrom, to: dateTo, days: Math.ceil((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / (1000 * 60 * 60 * 24)) },
        totalReservations: resList.length,
        totalRevenue,
        riskSummary,
        upcomingAlerts,
        reservations: enrichedReservations,
        channelMix,
        segmentMix,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg === "UNAUTHENTICATED") return json(req, 401, { ok: false, error: "UNAUTHENTICATED" });
    if (msg === "NO_ORG_MEMBERSHIP") return json(req, 403, { ok: false, error: "NO_ORG_MEMBERSHIP" });
    if (msg === "PROPERTY_NOT_FOUND") return json(req, 404, { ok: false, error: "PROPERTY_NOT_FOUND" });
    if (msg === "PROPERTY_ID_REQUIRED") return json(req, 400, { ok: false, error: "PROPERTY_ID_REQUIRED" });

    console.error("pms-query-future-reservations error:", msg);
    return json(req, 500, { ok: false, error: "internal_error", detail: msg });
  }
});