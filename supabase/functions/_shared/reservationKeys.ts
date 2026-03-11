// supabase/functions/debacu_eval_csv_unified_import/_shared/reservationKeys.ts

function clean(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

export function buildReservationKey(
  orgId: string,
  row: {
    property_code?: string | null;
    property_name?: string | null;
    reservation_id?: string | null;
    reservation_line_id?: string | null;
  },
): string {
  const propertyPart = clean(row.property_code || row.property_name || "UNKNOWN_PROPERTY");
  const reservationPart = clean(row.reservation_id || "UNKNOWN_RESERVATION");
  const linePart = clean(row.reservation_line_id || "");

  if (linePart) {
    return `${orgId}__${propertyPart}__${reservationPart}__${linePart}`;
  }

  return `${orgId}__${propertyPart}__${reservationPart}`;
}