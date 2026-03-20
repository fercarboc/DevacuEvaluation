// ============================================================
// ApaleoReservationMapper.ts
// Bloque 4 — Integrador Universal PMS v1.0
//
// Transforma una reserva RAW de Apaleo al modelo canónico
// CanonicalReservation de Debacu.
//
// Incluye:
//   - Mapeo exhaustivo de estados Apaleo → Debacu
//   - Cálculo de noches
//   - Normalización de importes y moneda
//   - Extracción de canal y segmento
// ============================================================

import type { ApaleoReservation } from "../connectors/ApaleoConnector.ts";

// ============================================================
// Tipos canónicos
// ============================================================

export type CanonicalReservationStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "CHECKED_OUT"
  | "CANCELLED"
  | "NO_SHOW"
  | "IN_HOUSE"
  | "UNKNOWN";

export interface CanonicalReservation {
  // Contexto multi-tenant
  org_id: string;
  property_id: string;
  connection_id: string;

  // IDs externos
  external_reservation_id: string;
  external_confirmation_code: string | null;
  external_group_reservation_id: string | null;
  external_guest_id: string | null;
  external_primary_room_type_id: string | null;
  external_assigned_room_id: string | null;

  // Estado
  status: CanonicalReservationStatus;
  raw_status: string | null;

  // Fechas
  booked_at: string | null;
  check_in_date: string | null;   // solo fecha YYYY-MM-DD
  check_out_date: string | null;
  nights: number | null;
  cancellation_at: string | null;

  // Ocupación
  adults: number | null;
  children: number | null;
  infants: number | null;
  rooms_count: number;

  // Canal y segmento — clave para Revenue Intelligence
  channel_code: string | null;
  channel_name: string | null;
  segment_code: string | null;
  segment_name: string | null;
  rate_plan_code: string | null;
  rate_plan_name: string | null;

  // Revenue
  currency_code: string | null;
  room_revenue_amount: number | null;
  total_amount: number | null;
  paid_amount: number | null;
  balance_amount: number | null;

  // Metadatos sync
  source_updated_at: string | null;
}

// ============================================================
// Mapeo de estados Apaleo → Debacu
// Catálogo exhaustivo según documentación Apaleo
// ============================================================

const APALEO_STATUS_MAP: Record<string, CanonicalReservationStatus> = {
  // Estados activos
  "Confirmed": "CONFIRMED",
  "InHouse": "IN_HOUSE",
  "CheckedIn": "CHECKED_IN",

  // Estados finales
  "CheckedOut": "CHECKED_OUT",
  "Canceled": "CANCELLED",
  "Cancelled": "CANCELLED",   // variante ortográfica
  "NoShow": "NO_SHOW",

  // Estados intermedios
  "Tentative": "PENDING",
  "WaitingList": "PENDING",
  "Inquiry": "PENDING",
  "Optional": "PENDING",
  "Released": "CANCELLED",
  "Maintenance": "UNKNOWN",
};

function mapApaleoStatus(rawStatus?: string | null): CanonicalReservationStatus {
  if (!rawStatus) return "UNKNOWN";
  return APALEO_STATUS_MAP[rawStatus] ?? "UNKNOWN";
}

// ============================================================
// Helpers
// ============================================================

function clean(v?: string | null): string {
  return String(v ?? "").trim();
}

function extractDateOnly(datetime?: string | null): string | null {
  if (!datetime) return null;
  // Apaleo devuelve ISO 8601: "2024-03-17T14:00:00Z"
  return datetime.substring(0, 10) || null;
}

function calculateNights(
  checkIn?: string | null,
  checkOut?: string | null,
): number | null {
  if (!checkIn || !checkOut) return null;
  const inDate = new Date(checkIn);
  const outDate = new Date(checkOut);
  const diffMs = outDate.getTime() - inDate.getTime();
  const nights = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return nights > 0 ? nights : null;
}

function extractAmount(
  amountObj?: { amount?: number; currency?: string } | null,
): number | null {
  if (!amountObj?.amount && amountObj?.amount !== 0) return null;
  return typeof amountObj.amount === "number" ? amountObj.amount : null;
}

function extractCurrency(
  ...amountObjs: Array<{ amount?: number; currency?: string } | null | undefined>
): string | null {
  for (const obj of amountObjs) {
    const c = clean(obj?.currency).toUpperCase();
    if (c.length === 3) return c;
  }
  return null;
}

