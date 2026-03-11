// supabase/functions/_shared/validator.ts

export type ImportCapability =
  | "SCREENING_AND_REVENUE"
  | "REVENUE_ONLY"
  | "INVALID";

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  import_capability: ImportCapability;
  screening_eligible: boolean;
  screening_reason: string | null;
};

function hasValue(v: unknown): boolean {
  return String(v ?? "").trim() !== "";
}

function parseIsoDate(value: unknown): Date | null {
  const s = String(value ?? "").trim();
  if (!s) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;

  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;

  return d;
}

function toNumber(value: unknown): number | null {
  const s = String(value ?? "").trim();
  if (!s) return null;

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toInteger(value: unknown): number | null {
  const n = toNumber(value);
  if (n === null) return null;
  return Number.isInteger(n) ? n : null;
}

export function validateUnifiedRow(row: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const reservationId = String(row.reservation_id ?? "").trim();
  const bookingDate = String(row.booking_date ?? "").trim();
  const checkinDate = String(row.checkin_date ?? "").trim();
  const checkoutDate = String(row.checkout_date ?? "").trim();
  const grossRevenue = String(row.gross_revenue ?? "").trim();
  const rooms = String(row.rooms ?? "").trim();

  if (!reservationId) errors.push("missing reservation_id");
  if (!bookingDate) errors.push("missing booking_date");
  if (!checkinDate) errors.push("missing checkin_date");
  if (!checkoutDate) errors.push("missing checkout_date");
  if (!grossRevenue) errors.push("missing gross_revenue");
  if (!rooms) errors.push("missing rooms");

  const bookingDateParsed = parseIsoDate(row.booking_date);
  const checkinDateParsed = parseIsoDate(row.checkin_date);
  const checkoutDateParsed = parseIsoDate(row.checkout_date);

  if (bookingDate && !bookingDateParsed) {
    errors.push("invalid booking_date");
  }

  if (checkinDate && !checkinDateParsed) {
    errors.push("invalid checkin_date");
  }

  if (checkoutDate && !checkoutDateParsed) {
    errors.push("invalid checkout_date");
  }

  if (checkinDateParsed && checkoutDateParsed) {
    if (checkoutDateParsed.getTime() <= checkinDateParsed.getTime()) {
      errors.push("checkout_date must be greater than checkin_date");
    }
  }

  const grossRevenueNumber = toNumber(row.gross_revenue);
  if (grossRevenue && grossRevenueNumber === null) {
    errors.push("invalid gross_revenue");
  } else if (grossRevenueNumber !== null && grossRevenueNumber < 0) {
    warnings.push("gross_revenue is negative");
  }

  const netRevenueNumber = toNumber(row.net_revenue);
  if (hasValue(row.net_revenue) && netRevenueNumber === null) {
    errors.push("invalid net_revenue");
  }

  const commissionAmountNumber = toNumber(row.commission_amount);
  if (hasValue(row.commission_amount) && commissionAmountNumber === null) {
    errors.push("invalid commission_amount");
  }

  const roomsNumber = toInteger(row.rooms);
  if (rooms && roomsNumber === null) {
    errors.push("invalid rooms");
  } else if (roomsNumber !== null && roomsNumber <= 0) {
    errors.push("rooms must be greater than 0");
  }

  const adultsNumber = toInteger(row.adults);
  if (hasValue(row.adults) && adultsNumber === null) {
    errors.push("invalid adults");
  } else if (adultsNumber !== null && adultsNumber < 0) {
    errors.push("adults cannot be negative");
  }

  const childrenNumber = toInteger(row.children);
  if (hasValue(row.children) && childrenNumber === null) {
    errors.push("invalid children");
  } else if (childrenNumber !== null && childrenNumber < 0) {
    errors.push("children cannot be negative");
  }

  const status = String(row.status ?? "").trim();
  if (!status) {
    warnings.push("missing normalized status");
  } else if (status === "UNKNOWN") {
    warnings.push("unknown reservation status");
  }

  const currency = String(row.currency ?? "").trim();
  if (!currency) {
    warnings.push("missing currency");
  }

  const hasDocument = hasValue(row.document);
  const hasEmail = hasValue(row.email);
  const hasPhone = hasValue(row.phone);

  const screeningEligible = hasDocument || hasEmail || hasPhone;

  let screeningReason: string | null = null;
  if (!screeningEligible) {
    screeningReason = "NO_STRONG_IDENTIFIER";
    warnings.push("screening disabled: no document/email/phone");
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      warnings,
      import_capability: "INVALID",
      screening_eligible: false,
      screening_reason: "INVALID_ROW",
    };
  }

  return {
    valid: true,
    errors,
    warnings,
    import_capability: screeningEligible
      ? "SCREENING_AND_REVENUE"
      : "REVENUE_ONLY",
    screening_eligible: screeningEligible,
    screening_reason: screeningReason,
  };
}