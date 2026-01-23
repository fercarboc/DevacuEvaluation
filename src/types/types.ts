// src/types/types.ts

export enum PlanType {
  BASIC = "BASIC",
  PROFESSIONAL = "PROFESSIONAL", // MEDIUM en BD -> PROFESSIONAL en UI
  ENTERPRISE = "ENTERPRISE",     // PREMIUM en BD -> ENTERPRISE en UI
  INACTIVE = "INACTIVE",
}

export interface User {
  id: string;          // customerId
  username: string;    // service_username
  fullName: string;    // customers.name
  email: string;

  plan: PlanType;

  // flags de UI
  isAdmin?: boolean;

  // opcionales útiles
  customerId?: string;       // si quieres duplicarlo (normalmente = id)
  planStartDate?: string;    // start_date (date) -> string
  monthlyFee?: number;       // plans.price_monthly
}

/**
 * Datos del cliente consultado en el historial.
 * Ojo: en SearchRatings los muestras enmascarados.
 */
export interface ClientData {
  fullName: string;
  document?: string;
  email?: string;
  phone?: string;
  nationality?: string;
}

export interface Rating {
  id: string;

  // 1-5
  value: number;

  // tu "controlled comment" (reasons=... | severity=... | ...)
  comment: string;

  // ISO string (date o timestamptz en string)
  createdAt: string;

  // creador (hotel/cliente)
  authorId: string;
  authorName: string;

  // Booking, Expedia, OTROS:xxx...
  platform?: string;

  clientData: ClientData;
}

export interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: "Paid" | "Pending";
  description: string;
}

export interface SearchFilters {
  query: string;
}
// ======================
// Plan codes (BD/Stripe)
// ======================
export type PlanCode = "FREE" | "BASIC" | "MEDIUM" | "PREMIUM";
export type PaidPlanCode = Exclude<PlanCode, "FREE">; // BASIC | MEDIUM | PREMIUM

export const PAID_PLAN_CODES: PaidPlanCode[] = ["BASIC", "MEDIUM", "PREMIUM"];

// Type guard útil para UI
export function isPaidPlanCode(code: PlanCode): code is PaidPlanCode {
  return code !== "FREE";
}

// ======================
// Mapeos UI <-> BD/Stripe
// ======================
export function planTypeToPlanCode(planType: PlanType): PlanCode {
  switch (planType) {
    case PlanType.BASIC:
      return "BASIC";
    case PlanType.PROFESSIONAL:
      return "MEDIUM";
    case PlanType.ENTERPRISE:
      return "PREMIUM";
    case PlanType.INACTIVE:
    default:
      return "FREE";
  }
}

export function planCodeToPlanType(code: PlanCode | null | undefined): PlanType {
  switch ((code ?? "").toUpperCase()) {
    case "BASIC":
      return PlanType.BASIC;
    case "MEDIUM":
      return PlanType.PROFESSIONAL;
    case "PREMIUM":
      return PlanType.ENTERPRISE;
    case "FREE":
    default:
      return PlanType.INACTIVE;
  }
}
