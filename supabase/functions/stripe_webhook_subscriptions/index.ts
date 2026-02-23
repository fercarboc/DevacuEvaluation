// supabase/functions/stripe_webhook_subscriptions/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { json, preflight } from "../_shared/cors.ts";

/**
 * OBJETIVO (corregido):
 * - Idempotencia fuerte por stripe_event_id (subscription_events)
 * - NO pisar stripe_customer_id si ya hay uno distinto (evitar “doble customer”)
 * - Activar PENDING_PAYMENT solo con checkout.session.completed
 * - Upgrade (NUEVA POLÍTICA):
 *     * se crea NUEVA subscription por Checkout (cobro inmediato)
 *     * el webhook activa la PENDING y CANCELA inmediatamente la suscripción anterior (si viene en metadata)
 *     * DB marca anterior como REPLACED (y limpia flags)
 * - Downgrade programado:
 *     * SOLO aplicar required_plan_code cuando el price actual YA es el target price
 *     * Si required_plan_code existe pero el schedule ya no existe / está released -> limpiar flags SIN bajar plan
 *
 * IMPORTANTE:
 * - Este webhook no debe “inventarse” downgrades: solo refleja lo que Stripe ya ha hecho.
 */

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

const STRIPE_SECRET_KEY = mustEnv("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = mustEnv("STRIPE_WEBHOOK_SECRET");
const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Helpers fecha */
function isoDateFromUnix(sec?: number | null) {
  if (!sec) return null;
  return new Date(sec * 1000).toISOString().slice(0, 10);
}
function isoTsFromUnix(sec?: number | null) {
  if (!sec) return null;
  return new Date(sec * 1000).toISOString();
}

/** snake_case preferida + compat camelCase */
function mdGet(md: Record<string, string> | null | undefined, snake: string, camel?: string) {
  const v = md?.[snake] ?? (camel ? md?.[camel] : undefined);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function safeUpper(v?: string | null) {
  return String(v ?? "").toUpperCase();
}

type PlanCode = "BASIC" | "MEDIUM" | "PREMIUM";
type BillingFrequency = "MONTHLY" | "YEARLY";
function asPlanCode(v?: string | null): PlanCode | null {
  const x = safeUpper(v);
  return x === "BASIC" || x === "MEDIUM" || x === "PREMIUM" ? (x as PlanCode) : null;
}
function asBilling(v?: string | null): BillingFrequency {
  const x = safeUpper(v);
  return x === "YEARLY" ? "YEARLY" : "MONTHLY";
}

/**
 * Price map (mismo set de envs que subscription_manage)
 * + Reverse map para detectar plan/billing desde stripe_price_id
 */
function mustPriceEnv(name: string) {
  return mustEnv(name);
}

const PRICE_MAP: Record<PlanCode, Record<BillingFrequency, string>> = {
  BASIC: {
    MONTHLY: mustPriceEnv("STRIPE_PRICE_ID_DEBACU_EVAL_BASIC_MONTHLY"),
    YEARLY: mustPriceEnv("STRIPE_PRICE_ID_DEBACU_EVAL_BASIC_YEARLY"),
  },
  MEDIUM: {
    MONTHLY: mustPriceEnv("STRIPE_PRICE_ID_DEBACU_EVAL_MEDIUM_MONTHLY"),
    YEARLY: mustPriceEnv("STRIPE_PRICE_ID_DEBACU_EVAL_MEDIUM_YEARLY"),
  },
  PREMIUM: {
    MONTHLY: mustPriceEnv("STRIPE_PRICE_ID_DEBACU_EVAL_PREMIUM_MONTHLY"),
    YEARLY: mustPriceEnv("STRIPE_PRICE_ID_DEBACU_EVAL_PREMIUM_YEARLY"),
  },
};

type PriceMeta = { plan_code: PlanCode; billing_frequency: BillingFrequency };
const PRICE_REVERSE: Record<string, PriceMeta> = Object.entries(PRICE_MAP).reduce((acc, [plan, freqs]) => {
  for (const [bf, priceId] of Object.entries(freqs)) {
    acc[String(priceId)] = { plan_code: plan as PlanCode, billing_frequency: bf as BillingFrequency };
  }
  return acc;
}, {} as Record<string, PriceMeta>);

/**
 * Idempotencia HARD:
 * - intentamos insertar stripe_event_id en subscription_events
 * - si existe (unique violation), devolvemos 200 y NO hacemos side-effects
 */
async function acquireEventLock(
  event: Stripe.Event,
): Promise<{ ok: true; duplicate: false } | { ok: true; duplicate: true } | { ok: false; detail: string }> {
  const baseRow = {
    stripe_event_id: event.id,
    type: event.type,
    payload: { note: "received", created: event.created, livemode: event.livemode } as any,
  };

  const { error } = await supabase.from("subscription_events").insert(baseRow);

  if (!error) return { ok: true, duplicate: false };

  const code = String((error as any)?.code ?? "");
  const msg = String((error as any)?.message ?? "").toLowerCase();

  if (code === "23505" || msg.includes("duplicate") || msg.includes("unique")) {
    return { ok: true, duplicate: true };
  }

  console.error("subscription_events acquireEventLock insert error:", error);
  return { ok: false, detail: "EVENT_LOCK_INSERT_FAILED" };
}

/** log best-effort (sin romper si ya existe) */
async function logEvent(params: {
  stripe_event_id: string;
  type: string;
  customer_id?: string | null;
  app_id?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  payload?: any;
}) {
  const patch: Record<string, unknown> = {
    customer_id: params.customer_id ?? null,
    app_id: params.app_id ?? null,
    stripe_customer_id: params.stripe_customer_id ?? null,
    stripe_subscription_id: params.stripe_subscription_id ?? null,
    payload: params.payload ?? null,
  };

  const { data: up, error: upErr } = await supabase
    .from("subscription_events")
    .update(patch)
    .eq("stripe_event_id", params.stripe_event_id)
    .select("stripe_event_id")
    .maybeSingle();

  if (!upErr && up?.stripe_event_id) return;

  if (upErr) console.error("subscription_events update error:", upErr);

  const { error: insErr } = await supabase.from("subscription_events").insert({
    stripe_event_id: params.stripe_event_id,
    type: params.type,
    payload: params.payload ?? null,
    customer_id: params.customer_id ?? null,
    app_id: params.app_id ?? null,
    stripe_customer_id: params.stripe_customer_id ?? null,
    stripe_subscription_id: params.stripe_subscription_id ?? null,
  });

  if (insErr) {
    const code = String((insErr as any)?.code ?? "");
    const msg = String((insErr as any)?.message ?? "").toLowerCase();
    if (!(code === "23505" || msg.includes("duplicate") || msg.includes("unique"))) {
      console.error("subscription_events insert error:", insErr);
    }
  }
}

function pickInvoiceLinePeriod(inv: Stripe.Invoice): { start: number | null; end: number | null } {
  const lines = inv.lines?.data ?? [];
  const subLine =
    lines.find((l: any) => l?.type === "subscription" && l?.period?.start && l?.period?.end) ??
    lines.find((l: any) => l?.period?.start && l?.period?.end) ??
    null;

  return {
    start: subLine?.period?.start ?? null,
    end: subLine?.period?.end ?? null,
  };
}

async function getSubscriptionPeriod(stripeSubId: string | null) {
  if (!stripeSubId) {
    return { start: null as number | null, end: null as number | null, priceId: null as string | null };
  }
  const s = await stripe.subscriptions.retrieve(stripeSubId);
  return {
    start: (s.current_period_start ?? null) as number | null,
    end: (s.current_period_end ?? null) as number | null,
    priceId: s.items.data?.[0]?.price?.id ?? null,
  };
}

async function findInternalSubscriptionByStripeSub(stripeSubId: string) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "id, customer_id, app_id, status, plan_id, replaces_subscription_id, required_plan_code, required_billing_frequency, stripe_schedule_id, stripe_customer_id, stripe_price_id",
    )
    .or(`stripe_subscription_id.eq.${stripeSubId},provider_subscription_id.eq.${stripeSubId}`)
    .maybeSingle();

  if (error) console.error("findInternalSubscriptionByStripeSub error:", error);
  return data ?? null;
}

