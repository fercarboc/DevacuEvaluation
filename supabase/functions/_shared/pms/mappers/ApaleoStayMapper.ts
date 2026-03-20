// ============================================================
// ApaleoStayMapper.ts
// Bloque 4 — Integrador Universal PMS v1.0
//
// Transforma una estancia RAW de Apaleo al modelo canónico
// CanonicalStay de Debacu.
//
// En Apaleo las estancias InHouse son reservas con status=InHouse
// No existe un endpoint /stays separado — se usa fetchReservations
// con filtro statuses=["InHouse"].
//
// Este mapper es el más crítico para el AGENTE NOCTURNO:
// stay_status = IN_HOUSE → alerta de riesgo en recepción
// ============================================================

import type { ApaleoReservation } from "../connectors/ApaleoConnector.ts";

// ============================================================
// Tipos canónicos
// ============================================================

export type CanonicalStayStatus =
  | "EXPECTED"
  | "IN_HOUSE"
  | "CHECKED_OUT"
  | "CANCELLED"
  | "NO_SHOW"
  | "UNKNOWN";

export interface CanonicalStay {
  // Contexto multi-tenant
  org_id: string;
  property_id: string;
  connection_id: string;

  // IDs externos
  external_stay_id: string | null;
  external_reservation_id: string | null;
  external_guest_id: string | null;
  external_room_id: string | null;
  external_room_type_id: string | null;

  // Estado — IN_HOUSE es el caso estrella del agente nocturno
  stay_status: CanonicalStayStatus;
  raw_status: string | null;

  // Fechas operativas
  arrival_scheduled_at: string | null;
  departure_scheduled_at: string | null;
  check_in_at: string | null;    // momento real de check-in
  check_out_at: string | null;   // momento real de check-out

  // Ocupación
  adults: number | null;
  children: number | null;

  // Revenue
  currency_code: string | null;
  room_revenue_amount: number | null;
  total_amount: number | null;

  // Metadatos sync
  source_updated_at: string | null;
}

// ============================================================
// Mapeo de estados Apaleo → CanonicalStayStatus
// ============================================================

const APALEO_STAY_STATUS_MAP: Record<string, CanonicalStayStatus> = {
  "Confirmed": "EXPECTED",
  "Tentative": "EXPECTED",
  "WaitingList": "EXPECTED",
  "Optional": "EXPECTED",
  "Inquiry": "EXPECTED",
  "InHouse": "IN_HOUSE",
  "CheckedIn": "IN_HOUSE",
  "CheckedOut": "CHECKED_OUT",
  "Canceled": "CANCELLED",
  "Cancelled": "CANCELLED",
  "NoShow": "NO_SHOW",
  "Released": "CANCELLED",
  "Maintenance": "UNKNOWN",
};

function mapApaleoStayStatus(rawStatus?: string | null): CanonicalStayStatus {
  if (!rawStatus) return "UNKNOWN";
  return APALEO_STAY_STATUS_MAP[rawStatus] ?? "UNKNOWN";
}

// ============================================================
// Helpers
// ============================================================

function clean(v?: string | null): string {
  return String(v ?? "").trim();
}

function extractAmount(
  amountObj?: { amount?: number; currency?: string } | null,
): number | null {
  if (!amountObj) return null;
  return typeof amountObj.amount === "number" ? amountObj.amount : null;
}

function extractCurrency(
  ...objs: Array<{ amount?: number; currency?: string } | null | undefined>
): string | null {
  for (const obj of objs) {
    const c = clean(obj?.currency).toUpperCase();
    if (c.length === 3) return c;
  }
  return null;
}

// En Apaleo InHouse el checkInTime es el momento real de llegada
// El arrival es la fecha programada
function resolveCheckInAt(raw: ApaleoReservation): string | null {
  // Si está InHouse, checkInTime es el momento real
  if (raw.status === "InHouse" || raw.status === "CheckedIn") {
    return raw.checkInTime ?? null;
  }
  return null;
}

function resolveCheckOutAt(raw: ApaleoReservation): string | null {
  if (raw.status === "CheckedOut") {
    return raw.checkOutTime ?? null;
  }
  return null;
}

// ============================================================
// Mapper principal — ApaleoReservation (InHouse) → CanonicalStay
// ============================================================

export function mapApaleoStay(
  raw: ApaleoReservation,
  context: {
    org_id: string;
    property_id: string;
    connection_id: string;
  },
): CanonicalStay {
  const guestId = raw.booker?.id ?? raw.primaryGuest?.id ?? null;

  const childrenCount = Array.isArray(raw.childrenAges)
    ? raw.childrenAges.length
    : null;

  return {
    org_id: context.org_id,
    property_id: context.property_id,
    connection_id: context.connection_id,

    // En Apaleo no hay stay_id separado — usamos reservation_id como stay_id
    external_stay_id: raw.id,
    external_reservation_id: raw.id,
    external_guest_id: guestId,
    external_room_id: raw.unit?.id ?? null,
    external_room_type_id: raw.unitType?.id ?? null,

    stay_status: mapApaleoStayStatus(raw.status),
    raw_status: clean(raw.status) || null,

    // Fechas programadas (de la reserva)
    arrival_scheduled_at: raw.arrival ?? null,
    departure_scheduled_at: raw.departure ?? null,

    // Fechas reales (solo si ya ocurrieron)
    check_in_at: resolveCheckInAt(raw),
    check_out_at: resolveCheckOutAt(raw),

    adults: typeof raw.adults === "number" ? raw.adults : null,
    children: childrenCount,

    currency_code: extractCurrency(raw.totalGrossAmount, raw.roomGrossAmount),
    room_revenue_amount: extractAmount(raw.roomGrossAmount),
    total_amount: extractAmount(raw.totalGrossAmount),

    source_updated_at: raw.updated ?? null,
  };
}

// ============================================================
// Batch mapper
// ============================================================

export function mapApaleoStays(
  rawList: ApaleoReservation[],
  context: {
    org_id: string;
    property_id: string;
    connection_id: string;
  },
): CanonicalStay[] {
  return rawList.map((r) => mapApaleoStay(r, context));
}