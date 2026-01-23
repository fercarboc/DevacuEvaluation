import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type PlanCode = "BASIC" | "MEDIUM" | "PREMIUM";
type BillingFrequency = "MONTHLY" | "YEARLY";

const DEFAULT_APP_ID = "DEBACU_EVAL";

function mustEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const STRIPE_SECRET_KEY = mustEnv("STRIPE_SECRET_KEY");

const STRIPE_SUCCESS_URL = mustEnv("STRIPE_SUCCESS_URL");
const STRIPE_CANCEL_URL = mustEnv("STRIPE_CANCEL_URL");

const PRICE_MAP: Record<PlanCode, Record<BillingFrequency, string>> = {
  BASIC: {
    MONTHLY: mustEnv("STRIPE_PRICE_ID_DEBACU_EVAL_BASIC_MONTHLY"),
    YEARLY: mustEnv("STRIPE_PRICE_ID_DEBACU_EVAL_BASIC_YEARLY"),
  },
  MEDIUM: {
    MONTHLY: mustEnv("STRIPE_PRICE_ID_DEBACU_EVAL_MEDIUM_MONTHLY"),
    YEARLY: mustEnv("STRIPE_PRICE_ID_DEBACU_EVAL_MEDIUM_YEARLY"),
  },
  PREMIUM: {
    MONTHLY: mustEnv("STRIPE_PRICE_ID_DEBACU_EVAL_PREMIUM_MONTHLY"),
    YEARLY: mustEnv("STRIPE_PRICE_ID_DEBACU_EVAL_PREMIUM_YEARLY"),
  },
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
});