async function resolveEventContext(params: { stripe_subscription_id?: string | null; stripe_customer_id?: string | null }) {
  const stripe_subscription_id = params.stripe_subscription_id ?? null;
  const stripe_customer_id = params.stripe_customer_id ?? null;

  if (stripe_subscription_id) {
    const internal = await findInternalSubscriptionByStripeSub(stripe_subscription_id);
    if (internal?.customer_id && (internal as any)?.app_id) {
      return {
        customer_id: internal.customer_id as string,
        app_id: (internal as any).app_id as string,
      };
    }
  }

  if (stripe_customer_id) {
    const { data: cust, error } = await supabase
      .from("customers")
      .select("id, app_id")
      .eq("stripe_customer_id", stripe_customer_id)
      .maybeSingle();

    if (error) console.error("resolveEventContext customers lookup error:", error);
    if (cust?.id) {
      return {
        customer_id: cust.id as string,
        app_id: (cust as any).app_id ?? "DEBACU_EVAL",
      };
    }
  }

  return { customer_id: null as string | null, app_id: null as string | null };
}

const CURRENT_STATUSES = ["ACTIVE", "TRIAL_ACTIVE", "PAST_DUE"] as const;

async function replaceAnyActive(customer_id: string, app_id: string, exceptId?: string) {
  const { data: currentRows, error } = await supabase
    .from("subscriptions")
    .select("id, status")
    .eq("customer_id", customer_id)
    .eq("app_id", app_id)
    .in("status", [...CURRENT_STATUSES]);

  if (error) {
    console.error("replaceAnyActive find error:", error);
    return;
  }

  const toReplace = (currentRows ?? [])
    .map((r: any) => r.id)
    .filter((id: string) => id && id !== exceptId);

  if (toReplace.length === 0) return;

  const { error: upErr } = await supabase
    .from("subscriptions")
    .update({
      status: "REPLACED",
      end_date: new Date().toISOString().slice(0, 10),
      required_plan_code: null,
      required_billing_frequency: null,
      stripe_schedule_id: null,
      updated_at: new Date().toISOString(),
    })
    .in("id", toReplace);

  if (upErr) console.error("replaceAnyActive update error:", upErr);
}

