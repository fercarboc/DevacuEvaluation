// supabase/functions/debacu_eval_checkout_create/index.ts
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
    // ✅ JWT-only
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

function fail(origin: string | null, status: number, code: string, message?: string, extra?: any) {
  return json(origin, status, { ok: false, error_obj: { code, message, ...(extra ?? {}) } });
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
  let j: any = null;
  try {
    j = JSON.parse(text);
  } catch {}

  if (!res.ok) {
    const msg = j?.error?.message ?? text ?? "Stripe error";
    throw new Error(msg);
  }
  return j;
}

/** =========================
 * JWT user (ANON) + org->customer
 * ========================= */
function userClient(req: Request, supabaseUrl: string, anonKey: string) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
}

async function requireJwtUser(req: Request, supabaseUrl: string, anonKey: string) {
  const sb = userClient(req, supabaseUrl, anonKey);
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");
  return data.user;
}

async function requireOrgContext(admin: any, user_id: string) {
  const { data: mem, error: memErr } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, role, created_at")
    .eq("user_id", user_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memErr) throw new Error(`MEMBERSHIP_FAILED:${memErr.message}`);
  if (!mem?.org_id) throw new Error("FORBIDDEN_NO_ORG");

  const org_id = String(mem.org_id);

  // primero entitlements view (si existe)
  let customer_id: string | null = null;
  try {
    const { data: ent, error: entErr } = await admin
      .from("debacu_eval_org_entitlements_v")
      .select("customer_id")
      .eq("org_id", org_id)
      .maybeSingle();
    if (!entErr && ent?.customer_id) customer_id = String(ent.customer_id);
  } catch {}

  // fallback organizations
  if (!customer_id) {
    const { data: org, error: orgErr } = await admin
      .from("debacu_eval_organizations")
      .select("customer_id")
      .eq("id", org_id)
      .maybeSingle();
    if (orgErr) throw new Error(`ORG_LOOKUP_FAILED:${orgErr.message}`);
    if (!org?.customer_id) throw new Error("FORBIDDEN_NO_CUSTOMER");
    customer_id = String(org.customer_id);
  }

  return { org_id, customer_id };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== "POST") return fail(origin, 405, "METHOD_NOT_ALLOWED");

  try {
    const SUPABASE_URL = mustEnv("SUPABASE_URL");
    const ANON_KEY = mustEnv("SUPABASE_ANON_KEY");
    const SERVICE_ROLE = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    const STRIPE_SECRET_KEY = mustEnv("STRIPE_SECRET_KEY");
    const SUCCESS_URL = Deno.env.get("STRIPE_SUCCESS_URL") || "http://localhost:3000/login?paid=1";
    const CANCEL_URL = Deno.env.get("STRIPE_CANCEL_URL") || "http://localhost:3000/login?cancel=1";

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

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ✅ JWT obligatorio (validado con ANON)
    const user = await requireJwtUser(req, SUPABASE_URL, ANON_KEY);

    const body = await req.json().catch(() => ({}));
    const app_id = String(body?.app_id ?? body?.app_code ?? APP_ID_DEFAULT).trim() || APP_ID_DEFAULT;

    const plan_code = toPlanCode(String(body?.plan_code ?? ""));
    const billing_frequency = toBilling(String(body?.billing_frequency ?? "MONTHLY")) ?? "MONTHLY";
    if (!plan_code) return fail(origin, 400, "VALIDATION_ERROR", "plan_code inválido (BASIC|MEDIUM|PREMIUM)");

    const stripe_price_id = PRICE_MAP[plan_code][billing_frequency];

    // ✅ tenant seguro (org->customer_id)
    const { org_id, customer_id } = await requireOrgContext(admin, user.id);

    // ✅ customer row
    const { data: customer, error: cErr } = await admin
      .from("customers")
      .select("id,name,email,is_active,stripe_customer_id")
      .eq("id", customer_id)
      .maybeSingle();

    if (cErr) return fail(origin, 500, "DB_ERROR", cErr.message);
    if (!customer?.id) return fail(origin, 403, "NO_CUSTOMER", "No existe customer para este org");
    if (customer.is_active === false) return fail(origin, 403, "CUSTOMER_INACTIVE", "Cliente inactivo");

    // ✅ evita doble pending
    const { data: pending } = await admin
      .from("subscriptions")
      .select("id")
      .eq("customer_id", customer_id)
      .eq("app_id", app_id)
      .eq("status", "PENDING_PAYMENT")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pending?.id) {
      return fail(origin, 409, "PENDING_CHANGE", "Ya existe un cambio pendiente", {
        pending_subscription_id: pending.id,
      });
    }

    // ✅ plan_id correcto por app_id
    const { data: planRow, error: pErr } = await admin
      .from("plans")
      .select("id, code")
      .eq("app_id", app_id)
      .eq("code", plan_code)
      .maybeSingle();

    if (pErr) return fail(origin, 500, "DB_ERROR", pErr.message);
    if (!planRow?.id) return fail(origin, 400, "PLAN_NOT_FOUND", `Plan ${plan_code} no existe para app_id=${app_id}`);

    // ✅ Stripe customer
    let stripe_customer_id = (customer.stripe_customer_id as string | null) ?? null;

    if (!stripe_customer_id) {
      const email = String(customer.email ?? user.email ?? "").trim().toLowerCase();
      if (!email || !email.includes("@")) return fail(origin, 409, "CUSTOMER_NO_EMAIL", "Cliente sin email válido para Stripe");

      const sc = await stripePost("customers", STRIPE_SECRET_KEY, {
        email,
        name: String(customer.name ?? email),
        "metadata[customer_id]": customer_id,
        "metadata[org_id]": org_id,
        "metadata[app_id]": app_id,
        "metadata[auth_user_id]": user.id,
      });

      stripe_customer_id = sc.id as string;

      const { error: upErr } = await admin.from("customers").update({ stripe_customer_id }).eq("id", customer_id);
      if (upErr) return fail(origin, 500, "DB_ERROR", upErr.message);
    }

    // ✅ crear pending subscription
    const start_date = todayISO();
    const nowIso = new Date().toISOString();

    const { data: pendingSub, error: pendingErr } = await admin
      .from("subscriptions")
      .insert({
        customer_id,
        app_id,
        plan_id: planRow.id,
        billing_frequency,
        start_date,
        status: "PENDING_PAYMENT",
        provider: "stripe",
        stripe_customer_id,
        stripe_price_id,
        created_at: nowIso,
        updated_at: nowIso,
        // si tienes estas columnas, perfecto; si no, bórralas:
        org_id,
        required_plan_code: plan_code,
        required_billing_frequency: billing_frequency,
        extra_seats: 0,
      } as any)
      .select("id")
      .single();

    if (pendingErr) return fail(origin, 500, "DB_ERROR", pendingErr.message);

    const pendingSubscriptionId = String(pendingSub.id);

    // ✅ checkout session
    const cs = await stripePost("checkout/sessions", STRIPE_SECRET_KEY, {
      mode: "subscription",
      customer: stripe_customer_id,
      success_url: `${SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
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
      "metadata[auth_user_id]": user.id,
    });

    const checkout_session_id = cs.id as string;
    const url = cs.url as string;

    // guarda checkout id
    await admin.from("subscriptions").update({ stripe_checkout_session_id: checkout_session_id }).eq("id", pendingSubscriptionId);

    return json(origin, 200, {
      ok: true,
      data: {
        url,
        pending_subscription_id: pendingSubscriptionId,
        stripe_checkout_session_id: checkout_session_id,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const code =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg.startsWith("FORBIDDEN") || msg.startsWith("MEMBERSHIP_FAILED") || msg.startsWith("ORG_LOOKUP_FAILED")
        ? 403
        : 500;

    console.error("debacu_eval_checkout_create error:", e);
    return json(origin, code, { ok: false, error_obj: { code: "CHECKOUT_CREATE_ERROR", message: msg } });
  }
});
