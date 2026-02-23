// supabase/functions/debacu_eval_subscription_manage/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { json, preflight } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

type PlanCode = "BASIC" | "MEDIUM" | "PREMIUM";
type BillingFrequency = "MONTHLY" | "YEARLY";

const DEFAULT_APP_ID = "DEBACU_EVAL";
const DEFAULT_RETURN_TO = "/app/perfil";

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`MISSING_ENV:${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

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
  const v = body?.target_plan_code ?? body?.targetPlanCode ?? body?.plan_code ?? body?.planCode;
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

// ✅ helper: construye URL bien (sin liarte con ? y &)
function buildReturnUrl(base: string, params: Record<string, string>) {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v).length) u.searchParams.set(k, String(v));
  }
  return u.toString();
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
    | "PENDING_CHANGE"
    | "USE_SCHEDULE_DOWNGRADE"
    | "NO_ACTIVE_SUBSCRIPTION"
    | "NO_DOWNGRADE_SCHEDULED"
    | "request_failed",
) {
  return json(req, status, { ok: false, error: "request_failed", detail });
}

/** ======================================================
 *  Org context (STRICT)
 *  - user debe ser OWNER/ADMIN ACTIVE en org
 *  - org.customer_id se usa como facturación
 *  ====================================================== */
async function requireOrgContext(sb: ReturnType<typeof sbService>, user_id: string, org_id: string) {
  const { data: mem, error: memErr } = await sb
    .from("debacu_eval_org_members")
    .select("org_id, role, status")
    .eq("user_id", user_id)
    .eq("org_id", org_id)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (memErr || !mem) return null;

  const role = safeUpper(mem.role);
  if (!(role === "OWNER" || role === "ADMIN")) return null;

  // ✅ org -> customer_id (ya lo arreglaste)
  const { data: org, error: orgErr } = await sb
    .from("debacu_eval_organizations")
    .select("id, customer_id")
    .eq("id", org_id)
    .maybeSingle();

  if (orgErr || !org?.customer_id) return null;

  return { org_id, role, customer_id: String(org.customer_id) };
}

/** ======================================================
 *  DB helpers
 *  ====================================================== */
async function getActiveSubscription(sb: ReturnType<typeof sbService>, customer_id: string, app_id: string) {
  const { data, error } = await sb
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
  return data as any;
}

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

const STATUS_ORDER = ["ACTIVE", "TRIAL_ACTIVE", "SUSPENDED", "PENDING_PAYMENT"] as const;
function scoreStatus(s?: string | null) {
  const up = safeUpper(s);
  const idx = STATUS_ORDER.indexOf(up as any);
  return idx === -1 ? 999 : idx;
}

async function getBestSubscription(sb: ReturnType<typeof sbService>, customer_id: string, app_id: string) {
  const { data, error } = await sb
    .from("subscriptions")
    .select("*")
    .eq("customer_id", customer_id)
    .eq("app_id", app_id)
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  const rows = (data ?? []).filter((r: any) => safeUpper(r?.status) !== "REPLACED");
  if (!rows.length) return null;

  rows.sort((a: any, b: any) => {
    const sa = scoreStatus(a.status);
    const sb2 = scoreStatus(b.status);
    if (sa !== sb2) return sa - sb2;

    const pa = (!a.next_billing_date ? 10 : 0) + (!(a.stripe_subscription_id || a.provider_subscription_id) ? 10 : 0);
    const pb = (!b.next_billing_date ? 10 : 0) + (!(b.stripe_subscription_id || b.provider_subscription_id) ? 10 : 0);
    if (pa !== pb) return pa - pb;

    const da = String(a.start_date ?? a.created_at ?? "");
    const db = String(b.start_date ?? b.created_at ?? "");
    return db.localeCompare(da);
  });

  return rows[0] as any;
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

/**
 * ✅ Fuente de verdad de facturación:
 * customers.stripe_customer_id (NO crear nuevos customers en Stripe con customer_email)
 */
async function getCustomerBilling(sb: ReturnType<typeof sbService>, customer_id: string) {
  const { data, error } = await sb
    .from("customers")
    .select("id, email, name, stripe_customer_id")
    .eq("id", customer_id)
    .maybeSingle();
  if (error) throw error;
  return data as any;
}

async function ensureStripeCustomer(sb: ReturnType<typeof sbService>, customer_id: string) {
  const customer = await getCustomerBilling(sb, customer_id);

  const existing = safeStr(customer?.stripe_customer_id);
  if (existing) return { stripe_customer_id: existing, email: customer?.email ?? null };

  // ✅ crea 1 vez y guarda
  const email = safeStr(customer?.email);
  const name = safeStr(customer?.name);

  const sc = await stripe.customers.create({
    email: email || undefined,
    name: name || undefined,
    metadata: { app_id: DEFAULT_APP_ID, customer_id },
  });

  const { error: upErr } = await sb
    .from("customers")
    .update({ stripe_customer_id: sc.id, updated_at: new Date().toISOString() })
    .eq("id", customer_id);

  if (upErr) throw upErr;

  return { stripe_customer_id: sc.id, email: email || null };
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
 *  Handlers
 *  ====================================================== */
async function handleGet(sb: ReturnType<typeof sbService>, customer_id: string, app_id: string) {
  const best = await getBestSubscription(sb, customer_id, app_id);
  const active = await getActiveSubscription(sb, customer_id, app_id);
  const pending = await getPendingSubscription(sb, customer_id, app_id);

  const plan =
    best?.plan_id ? await getPlanById(sb, best.plan_id)
    : active?.plan_id ? await getPlanById(sb, active.plan_id)
    : null;

  return { latest: best, active, pending, plan };
}

async function handleChange(
  sb: ReturnType<typeof sbService>,
  customer_id: string,
  app_id: string,
  org_id: string,
  body: any,
) {
  const target_plan_code = pickPlanCode(body);
  if (!target_plan_code) return { status: 400, detail: "missing_target_plan_code" as const };

  const billing_frequency = pickBillingFrequency(body);
  const price_id = PRICE_MAP[target_plan_code][billing_frequency];
  if (!price_id) return { status: 400, detail: "request_failed" as const };

  const return_to = pickString(body, "return_to", "returnTo") ?? DEFAULT_RETURN_TO;

  const pending = await getPendingSubscription(sb, customer_id, app_id);
  if (pending) return { status: 409, detail: "PENDING_CHANGE" as const, extra: { pendingSubscriptionId: pending.id } };

  const plan_row = await getPlanByCode(sb, app_id, target_plan_code);
  if (!plan_row) return { status: 400, detail: "request_failed" as const };

  const active_sub = await getActiveSubscription(sb, customer_id, app_id);
  const currentPlanRow = active_sub?.plan_id ? await getPlanById(sb, active_sub.plan_id) : null;
  const current_code = safeUpper(currentPlanRow?.code ?? "");

  const isDowngrade = !!active_sub && planRank(target_plan_code) < planRank(current_code);
  if (isDowngrade) return { status: 400, detail: "USE_SCHEDULE_DOWNGRADE" as const };

  const replaces_subscription_id = active_sub?.id ?? null;
  const replaces_stripe_subscription_id =
    active_sub?.stripe_subscription_id ??
    active_sub?.provider_subscription_id ??
    null;

  const pending_subscription_id = crypto.randomUUID();
  const now_iso = new Date().toISOString();
  const start_date = now_iso.slice(0, 10);

  // ✅ Siempre usar Stripe Customer existente (o crearlo 1 vez y persistirlo)
  const { stripe_customer_id } = await ensureStripeCustomer(sb, customer_id);

  const success_url = buildReturnUrl(STRIPE_SUCCESS_URL, {
    stripe: "success",
    session_id: "{CHECKOUT_SESSION_ID}",
    org_id,
    return_to,
  });

  const cancel_url = buildReturnUrl(STRIPE_CANCEL_URL, {
    stripe: "cancel",
    org_id,
    return_to,
  });

  // ✅ IMPORTANTE:
  // - Usar `customer` evita duplicados de customers.
  // - Añadir `subscription_data.metadata` ayuda al webhook a identificar la suscripción creada.
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: price_id, quantity: 1 }],
    payment_method_types: ["card"],

    customer: stripe_customer_id,
    client_reference_id: customer_id,

    success_url,
    cancel_url,

    metadata: {
      app_id,
      customer_id,
      pending_subscription_id,
      target_plan_code,
      billing_frequency,
      replaces_subscription_id: replaces_subscription_id ?? "",
      replaces_stripe_subscription_id: replaces_stripe_subscription_id ?? "",
      org_id,
      return_to,

      // compat camel
      appId: app_id,
      customerId: customer_id,
      pendingSubscriptionId: pending_subscription_id,
      targetPlanCode: target_plan_code,
      billingFrequency: billing_frequency,
      replacesSubscriptionId: replaces_subscription_id ?? "",
      replacesStripeSubscriptionId: replaces_stripe_subscription_id ?? "",
      orgId: org_id,
      returnTo: return_to,
    },

    subscription_data: {
      metadata: {
        app_id,
        customer_id,
        pending_subscription_id,
        org_id,
        target_plan_code,
        billing_frequency,
        replaces_subscription_id: replaces_subscription_id ?? "",
        replaces_stripe_subscription_id: replaces_stripe_subscription_id ?? "",
      },
    },
  });

  const { error: insertError } = await sb.from("subscriptions").insert({
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
    provider_subscription_id: null,
    stripe_subscription_id: null,
    stripe_customer_id, // ✅ guardamos el stripe customer usado
    created_at: now_iso,
    updated_at: now_iso,
  } as any);

  if (insertError) throw insertError;

  await insertEvent(sb, {
    app_id,
    customer_id,
    type: "CHECKOUT_CREATED",
    stripe_customer_id,
    payload: {
      pending_subscription_id,
      checkout_session_id: checkoutSession.id,
      stripe_price_id: price_id,
      target_plan_code,
      billing_frequency,
      replaces_subscription_id,
      replaces_stripe_subscription_id,
      org_id,
      return_to,
      success_url,
      cancel_url,
    },
  });

  return {
    status: 200,
    body: {
      ok: true,
      checkoutUrl: checkoutSession.url,
      checkout_url: checkoutSession.url, // compat
      pendingSubscriptionId: pending_subscription_id,
      pending_subscription_id,
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

  if ((active_sub as any)?.required_plan_code) {
    return {
      status: 200,
      body: {
        ok: true,
        scheduled: true,
        effective_date: (active_sub as any)?.next_billing_date ?? null,
        target_plan_code: (active_sub as any)?.required_plan_code,
        schedule_id: (active_sub as any)?.stripe_schedule_id ?? null,
      },
    };
  }

  const currentPlanRow = (active_sub as any)?.plan_id ? await getPlanById(sb, (active_sub as any).plan_id) : null;
  const current_code = safeUpper(currentPlanRow?.code ?? "");

  if (!(planRank(target_plan_code) < planRank(current_code))) {
    return { status: 400, detail: "invalid_action" as const };
  }

  const stripeSubId =
    (active_sub as any)?.stripe_subscription_id ??
    (active_sub as any)?.provider_subscription_id ??
    null;

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
    .eq("id", (active_sub as any).id);

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
      mode: "SCHEDULE_NEXT_CYCLE",
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
  if (!scheduleId) return { status: 400, detail: "NO_DOWNGRADE_SCHEDULED" as const };

  const stripeSubId =
    (active_sub as any)?.stripe_subscription_id ??
    (active_sub as any)?.provider_subscription_id ??
    null;

  if (!stripeSubId) return { status: 409, detail: "request_failed" as const };

  try {
    await stripe.subscriptionSchedules.release(scheduleId);
  } catch (e: any) {
    const msg = String(e?.message ?? e).toLowerCase();
    const code = String(e?.code ?? "");
    const isNotFound = code === "resource_missing" || msg.includes("no such subscription schedule");
    if (!isNotFound) throw e;
  }

  let effectiveNextDate: string | null = null;
  try {
    const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
    const end = (stripeSub as any)?.current_period_end as number | undefined;
    effectiveNextDate = end ? new Date(end * 1000).toISOString().slice(0, 10) : null;
  } catch {
    effectiveNextDate = null;
  }

  const nowIso = new Date().toISOString();

  const updatePayload: Record<string, any> = {
    required_plan_code: null,
    required_billing_frequency: null,
    stripe_schedule_id: null,
    updated_at: nowIso,
  };
  if (effectiveNextDate) updatePayload.next_billing_date = effectiveNextDate;

  const { error: upErr } = await sb.from("subscriptions").update(updatePayload as any).eq("id", (active_sub as any).id);
  if (upErr) throw upErr;

  await insertEvent(sb, {
    app_id,
    customer_id,
    type: "DOWNGRADE_CANCELLED",
    stripe_subscription_id: stripeSubId ?? null,
    stripe_customer_id: (active_sub as any)?.stripe_customer_id ?? null,
    payload: { stripe_schedule_id: scheduleId, action: "CANCEL_DOWNGRADE", next_billing_date: effectiveNextDate },
  });

  return { status: 200, body: { ok: true, next_billing_date: effectiveNextDate } };
}

/** ======================================================
 *  Server
 *  ====================================================== */
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

    const sb = sbService();

    const ctx = await requireOrgContext(sb, user.id, org_id);
    if (!ctx) return err(req, 403, "FORBIDDEN");

    const app_id = pickString(body, "app_id", "appId") ?? DEFAULT_APP_ID;
    if (app_id !== DEFAULT_APP_ID) return err(req, 400, "invalid_app_id");

    // anti-tampering: si mandan customer_id, debe coincidir
    const customer_id_in = pickString(body, "customer_id", "customerId");
    if (customer_id_in && customer_id_in !== ctx.customer_id) return err(req, 403, "FORBIDDEN");

    // Routing
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
      const result = await handleChange(sb, ctx.customer_id, app_id, org_id, body);
      if ((result as any).detail) {
        const d = (result as any).detail as any;
        if (d === "missing_target_plan_code") return err(req, 400, "missing_target_plan_code");
        if (d === "USE_SCHEDULE_DOWNGRADE") return err(req, 400, "USE_SCHEDULE_DOWNGRADE");
        if (d === "PENDING_CHANGE") {
          return json(req, 409, { ok: false, error: "request_failed", detail: "PENDING_CHANGE", ...(result as any).extra });
        }
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
        if (d === "PENDING_CHANGE") {
          return json(req, 409, { ok: false, error: "request_failed", detail: "PENDING_CHANGE", ...(result as any).extra });
        }
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
  } catch (e) {
    console.error("debacu_eval_subscription_manage error:", e);
    return err(req, 500, "request_failed");
  }
});