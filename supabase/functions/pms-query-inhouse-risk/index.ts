// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

// ============================================================
// pms-query-inhouse-risk
// Huéspedes IN-HOUSE hoy + cruce con motor de riesgo Debacu
// Lee de pms_stays + pms_guests + debacu_eval_identity_risk_state
// NO llama al PMS — lee tablas canónicas ya sincronizadas
// ============================================================

type ReqBody = {
  property_id: string;
  date?: string | null;
};

function clean(v?: string | null): string {
  return String(v ?? "").trim();
}

function calculateNightsRemaining(departureDateStr?: string | null, from?: Date): number | null {
  if (!departureDateStr) return null;
  const departure = new Date(departureDateStr);
  const ref = from ?? new Date();
  return Math.max(0, Math.ceil((departure.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24)));
}

function calculateAlertPriority(riskLevel: string, nightsRemaining: number | null): string {
  const nights = nightsRemaining ?? 99;
  if (riskLevel === "HIGH" && nights <= 1) return "URGENT";
  if (riskLevel === "HIGH" && nights <= 3) return "HIGH";
  if (riskLevel === "HIGH") return "MEDIUM";
  if (riskLevel === "MEDIUM") return "MEDIUM";
  return "LOW";
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

    const propertyId = clean(body.property_id);
    if (!propertyId) throw new Error("PROPERTY_ID_REQUIRED");

    const queryDate = body.date ? new Date(body.date) : new Date();

    // Verificar propiedad y membresía
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

    // 1. Stays IN_HOUSE
    const { data: stays, error: staysErr } = await sb
      .from("pms_stays")
      .select("id, external_stay_id, external_reservation_id, external_guest_id, external_room_id, external_room_type_id, connection_id, stay_status, arrival_scheduled_at, departure_scheduled_at, check_in_at, adults, children, currency_code, room_revenue_amount, total_amount")
      .eq("property_id", propertyId)
      .eq("org_id", property.org_id)
      .eq("stay_status", "IN_HOUSE")
      .order("departure_scheduled_at", { ascending: true });

    if (staysErr) throw new Error("STAYS_QUERY_FAILED");

    if (!stays || stays.length === 0) {
      return json(req, 200, {
        ok: true,
        data: {
          propertyId, propertyName: property.name,
          date: queryDate.toISOString().split("T")[0],
          totalInHouse: 0, adultsTotal: 0,
          riskSummary: { URGENT: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
          guests: [], syncedAt: new Date().toISOString(),
        },
      });
    }

    // 2. Reservas asociadas para channel_code
    const extResIds = stays.map((s) => s.external_reservation_id).filter(Boolean) as string[];
    const reservationMap = new Map<string, { channel_code: string | null; nights: number | null }>();

    if (extResIds.length > 0) {
      const { data: reservations } = await sb
        .from("pms_reservations")
        .select("external_reservation_id, channel_code, nights")
        .eq("property_id", propertyId)
        .eq("org_id", property.org_id)
        .in("external_reservation_id", extResIds.slice(0, 100));

      for (const r of reservations ?? []) {
        reservationMap.set(r.external_reservation_id, { channel_code: r.channel_code, nights: r.nights });
      }
    }

    // 3. Guests → identity_keys
    const extGuestIds = stays.map((s) => s.external_guest_id).filter(Boolean) as string[];
    const connectionIds = [...new Set(stays.map((s) => s.connection_id))];
    const guestMap = new Map<string, { identity_key: string | null; nationality_code: string | null; country_code: string | null }>();

    if (extGuestIds.length > 0) {
      const { data: guests } = await sb
        .from("pms_guests")
        .select("external_guest_id, name_key, email_key, document_key, nationality_code, country_code")
        .eq("org_id", property.org_id)
        .in("connection_id", connectionIds)
        .in("external_guest_id", extGuestIds.slice(0, 200));

      for (const g of guests ?? []) {
        guestMap.set(g.external_guest_id, {
          identity_key: g.document_key ?? g.email_key ?? g.name_key ?? null,
          nationality_code: g.nationality_code,
          country_code: g.country_code,
        });
      }
    }

    // 4. Motor de riesgo Debacu
    const identityKeys = [...guestMap.values()].map((g) => g.identity_key).filter(Boolean) as string[];
    const riskStateMap = new Map<string, { risk_level: string; risk_score: number; incidents_total: number; incidents_high: number; last_incident_at: string | null }>();

    if (identityKeys.length > 0) {
      const { data: riskStates } = await sb
        .from("debacu_eval_identity_risk_state")
        .select("identity_key, risk_level, risk_score, incidents_total, incidents_high, last_incident_at")
        .in("identity_key", identityKeys.slice(0, 200));

      for (const rs of riskStates ?? []) {
        riskStateMap.set(rs.identity_key, {
          risk_level: rs.risk_level ?? "NONE",
          risk_score: rs.risk_score ?? 0,
          incidents_total: rs.incidents_total ?? 0,
          incidents_high: rs.incidents_high ?? 0,
          last_incident_at: rs.last_incident_at ?? null,
        });
      }
    }

    // 5. Construir resultado
    const riskSummary = { URGENT: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

    const result = stays.map((stay) => {
      const guestData = stay.external_guest_id ? guestMap.get(stay.external_guest_id) : null;
      const identityKey = guestData?.identity_key ?? null;
      const riskState = identityKey ? riskStateMap.get(identityKey) : null;
      const riskLevel = riskState?.risk_level ?? "UNKNOWN";
      const nightsRemaining = calculateNightsRemaining(stay.departure_scheduled_at, queryDate);
      const alertPriority = calculateAlertPriority(riskLevel, nightsRemaining);
      const resData = stay.external_reservation_id ? reservationMap.get(stay.external_reservation_id) : null;

      if (alertPriority === "URGENT") riskSummary.URGENT++;
      else if (alertPriority === "HIGH") riskSummary.HIGH++;
      else if (alertPriority === "MEDIUM") riskSummary.MEDIUM++;
      else riskSummary.LOW++;

      return {
        stayId: stay.external_stay_id ?? stay.id,
        roomId: stay.external_room_id ?? null,
        roomTypeId: stay.external_room_type_id ?? null,
        externalReservationId: stay.external_reservation_id ?? null,
        externalGuestId: stay.external_guest_id ?? null,
        arrivalScheduledAt: stay.arrival_scheduled_at ?? null,
        departureScheduledAt: stay.departure_scheduled_at ?? null,
        checkInAt: stay.check_in_at ?? null,
        nightsRemaining,
        adults: stay.adults ?? null,
        children: stay.children ?? null,
        channelCode: resData?.channel_code ?? null,
        nights: resData?.nights ?? null,
        currencyCode: stay.currency_code ?? null,
        roomRevenueAmount: stay.room_revenue_amount ?? null,
        totalAmount: stay.total_amount ?? null,
        identityKey,
        nationalityCode: guestData?.nationality_code ?? null,
        countryCode: guestData?.country_code ?? null,
        hasIdentityKey: !!identityKey,
        riskLevel,
        riskScore: riskState?.risk_score ?? 0,
        incidentsTotal: riskState?.incidents_total ?? 0,
        incidentsHigh: riskState?.incidents_high ?? 0,
        lastIncidentAt: riskState?.last_incident_at ?? null,
        hasRiskSignals: !!riskState && (riskState.incidents_total > 0),
        alertPriority,
      };
    }).sort((a, b) =>
      (priorityOrder[a.alertPriority as keyof typeof priorityOrder] ?? 3) -
      (priorityOrder[b.alertPriority as keyof typeof priorityOrder] ?? 3)
    );

    return json(req, 200, {
      ok: true,
      data: {
        propertyId, propertyName: property.name,
        date: queryDate.toISOString().split("T")[0],
        totalInHouse: result.length,
        adultsTotal: result.reduce((sum, g) => sum + (g.adults ?? 0), 0),
        riskSummary, guests: result,
        syncedAt: new Date().toISOString(),
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg === "UNAUTHENTICATED") return json(req, 401, { ok: false, error: "request_failed", detail: "UNAUTHENTICATED" });
    if (msg === "NO_ORG_MEMBERSHIP") return json(req, 403, { ok: false, error: "request_failed", detail: "NO_ORG_MEMBERSHIP" });
    if (msg === "PROPERTY_NOT_FOUND") return json(req, 404, { ok: false, error: "request_failed", detail: msg });
    if (msg === "PROPERTY_ID_REQUIRED") return json(req, 400, { ok: false, error: "request_failed", detail: msg });
    console.error("pms-query-inhouse-risk error:", msg);
    return json(req, 500, { ok: false, error: "request_failed", detail: "internal_error" });
  }
});