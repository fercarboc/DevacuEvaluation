// src/services/accountService.ts
import { supabase } from '@/services/supabaseClient';

const APP_CODE = 'DEBACU_EVAL'; // el que usas en el login

// ----------------- TIPOS SEGÚN TU ESQUEMA -----------------

export interface DbCustomer {
  id: string;
  name: string;
  nif: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  sectorId: string | null;
  serviceUsername: string | null;
  servicePassword: string | null;
}

export interface DbSubscription {
  id: string;
  customerId: string;
  appId: string;
  planId: string | null;
  billingFrequency: string; // 'MONTHLY', 'ANNUAL', etc.
  startDate: string;        // date
  endDate: string | null;   // date
  nextBillingDate: string | null; // date
  status: string;           // 'ACTIVE', 'CANCELLED', etc.
  created_at: string;       // timestamp
}

export interface DbPlan {
  id: string;
  appId: string;
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
  customerId: string;
  customerName: string | null;
  concept: string | null;
  paymentMethod: string | null;
  status: string;           // 'PAID', 'PENDING', etc.
  billingPeriod: string | null;
  invoiceNumber: string | null;
  previousInvoiceHash: string | null;
  currentHash: string | null;
  signature: string | null;
  certificateUsed: string | null;
  signatureMethod: string | null;
  isReturned: boolean | null;
  returnReason: string | null;
  returnDate: string | null;
  subscriptionId: string | null;
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
    .eq('customerId', customerId)
    .eq('appId', APP_CODE)
    .eq('status', 'ACTIVE')
    .order('startDate', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subError) {
    console.error('Error cargando subscription:', subError);
  }

  let plan: DbPlan | null = null;

  // 3) Plan (si la suscripción tiene planId)
  if (subscription?.planId) {
    const { data: planRow, error: planError } = await supabase
      .from('plans')
      .select('*')
      .eq('id', subscription.planId)
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
    .eq('customerId', customerId)
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
