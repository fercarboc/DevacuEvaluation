// supabase/functions/debacu_eval_account_bundle/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

const APP_ID = "DEBACU_EVAL";

/* ======================================================
 * Env
 * ====================================================== */
function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`MISSING_ENV:${name}`);
  return v;
}

function optEnv(name: string) {
  return Deno.env.get(name) ?? null;
}

const STRIPE_SECRET_KEY =
  optEnv("STRIPE_SECRET_KEY") ||
  optEnv("DEBACU_STRIPE_SECRET_KEY") ||
  null;

/* ======================================================
 * Utils
 * ====================================================== */
function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function readJsonSafe<T>(req: Request): Promise<T | null> {
  try {
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function safeUpper(v?: string | null) {
  return (v ?? "").toUpperCase();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function str(v: unknown) {
  return String(v ?? "").trim();
}

function toNumber(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function fromUnix(ts?: number | null) {
  if (!ts || !Number.isFinite(ts)) return null;
  return new Date(ts * 1000).toISOString();
}

function amountFromStripe(v?: number | null) {
  if (v === null || v === undefined || !Number.isFinite(v)) return 0;
  return Math.round(v) / 100;
}

function firstNonEmpty(...vals: any[]) {
  for (const v of vals) {
    if (v !== null && v !== undefined && String(v).trim() !== "") return v;
  }
  return null;
}

/* ======================================================
 * Types
 * ====================================================== */
type Body = {
  org_id?: string;
};

type OrgResolvedBy = "requested" | "first_active" | "first_any";

/* ======================================================
 * Subscription helpers
 * ====================================================== */
const STATUS_ORDER = ["ACTIVE", "TRIAL_ACTIVE", "SUSPENDED", "PAST_DUE", "PENDING_PAYMENT"] as const;

function scoreStatus(s?: string | null) {
  const up = safeUpper(s);
  const idx = STATUS_ORDER.indexOf(up as any);
  return idx === -1 ? 999 : idx;
}

async function getBestSubscription(params: {
  admin: ReturnType<typeof supabaseServiceClient>;
  customer_id: string;
  app_id: string;
}) {
  const { admin, customer_id, app_id } = params;

  const { data, error } = await admin
    .from("subscriptions")
    .select(
      "id,status,billing_frequency,next_billing_date,plan_id,created_at,updated_at,start_date," +
        "stripe_subscription_id,provider_subscription_id,required_plan_code,required_billing_frequency,stripe_schedule_id",
    )
    .eq("customer_id", customer_id)
    .eq("app_id", app_id)
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(25);

  if (error) throw new Error("DB_SUBSCRIPTIONS_FAILED");

  const rows = (data ?? []).filter((r: any) => safeUpper(r?.status) !== "REPLACED");
  if (!rows.length) return null;

  rows.sort((a: any, b: any) => {
    const sa = scoreStatus(a.status);
    const sb = scoreStatus(b.status);
    if (sa !== sb) return sa - sb;

    const da = String(a.start_date ?? "");
    const db = String(b.start_date ?? "");
    if (da && db && da !== db) return db.localeCompare(da);

    const ua = String(a.updated_at ?? "");
    const ub = String(b.updated_at ?? "");
    if (ua && ub && ua !== ub) return ub.localeCompare(ua);

    const ca = String(a.created_at ?? "");
    const cb = String(b.created_at ?? "");
    return cb.localeCompare(ca);
  });

  return rows[0] as any;
}

/* ======================================================
 * Tenant resolution
 * ====================================================== */
async function resolveOrgForUser(params: {
  admin: ReturnType<typeof supabaseServiceClient>;
  user_id: string;
  org_id?: string | null;
}): Promise<{ org_id: string; role: string | null; resolvedBy: OrgResolvedBy }> {
  const { admin, user_id } = params;
  const requestedOrgId = (params.org_id ?? "").trim() || null;
  const uid = String(user_id);

  if (requestedOrgId) {
    if (!isUuid(requestedOrgId)) throw new Error("invalid_org_id");

    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, role")
      .eq("org_id", requestedOrgId)
      .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (error || !data?.org_id) throw new Error("FORBIDDEN");
    return { org_id: String(data.org_id), role: data.role ?? null, resolvedBy: "requested" };
  }

  const { data, error } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, role, created_at")
    .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data?.org_id) throw new Error("FORBIDDEN");
  return { org_id: String(data.org_id), role: data.role ?? null, resolvedBy: "first_active" };
}

async function resolveCustomerId(params: { admin: ReturnType<typeof supabaseServiceClient>; org_id: string }) {
  const { admin, org_id } = params;

  const { data: org, error } = await admin
    .from("debacu_eval_organizations")
    .select("customer_id")
    .eq("id", org_id)
    .maybeSingle();

  if (error || !org?.customer_id) throw new Error("FORBIDDEN");
  return String(org.customer_id);
}

/* ======================================================
 * Stripe helpers
 * ====================================================== */
function resolveStripeCustomerId(customer: any): string | null {
  return (
    firstNonEmpty(
      customer?.stripe_customer_id,
      customer?.provider_customer_id,
      customer?.processor_customer_id,
      customer?.external_customer_id,
      customer?.gateway_customer_id,
    ) as string | null
  );
}

function resolveStripeSubscriptionId(subscription: any): string | null {
  return (
    firstNonEmpty(
      subscription?.stripe_subscription_id,
      subscription?.provider_subscription_id,
    ) as string | null
  );
}

async function stripeRequest(path: string, qs?: Record<string, string | number | null | undefined>) {
  if (!STRIPE_SECRET_KEY) {
    throw new Error("MISSING_ENV:STRIPE_SECRET_KEY");
  }

  const url = new URL(`https://api.stripe.com/v1/${path}`);
  for (const [k, v] of Object.entries(qs ?? {})) {
    if (v !== null && v !== undefined && String(v) !== "") {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  if (!res.ok) {
    const msg =
      body?.error?.message ||
      body?.message ||
      `STRIPE_HTTP_${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return body;
}

function normalizeStripeInvoice(inv: any) {
  return {
    id: inv?.id ?? null,
    number: inv?.number ?? null,
    status: inv?.status ?? null,
    currency: inv?.currency ? String(inv.currency).toUpperCase() : null,

    subtotal: amountFromStripe(inv?.subtotal ?? 0),
    total: amountFromStripe(inv?.total ?? 0),
    amount_due: amountFromStripe(inv?.amount_due ?? 0),
    amount_paid: amountFromStripe(inv?.amount_paid ?? 0),
    amount_remaining: amountFromStripe(inv?.amount_remaining ?? 0),

    created_at: fromUnix(inv?.created),
    period_start: fromUnix(inv?.period_start),
    period_end: fromUnix(inv?.period_end),
    due_date: fromUnix(inv?.due_date),
    paid_at: fromUnix(inv?.status_transitions?.paid_at ?? null),

    hosted_invoice_url: inv?.hosted_invoice_url ?? null,
    invoice_pdf: inv?.invoice_pdf ?? null,

    customer: inv?.customer ?? null,
    subscription: inv?.subscription ?? null,
    charge: inv?.charge ?? null,
    payment_intent: inv?.payment_intent ?? null,
  };
}

async function getStripeInvoices(params: {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  limit?: number;
}) {
  const { stripe_customer_id, stripe_subscription_id, limit = 12 } = params;

  if (!stripe_customer_id && !stripe_subscription_id) {
    return {
      invoices: [] as any[],
      debug: {
        stripe_enabled: Boolean(STRIPE_SECRET_KEY),
        reason: "missing_stripe_customer_and_subscription",
      },
    };
  }

  const qs: Record<string, string | number | null> = {
    limit,
    customer: stripe_customer_id,
    subscription: stripe_subscription_id,
  };

  const body = await stripeRequest("invoices", qs);
  const rows = Array.isArray(body?.data) ? body.data : [];

  const normalized = rows
    .map(normalizeStripeInvoice)
    .sort((a: any, b: any) => {
      const da = String(a.created_at ?? "");
      const db = String(b.created_at ?? "");
      return db.localeCompare(da);
    });

  return {
    invoices: normalized,
    debug: {
      stripe_enabled: Boolean(STRIPE_SECRET_KEY),
      stripe_customer_id,
      stripe_subscription_id,
      fetched: normalized.length,
    },
  };
}

/* ======================================================
 * Handler
 * ====================================================== */
export default Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, {
      ok: false,
      error: "request_failed",
      detail: "METHOD_NOT_ALLOWED",
    });
  }

  const admin = supabaseServiceClient();

  try {
    const user = await requireUser(req);
    const body = (await readJsonSafe<Body>(req)) ?? {};
    const org_id = (body.org_id ?? "").trim() || null;

    const { org_id: resolvedOrgId, role, resolvedBy } = await resolveOrgForUser({
      admin,
      user_id: user.id,
      org_id,
    });

    const customer_id = await resolveCustomerId({
      admin,
      org_id: resolvedOrgId,
    });

    const { data: customer, error: customerErr } = await admin
      .from("customers")
      .select("*")
      .eq("id", customer_id)
      .maybeSingle();

    if (customerErr) {
      throw new Error("DB_CUSTOMER_FAILED");
    }

    const subscription = await getBestSubscription({
      admin,
      customer_id,
      app_id: APP_ID,
    }).catch(() => null);

    let plan: any = null;
    if (subscription?.plan_id) {
      const { data: planRow } = await admin
        .from("plans")
        .select("*")
        .eq("id", subscription.plan_id)
        .maybeSingle();

      plan = planRow ?? null;
    }

    const { data: plans } = await admin
      .from("plans")
      .select("*")
      .eq("app_id", APP_ID)
      .order("price_monthly", { ascending: true });

    let downgrade: any = null;
    const requiredPlan = subscription?.required_plan_code ?? null;
    const scheduleId = subscription?.stripe_schedule_id ?? null;

    if (requiredPlan || scheduleId) {
      downgrade = {
        scheduled: true,
        target_plan_code: requiredPlan ?? null,
        billing_frequency: subscription?.required_billing_frequency ?? null,
        effective_date: subscription?.next_billing_date ?? null,
        schedule_id: scheduleId ?? null,
      };
    }

    /* ======================================================
     * Stripe invoices
     * ====================================================== */
    const stripe_customer_id = resolveStripeCustomerId(customer);
    const stripe_subscription_id = resolveStripeSubscriptionId(subscription);

    let invoices: any[] = [];
    let stripe_debug: any = {
      stripe_enabled: Boolean(STRIPE_SECRET_KEY),
      stripe_customer_id,
      stripe_subscription_id,
    };

    try {
      const stripeRes = await getStripeInvoices({
        stripe_customer_id,
        stripe_subscription_id,
        limit: 24,
      });

      invoices = stripeRes.invoices;
      stripe_debug = {
        ...stripe_debug,
        ...stripeRes.debug,
      };
    } catch (stripeErr: any) {
      stripe_debug = {
        ...stripe_debug,
        error: stripeErr?.message ?? String(stripeErr ?? ""),
        status: stripeErr?.status ?? null,
        body: stripeErr?.body ?? null,
      };
    }

    return json(req, 200, {
      ok: true,
      meta: {
        customer_id,
        app_id: APP_ID,
        org_id: resolvedOrgId,
        org_id_resolved_by: resolvedBy,
        member_role: role,
        server_date: toISODate(new Date()),
      },
      customer,
      subscription: subscription ?? null,
      plan,
      plans: plans ?? [],
      invoices,
      downgrade,
      stripe_debug,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    console.error("debacu_eval_account_bundle error:", msg);
    return json(req, 500, {
      ok: false,
      error: "request_failed",
      detail: msg,
    });
  }
});