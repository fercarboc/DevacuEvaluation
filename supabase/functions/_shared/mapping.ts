// supabase/functions/debacu_eval_csv_unified_import/_shared/mapping.ts

import { normalizeHeader } from "./headers.ts";

export type UnifiedField =
  | "reservation_id"
  | "reservation_line_id"
  | "property_code"
  | "property_name"
  | "booking_date"
  | "checkin_date"
  | "checkout_date"
  | "status"
  | "channel"
  | "segment"
  | "company"
  | "agency"
  | "guest_full_name"
  | "first_name"
  | "last_name"
  | "document"
  | "email"
  | "phone"
  | "country"
  | "rooms"
  | "gross_revenue"
  | "net_revenue"
  | "commission_amount"
  | "currency"
  | "adults"
  | "children"
  | "room_type"
  | "rate_plan"
  | "market_code"
  | "source_system"
  | "cancelled_at";

type HeaderAliases = Record<UnifiedField, string[]>;

const HEADER_ALIASES: HeaderAliases = {
  reservation_id: [
    "reservation id",
    "reservation_id",
    "id",
    "codigo reserva",
    "reserva",
    "booking id",
    "booking_id",
    "id reserva",
  ],
  reservation_line_id: [
    "reservation line id",
    "reservation_line_id",
    "line id",
    "linea reserva",
    "id linea",
  ],
  property_code: [
    "property code",
    "property_code",
    "hotel code",
    "codigo hotel",
    "codigo alojamiento",
  ],
  property_name: [
    "property",
    "property name",
    "property_name",
    "hotel",
    "hotel name",
    "alojamiento",
    "nombre alojamiento",
  ],
  booking_date: [
    "booking date",
    "booking_date",
    "fecha reserva",
    "f reserva",
    "fecha de reserva",
    "created at",
    "creation date",
  ],
  checkin_date: [
    "checkin date",
    "checkin_date",
    "check in",
    "entrada",
    "llegada",
    "arrival",
    "arrival date",
    "fecha entrada",
    "fecha llegada",
  ],
  checkout_date: [
    "checkout date",
    "checkout_date",
    "check out",
    "salida",
    "departure",
    "departure date",
    "fecha salida",
  ],
  status: [
    "status",
    "estado",
    "reservation status",
    "booking status",
  ],
  channel: [
    "channel",
    "canal",
    "source",
    "booking source",
    "sales channel",
  ],
  segment: [
    "segment",
    "segmento",
    "market segment",
  ],
  company: [
    "company",
    "empresa",
    "corporate",
  ],
  agency: [
    "agency",
    "agencia",
    "travel agency",
    "ota",
  ],
  guest_full_name: [
    "guest",
    "guest name",
    "nombre",
    "nombre huesped",
    "cliente",
    "titular",
  ],
  first_name: [
    "first name",
    "first_name",
    "nombre pila",
    "name",
  ],
  last_name: [
    "last name",
    "last_name",
    "surname",
    "apellidos",
  ],
  document: [
    "document",
    "documento",
    "dni",
    "nie",
    "passport",
    "passport number",
    "doc number",
    "numero documento",
  ],
  email: [
    "email",
    "e-mail",
    "correo",
    "correo electronico",
    "mail",
  ],
  phone: [
    "phone",
    "telefono",
    "mobile",
    "telefono movil",
    "tel",
  ],
  country: [
    "country",
    "pais",
    "nationality",
    "nacionalidad",
  ],
  rooms: [
    "rooms",
    "room count",
    "habitaciones",
    "numero de habitaciones",
    "n habitaciones",
    "num habitaciones",
  ],
  gross_revenue: [
    "gross revenue",
    "gross_revenue",
    "importe total",
    "p total",
    "total",
    "revenue",
    "total amount",
    "booking amount",
  ],
  net_revenue: [
    "net revenue",
    "net_revenue",
    "importe neto",
    "neto",
  ],
  commission_amount: [
    "commission",
    "commission amount",
    "commission_amount",
    "comision",
    "importe comision",
  ],
  currency: [
    "currency",
    "moneda",
  ],
  adults: [
    "adults",
    "adultos",
    "pax adults",
  ],
  children: [
    "children",
    "ninos",
    "niños",
    "child",
    "pax children",
  ],
  room_type: [
    "room type",
    "room_type",
    "tipo habitacion",
    "habitacion tipo",
    "tipo de habitacion",
  ],
  rate_plan: [
    "rate plan",
    "rate_plan",
    "tarifa",
    "plan tarifa",
    "regimen",
  ],
  market_code: [
    "market code",
    "market_code",
    "codigo mercado",
  ],
  source_system: [
    "source system",
    "source_system",
    "pms",
    "system",
  ],
  cancelled_at: [
    "cancelled at",
    "cancellation date",
    "fecha cancelacion",
    "fecha de cancelacion",
  ],
};

export type HeaderMap = Partial<Record<UnifiedField, string>>;

export function buildHeaderMap(originalHeaders: string[]): HeaderMap {
  const normalizedToOriginal = new Map<string, string>();

  for (const original of originalHeaders) {
    normalizedToOriginal.set(normalizeHeader(original), original);
  }

  const result: HeaderMap = {};

  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [UnifiedField, string[]][]) {
    for (const alias of aliases) {
      const normalizedAlias = normalizeHeader(alias);
      const foundOriginal = normalizedToOriginal.get(normalizedAlias);
      if (foundOriginal) {
        result[field] = foundOriginal;
        break;
      }
    }
  }

  return result;
}

export function pickValueFromRow(
  rawRow: Record<string, unknown>,
  headerMap: HeaderMap,
  field: UnifiedField,
): string | null {
  const originalHeader = headerMap[field];
  if (!originalHeader) return null;

  const value = rawRow[originalHeader];
  if (value === undefined || value === null) return null;

  const text = String(value).trim();
  return text === "" ? null : text;
}