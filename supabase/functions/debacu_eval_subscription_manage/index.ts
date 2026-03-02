// supabase/functions/debacu_eval_subscription_manage/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { json, preflight } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

/**
 * OBJETIVO:
 * - 1 Stripe Customer por customer_id interno
 * - 1 Stripe Subscription activa por customer_id/app_id
 * - Upgrade: SIEMPRE Checkout (cobro inmediato, pierde lo pendiente) => NUEVA subscription, luego webhook cancela la anterior
 * - Downgrade: stripe.subscriptionSchedules (programado)
 * - Cancel downgrade: release(schedule) + limpiar flags DB
 *
 * DB:
 * - customers: id, email, stripe_customer_id
 * - subscriptions: id, customer_id, app_id, status, plan_id,
 *                  stripe_subscription_id, provider_subscription_id,
 *                  stripe_customer_id, stripe_price_id,
 *                  required_plan_code, required_billing_frequency, stripe_schedule_id,
 *                  replaces_subscription_id,
 *                  start_date, next_billing_date, end_date, updated_at...
 * - plans: id, app_id, code
 */

type PlanCode = "BASIC" | "MEDIUM" | "PREMIUM";
type BillingFrequency = "MONTHLY" | "YEARLY";

const DEFAULT_APP_ID = "DEBACU_EVAL";
const DEFAULT_RETURN_TO = "/app/perfil";

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`MISSING_ENV:${name}`);
  return v;
}

// Env
const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

const STRIPE_SECRET_KEY = mustEnv("STRIPE_SECRET_KEY");

/**
 * ✅ CANÓNICO para construir redirects de Stripe.
 * En PROD: https://www.debacu.com
 * En DEV:  http://localhost:3000  (si lo quieres)
 */
const PUBLIC_SITE_URL = mustEnv("PUBLIC_SITE_URL").replace(/\/+$/, "");

// Precios
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

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

function sbService() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function safeUpper(v?: string | null) {
  return String(v ?? "").toUpperCase();
}
function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
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
  if (typeof v !== "string") return "MONTHLY";
  const up = v.toUpperCase().trim();
  if (up === "MONTHLY" || up === "YEARLY") return up;
  return "MONTHLY";
}
function planRank(code: string) {
  const c = safeUpper(code);
  if (c === "BASIC") return 1;
  if (c === "MEDIUM") return 2;
  if (c === "PREMIUM") return 3;
  return 0;
}
function isoDateFromUnix(sec?: number | null) {
  if (!sec) return null;
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

function buildUrl(base: string, params: Record<string, string>) {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v).length) u.searchParams.set(k, String(v));
  }
  return u.toString();
}

/**
 * ✅ Redirects Stripe (hosted Checkout)
 * Siempre construimos desde PUBLIC_SITE_URL.
 */
function buildStripeSuccessUrl(org_id: string, return_to: string) {
  return buildUrl(`${PUBLIC_SITE_URL}/app/cuenta`, {
    stripe: "success",
    session_id: "{CHECKOUT_SESSION_ID}",
    org_id,
    return_to,
  });
}
function buildStripeCancelUrl(org_id: string, return_to: string) {
  return buildUrl(`${PUBLIC_SITE_URL}/app/cuenta`, {
    stripe: "cancel",
    org_id,
    return_to,
  });
}

function err(
  req: Request,
  status: number,
  detail:
    | "UNAUTHENTICATED"
    | "FORBIDDEN"
    | "missing_org_id"
    | "missing_action"
    | "invalid_action"
    | "invalid_app_id"
    | "missing_target_plan_code"
    | "invalid_billing_frequency"
    | "PENDING_CHANGE"
    | "USE_SCHEDULE_DOWNGRADE"
    | "PLAN_NOT_ACTIVE"
    | "SEATS_EXCEEDED"
    | "NO_ACTIVE_SUBSCRIPTION"
    | "NO_DOWNGRADE_SCHEDULED"
    | "request_failed",
  extra?: Record<string, unknown>,
) {
  return json(req, status, { ok: false, error: "request_failed", detail, ...(extra ?? {}) });
}

/** ======================================================
 * Org context (org_id obligatorio) + role OWNER/ADMIN
 * ====================================================== */