async function markReplacedById(id?: string | null) {
  if (!id) return;
  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: "REPLACED",
      end_date: new Date().toISOString().slice(0, 10),
      required_plan_code: null,
      required_billing_frequency: null,
      stripe_schedule_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) console.error("markReplacedById error:", error);
}

/**
 * ✅ Vincular stripe_customer_id a customers SIN pisar si ya existe uno distinto.
 */
async function linkStripeCustomerSafe(opts: { customer_id: string; app_id?: string | null; stripe_customer_id: string }) {
  const { customer_id, stripe_customer_id } = opts;
  const app_id = opts.app_id ?? "DEBACU_EVAL";

  const { data: dbCust, error: readErr } = await supabase
    .from("customers")
    .select("id, stripe_customer_id")
    .eq("id", customer_id)
    .maybeSingle();

  if (readErr) {
    console.error("customers read stripe_customer_id error:", readErr);
    return { ok: false as const, reason: "READ_FAILED" as const };
  }

  const existing = String((dbCust as any)?.stripe_customer_id ?? "").trim();

  if (existing && existing !== stripe_customer_id) {
    console.error("stripe_customer_id mismatch (NOT overwriting)", {
      customer_id,
      existing,
      incoming: stripe_customer_id,
    });
    return { ok: true as const, skipped: true as const };
  }

  if (existing === stripe_customer_id) return { ok: true as const, already: true as const };

  const { error: upErr } = await supabase
    .from("customers")
    .update({
      stripe_customer_id,
      app_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customer_id);

  if (upErr) {
    console.error("customers update stripe_customer_id error:", upErr);
    return { ok: false as const, reason: "UPDATE_FAILED" as const };
  }

  return { ok: true as const };
}

/**
 * Si en metadata no viene replaces_stripe_subscription_id,
 * intentamos derivarlo desde la suscripción pending (replaces_subscription_id -> stripe_subscription_id)
 */
async function deriveReplacesStripeSubIdFromPending(pending_subscription_id: string): Promise<string | null> {
  const { data: pending, error: e1 } = await supabase
    .from("subscriptions")
    .select("id, replaces_subscription_id")
    .eq("id", pending_subscription_id)
    .maybeSingle();

  if (e1) {
    console.error("deriveReplacesStripeSubIdFromPending pending lookup error:", e1);
    return null;
  }

  const replacesId = (pending as any)?.replaces_subscription_id ?? null;
  if (!replacesId) return null;

  const { data: prev, error: e2 } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id, provider_subscription_id")
    .eq("id", replacesId)
    .maybeSingle();

  if (e2) {
    console.error("deriveReplacesStripeSubIdFromPending prev lookup error:", e2);
    return null;
  }

  const sid = (prev as any)?.stripe_subscription_id ?? (prev as any)?.provider_subscription_id ?? null;
  return typeof sid === "string" && sid.trim() ? sid.trim() : null;
}

async function activatePendingSubscription(opts: {
  pending_subscription_id: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_price_id: string | null;
  period_end_unix: number | null;
  period_start_unix?: number | null;
}) {
  const { data: sub, error: subErr } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("id", opts.pending_subscription_id)
    .single();

  if (subErr || !sub) {
    console.error("Pending subscription not found:", subErr);
    return { ok: false as const, reason: "PENDING_NOT_FOUND" as const };
  }

  if (sub.status === "ACTIVE") return { ok: true as const, alreadyActive: true as const };

  await replaceAnyActive(sub.customer_id, sub.app_id, sub.id);
  await markReplacedById((sub as any).replaces_subscription_id ?? null);

  const today = new Date().toISOString().slice(0, 10);

  const patch: Record<string, unknown> = {
    status: "ACTIVE",
    provider: "stripe",
    updated_at: new Date().toISOString(),

    provider_checkout_id: opts.stripe_checkout_session_id ?? (sub as any).provider_checkout_id ?? null,
    stripe_checkout_session_id: opts.stripe_checkout_session_id ?? (sub as any).stripe_checkout_session_id ?? null,

    provider_subscription_id: opts.stripe_subscription_id ?? (sub as any).provider_subscription_id ?? null,
    stripe_subscription_id: opts.stripe_subscription_id ?? (sub as any).stripe_subscription_id ?? null,

    stripe_customer_id: opts.stripe_customer_id ?? (sub as any).stripe_customer_id ?? null,
    stripe_price_id: opts.stripe_price_id ?? (sub as any).stripe_price_id ?? null,

    start_date: (sub as any).start_date ?? isoDateFromUnix(opts.period_start_unix ?? null) ?? today,
    next_billing_date: isoDateFromUnix(opts.period_end_unix ?? null) ?? ((sub as any).next_billing_date ?? null),
  };

  const { error: upErr } = await supabase.from("subscriptions").update(patch).eq("id", sub.id);

  if (upErr) {
    console.error("Activate subscription update error:", upErr);
    return { ok: false as const, reason: "UPDATE_FAILED" as const };
  }

  return { ok: true as const };
}

/** Ajusta plan_id por price_id */
async function syncPlanFromPriceId(opts: { app_id: string; internal_sub_id: string; stripe_price_id: string | null }) {
  const { app_id, internal_sub_id, stripe_price_id } = opts;
  if (!stripe_price_id) return { ok: true as const, skipped: true as const };

  const meta = PRICE_REVERSE[stripe_price_id];
  if (!meta) return { ok: true as const, unknown_price: true as const };

  const { data: planRow, error: pErr } = await supabase
    .from("plans")
    .select("id")
    .eq("app_id", app_id)
    .eq("code", meta.plan_code)
    .maybeSingle();

  if (pErr) {
    console.error("syncPlanFromPriceId plans lookup error:", pErr);
    return { ok: false as const, reason: "PLAN_LOOKUP_FAILED" as const };
  }
  if (!planRow?.id) return { ok: true as const, plan_missing: true as const };

  const { error: upErr } = await supabase
    .from("subscriptions")
    .update({
      plan_id: planRow.id,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", internal_sub_id);

  if (upErr) {
    console.error("syncPlanFromPriceId update error:", upErr);
    return { ok: false as const, reason: "UPDATE_FAILED" as const };
  }

  return { ok: true as const, plan_code: meta.plan_code, billing_frequency: meta.billing_frequency };
}

/**
 * CANCELA inmediatamente una suscripción anterior en Stripe (upgrade “pierde lo pendiente”).
 * - Ignora resource_missing / already canceled.
 */
async function cancelPreviousStripeSubscriptionNow(prevStripeSubId: string) {
  const sid = String(prevStripeSubId ?? "").trim();
  if (!sid) return { ok: true as const, skipped: true as const };

  try {
    // cancel inmediato (no cancel_at_period_end)
    const canceled = await stripe.subscriptions.cancel(sid);
    return { ok: true as const, canceled: true as const, status: canceled.status ?? null };
  } catch (e: any) {
    const msg = String(e?.message ?? e).toLowerCase();
    const code = String(e?.code ?? "");
    const isNotFound = code === "resource_missing" || msg.includes("no such subscription");
    const isAlreadyCanceled = msg.includes("already canceled") || msg.includes("canceled subscription") || msg.includes("status is canceled");
    if (isNotFound || isAlreadyCanceled) {
      return { ok: true as const, ignored: true as const, reason: isNotFound ? "not_found" : "already_canceled" };
    }
    throw e;
  }
}

/**
 * Guarda facturas
 */
async function upsertDebacuEvalInvoice(inv: Stripe.Invoice) {
  const stripe_invoice_id = inv.id;

  const stripe_subscription_id = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id ?? null;
  const stripe_customer_id = typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? null;

  let customer_id: string | null = null;
  let app_id: string | null = null;

  if (stripe_subscription_id) {
    const internal = await findInternalSubscriptionByStripeSub(stripe_subscription_id);
    customer_id = (internal as any)?.customer_id ?? null;
    app_id = (internal as any)?.app_id ?? null;
  }

  if (!customer_id && stripe_customer_id) {
    const { data: custByStripe, error: e1 } = await supabase
      .from("customers")
      .select("id, app_id, stripe_customer_id, email")
      .eq("stripe_customer_id", stripe_customer_id)
      .maybeSingle();

    if (e1) console.error("customers lookup by stripe_customer_id error:", e1);
    if (custByStripe) {
      customer_id = custByStripe.id ?? null;
      app_id = (custByStripe as any).app_id ?? null;
    }
  }

  let stripe_customer_email: string | null = null;
  if (!customer_id && stripe_customer_id) {
    try {
      const c = await stripe.customers.retrieve(stripe_customer_id);
      stripe_customer_email = typeof c !== "string" ? (c.email ?? null) : null;
    } catch (e) {
      console.error("stripe.customers.retrieve failed:", e);
    }

    if (stripe_customer_email) {
      const { data: custByEmail, error: e2 } = await supabase
        .from("customers")
        .select("id, app_id, stripe_customer_id, email")
        .eq("email", stripe_customer_email)
        .maybeSingle();

      if (e2) console.error("customers lookup by email error:", e2);
      if (custByEmail) {
        customer_id = custByEmail.id ?? null;
        app_id = (custByEmail as any).app_id ?? null;

        if (customer_id && stripe_customer_id) {
          await linkStripeCustomerSafe({ customer_id, app_id: app_id ?? "DEBACU_EVAL", stripe_customer_id });
        }
      }
    }
  }

  if (!app_id && customer_id) app_id = "DEBACU_EVAL";

  if (!customer_id || !app_id) {
    console.error("Invoice cannot be stored: missing customer_id/app_id", {
      stripe_invoice_id,
      stripe_customer_id,
      stripe_subscription_id,
      resolved: { customer_id, app_id },
      stripe_customer_email,
    });
    return { customer_id, app_id };
  }

  const linePeriod = pickInvoiceLinePeriod(inv);

  let subPeriodStart: number | null = null;
  let subPeriodEnd: number | null = null;
  let subPriceId: string | null = null;

  if ((!linePeriod.start || !linePeriod.end) && stripe_subscription_id) {
    try {
      const subp = await getSubscriptionPeriod(stripe_subscription_id);
      subPeriodStart = subp.start;
      subPeriodEnd = subp.end;
      subPriceId = subp.priceId;
    } catch (e) {
      console.error("getSubscriptionPeriod failed:", e);
    }
  }

  const periodStartUnix = linePeriod.start ?? subPeriodStart ?? (inv.period_start ?? null);
  const periodEndUnix = linePeriod.end ?? subPeriodEnd ?? (inv.period_end ?? null);

  const payload: Record<string, unknown> = {
    app_id,
    customer_id,

    stripe_invoice_id,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_payment_intent_id: typeof inv.payment_intent === "string" ? inv.payment_intent : inv.payment_intent?.id ?? null,

    status: inv.status ?? "unknown",
    currency: inv.currency ?? "eur",

    amount_subtotal: inv.subtotal ?? null,
    amount_tax: inv.tax ?? null,
    amount_total: inv.total ?? 0,
    amount_due: inv.amount_due ?? null,

    invoice_created_at: isoTsFromUnix(inv.created ?? null) ?? new Date().toISOString(),
    period_start: isoTsFromUnix(periodStartUnix),
    period_end: isoTsFromUnix(periodEndUnix),

    paid_at: inv.status_transitions?.paid_at
      ? isoTsFromUnix(inv.status_transitions.paid_at)
      : inv.status === "paid"
        ? new Date().toISOString()
        : null,

    hosted_invoice_url: inv.hosted_invoice_url ?? null,
    invoice_pdf: inv.invoice_pdf ?? null,
    invoice_number: inv.number ?? null,

    metadata: (inv.metadata ?? {}) as any,

    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("debacu_eval_invoices").upsert(payload, { onConflict: "stripe_invoice_id" });
  if (error) console.error("debacu_eval_invoices upsert error:", error);

  if (stripe_subscription_id && periodEndUnix) {
    const { error: eUp } = await supabase
      .from("subscriptions")
      .update({
        next_billing_date: isoDateFromUnix(periodEndUnix),
        stripe_price_id: subPriceId ?? (inv.lines?.data?.[0] as any)?.price?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .or(`stripe_subscription_id.eq.${stripe_subscription_id},provider_subscription_id.eq.${stripe_subscription_id}`);

    if (eUp) console.error("subscriptions update next_billing_date (invoice.paid) error:", eUp);
  }

  return { customer_id, app_id };
}

/** status mapping a tu enum interno */
function mapStripeStatusToInternal(stripeStatus: string | null | undefined) {
  const s = String(stripeStatus ?? "").toLowerCase();

  if (s === "active") return "ACTIVE";
  if (s === "trialing") return "TRIAL_ACTIVE";
  if (s === "past_due") return "PAST_DUE";
  if (s === "canceled") return "CANCELED";
  if (s === "unpaid") return "UNPAID";
  if (s === "incomplete") return "INCOMPLETE";
  if (s === "incomplete_expired") return "INCOMPLETE_EXPIRED";
  if (s === "paused") return "SUSPENDED";

  return safeUpper(s || "UNKNOWN");
}

/**
 * GUARD de downgrade
 */
async function handleMaybeApplyScheduledDowngrade(opts: {
  internal: any;
  app_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string | null;
  stripe_price_id: string | null;
  mapped_status: string;
  next_billing_date: string | null;
  stripe_period_end_unix: number | null;
}) {
  const { internal, app_id, stripe_price_id, mapped_status, next_billing_date } = opts;

  const internalId = String(internal?.id ?? "");
  if (!internalId) return { ok: false as const, reason: "NO_INTERNAL_ID" as const };

  const required_plan_code = asPlanCode(internal?.required_plan_code ?? null);
  const required_billing_frequency = asBilling(internal?.required_billing_frequency ?? null);
  const scheduleId = String(internal?.stripe_schedule_id ?? "").trim() || null;

  if (!required_plan_code) {
    return { ok: true as const, scheduled: false as const };
  }

  const targetPriceId = PRICE_MAP[required_plan_code][required_billing_frequency] ?? null;

  if (stripe_price_id && targetPriceId && stripe_price_id === targetPriceId) {
    const { data: newPlan, error: planErr } = await supabase
      .from("plans")
      .select("id")
      .eq("app_id", app_id)
      .eq("code", required_plan_code)
      .maybeSingle();

    if (planErr) console.error("plans lookup (apply downgrade) error:", planErr);

    const patch: Record<string, unknown> = {
      status: mapped_status,
      next_billing_date,
      stripe_price_id: stripe_price_id ?? null,
      updated_at: new Date().toISOString(),
      required_plan_code: null,
      required_billing_frequency: null,
      stripe_schedule_id: null,
    };
    if (newPlan?.id) patch.plan_id = newPlan.id;

    const { error: upErr } = await supabase.from("subscriptions").update(patch).eq("id", internalId);
    if (upErr) {
      console.error("apply scheduled downgrade update error:", upErr);
      return { ok: false as const, reason: "DB_UPDATE_FAILED" as const };
    }

    return { ok: true as const, applied: true as const, plan_code: required_plan_code, billing_frequency: required_billing_frequency };
  }

  if (!scheduleId) {
    const { error: upErr } = await supabase
      .from("subscriptions")
      .update({
        status: mapped_status,
        next_billing_date,
        stripe_price_id: stripe_price_id ?? null,
        required_plan_code: null,
        required_billing_frequency: null,
        stripe_schedule_id: null,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", internalId);

    if (upErr) console.error("cleanup required_plan_code without schedule_id error:", upErr);
    return { ok: true as const, cleaned: true as const, reason: "missing_schedule_id" as const };
  }

  try {
    const sch = await stripe.subscriptionSchedules.retrieve(scheduleId);
    const schStatus = String((sch as any)?.status ?? "").toLowerCase();

    if (schStatus === "released" || schStatus === "canceled" || schStatus === "completed") {
      const { error: upErr } = await supabase
        .from("subscriptions")
        .update({
          status: mapped_status,
          next_billing_date,
          stripe_price_id: stripe_price_id ?? null,
          required_plan_code: null,
          required_billing_frequency: null,
          stripe_schedule_id: null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", internalId);

      if (upErr) console.error("cleanup flags after schedule released/canceled error:", upErr);
      return { ok: true as const, cleaned: true as const, schedule_status: schStatus };
    }

    const { error: upErr } = await supabase
      .from("subscriptions")
      .update({
        status: mapped_status,
        next_billing_date,
        stripe_price_id: stripe_price_id ?? null,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", internalId);

    if (upErr) console.error("keep scheduled downgrade (no apply) update error:", upErr);

    return { ok: true as const, scheduled: true as const, applied: false as const, schedule_status: schStatus, target_price_id: targetPriceId };
  } catch (e: any) {
    const msg = String(e?.message ?? e).toLowerCase();
    const code = String(e?.code ?? "");
    const isNotFound = code === "resource_missing" || msg.includes("no such subscription schedule");

    if (isNotFound) {
      const { error: upErr } = await supabase
        .from("subscriptions")
        .update({
          status: mapped_status,
          next_billing_date,
          stripe_price_id: stripe_price_id ?? null,
          required_plan_code: null,
          required_billing_frequency: null,
          stripe_schedule_id: null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", internalId);

      if (upErr) console.error("cleanup flags after schedule not found error:", upErr);
      return { ok: true as const, cleaned: true as const, reason: "schedule_not_found" as const };
    }

    console.error("stripe.subscriptionSchedules.retrieve error:", e);

    await supabase
      .from("subscriptions")
      .update({
        status: mapped_status,
        next_billing_date,
        stripe_price_id: stripe_price_id ?? null,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", internalId);

    return { ok: true as const, scheduled: true as const, applied: false as const, reason: "schedule_retrieve_failed" as const };
  }
}

/** util: extrae (primera) priceId de un Stripe.Subscription */
function priceIdFromStripeSub(s: Stripe.Subscription): string | null {
  const it = (s.items?.data ?? [])[0];
  const pid = it?.price?.id ?? null;
  return typeof pid === "string" && pid.trim() ? pid.trim() : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "request_failed", detail: "method_not_allowed" });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return json(req, 400, { ok: false, error: "request_failed", detail: "missing_stripe_signature" });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_signature" });
  }

  const lock = await acquireEventLock(event);
  if (!lock.ok) {
    return json(req, 500, { ok: false, error: "request_failed", detail: lock.detail });
  }
  if (lock.duplicate) {
    return json(req, 200, { ok: true, received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.mode !== "subscription") {
          await logEvent({
            stripe_event_id: event.id,
            type: event.type,
            payload: { note: "ignored_non_subscription_mode", mode: session.mode },
          });
          return json(req, 200, { ok: true, received: true });
        }

        const stripe_subscription_id =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;

        const stripe_customer_id =
          typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

        const pending_subscription_id = mdGet(session.metadata, "pending_subscription_id", "pendingSubscriptionId");
        const app_id = mdGet(session.metadata, "app_id", "appId");
        const customer_id = mdGet(session.metadata, "customer_id", "customerId");

        // metadata de reemplazo (upgrade)
        let replaces_stripe_subscription_id =
          mdGet(session.metadata, "replaces_stripe_subscription_id", "replacesStripeSubscriptionId") ?? null;

        // si no vino, derivamos desde pending
        if (!replaces_stripe_subscription_id && pending_subscription_id) {
          replaces_stripe_subscription_id = await deriveReplacesStripeSubIdFromPending(pending_subscription_id);
        }

        // ✅ link safe (no pisar)
        let link_res: any = null;
        if (customer_id && stripe_customer_id) {
          link_res = await linkStripeCustomerSafe({ customer_id, app_id: app_id ?? "DEBACU_EVAL", stripe_customer_id });
        }

        let stripe_price_id: string | null = null;
        let period_end_unix: number | null = null;
        let period_start_unix: number | null = null;

        if (stripe_subscription_id) {
          const s = await stripe.subscriptions.retrieve(stripe_subscription_id);
          stripe_price_id = priceIdFromStripeSub(s);
          period_end_unix = (s.current_period_end ?? null) as number | null;
          period_start_unix = (s.current_period_start ?? null) as number | null;

          const { error: eUp } = await supabase
            .from("subscriptions")
            .update({
              next_billing_date: isoDateFromUnix(period_end_unix),
              stripe_price_id: stripe_price_id ?? null,
              updated_at: new Date().toISOString(),
            })
            .or(`stripe_subscription_id.eq.${stripe_subscription_id},provider_subscription_id.eq.${stripe_subscription_id}`);

          if (eUp) console.error("subscriptions update (checkout.session.completed) error:", eUp);
        }

        await logEvent({
          stripe_event_id: event.id,
          type: event.type,
          customer_id,
          app_id,
          stripe_customer_id,
          stripe_subscription_id,
          payload: {
            session_id: session.id,
            mode: session.mode,
            pending_subscription_id,
            replaces_stripe_subscription_id,
            stripe_price_id,
            period_start_unix,
            period_end_unix,
            link_res,
          },
        });

        // ✅ Activar SOLO si viene pending_subscription_id
        if (pending_subscription_id) {
          const act = await activatePendingSubscription({
            pending_subscription_id,
            stripe_subscription_id,
            stripe_customer_id,
            stripe_checkout_session_id: session.id,
            stripe_price_id,
            period_end_unix,
            period_start_unix,
          });

          // ✅ NUEVA POLÍTICA: si es upgrade, cancelar inmediatamente la suscripción anterior en Stripe
          let cancel_prev_res: any = null;
          if (replaces_stripe_subscription_id) {
            cancel_prev_res = await cancelPreviousStripeSubscriptionNow(replaces_stripe_subscription_id);
          }

          // ✅ también alinear plan_id del pending por price_id (por si acaso)
          let sync_res: any = null;
          if (stripe_price_id) {
            sync_res = await syncPlanFromPriceId({
              app_id: app_id ?? "DEBACU_EVAL",
              internal_sub_id: pending_subscription_id,
              stripe_price_id,
            });
          }

          return json(req, 200, {
            ok: true,
            received: true,
            action: "activated_pending_subscription",
            pending_subscription_id,
            stripe_subscription_id,
            stripe_customer_id,
            stripe_price_id,
            result: act,
            cancel_previous: cancel_prev_res,
            sync_plan: sync_res,
          });
        }

        return json(req, 200, { ok: true, received: true, action: "logged_checkout_completed_only" });
      }

      case "customer.subscription.updated": {
        const s = event.data.object as Stripe.Subscription;

        const stripe_subscription_id = s.id ?? null;
        const stripe_customer_id = typeof s.customer === "string" ? s.customer : s.customer?.id ?? null;

        const internal = stripe_subscription_id ? await findInternalSubscriptionByStripeSub(stripe_subscription_id) : null;

        const mapped_status = mapStripeStatusToInternal(s.status ?? null);
        const stripe_period_end_unix = (s.current_period_end ?? null) as number | null;
        const next_billing_date = isoDateFromUnix(stripe_period_end_unix);
        const stripe_price_id = priceIdFromStripeSub(s);

        const ctx = internal?.customer_id
          ? { customer_id: internal.customer_id as string, app_id: (internal as any)?.app_id ?? "DEBACU_EVAL" }
          : await resolveEventContext({ stripe_subscription_id, stripe_customer_id });

        await logEvent({
          stripe_event_id: event.id,
          type: event.type,
          customer_id: ctx.customer_id,
          app_id: ctx.app_id,
          stripe_customer_id,
          stripe_subscription_id,
          payload: {
            mapped_status,
            stripe_price_id,
            current_period_end: stripe_period_end_unix,
            next_billing_date,
            cancel_at_period_end: (s.cancel_at_period_end ?? null) as any,
            canceled_at: (s.canceled_at ?? null) as any,
            cancellation_details: (s.cancellation_details ?? null) as any,
          },
        });

        if (!internal?.id) {
          const { error: eUp } = await supabase
            .from("subscriptions")
            .update({
              status: mapped_status,
              next_billing_date,
              stripe_customer_id: stripe_customer_id ?? null,
              stripe_price_id: stripe_price_id ?? null,
              updated_at: new Date().toISOString(),
            } as any)
            .or(`stripe_subscription_id.eq.${stripe_subscription_id},provider_subscription_id.eq.${stripe_subscription_id}`);

          if (eUp) console.error("subscriptions update (subscription.updated) without internal error:", eUp);

          return json(req, 200, { ok: true, received: true, note: "no_internal_subscription_row" });
        }

        if (ctx.customer_id && stripe_customer_id) {
          await linkStripeCustomerSafe({ customer_id: ctx.customer_id, app_id: ctx.app_id ?? "DEBACU_EVAL", stripe_customer_id });
        }

        const { error: upErr } = await supabase
          .from("subscriptions")
          .update({
            status: mapped_status,
            next_billing_date,
            stripe_customer_id: stripe_customer_id ?? null,
            stripe_price_id: stripe_price_id ?? null,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", internal.id);

        if (upErr) console.error("subscriptions update (subscription.updated) error:", upErr);

        const down = await handleMaybeApplyScheduledDowngrade({
          internal,
          app_id: ctx.app_id ?? "DEBACU_EVAL",
          stripe_subscription_id: stripe_subscription_id!,
          stripe_customer_id,
          stripe_price_id,
          mapped_status,
          next_billing_date,
          stripe_period_end_unix,
        });

        const sync = await syncPlanFromPriceId({
          app_id: ctx.app_id ?? "DEBACU_EVAL",
          internal_sub_id: internal.id,
          stripe_price_id,
        });

        return json(req, 200, {
          ok: true,
          received: true,
          stripe_subscription_id,
          internal_sub_id: internal.id,
          mapped_status,
          next_billing_date,
          stripe_price_id,
          downgrade_guard: down,
          sync_plan: sync,
        });
      }

      case "customer.subscription.deleted": {
        const s = event.data.object as Stripe.Subscription;
        const stripe_subscription_id = s.id ?? null;
        const stripe_customer_id = typeof s.customer === "string" ? s.customer : s.customer?.id ?? null;

        const internal = stripe_subscription_id ? await findInternalSubscriptionByStripeSub(stripe_subscription_id) : null;
        const mapped_status = "CANCELED";
        const stripe_price_id = priceIdFromStripeSub(s);
        const stripe_period_end_unix = (s.current_period_end ?? null) as number | null;

        const ctx = internal?.customer_id
          ? { customer_id: internal.customer_id as string, app_id: (internal as any)?.app_id ?? "DEBACU_EVAL" }
          : await resolveEventContext({ stripe_subscription_id, stripe_customer_id });

        await logEvent({
          stripe_event_id: event.id,
          type: event.type,
          customer_id: ctx.customer_id,
          app_id: ctx.app_id,
          stripe_customer_id,
          stripe_subscription_id,
          payload: {
            mapped_status,
            stripe_price_id,
            current_period_end: stripe_period_end_unix,
            canceled_at: (s.canceled_at ?? null) as any,
          },
        });

        const { error } = await supabase
          .from("subscriptions")
          .update({
            status: mapped_status,
            end_date: isoDateFromUnix(stripe_period_end_unix) ?? new Date().toISOString().slice(0, 10),
            stripe_price_id: stripe_price_id ?? null,
            updated_at: new Date().toISOString(),
            required_plan_code: null,
            required_billing_frequency: null,
            stripe_schedule_id: null,
          } as any)
          .or(`stripe_subscription_id.eq.${stripe_subscription_id},provider_subscription_id.eq.${stripe_subscription_id}`);

        if (error) console.error("subscriptions update (subscription.deleted) error:", error);

        return json(req, 200, { ok: true, received: true });
      }

      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;

        const r = await upsertDebacuEvalInvoice(inv);

        const stripe_subscription_id = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id ?? null;
        const stripe_customer_id = typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? null;

        await logEvent({
          stripe_event_id: event.id,
          type: event.type,
          customer_id: r.customer_id ?? null,
          app_id: r.app_id ?? null,
          stripe_customer_id,
          stripe_subscription_id,
          payload: {
            stripe_invoice_id: inv.id,
            status: inv.status,
            total: inv.total,
            currency: inv.currency,
            hosted_invoice_url: inv.hosted_invoice_url ?? null,
          },
        });

        return json(req, 200, { ok: true, received: true, stored_invoice: true });
      }

      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;

        const stripe_subscription_id = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id ?? null;
        const stripe_customer_id = typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? null;

        const ctx = await resolveEventContext({ stripe_subscription_id, stripe_customer_id });

        await logEvent({
          stripe_event_id: event.id,
          type: event.type,
          customer_id: ctx.customer_id,
          app_id: ctx.app_id,
          stripe_customer_id,
          stripe_subscription_id,
          payload: {
            stripe_invoice_id: inv.id,
            status: inv.status,
            attempt_count: (inv.attempt_count ?? null) as any,
            next_payment_attempt: (inv.next_payment_attempt ?? null) as any,
            amount_due: inv.amount_due ?? null,
            hosted_invoice_url: inv.hosted_invoice_url ?? null,
          },
        });

        if (stripe_subscription_id) {
          const { error } = await supabase
            .from("subscriptions")
            .update({
              status: "PAST_DUE",
              updated_at: new Date().toISOString(),
            } as any)
            .or(`stripe_subscription_id.eq.${stripe_subscription_id},provider_subscription_id.eq.${stripe_subscription_id}`);

          if (error) console.error("subscriptions update (invoice.payment_failed) error:", error);
        }

        return json(req, 200, { ok: true, received: true });
      }

      default: {
        let stripe_subscription_id: string | null = null;
        let stripe_customer_id: string | null = null;

        const obj: any = (event.data as any)?.object ?? null;
        if (obj) {
          if (typeof obj?.subscription === "string") stripe_subscription_id = obj.subscription;
          if (typeof obj?.subscription?.id === "string") stripe_subscription_id = obj.subscription.id;
          if (typeof obj?.id === "string" && event.type.startsWith("customer.subscription.")) stripe_subscription_id = obj.id;

          if (typeof obj?.customer === "string") stripe_customer_id = obj.customer;
          if (typeof obj?.customer?.id === "string") stripe_customer_id = obj.customer.id;
        }

        const ctx = await resolveEventContext({ stripe_subscription_id, stripe_customer_id });

        await logEvent({
          stripe_event_id: event.id,
          type: event.type,
          customer_id: ctx.customer_id,
          app_id: ctx.app_id,
          stripe_customer_id,
          stripe_subscription_id,
          payload: {
            note: "ignored_event_type",
            event_type: event.type,
          },
        });

        return json(req, 200, { ok: true, received: true, ignored: true, type: event.type });
      }
    }
  } catch (e: any) {
    console.error("stripe_webhook_subscriptions handler error:", e);

    try {
      await logEvent({
        stripe_event_id: event.id,
        type: event.type,
        payload: { note: "handler_error", message: String(e?.message ?? e) },
      });
    } catch (_) {
      // ignore
    }

    return json(req, 500, { ok: false, error: "request_failed", detail: "webhook_handler_failed" });
  }
});