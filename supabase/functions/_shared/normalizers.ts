// supabase/functions/_shared/normalizers.ts

export type NormalizedStatus =
  | "CONFIRMED"
  | "PENDING"
  | "CANCELLED"
  | "CHECKED_IN"
  | "CHECKED_OUT"
  | "NO_SHOW"
  | "UNKNOWN";

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeComparableText(value: unknown): string {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * Convierte fechas habituales a YYYY-MM-DD
 *
 * Soporta:
 * - yyyy-mm-dd
 * - yyyy/mm/dd
 * - dd/mm/yyyy
 * - dd-mm-yyyy
 * - dd.mm.yyyy
 * - yyyy-mm-dd hh:mm:ss
 * - dd/mm/yyyy hh:mm
 */
export function normalizeDateToISO(value: unknown): string | null {
  const raw = cleanText(value);
  if (!raw) return null;

  const withoutTime = raw.split(" ")[0].trim();

  // yyyy-mm-dd o yyyy/mm/dd
  let m = withoutTime.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);

    if (!isValidDateParts(year, month, day)) return null;
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  // dd/mm/yyyy o dd-mm-yyyy o dd.mm.yyyy
  m = withoutTime.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);

    if (!isValidDateParts(year, month, day)) return null;
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  return null;
}

/**
 * Convierte importes a string decimal estándar con punto.
 *
 * Ejemplos:
 * - "1.234,56" -> "1234.56"
 * - "1234,56"  -> "1234.56"
 * - "1,234.56" -> "1234.56"
 * - "1234.56"  -> "1234.56"
 * - "1 234,56" -> "1234.56"
 */
export function normalizeDecimalString(value: unknown): string | null {
  const raw = cleanText(value);
  if (!raw) return null;

  let s = raw.replace(/\s+/g, "");

  // dejar solo dígitos, coma, punto y signo
  s = s.replace(/[^\d,.\-]/g, "");

  if (!s || s === "-" || s === "," || s === ".") return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  // Caso 1: tiene coma y punto
  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");

    // formato europeo: 1.234,56
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // formato anglosajón: 1,234.56
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // 1234,56 o 1.234,56
    const commaCount = (s.match(/,/g) || []).length;

    if (commaCount === 1) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // demasiadas comas -> quitar separadores extra
      const lastComma = s.lastIndexOf(",");
      s =
        s.slice(0, lastComma).replace(/[.,]/g, "") +
        "." +
        s.slice(lastComma + 1).replace(/[.,]/g, "");
    }
  } else if (hasDot) {
    const dotCount = (s.match(/\./g) || []).length;

    if (dotCount > 1) {
      const lastDot = s.lastIndexOf(".");
      s =
        s.slice(0, lastDot).replace(/[.,]/g, "") +
        "." +
        s.slice(lastDot + 1).replace(/[.,]/g, "");
    }
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;

  return String(n);
}

export function normalizeIntegerString(value: unknown): string | null {
  const raw = cleanText(value);
  if (!raw) return null;

  const s = raw.replace(/[^\d\-]/g, "");
  if (!s || s === "-") return null;

  const n = Number(s);
  if (!Number.isInteger(n)) return null;

  return String(n);
}

export function normalizeCurrency(value: unknown): string | null {
  const raw = normalizeComparableText(value);
  if (!raw) return null;

  const map: Record<string, string> = {
    eur: "EUR",
    euro: "EUR",
    euros: "EUR",
    usd: "USD",
    dollar: "USD",
    dollars: "USD",
    gbp: "GBP",
    libra: "GBP",
    libras: "GBP",
  };

  if (map[raw]) return map[raw];

  const upper = cleanText(value).toUpperCase();
  if (/^[A-Z]{3}$/.test(upper)) return upper;

  return null;
}

export function normalizeReservationStatus(value: unknown): NormalizedStatus {
  const raw = normalizeComparableText(value);

  if (!raw) return "UNKNOWN";

  const statusMap: Array<[NormalizedStatus, string[]]> = [
    ["CANCELLED", [
      "cancelled",
      "canceled",
      "cancelada",
      "cancelado",
      "anulada",
      "anulado",
      "fecha de cancelacion",
    ]],
    ["CHECKED_OUT", [
      "checked out",
      "checkout",
      "check out",
      "salida",
      "finalizada",
      "checked-out",
    ]],
    ["CHECKED_IN", [
      "checked in",
      "checkin",
      "check in",
      "entrada",
      "hospedado",
      "in house",
      "alojado",
    ]],
    ["NO_SHOW", [
      "no show",
      "noshow",
      "no-show",
      "no presentado",
    ]],
    ["PENDING", [
      "pending",
      "pendiente",
      "pendiente de leer",
      "on request",
      "solicitada",
      "solicitud",
    ]],
    ["CONFIRMED", [
      "confirmed",
      "confirmada",
      "confirmado",
      "ok",
      "booked",
      "reservada",
      "reserva confirmada",
      "activa",
    ]],
  ];

  for (const [normalized, aliases] of statusMap) {
    if (aliases.includes(raw)) return normalized;
  }

  // fallback por contains
  if (raw.includes("cancel")) return "CANCELLED";
  if (raw.includes("pend")) return "PENDING";
  if (raw.includes("confirm")) return "CONFIRMED";
  if (raw.includes("check") && raw.includes("out")) return "CHECKED_OUT";
  if (raw.includes("check") && raw.includes("in")) return "CHECKED_IN";

  return "UNKNOWN";
}

/**
 * Intenta separar nombre completo en first_name / last_name.
 * No hace magia. Solo una heurística simple y razonable.
 */
export function splitGuestFullName(value: unknown): {
  guest_full_name: string | null;
  first_name: string | null;
  last_name: string | null;
} {
  const full = cleanText(value);
  if (!full) {
    return {
      guest_full_name: null,
      first_name: null,
      last_name: null,
    };
  }

  const parts = full.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return {
      guest_full_name: full,
      first_name: parts[0],
      last_name: null,
    };
  }

  if (parts.length === 2) {
    return {
      guest_full_name: full,
      first_name: parts[0],
      last_name: parts[1],
    };
  }

  return {
    guest_full_name: full,
    first_name: parts.slice(0, -2).join(" "),
    last_name: parts.slice(-2).join(" "),
  };
}