async function requireOrgContext(sb: ReturnType<typeof sbService>, auth_user_id: string, org_id: string) {
  const { data: mem, error: memErr } = await sb
    .from("debacu_eval_org_members")
    .select("org_id, role, status")
    .eq("auth_user_id", auth_user_id)
    .eq("org_id", org_id)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (memErr || !mem) return null;

  const role = safeUpper(mem.role);
  if (!(role === "OWNER" || role === "ADMIN")) return null;

  let customer_id: string | null = null;

  const { data: ent, error: entErr } = await sb
    .from("debacu_eval_org_entitlements_v")
    .select("customer_id")
    .eq("org_id", org_id)
    .maybeSingle();

  if (!entErr && ent?.customer_id) customer_id = String(ent.customer_id);

  if (!customer_id) {
    const { data: org, error: orgErr } = await sb
      .from("debacu_eval_organizations")
      .select("customer_id")
      .eq("id", org_id)
      .maybeSingle();

    if (orgErr || !org?.customer_id) return null;
    customer_id = String(org.customer_id);
  }

  return { org_id, role, customer_id };
}

/** ======================================================
 * DB helpers
 * ====================================================== */
async function getPendingSubscription(sb: ReturnType<typeof sbService>, customer_id: string, app_id: string) {
  const { data, error } = await sb
    .from("subscriptions")
    .select("*")
    .eq("customer_id", customer_id)
    .eq("app_id", app_id)
    .eq("status", "PENDING_PAYMENT")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as any;
}

const ACTIVE_STATUSES = ["ACTIVE", "TRIAL_ACTIVE", "PAST_DUE"] as const;

