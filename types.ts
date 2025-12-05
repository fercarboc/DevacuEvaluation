// types.ts

export enum PlanType {
  BASIC = 'BASIC',
  PROFESSIONAL = 'PROFESSIONAL',
  ENTERPRISE = 'ENTERPRISE',
  INACTIVE = 'INACTIVE',
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  email: string;
  plan: PlanType;
  planStartDate: string;
  monthlyFee: number;
}

export interface ClientData {
  document?: string;
  email?: string;
  phone?: string;
  fullName: string;
  nationality?: string;   // ⬅️ NUEVO: país / nacionalidad
}

export interface Rating {
  id: string;
  value: number; // 1-5
  comment: string;
  createdAt: string;
  authorId: string; // ID of the user who created it
  authorName: string; // Name of the user who created it
  clientData: ClientData;
  platform?: string;     // ⬅️ NUEVO: Booking, Expedia, Motor propio, etc.
}

export interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: 'Paid' | 'Pending';
  description: string;
}

export interface SearchFilters {
  query: string;
}
