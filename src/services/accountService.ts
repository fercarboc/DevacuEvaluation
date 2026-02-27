// src/services/accountService.ts
import { callEvalFn } from "@/services/callEvalFn";

/**
 * Este service queda 100% Edge Functions (NADA de supabase.from(...) aquí).
 * - Bundle: customer + invoices + plans (para pantalla "Mi cuenta & plan")
 * - Updates: profile + bank
 */

// ----------------- TIPOS (bundle Edge) -----------------

export interface AccountBundleCustomer {
  id: string;
  name: string | null;
  nif: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;

  // bancarios
  iban: string | null;
  swift: string | null;
  bank_name: string | null;
  bank_address: string | null;

  // opcionales si existen en tu tabla (no molestan si vienen null)
  sector_id?: string | null;
  service_username?: string | null;
  service_password?: string | null;
  api_token?: string | null;
  is_active?: boolean | null;

  // por si el backend te lo manda (en tu captura sale app_id)
  app_id?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

export interface AccountBundleInvoice {
  id: string;
  invoice_number: string | null;
  stripe_invoice_id: string | null;
  status: string | null;
  currency: string | null;
  amount_total: number | null; // cents
  invoice_created_at: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;

  // campos extra que tu backend puede incluir (no molestan)
  app_id?: string | null;
  customer_id?: string | null;
}

export interface AccountBundlePlan {
  id: string;
  name: string | null;
  code: string | null;
  price_monthly: number | null;
  max_queries_per_month: number | null;

  // opcionales si en tu tabla existen
  app_id?: string | null;
  price_yearly?: number | null;
  extra_config?: any | null;
}

/**
 * Hotel profile (best-effort) que ya estás devolviendo desde la Edge Function.
 */
export interface AccountBundleHotelProfile {
  customer_id: string;
  hotel_category: number;
  adr_real: number | null;
  adr_reference: number;
  adr_effective: number;
  monthly_stays_estimated: number | null;
  season_mult_high: number;
  season_mult_low: number;
  updated_at: string;
}

/**
 * Meta multi-tenant que devuelve la Edge Function (lo vimos en tus capturas).
 */
export interface AccountBundleMeta {
  customer_id: string;
  app_id: string;
  org_id: string;
  org_id_resolved_by?: string | null;
  member_role?: string | null;
  server_date?: string | null;
}

/**
 * Subscription “elegida” por el backend (best subscription).
 * Tipado flexible pero con campos clave.
 */
export interface AccountBundleSubscription {
  id: string;
  status: string | null;
  billing_frequency: string | null;
  next_billing_date: string | null;
  plan_id: string | null;

  // opcionales frecuentes
  start_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;

  stripe_subscription_id?: string | null;
  provider_subscription_id?: string | null;

  // downgrade programado / cambios pendientes
  required_plan_code?: string | null;
  required_billing_frequency?: string | null;
  stripe_schedule_id?: string | null;
}

/**
 * ✅ ÚNICA definición de AccountBundleResponse (antes estaba duplicada).
 * Incluye TODO lo que devuelve tu Edge Function:
 * - meta
 * - customer
 * - hotel_profile
 * - subscription + plan (plan actual)
 * - plans (planes disponibles)
 * - invoices
 */
export interface AccountBundleResponse {
  ok?: boolean; // algunos endpoints devuelven ok arriba
  meta?: AccountBundleMeta;

  customer: AccountBundleCustomer | null;
  hotel_profile?: AccountBundleHotelProfile | null;

  subscription?: AccountBundleSubscription | null;
  plan?: AccountBundlePlan | null;

  plans: AccountBundlePlan[];
  invoices: AccountBundleInvoice[];
}

// ----------------- EDGE CALLS -----------------

/**
 * Bundle para "Mi cuenta & plan":
 * - customer (empresa+banco)
 * - invoices (debacu_eval_invoices)
 * - plans (plans del app DEBACU_EVAL para BASIC/MEDIUM/PREMIUM)
 * - subscription + plan (plan actual)
 * - meta (org_id, customer_id, etc.)
 */
export async function getAccountBundle(customer_id: string) {
  return callEvalFn<AccountBundleResponse>("debacu_eval_account_bundle", { customer_id });
}

/**
 * Update datos empresa/contacto del customer (whitelist server-side).
 */
export async function updateAccountProfile(
  customer_id: string,
  patch: {
    name?: string | null;
    nif?: string | null;
    address?: string | null;
    postal_code?: string | null;
    city?: string | null;
    province?: string | null;
    country?: string | null;
    phone?: string | null;
    email?: string | null;
  }
) {
  return callEvalFn<{ ok: boolean }>("debacu_eval_account_update_profile", { customer_id, patch });
}

/**
 * Update datos bancarios del customer (whitelist server-side).
 */
export async function updateAccountBank(
  customer_id: string,
  patch: {
    iban?: string | null;
    swift?: string | null;
    bank_name?: string | null;
    bank_address?: string | null;
  }
) {
  return callEvalFn<{ ok: boolean }>("debacu_eval_account_update_bank", { customer_id, patch });
}