async function getActiveSubscription(sb: ReturnType<typeof sbService>, customer_id: string, app_id: string) {
  const { data, error } = await sb
    .from("subscriptions")
    .select("*")
    .eq("customer_id", customer_id)
    .eq("app_id", app_id)
    .in("status", [...ACTIVE_STATUSES])
    .order("start_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as any;
}

async function getPlanByCode(sb: ReturnType<typeof sbService>, app_id: string, code: string) {
  const { data, error } = await sb.from("plans").select("*").eq("app_id", app_id).eq("code", code).maybeSingle();
  if (error) throw error;
  return data as any;
}
async function getPlanById(sb: ReturnType<typeof sbService>, plan_id: string) {
  const { data, error } = await sb.from("plans").select("*").eq("id", plan_id).maybeSingle();
  if (error) throw error;
  return data as any;
}

async function getCustomerRow(sb: ReturnType<typeof sbService>, customer_id: string) {
  const { data, error } = await sb
    .from("customers")
    .select("id, email, name, stripe_customer_id, is_active")
    .eq("id", customer_id)
    .maybeSingle();
  if (error) throw error;
  return data as any;
}

async function insertEvent(sb: ReturnType<typeof sbService>, params: {
  app_id: string;
  customer_id: string;
  type: string;
  payload?: Record<string, unknown>;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_event_id?: string | null;
}) {
  const stripe_event_id = params.stripe_event_id ?? `manage_${crypto.randomUUID()}`;
  const { error } = await sb.from("subscription_events").insert({
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

/** ======================================================
 * Stripe helpers
 * ====================================================== */
async function ensureStripeCustomer(
  sb: ReturnType<typeof sbService>,
  customer_id: string,
  org_id: string,
  app_id: string,
  auth_user_id: string,
) {
  const c = await getCustomerRow(sb, customer_id);
  if (!c?.id) throw new Error("FORBIDDEN");
  if (c.is_active === false) throw new Error("FORBIDDEN");

  let stripe_customer_id: string | null = (c.stripe_customer_id as string | null) ?? null;

  if (stripe_customer_id) return { stripe_customer_id, email: String(c.email ?? "").trim().toLowerCase() };

  const email = String(c.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("customer_no_email");

  const sc = await stripe.customers.create({
    email,
    name: c.name ?? email,
    metadata: { customer_id, org_id, app_id, auth_user_id },
  });

  stripe_customer_id = sc.id;

  const { error: upErr } = await sb
    .from("customers")
    .update({ stripe_customer_id, updated_at: new Date().toISOString() })
    .eq("id", customer_id);

  if (upErr) throw upErr;

  return { stripe_customer_id, email };
}

function normalizeStripeSubId(row: any): string | null {
  return (row?.stripe_subscription_id ?? row?.provider_subscription_id ?? null)
    ? String(row.stripe_subscription_id ?? row.provider_subscription_id)
    : null;
}

/**
 * ✅ Si ya hay downgrade programado pero en DB falta next_billing_date,
 * calculamos la fecha desde Stripe y opcionalmente la persistimos en DB.
 */
async function ensureEffectiveDateForScheduledDowngrade(params: {
  sb: ReturnType<typeof sbService>;
  active_sub: any;
  stripeSubId: string;
}) {
  const { sb, active_sub, stripeSubId } = params;

  let effective_date: string | null = (active_sub as any)?.next_billing_date ?? null;

  if (effective_date) return effective_date;

  // 1) intentar sacar current_period_end de la suscripción
  try {
    const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
    const periodEnd = (stripeSub as any)?.current_period_end as number | undefined;
    const computed = isoDateFromUnix(periodEnd ?? null);
    if (computed) effective_date = computed;
  } catch {
    // ignore
  }

  // 2) persistir si lo hemos calculado
  if (effective_date) {
    const nowIso = new Date().toISOString();
    await sb
      .from("subscriptions")
      .update({ next_billing_date: effective_date, updated_at: nowIso } as any)
      .eq("id", active_sub.id);
  }

  return effective_date;
}

/** ======================================================
 * Handlers
 * ====================================================== */
async function handleGet(sb: ReturnType<typeof sbService>, customer_id: string, app_id: string) {
  const active = await getActiveSubscription(sb, customer_id, app_id);
  const pending = await getPendingSubscription(sb, customer_id, app_id);
  const plan = active?.plan_id ? await getPlanById(sb, active.plan_id) : null;

  // Nota: no llamo a Stripe aquí para no encarecer cada GET.
  // Lo importante es que SCHEDULE_DOWNGRADE devuelva effective_date no null,
  // y que next_billing_date se persista si falta.
  return {
    active,
    pending,
    plan,
    downgrade_scheduled: !!active?.stripe_schedule_id && !!active?.required_plan_code,
  };
}

/**
 * CHANGE (NUEVA POLÍTICA):
 * - Si NO hay suscripción activa -> Checkout para crear primera.
 * - Si HAY suscripción activa:
 *    - Downgrade -> forzar SCHEDULE_DOWNGRADE
 *    - Upgrade -> Checkout SIEMPRE (cobro inmediato). El webhook debe:
 *        - activar la nueva
 *        - cancelar la anterior
 *        - marcar anterior como REPLACED y nueva como ACTIVE
 */
async function handleChange(
  sb: ReturnType<typeof sbService>,
  customer_id: string,
  app_id: string,
  org_id: string,
  auth_user_id: string,
  body: any,
) {
  const target_plan_code = pickPlanCode(body);
  if (!target_plan_code) return { status: 400, detail: "missing_target_plan_code" as const };

  const billing_frequency = pickBillingFrequency(body);
  const price_id = PRICE_MAP[target_plan_code][billing_frequency];
  if (!price_id) return { status: 400, detail: "request_failed" as const };

  const pending = await getPendingSubscription(sb, customer_id, app_id);
  if (pending) return { status: 409, detail: "PENDING_CHANGE" as const, extra: { pendingSubscriptionId: pending.id } };

  const plan_row = await getPlanByCode(sb, app_id, target_plan_code);
  if (!plan_row?.id) return { status: 400, detail: "request_failed" as const };

  const return_to = pickString(body, "return_to", "returnTo") ?? DEFAULT_RETURN_TO;

  const { stripe_customer_id } = await ensureStripeCustomer(sb, customer_id, org_id, app_id, auth_user_id);

  const active_sub = await getActiveSubscription(sb, customer_id, app_id);
  const activeStripeSubId = active_sub ? normalizeStripeSubId(active_sub) : null;

  // Si hay activa: decidir downgrade vs upgrade
  if (active_sub) {
    const currentPlanRow = active_sub.plan_id ? await getPlanById(sb, active_sub.plan_id) : null;
    const current_code = safeUpper(currentPlanRow?.code ?? "");

    const isDowngrade = planRank(target_plan_code) < planRank(current_code);
    if (isDowngrade) {
      return { status: 400, detail: "USE_SCHEDULE_DOWNGRADE" as const };
    }
  }

  // CHECKOUT SIEMPRE (primera suscripción o upgrade inmediato)
  const now_iso = new Date().toISOString();
  const start_date = now_iso.slice(0, 10);
  const pending_subscription_id = crypto.randomUUID();

  // ✅ Redirects correctos
  const success_url = buildStripeSuccessUrl(org_id, return_to);
  const cancel_url = buildStripeCancelUrl(org_id, return_to);

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripe_customer_id,
    line_items: [{ price: price_id, quantity: 1 }],
    success_url,
    cancel_url,
    allow_promotion_codes: true,
    subscription_data: {
      metadata: {
        app_id,
        customer_id,
        org_id,
        pending_subscription_id,
        target_plan_code,
        billing_frequency,
        replaces_subscription_id: active_sub?.id ?? "",
        replaces_stripe_subscription_id: activeStripeSubId ?? "",
        return_to,
      },
    },
    metadata: {
      app_id,
      customer_id,
      org_id,
      pending_subscription_id,
      target_plan_code,
      billing_frequency,
      return_to,
      replaces_subscription_id: active_sub?.id ?? "",
      replaces_stripe_subscription_id: activeStripeSubId ?? "",
    },
  });

  const { error: insErr } = await sb.from("subscriptions").insert({
    id: pending_subscription_id,
    customer_id,
    app_id,
    plan_id: plan_row.id,
    status: "PENDING_PAYMENT",
    billing_frequency,
    start_date,
    provider: "stripe",
    stripe_customer_id,
    stripe_price_id: price_id,
    provider_checkout_id: checkoutSession.id,
    stripe_checkout_session_id: checkoutSession.id,
    replaces_subscription_id: active_sub?.id ?? null,
    created_at: now_iso,
    updated_at: now_iso,
  } as any);

  if (insErr) throw insErr;

  await insertEvent(sb, {
    app_id,
    customer_id,
    type: active_sub ? "CHECKOUT_CREATED_UPGRADE_REPLACE" : "CHECKOUT_CREATED_FIRST_SUBSCRIPTION",
    stripe_customer_id,
    stripe_subscription_id: activeStripeSubId ?? null,
    payload: {
      pending_subscription_id,
      checkout_session_id: checkoutSession.id,
      target_plan_code,
      billing_frequency,
      success_url,
      cancel_url,
      replaces_subscription_id: active_sub?.id ?? null,
      replaces_stripe_subscription_id: activeStripeSubId ?? null,
    },
  });

  return {
    status: 200,
    body: {
      ok: true,
      mode: active_sub ? "CHECKOUT_UPGRADE_REPLACE" : "CHECKOUT_CREATE_FIRST_SUBSCRIPTION",
      checkoutUrl: checkoutSession.url,
      pendingSubscriptionId: pending_subscription_id,
      return_to,
    },
  };
}

async function handleScheduleDowngrade(sb: ReturnType<typeof sbService>, customer_id: string, app_id: string, body: any) {
  const target_plan_code = pickPlanCode(body);
  if (!target_plan_code) return { status: 400, detail: "missing_target_plan_code" as const };

  const billing_frequency = pickBillingFrequency(body);
  const price_id = PRICE_MAP[target_plan_code][billing_frequency];
  if (!price_id) return { status: 400, detail: "request_failed" as const };

  const pending = await getPendingSubscription(sb, customer_id, app_id);
  if (pending) return { status: 409, detail: "PENDING_CHANGE" as const, extra: { pendingSubscriptionId: pending.id } };

  const active_sub = await getActiveSubscription(sb, customer_id, app_id);
  if (!active_sub) return { status: 409, detail: "NO_ACTIVE_SUBSCRIPTION" as const };

  // ✅ YA ESTABA PROGRAMADO: antes devolvía effective_date = null si next_billing_date era null.
  // Ahora lo calculamos desde Stripe y lo persistimos si falta.
  if ((active_sub as any)?.required_plan_code && (active_sub as any)?.stripe_schedule_id) {
    const stripeSubId = normalizeStripeSubId(active_sub);
    let effective_date: string | null = (active_sub as any)?.next_billing_date ?? null;

    if (stripeSubId) {
      effective_date = await ensureEffectiveDateForScheduledDowngrade({ sb, active_sub, stripeSubId });
    }

    return {
      status: 200,
      body: {
        ok: true,
        scheduled: true,
        effective_date,
        target_plan_code: (active_sub as any)?.required_plan_code,
        schedule_id: (active_sub as any)?.stripe_schedule_id ?? null,
      },
    };
  }

  const currentPlanRow = active_sub.plan_id ? await getPlanById(sb, active_sub.plan_id) : null;
  const current_code = safeUpper(currentPlanRow?.code ?? "");

  if (!(planRank(target_plan_code) < planRank(current_code))) {
    return { status: 400, detail: "invalid_action" as const };
  }

  const stripeSubId = normalizeStripeSubId(active_sub);
  if (!stripeSubId) return { status: 409, detail: "request_failed" as const };

  const stripeSub = await stripe.subscriptions.retrieve(stripeSubId, { expand: ["items.data.price", "customer"] });
  const currentPriceId = stripeSub.items.data?.[0]?.price?.id;
  const periodStart = (stripeSub as any).current_period_start as number | undefined;
  const periodEnd = (stripeSub as any).current_period_end as number | undefined;

  if (!currentPriceId || !periodStart || !periodEnd) return { status: 500, detail: "request_failed" as const };

  const schedule = await stripe.subscriptionSchedules.create({ from_subscription: stripeSubId });

  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    phases: [
      {
        start_date: periodStart,
        end_date: periodEnd,
        items: [{ price: currentPriceId, quantity: 1 }],
        proration_behavior: "none",
      },
      {
        start_date: periodEnd,
        items: [{ price: price_id, quantity: 1 }],
        proration_behavior: "none",
      },
    ],
  });

  const nowIso = new Date().toISOString();
  const effective_date = isoDateFromUnix(periodEnd);

  const { error: upErr } = await sb
    .from("subscriptions")
    .update({
      required_plan_code: target_plan_code,
      required_billing_frequency: billing_frequency,
      stripe_schedule_id: schedule.id,
      next_billing_date: effective_date,
      updated_at: nowIso,
    } as any)
    .eq("id", active_sub.id);

  if (upErr) throw upErr;

  await insertEvent(sb, {
    app_id,
    customer_id,
    type: "DOWNGRADE_SCHEDULED",
    stripe_subscription_id: stripeSubId,
    stripe_customer_id: typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer?.id ?? null,
    payload: {
      target_plan_code,
      billing_frequency,
      stripe_schedule_id: schedule.id,
      effective_unix: periodEnd,
      effective_date,
      current_plan_code: current_code || null,
      current_price_id: currentPriceId,
      target_price_id: price_id,
    },
  });

  return {
    status: 200,
    body: {
      ok: true,
      scheduled: true,
      effective_date,
      current_plan_code: current_code || null,
      target_plan_code,
      schedule_id: schedule.id,
    },
  };
}

async function handleCancelDowngrade(sb: ReturnType<typeof sbService>, customer_id: string, app_id: string) {
  const active_sub = await getActiveSubscription(sb, customer_id, app_id);
  if (!active_sub) return { status: 409, detail: "NO_ACTIVE_SUBSCRIPTION" as const };

  const scheduleId = (active_sub as any)?.stripe_schedule_id ?? null;
  const required_plan_code = (active_sub as any)?.required_plan_code ?? null;

  if (!scheduleId || !required_plan_code) return { status: 400, detail: "NO_DOWNGRADE_SCHEDULED" as const };

  const stripeSubId = normalizeStripeSubId(active_sub);
  if (!stripeSubId) return { status: 409, detail: "request_failed" as const };

  try {
    await stripe.subscriptionSchedules.release(scheduleId);
  } catch (e: any) {
    const msg = String(e?.message ?? e).toLowerCase();
    const code = String(e?.code ?? "");
    const isNotFound = code === "resource_missing" || msg.includes("no such subscription schedule");
    if (!isNotFound) throw e;
  }

  let next_billing_date: string | null = null;
  try {
    const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
    next_billing_date = isoDateFromUnix((stripeSub as any)?.current_period_end ?? null);
  } catch {
    next_billing_date = (active_sub as any)?.next_billing_date ?? null;
  }

  const nowIso = new Date().toISOString();

  const { error: upErr } = await sb
    .from("subscriptions")
    .update({
      required_plan_code: null,
      required_billing_frequency: null,
      stripe_schedule_id: null,
      next_billing_date,
      updated_at: nowIso,
    } as any)
    .eq("id", active_sub.id);

  if (upErr) throw upErr;

  await insertEvent(sb, {
    app_id,
    customer_id,
    type: "DOWNGRADE_CANCELLED",
    stripe_subscription_id: stripeSubId,
    stripe_customer_id: (active_sub as any)?.stripe_customer_id ?? null,
    payload: { stripe_schedule_id: scheduleId, action: "CANCEL_DOWNGRADE", next_billing_date },
  });

  return { status: 200, body: { ok: true, cancelled: true, next_billing_date } };
}

/** ======================================================
 * Server
 * ====================================================== */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);

  try {
    const user = await requireUser(req);
    if (!user?.id) return err(req, 401, "UNAUTHENTICATED");

    const url = new URL(req.url);
    const org_id_q = safeStr(url.searchParams.get("org_id"));

    let body: any = {};
    if (req.method === "POST") body = await req.json().catch(() => ({}));

    if (req.method !== "POST" && req.method !== "GET") {
      return json(req, 405, { ok: false, error: "request_failed", detail: "METHOD_NOT_ALLOWED" });
    }

    const org_id = pickString(body, "org_id", "orgId") ?? org_id_q;
    if (!org_id) return err(req, 400, "missing_org_id");

    const app_id = pickString(body, "app_id", "appId") ?? DEFAULT_APP_ID;
    if (app_id !== DEFAULT_APP_ID) return err(req, 400, "invalid_app_id");

    const sb = sbService();
    const ctx = await requireOrgContext(sb, user.id, org_id);
    if (!ctx) return err(req, 403, "FORBIDDEN");

    const customer_id_in = pickString(body, "customer_id", "customerId");
    if (customer_id_in && customer_id_in !== ctx.customer_id) return err(req, 403, "FORBIDDEN");

    if (req.method === "GET") {
      const data = await handleGet(sb, ctx.customer_id, app_id);
      return json(req, 200, { ok: true, data });
    }

    const action = safeUpper(body?.action ?? "");
    if (!action) return err(req, 400, "missing_action");

    if (action === "GET") {
      const data = await handleGet(sb, ctx.customer_id, app_id);
      return json(req, 200, { ok: true, data });
    }

    if (action === "CHANGE") {
      const result = await handleChange(sb, ctx.customer_id, app_id, org_id, user.id, body);
      if ((result as any).detail) {
        const d = (result as any).detail as any;
        if (d === "missing_target_plan_code") return err(req, 400, "missing_target_plan_code");
        if (d === "USE_SCHEDULE_DOWNGRADE") return err(req, 400, "USE_SCHEDULE_DOWNGRADE");
        if (d === "PENDING_CHANGE") return err(req, 409, "PENDING_CHANGE", (result as any).extra ?? {});
        return err(req, 500, "request_failed");
      }
      return json(req, 200, (result as any).body);
    }

    if (action === "SCHEDULE_DOWNGRADE") {
      const result = await handleScheduleDowngrade(sb, ctx.customer_id, app_id, body);
      if ((result as any).detail) {
        const d = (result as any).detail as any;
        if (d === "missing_target_plan_code") return err(req, 400, "missing_target_plan_code");
        if (d === "NO_ACTIVE_SUBSCRIPTION") return err(req, 409, "NO_ACTIVE_SUBSCRIPTION");
        if (d === "PENDING_CHANGE") return err(req, 409, "PENDING_CHANGE", (result as any).extra ?? {});
        return err(req, 500, "request_failed");
      }
      return json(req, (result as any).status ?? 200, (result as any).body);
    }

    if (action === "CANCEL_DOWNGRADE") {
      const result = await handleCancelDowngrade(sb, ctx.customer_id, app_id);
      if ((result as any).detail) {
        const d = (result as any).detail as any;
        if (d === "NO_ACTIVE_SUBSCRIPTION") return err(req, 409, "NO_ACTIVE_SUBSCRIPTION");
        if (d === "NO_DOWNGRADE_SCHEDULED") return err(req, 400, "NO_DOWNGRADE_SCHEDULED");
        return err(req, 500, "request_failed");
      }
      return json(req, (result as any).status ?? 200, (result as any).body);
    }

    return err(req, 400, "invalid_action");
  } catch (e: any) {
    console.error("debacu_eval_subscription_manage error:", e);
    const msg = String(e?.message ?? e);
    if (msg === "FORBIDDEN") return err(req, 403, "FORBIDDEN");
    return err(req, 500, "request_failed");
  }
});