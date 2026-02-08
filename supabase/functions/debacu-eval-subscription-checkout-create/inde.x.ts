// supabase/functions/debacu-eval-subscription-checkout-create/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type PlanCode = "BASIC" | "MEDIUM" | "PREMIUM";
type BillingFrequency = "MONTHLY" | "YEARLY";

const APP_ID_DEFAULT = "DEBACU_EVAL";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

function mustEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function corsHeaders(origin: string | null) {
  const o = origin ?? "";
  const allowOrigin = ALLOWED_ORIGINS.has(o) ? o : "https://debacu.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    Vary: "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function safeLowerEmail(v: unknown) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function toPlanCode(v: string): PlanCode | null {
  const x = v.toUpperCase().trim();
  if (x === "BASIC" || x === "MEDIUM" || x === "PREMIUM") return x;
  return null;
}

function toBilling(v: string): BillingFrequency | null {
  const x = v.toUpperCase().trim();
  if (x === "MONTHLY" || x === "YEARLY") return x;
  return null;
}

function formEncode(obj: Record<string, string>) {
  return new URLSearchParams(obj).toString();
}

async function stripePost(path: string, secretKey: string, form: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formEncode(form),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }

  if (!res.ok) {
    const msg = json?.error?.message ?? text ?? "Stripe error";
    throw new Error(msg);
  }

  return json;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });

  try {
    // ENV
    const SUPABASE_URL = mustEnv("SUPABASE_URL");
    const SERVICE_ROLE = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    const STRIPE_SECRET_KEY = mustEnv("STRIPE_SECRET_KEY");
    const SUCCESS_URL = Deno.env.get("STRIPE_SUCCESS_URL") || "http://localhost:3000/login?paid=1";
    const CANCEL_URL = Deno.env.get("STRIPE_CANCEL_URL") || "http://localhost:3000/login?cancel=1";

    // Price IDs (como ya tienes en secrets)
    const PRICE_BASIC_MONTHLY = mustEnv("STRIPE_PRICE_ID_DEBACU_EVAL_BASIC_MONTHLY");
    const PRICE_BASIC_YEARLY = mustEnv("STRIPE_PRICE_ID_DEBACU_EVAL_BASIC_YEARLY");
    const PRICE_MEDIUM_MONTHLY = mustEnv("STRIPE_PRICE_ID_DEBACU_EVAL_MEDIUM_MONTHLY");
    const PRICE_MEDIUM_YEARLY = mustEnv("STRIPE_PRICE_ID_DEBACU_EVAL_MEDIUM_YEARLY");
    const PRICE_PREMIUM_MONTHLY = mustEnv("STRIPE_PRICE_ID_DEBACU_EVAL_PREMIUM_MONTHLY");
    const PRICE_PREMIUM_YEARLY = mustEnv("STRIPE_PRICE_ID_DEBACU_EVAL_PREMIUM_YEARLY");

    const PRICE_MAP: Record<PlanCode, Record<BillingFrequency, string>> = {
      BASIC: { MONTHLY: PRICE_BASIC_MONTHLY, YEARLY: PRICE_BASIC_YEARLY },
      MEDIUM: { MONTHLY: PRICE_MEDIUM_MONTHLY, YEARLY: PRICE_MEDIUM_YEARLY },
      PREMIUM: { MONTHLY: PRICE_PREMIUM_MONTHLY, YEARLY: PRICE_PREMIUM_YEARLY },
    };

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));

    const username = String(body?.username ?? "").trim();
    const password = String(body?.password ?? "").trim();

    const app_id = String(body?.app_id ?? APP_ID_DEFAULT).trim() || APP_ID_DEFAULT;

    const plan_code = toPlanCode(String(body?.plan_code ?? ""));
    const billing_frequency = toBilling(String(body?.billing_frequency ?? "MONTHLY")) ?? "MONTHLY";

    if (!username || !password) return json(origin, 400, { error: "Faltan credenciales" });
    if (!plan_code) return json(origin, 400, { error: "plan_code inválido (BASIC|MEDIUM|PREMIUM)" });

    const stripe_price_id = PRICE_MAP[plan_code][billing_frequency];

    // 1) validar customer (con tus credenciales internas)
    const { data: customer, error: customerError } = await admin
      .from("customers")
      .select("id,name,email,is_active,service_username,service_password,stripe_customer_id")
      .eq("service_username", username)
      .eq("service_password", password)
      .maybeSingle();

    if (customerError) return json(origin, 500, { error: "Error DB customers", detail: customerError.message });
    if (!customer) return json(origin, 401, { error: "Usuario o contraseña incorrectos" });
    if (customer.is_active === false) return json(origin, 403, { error: "Cliente inactivo" });

    const email = safeLowerEmail(customer.email);
    if (!email) return json(origin, 409, { error: "Cliente sin email. Registre un email para activar acceso." });

    // 2) asegurar Stripe Customer
    let stripe_customer_id = (customer.stripe_customer_id as string | null) ?? null;

    if (!stripe_customer_id) {
      const sc = await stripePost("customers", STRIPE_SECRET_KEY, {
        email,
        name: String(customer.name ?? username),
        "metadata[customer_id]": String(customer.id),
        "metadata[app_id]": app_id,
      });

      stripe_customer_id = sc.id as string;

      const { error: upErr } = await admin
        .from("customers")
        .update({ stripe_customer_id })
        .eq("id", customer.id);

      if (upErr) return json(origin, 500, { error: "No se pudo guardar stripe_customer_id", detail: upErr.message });
    }

    // 3) obtener plan_id (si tienes tabla de planes)
    const { data: planRow } = await admin
      .from("plans")
      .select("id, code")
      .eq("code", plan_code)
      .maybeSingle();

    const plan_id = planRow?.id ?? null;

    // 4) crear suscripción PENDING_PAYMENT en BD ANTES del checkout
    const start_date = todayISO();

    const { data: pendingSub, error: pendingErr } = await admin
      .from("subscriptions")
      .insert({
        customer_id: customer.id,
        app_id,
        plan_id,
        billing_frequency,
        start_date,
        status: "PENDING_PAYMENT",
        provider: "stripe",
        stripe_customer_id,
        stripe_price_id,
        required_plan_code: plan_code,
        required_billing_frequency: billing_frequency,
        extra_seats: 0,
      })
      .select("id")
      .single();

    if (pendingErr) {
      return json(origin, 500, { error: "No se pudo crear suscripción pendiente", detail: pendingErr.message });
    }

    const pendingSubscriptionId = pendingSub.id as string;

    // 5) crear Checkout Session (subscription)
    // line_items[0][price], line_items[0][quantity], metadata[...]
    const cs = await stripePost("checkout/sessions", STRIPE_SECRET_KEY, {
      mode: "subscription",
      customer: stripe_customer_id,
      success_url: SUCCESS_URL,
      cancel_url: CANCEL_URL,
      allow_promotion_codes: "true",

      "line_items[0][price]": stripe_price_id,
      "line_items[0][quantity]": "1",

      // metadata para webhook
      "metadata[pendingSubscriptionId]": pendingSubscriptionId,
      "metadata[customer_id]": String(customer.id),
      "metadata[app_id]": app_id,
      "metadata[plan_code]": plan_code,
      "metadata[billing_frequency]": billing_frequency,
    });

    const checkout_session_id = cs.id as string;
    const url = cs.url as string;

    // 6) guardar checkout_session_id en BD
    const { error: upSubErr } = await admin
      .from("subscriptions")
      .update({ stripe_checkout_session_id: checkout_session_id })
      .eq("id", pendingSubscriptionId);

    if (upSubErr) {
      // no rompas el checkout por esto, pero log
      console.error("WARN: no se pudo guardar stripe_checkout_session_id:", upSubErr.message);
    }

    return json(origin, 200, {
      url,
      pending_subscription_id: pendingSubscriptionId,
      stripe_checkout_session_id: checkout_session_id,
    });
  } catch (e: any) {
    console.error("checkout-create error:", e);
    return json(origin, 500, { error: "Error iniciando checkout", detail: String(e?.message ?? e) });
  }
});
