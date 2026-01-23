// src/services/accountService.ts
import { supabase } from '@/services/supabaseClient';

const APP_CODE = 'DEBACU_EVAL'; // el que usas en el login

// ----------------- TIPOS SEGÚN TU ESQUEMA -----------------

export interface DbCustomer {
  id: string;
  name: string;
  nif: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  sector_id: string | null;
  service_username: string | null;
  service_password: string | null;
  api_token: string | null;
  is_active: boolean | null;
  iban: string | null;
  swift: string | null;
  bank_name: string | null;
  bank_address: string | null;
}

export interface DbSubscription {
  id: string;
  customer_id: string;
  app_id: string;
  plan_id: string | null;
  billing_frequency: string; // 'MONTHLY', 'ANNUAL', etc.
  start_date: string;        // date
  end_date: string | null;   // date
  next_billing_date: string | null; // date
  status: string;           // 'ACTIVE', 'CANCELLED', etc.
  created_at: string;       // timestamp
}

export interface DbPlan {
  id: string;
  app_id: string;
  name: string;
  code: string | null;
  price_monthly: number | null;
  price_yearly: number | null;
  max_queries_per_month: number | null;
  extra_config: any | null;
}

export interface DbReceipt {
  id: string;
  date: string;             // date
  amount: number;           // numeric
  customer_id: string;
  customer_name: string | null;
  concept: string | null;
  payment_method: string | null;
  status: string;           // 'PAID', 'PENDING', etc.
  billing_period: string | null;
  invoice_number: string | null;
  previous_invoice_hash: string | null;
  current_hash: string | null;
  signature: string | null;
  certificate_used: string | null;
  signature_method: string | null;
  is_returned: boolean | null;
  return_reason: string | null;
  return_date: string | null;
  subscription_id: string | null;
  created_at: string;
}

export interface MyEvalAccount {
  customer: DbCustomer | null;
  subscription: DbSubscription | null;
  plan: DbPlan | null;
  receipts: DbReceipt[];
}

// ----------------- FUNCIÓN PRINCIPAL -----------------

/**
 * Carga todos los datos necesarios para la pantalla
 * "Mi Cuenta & Plan" para un cliente concreto.
 */
export async function getMyEvalAccount(
  customerId: string
): Promise<MyEvalAccount> {
  // 1) Cliente
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .maybeSingle();

  if (customerError) {
    console.error('Error cargando customer:', customerError);
  }

  // 2) Suscripción ACTIVA a la app DEBACU_EVAL
  const { data: subscription, error: subError } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('customer_id', customerId)
    .eq('app_id', APP_CODE)
    .eq('status', 'ACTIVE')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subError) {
    console.error('Error cargando subscription:', subError);
  }

  let plan: DbPlan | null = null;

  // 3) Plan (si la suscripción tiene planId)
  if (subscription?.plan_id) {
    const { data: planRow, error: planError } = await supabase
      .from('plans')
      .select('*')
      .eq('id', subscription.plan_id)
      .maybeSingle();

    if (planError) {
      console.error('Error cargando plan:', planError);
    } else {
      plan = planRow as DbPlan;
    }
  }

  // 4) Últimos recibos del cliente
  // En tu esquema NO aparece appId en receipts, así que filtramos solo por customerId.
  const { data: receipts, error: receiptsError } = await supabase
    .from('receipts')
    .select('*')
    .eq('customer_id', customerId)
    .order('date', { ascending: false })
    .limit(10);

  if (receiptsError) {
    console.error('Error cargando receipts:', receiptsError);
  }

  return {
    customer: (customer as DbCustomer) || null,
    subscription: (subscription as DbSubscription) || null,
    plan,
    receipts: (receipts as DbReceipt[]) || [],
  };
}
