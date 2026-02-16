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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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
  } catch {}

  if (!res.ok) {
    const msg = json?.error?.message ?? text ?? "Stripe error";
    throw new Error(msg);
  }

  return json;
}

function getBearer(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function fail(origin: string | null, status: number, code: string, message?: string, extra?: any) {
  return json(origin, status, { ok: false, error_obj: { code, message, ...(extra ?? {}) } });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(origin, 405, { ok: false, error_obj: { code: "METHOD_NOT_ALLOWED" } });

  try {
    const SUPABASE_URL = mustEnv("SUPABASE_URL");
    const SERVICE_ROLE = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    const STRIPE_SECRET_KEY = mustEnv("STRIPE_SECRET_KEY");
    const SUCCESS_URL = Deno.env.get("STRIPE_SUCCESS_URL") || "http://localhost:3000/login?paid=1";
    const CANCEL_URL = Deno.env.get("STRIPE_CANCEL_URL") || "http://localhost:3000/login?cancel=1";

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

    const token = getBearer(req);
    if (!token) return fail(origin, 401, "UNAUTHENTICATED", "Missing bearer token");

    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes?.user) return fail(origin, 401, "UNAUTHENTICATED", "Invalid token");

    const authUser = userRes.user;
    const authUserId = authUser.id;

    const body = await req.json().catch(() => ({}));
    const app_id = String(body?.app_id ?? body?.app_code ?? APP_ID_DEFAULT).trim() || APP_ID_DEFAULT;

    const plan_code = toPlanCode(String(body?.plan_code ?? ""));
    const billing_frequency = toBilling(String(body?.billing_frequency ?? "MONTHLY")) ?? "MONTHLY";

    if (!plan_code) {
      return fail(origin, 400, "VALIDATION_ERROR", "plan_code inválido (BASIC|MEDIUM|PREMIUM)");
    }

    const stripe_price_id = PRICE_MAP[plan_code][billing_frequency];

    // ✅ 1) customer determinista por auth_user_id
    // Si tu app_id a veces está NULL, aceptamos NULL como fallback "DEBACU_EVAL" en dev:
    const { data: customer, error: cErr } = await admin
      .from("customers")
      .select("id,name,email,is_active,stripe_customer_id,app_id")
      .eq("auth_user_id", authUserId)
      .or(`app_id.eq.${app_id},app_id.is.null`)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (cErr) return fail(origin, 500, "DB_ERROR", cErr.message);
    if (!customer?.id) return fail(origin, 403, "NO_CUSTOMER", "No existe customer vinculado a este usuario");

    if (customer.is_active === false) return fail(origin, 403, "CUSTOMER_INACTIVE", "Cliente inactivo");

    const customer_id = String(customer.id);

    // ✅ 2) org determinista por customer_id (tu FK ya existe)
    const { data: org, error: oErr } = await admin
      .from("debacu_eval_organizations")
      .select("id,name,customer_id")
      .eq("customer_id", customer_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (oErr) return fail(origin, 500, "DB_ERROR", oErr.message);
    if (!org?.id) return fail(origin, 403, "NO_ORG", "No existe organización para este customer");

    const org_id = String(org.id);

    // ✅ 3) Asegurar Stripe customer
    let stripe_customer_id = (customer.stripe_customer_id as string | null) ?? null;

    if (!stripe_customer_id) {
      const email = String(customer.email ?? authUser.email ?? "").trim().toLowerCase();
      if (!email || !email.includes("@")) {
        return fail(origin, 409, "CUSTOMER_NO_EMAIL", "Cliente sin email válido para Stripe");
      }

      const sc = await stripePost("customers", STRIPE_SECRET_KEY, {
        email,
        name: String(customer.name ?? email),
        "metadata[customer_id]": customer_id,
        "metadata[app_id]": app_id,
        "metadata[org_id]": org_id,
        "metadata[auth_user_id]": authUserId,
      });

      stripe_customer_id = sc.id as string;

      const { error: upErr } = await admin.from("customers").update({ stripe_customer_id }).eq("id", customer_id);
      if (upErr) return fail(origin, 500, "DB_ERROR", upErr.message);
    }

    // ✅ 4) plan_id (si tienes tabla plans)
    const { data: planRow, error: pErr } = await admin
      .from("plans")
      .select("id, code")
      .eq("code", plan_code)
      .maybeSingle();

    if (pErr) return fail(origin, 500, "DB_ERROR", pErr.message);
    const plan_id = planRow?.id ?? null;

    // ✅ 5) Crear pending subscription
    const start_date = todayISO();

    const { data: pendingSub, error: pendingErr } = await admin
      .from("subscriptions")
      .insert({
        customer_id,
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
        org_id,
      })
      .select("id")
      .single();

    if (pendingErr) return fail(origin, 500, "DB_ERROR", pendingErr.message);

    const pendingSubscriptionId = String(pendingSub.id);

    // ✅ 6) Crear Checkout Session
    const cs = await stripePost("checkout/sessions", STRIPE_SECRET_KEY, {
      mode: "subscription",
      customer: stripe_customer_id,
      success_url: SUCCESS_URL,
      cancel_url: CANCEL_URL,
      allow_promotion_codes: "true",

      "line_items[0][price]": stripe_price_id,
      "line_items[0][quantity]": "1",

      "metadata[pendingSubscriptionId]": pendingSubscriptionId,
      "metadata[customer_id]": customer_id,
      "metadata[org_id]": org_id,
      "metadata[app_id]": app_id,
      "metadata[plan_code]": plan_code,
      "metadata[billing_frequency]": billing_frequency,
      "metadata[auth_user_id]": authUserId,
    });

    const checkout_session_id = cs.id as string;
    const url = cs.url as string;

    const { error: upSubErr } = await admin
      .from("subscriptions")
      .update({ stripe_checkout_session_id: checkout_session_id })
      .eq("id", pendingSubscriptionId);

    if (upSubErr) console.error("WARN: no se pudo guardar stripe_checkout_session_id:", upSubErr.message);

    return json(origin, 200, {
      ok: true,
      data: {
        url,
        pending_subscription_id: pendingSubscriptionId,
        stripe_checkout_session_id: checkout_session_id,
      },
    });
  } catch (e: any) {
    console.error("checkout-create error:", e);
    return json(origin, 500, { ok: false, error_obj: { code: "CHECKOUT_CREATE_ERROR", message: String(e?.message ?? e) } });
  }
});