// Extrae channel_code desde Apaleo
// Apaleo usa channelCode directo o source como fallback
function extractChannelCode(raw: ApaleoReservation): string | null {
  const code = clean(raw.channelCode);
  if (code) return code.toUpperCase();

  const source = clean(raw.source);
  if (source) return source.toUpperCase();

  return null;
}

function extractChannelName(raw: ApaleoReservation): string | null {
  const code = clean(raw.channelCode);
  // Mapeo de códigos Apaleo comunes a nombres legibles
  const channelNames: Record<string, string> = {
    "BookingCom": "Booking.com",
    "Expedia": "Expedia",
    "Direct": "Directo",
    "GDS": "GDS",
    "OTA": "OTA",
    "Airbnb": "Airbnb",
    "Corporate": "Corporativo",
    "TourOperator": "Tour Operador",
    "WalkIn": "Walk-in",
    "Phone": "Teléfono",
    "Email": "Email",
  };
  return channelNames[code] ?? code ?? null;
}

function extractRatePlanCode(raw: ApaleoReservation): string | null {
  return clean(raw.ratePlan?.code) || clean(raw.ratePlan?.id) || null;
}

function extractRatePlanName(raw: ApaleoReservation): string | null {
  const name = raw.ratePlan?.name;
  if (!name) return null;
  // Apaleo devuelve nombres multi-idioma, preferir español o inglés
  return name["es"] ?? name["en"] ?? Object.values(name)[0] ?? null;
}

// ============================================================
// Mapper principal
// ============================================================

export function mapApaleoReservation(
  raw: ApaleoReservation,
  context: {
    org_id: string;
    property_id: string;
    connection_id: string;
  },
): CanonicalReservation {
  const checkInDate = extractDateOnly(raw.arrival ?? raw.checkInTime);
  const checkOutDate = extractDateOnly(raw.departure ?? raw.checkOutTime);

  // Extraer guest_id del booker o primaryGuest
  const guestId =
    raw.booker?.id ??
    raw.primaryGuest?.id ??
    null;

  // Children: Apaleo devuelve array de edades
  const childrenCount = Array.isArray(raw.childrenAges)
    ? raw.childrenAges.length
    : null;

  const currencyCode = extractCurrency(
    raw.totalGrossAmount,
    raw.roomGrossAmount,
    raw.balance,
  );

  return {
    org_id: context.org_id,
    property_id: context.property_id,
    connection_id: context.connection_id,

    external_reservation_id: raw.id,
    external_confirmation_code: clean(raw.bookingId) || null,
    external_group_reservation_id: clean(raw.groupId) || null,
    external_guest_id: guestId,
    external_primary_room_type_id: raw.unitType?.id ?? null,
    external_assigned_room_id: raw.unit?.id ?? null,

    status: mapApaleoStatus(raw.status),
    raw_status: clean(raw.status) || null,

    booked_at: raw.created ?? null,
    check_in_date: checkInDate,
    check_out_date: checkOutDate,
    nights: calculateNights(checkInDate, checkOutDate),
    cancellation_at: raw.cancellationTime ?? raw.noShowTime ?? null,

    adults: typeof raw.adults === "number" ? raw.adults : null,
    children: childrenCount,
    infants: null, // Apaleo no distingue infants
    rooms_count: 1, // Apaleo: 1 reserva = 1 unidad

    channel_code: extractChannelCode(raw),
    channel_name: extractChannelName(raw),
    segment_code: null, // Apaleo no tiene segmento directo
    segment_name: null,
    rate_plan_code: extractRatePlanCode(raw),
    rate_plan_name: extractRatePlanName(raw),

    currency_code: currencyCode,
    room_revenue_amount: extractAmount(raw.roomGrossAmount),
    total_amount: extractAmount(raw.totalGrossAmount),
    paid_amount: extractAmount(raw.paymentAccount?.payedAmount),
    balance_amount: extractAmount(raw.balance),

    source_updated_at: raw.updated ?? null,
  };
}

// ============================================================
// Batch mapper
// ============================================================

export function mapApaleoReservations(
  rawList: ApaleoReservation[],
  context: {
    org_id: string;
    property_id: string;
    connection_id: string;
  },
): CanonicalReservation[] {
  return rawList.map((r) => mapApaleoReservation(r, context));
}