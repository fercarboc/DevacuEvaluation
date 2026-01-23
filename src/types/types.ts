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