function json(status: number, origin: string | null, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function errToString(e: unknown) {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function pickString(body: any, snake: string, camel?: string): string | undefined {
  const v = body?.[snake] ?? (camel ? body?.[camel] : undefined);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function pickPlanCode(body: any): PlanCode | undefined {
  const v = body?.target_plan_code ?? body?.targetPlanCode;
  if (typeof v !== "string") return undefined;
  const up = v.toUpperCase().trim();
  if (up === "BASIC" || up === "MEDIUM" || up === "PREMIUM") return up;
  return undefined;
}

function pickBillingFrequency(body: any): BillingFrequency {
  const v = body?.billing_frequency ?? body?.billingFrequency;
  if (typeof v !== "string") return "YEARLY"; // ✅ anual por defecto
  const up = v.toUpperCase().trim();
  if (up === "MONTHLY" || up === "YEARLY") return up;
  return "YEARLY";
}

/* -------------------- DB helpers -------------------- */

async function getActiveSubscription(customer_id: string, app_id: string) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("customer_id", customer_id)
    .eq("app_id", app_id)
    .eq("status", "ACTIVE")
    .order("start_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getPendingSubscription(customer_id: string, app_id: string) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("customer_id", customer_id)
    .eq("app_id", app_id)
    .eq("status", "PENDING_PAYMENT")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getLatestSubscriptionAnyState(customer_id: string, app_id: string) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("customer_id", customer_id)
    .eq("app_id", app_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getPlanByCode(app_id: string, code: string) {
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("app_id", app_id)
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getPlanById(plan_id: string) {
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("id", plan_id)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** customers snake_case: id,email */
async function getCustomerById(customer_id: string) {
  const { data, error } = await supabase
    .from("customers")
    .select("id, email")
    .eq("id", customer_id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function insertEvent(params: {
  app_id: string;
  customer_id: string;
  type: string;
  payload?: Record<string, unknown>;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_event_id?: string | null;
}) {
  const stripe_event_id = params.stripe_event_id ?? `manage_${crypto.randomUUID()}`;

  const { error } = await supabase.from("subscription_events").insert({
    stripe_event_id,
    type: params.type,
    payload: params.payload ?? {},
    created_at: new Date().toISOString(),
    customer_id: params.customer_id,
    app_id: params.app_id,
    stripe_customer_id: params.stripe_customer_id ?? null,
    stripe_subscription_id: params.stripe_subscription_id ?? null,
  });

  if (error) {
    const msg = String((error as any)?.message ?? "").toLowerCase();
    if (!(msg.includes("duplicate") || msg.includes("unique"))) throw error;
  }
}

/* -------------------- Handlers -------------------- */

async function handleGet(customer_id: string, app_id: string) {
  const latest = await getLatestSubscriptionAnyState(customer_id, app_id);
  const active = await getActiveSubscription(customer_id, app_id);
  const pending = await getPendingSubscription(customer_id, app_id);

  const plan =
    active?.plan_id && typeof active.plan_id === "string"
      ? await getPlanById(active.plan_id)
      : null;

  return { latest, active, pending, plan };
}

async function handleChange(body: any) {
  const customer_id = pickString(body, "customer_id", "customerId");
  const app_id = pickString(body, "app_id", "appId") ?? DEFAULT_APP_ID;

  if (!customer_id) return { status: 400, body: { error: "customer_id is required" } };

  const target_plan_code = pickPlanCode(body);
  if (!target_plan_code) return { status: 400, body: { error: "target_plan_code is required" } };

  const billing_frequency = pickBillingFrequency(body); // ✅ YEARLY por defecto

  const price_id = PRICE_MAP[target_plan_code][billing_frequency];
  if (!price_id) return { status: 400, body: { error: "stripe price not configured" } };

  // 1) Si ya hay pendiente, no creamos otro checkout
  const pending = await getPendingSubscription(customer_id, app_id);
  if (pending) {
    return {
      status: 409,
      body: {
        error: "Ya existe un cambio de plan pendiente",
        pending_subscription_id: pending.id,
        pendingSubscriptionId: pending.id, // compat
      },
    };
  }

  // 2) Plan en BD
  const plan_row = await getPlanByCode(app_id, target_plan_code);
  if (!plan_row) return { status: 400, body: { error: `Plan ${target_plan_code} no encontrado en BD` } };

  // 3) Customer en BD
  const customer = await getCustomerById(customer_id);

  // 4) Reemplazo de active (si existe)
  const active_sub = await getActiveSubscription(customer_id, app_id);
  const replaces_subscription_id = active_sub?.id ?? null;

  // 5) Creamos fila PENDING y Checkout
  const pending_subscription_id = crypto.randomUUID();
  const now_iso = new Date().toISOString();
  const start_date = now_iso.slice(0, 10);

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: price_id, quantity: 1 }],
    payment_method_types: ["card"],
    customer_email: customer?.email ?? undefined,
    success_url: `${STRIPE_SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: STRIPE_CANCEL_URL,

    // ✅ IMPORTANTÍSIMO: metadata EN SNAKE_CASE (el webhook leerá estos)
    metadata: {
      app_id,
      customer_id,
      pending_subscription_id,
      target_plan_code,
      billing_frequency,
      replaces_subscription_id: replaces_subscription_id ?? "",

      // compat opcional (por si algún log viejo lo usa)
      appId: app_id,
      customerId: customer_id,
      pendingSubscriptionId: pending_subscription_id,
      targetPlanCode: target_plan_code,
      billingFrequency: billing_frequency,
      replacesSubscriptionId: replaces_subscription_id ?? "",
    },

    client_reference_id: customer_id,
  });

  const { error: insertError } = await supabase.from("subscriptions").insert({
    id: pending_subscription_id,
    customer_id,
    app_id,
    plan_id: plan_row.id,
    status: "PENDING_PAYMENT",
    billing_frequency,
    start_date,

    provider: "stripe",
    provider_checkout_id: checkoutSession.id,
    stripe_checkout_session_id: checkoutSession.id,
    stripe_price_id: price_id,
    replaces_subscription_id,

    // tu esquema incluye provider_subscription_id / stripe_subscription_id
    // aquí aún no existe hasta checkout.session.completed
    provider_subscription_id: null,
    stripe_subscription_id: null,

    created_at: now_iso,
    updated_at: now_iso,
  });

  if (insertError) throw insertError;

  await insertEvent({
    app_id,
    customer_id,
    type: "CHECKOUT_CREATED",
    payload: {
      pending_subscription_id,
      checkout_session_id: checkoutSession.id,
      stripe_price_id: price_id,
      target_plan_code,
      billing_frequency,
      replaces_subscription_id,
    },
  });

  return {
    status: 200,
    body: {
      checkout_url: checkoutSession.url,
      pending_subscription_id,

      // compat
      checkoutUrl: checkoutSession.url,
      pendingSubscriptionId: pending_subscription_id,
    },
  };
}

/* -------------------- Server -------------------- */

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const customer_id =
        url.searchParams.get("customer_id") ?? url.searchParams.get("customerId") ?? undefined;
      const app_id =
        url.searchParams.get("app_id") ?? url.searchParams.get("appId") ?? DEFAULT_APP_ID;

      if (!customer_id) return json(400, origin, { error: "customer_id query param required" });

      const data = await handleGet(customer_id, app_id);
      return json(200, origin, data);
    }

    const body = await req.json().catch(() => ({}));

    if (body?.action === "CHANGE") {
      const result = await handleChange(body);
      return json(result.status, origin, result.body);
    }

    return json(400, origin, { error: "Unsupported action" });
  } catch (error) {
    console.error("debacu_eval_subscription_manage error:", error);
    return json(500, origin, { error: "Unhandled error", detail: errToString(error) });
  }
});
