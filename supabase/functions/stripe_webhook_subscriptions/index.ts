// supabase/functions/stripe_webhook_subscriptions/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { json, preflight } from "../_shared/cors.ts";

// deno-lint-ignore-file no-explicit-any

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

// Webhook => siempre service role
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
function mdGet(
  md: Record<string, string> | null | undefined,
  snake: string,
  camel?: string,
) {
  const v = md?.[snake] ?? (camel ? md?.[camel] : undefined);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Idempotencia HARD:
 * - intentamos insertar stripe_event_id en subscription_events
 * - si existe (unique violation), devolvemos 200 y NO hacemos side-effects
 */
async function acquireEventLock(event: Stripe.Event): Promise<
  | { ok: true; duplicate: false }
  | { ok: true; duplicate: true }
  | { ok: false; detail: string }
> {
  const baseRow = {
    stripe_event_id: event.id,
    type: event.type,
    payload: { note: "received", created: event.created, livemode: event.livemode } as any,
    // no ponemos created_at manual; deja default now() si existe
  };

  const { error } = await supabase.from("subscription_events").insert(baseRow);

  if (!error) return { ok: true, duplicate: false };

  const code = String((error as any)?.code ?? "");
  const msg = String((error as any)?.message ?? "").toLowerCase();

  // Postgres unique violation
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
  // Intento UPDATE del evento ya insertado (el “lock”), y si no existe por lo que sea, hago insert best-effort.
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

  if (upErr) {
    // si falla por RLS o similar (no debería con service role), lo logueamos y seguimos
    console.error("subscription_events update error:", upErr);
  }

  // fallback insert (por si el lock no se insertó)
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

/**
 * Stripe a veces trae inv.period_start/end “pegados”.
 * Para el periodo REAL:
 * - invoice.lines[].period.start/end (línea de suscripción)
 * - si falta, subscription.current_period_start/end
 */
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
    .select("id, customer_id, app_id, status, plan_id, replaces_subscription_id")
    .or(`stripe_subscription_id.eq.${stripeSubId},provider_subscription_id.eq.${stripeSubId}`)
    .maybeSingle();

  if (error) console.error("findInternalSubscriptionByStripeSub error:", error);
  return data ?? null;
}

/**
 * Para eventos que vienen sin metadata, intentamos “poner contexto”
 * (customer_id/app_id) antes del logEvent.
 */
async function resolveEventContext(params: {
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
}) {
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

/**
 * Ojo: índice único "suscripción vigente" suele incluir TRIAL_ACTIVE/PAST_DUE etc.
 * Para activar una pending sin reventar 23505: reemplazar vigentes antes.
 */
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
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) console.error("markReplacedById error:", error);
}

async function activatePendingSubscription(opts: {
  pending_subscription_id: string;
  stripe_subscription_id: string | null;
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

  // primero libera el índice único
  await replaceAnyActive(sub.customer_id, sub.app_id, sub.id);
  await markReplacedById((sub as any).replaces_subscription_id ?? null);

  const today = new Date().toISOString().slice(0, 10);

  const patch: Record<string, unknown> = {
    status: "ACTIVE",
    provider: "stripe",
    updated_at: new Date().toISOString(),

    provider_checkout_id: opts.stripe_checkout_session_id ?? (sub as any).provider_checkout_id ?? null,
    stripe_checkout_session_id:
      opts.stripe_checkout_session_id ?? (sub as any).stripe_checkout_session_id ?? null,

    provider_subscription_id:
      opts.stripe_subscription_id ?? (sub as any).provider_subscription_id ?? null,
    stripe_subscription_id:
      opts.stripe_subscription_id ?? (sub as any).stripe_subscription_id ?? null,

    stripe_price_id: opts.stripe_price_id ?? (sub as any).stripe_price_id ?? null,

    start_date: (sub as any).start_date ?? isoDateFromUnix(opts.period_start_unix ?? null) ?? today,

    next_billing_date:
      isoDateFromUnix(opts.period_end_unix ?? null) ?? ((sub as any).next_billing_date ?? null),
  };

  const { error: upErr } = await supabase.from("subscriptions").update(patch).eq("id", sub.id);

  if (upErr) {
    console.error("Activate subscription update error:", upErr);
    return { ok: false as const, reason: "UPDATE_FAILED" as const };
  }

  return { ok: true as const };
}

async function upsertDebacuEvalInvoice(inv: Stripe.Invoice) {
  const stripe_invoice_id = inv.id;

  const stripe_subscription_id =
    typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id ?? null;

  const stripe_customer_id =
    typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? null;

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

  // fallback por email Stripe (solo dev/recuperación)
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

        if (!(custByEmail as any).stripe_customer_id && stripe_customer_id) {
          const { error: ePatch } = await supabase
            .from("customers")
            .update({ stripe_customer_id, updated_at: new Date().toISOString() })
            .eq("id", customer_id);

          if (ePatch) console.error("customers patch stripe_customer_id error:", ePatch);
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
    stripe_payment_intent_id:
      typeof inv.payment_intent === "string"
        ? inv.payment_intent
        : inv.payment_intent?.id ?? null,

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

  const { error } = await supabase
    .from("debacu_eval_invoices")
    .upsert(payload, { onConflict: "stripe_invoice_id" });

  if (error) console.error("debacu_eval_invoices upsert error:", error);

  if (stripe_subscription_id && periodEndUnix) {
    const { error: eUp } = await supabase
      .from("subscriptions")
      .update({
        next_billing_date: isoDateFromUnix(periodEndUnix),
        stripe_price_id: subPriceId ?? (inv.lines?.data?.[0] as any)?.price?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .or(
        `stripe_subscription_id.eq.${stripe_subscription_id},provider_subscription_id.eq.${stripe_subscription_id}`,
      );

    if (eUp) console.error("subscriptions update next_billing_date (invoice.paid) error:", eUp);
  }

  return { customer_id, app_id };
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

  // ✅ Idempotencia: si ya existe, salimos sin side-effects
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
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id ?? null;

        const stripe_customer_id =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id ?? null;

        const pending_subscription_id = mdGet(
          session.metadata,
          "pending_subscription_id",
          "pendingSubscriptionId",
        );
        const app_id = mdGet(session.metadata, "app_id", "appId");
        const customer_id = mdGet(session.metadata, "customer_id", "customerId");

        // si viene customer_id + stripe_customer_id, lo vinculamos
        if (customer_id && stripe_customer_id) {
          const { error: upCustErr } = await supabase
            .from("customers")
            .update({
              stripe_customer_id,
              app_id: app_id ?? "DEBACU_EVAL",
              updated_at: new Date().toISOString(),
            })
            .eq("id", customer_id);

          if (upCustErr) console.error("customers update stripe_customer_id error:", upCustErr);
        }

        let stripe_price_id: string | null = null;
        let period_end_unix: number | null = null;
        let period_start_unix: number | null = null;

        if (stripe_subscription_id) {
          const s = await stripe.subscriptions.retrieve(stripe_subscription_id);
          stripe_price_id = s.items.data?.[0]?.price?.id ?? null;
          period_end_unix = s.current_period_end ?? null;
          period_start_unix = s.current_period_start ?? null;

          const { error: eUp } = await supabase
            .from("subscriptions")
            .update({
              next_billing_date: isoDateFromUnix(period_end_unix),
              stripe_price_id: stripe_price_id ?? null,
              updated_at: new Date().toISOString(),
            })
            .or(
              `stripe_subscription_id.eq.${stripe_subscription_id},provider_subscription_id.eq.${stripe_subscription_id}`,
            );
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
            metadata: session.metadata,
          },
        });

        if (!pending_subscription_id) {
          return json(req, 200, { ok: true, received: true, warning: "missing_pending_subscription_id" });
        }

        const act = await activatePendingSubscription({
          pending_subscription_id,
          stripe_subscription_id,
          stripe_checkout_session_id: session.id,
          stripe_price_id,
          period_end_unix,
          period_start_unix,
        });

        return json(req, 200, { ok: true, received: true, activate: act });
      }

      case "invoice.paid": {
        let inv = event.data.object as Stripe.Invoice;

        try {
          inv = await stripe.invoices.retrieve(inv.id, {
            expand: ["subscription", "customer", "payment_intent"],
          });
        } catch (e) {
          console.error("stripe.invoices.retrieve failed (invoice.paid):", e);
        }

        const stripe_subscription_id =
          typeof inv.subscription === "string"
            ? inv.subscription
            : inv.subscription?.id ?? null;

        const stripe_customer_id =
          typeof inv.customer === "string"
            ? inv.customer
            : inv.customer?.id ?? null;

        const ctx = await upsertDebacuEvalInvoice(inv);
        const ctx2 =
          ctx.customer_id && ctx.app_id
            ? ctx
            : await resolveEventContext({ stripe_subscription_id, stripe_customer_id });

        await logEvent({
          stripe_event_id: event.id,
          type: event.type,
          customer_id: ctx2.customer_id ?? null,
          app_id: ctx2.app_id ?? null,
          stripe_customer_id,
          stripe_subscription_id,
          payload: { stripe_invoice_id: inv.id, status: inv.status, total: inv.total },
        });

        return json(req, 200, { ok: true, received: true });
      }

      case "invoice.payment_failed": {
        let inv = event.data.object as Stripe.Invoice;

        try {
          inv = await stripe.invoices.retrieve(inv.id, {
            expand: ["subscription", "customer", "payment_intent"],
          });
        } catch (e) {
          console.error("stripe.invoices.retrieve failed (invoice.payment_failed):", e);
        }

        const stripe_subscription_id =
          typeof inv.subscription === "string"
            ? inv.subscription
            : inv.subscription?.id ?? null;

        const stripe_customer_id =
          typeof inv.customer === "string"
            ? inv.customer
            : inv.customer?.id ?? null;

        const ctx = await upsertDebacuEvalInvoice(inv);
        const ctx2 =
          ctx.customer_id && ctx.app_id
            ? ctx
            : await resolveEventContext({ stripe_subscription_id, stripe_customer_id });

        if (stripe_subscription_id) {
          await supabase
            .from("subscriptions")
            .update({ status: "PAST_DUE", updated_at: new Date().toISOString() })
            .or(
              `stripe_subscription_id.eq.${stripe_subscription_id},provider_subscription_id.eq.${stripe_subscription_id}`,
            );
        }

        await logEvent({
          stripe_event_id: event.id,
          type: event.type,
          customer_id: ctx2.customer_id ?? null,
          app_id: ctx2.app_id ?? null,
          stripe_customer_id,
          stripe_subscription_id,
          payload: { stripe_invoice_id: inv.id, status: inv.status },
        });

        return json(req, 200, { ok: true, received: true });
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const stripe_subscription_id = sub.id;

        const stripe_customer_id =
          typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;

        const internal = await findInternalSubscriptionByStripeSub(stripe_subscription_id);

        const next_billing_date = isoDateFromUnix(sub.current_period_end ?? null);
        const stripe_price_id = sub.items.data?.[0]?.price?.id ?? null;

        const mapped_status =
          sub.status === "active" ? "ACTIVE" : String(sub.status ?? "UNKNOWN").toUpperCase();

        if (internal) {
          const { error } = await supabase
            .from("subscriptions")
            .update({
              status: mapped_status,
              next_billing_date,
              stripe_price_id: stripe_price_id ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", (internal as any).id);

          if (error) console.error("customer.subscription.updated update error:", error);
        } else {
          const { error: eUp } = await supabase
            .from("subscriptions")
            .update({
              status: mapped_status,
              next_billing_date,
              stripe_price_id: stripe_price_id ?? null,
              updated_at: new Date().toISOString(),
            })
            .or(
              `stripe_subscription_id.eq.${stripe_subscription_id},provider_subscription_id.eq.${stripe_subscription_id}`,
            );

          if (eUp) console.error("customer.subscription.updated fallback update error:", eUp);
        }

        const ctx = internal
          ? { customer_id: (internal as any).customer_id ?? null, app_id: (internal as any).app_id ?? null }
          : await resolveEventContext({ stripe_subscription_id, stripe_customer_id });

        await logEvent({
          stripe_event_id: event.id,
          type: event.type,
          customer_id: ctx.customer_id ?? null,
          app_id: ctx.app_id ?? null,
          stripe_customer_id,
          stripe_subscription_id,
          payload: {
            status: sub.status,
            cancel_at_period_end: sub.cancel_at_period_end,
            current_period_end: sub.current_period_end,
          },
        });

        return json(req, 200, { ok: true, received: true });
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const stripe_subscription_id = sub.id;

        const stripe_customer_id =
          typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;

        const internal = await findInternalSubscriptionByStripeSub(stripe_subscription_id);

        if (internal) {
          const { error } = await supabase
            .from("subscriptions")
            .update({
              status: "CANCELED",
              end_date: new Date().toISOString().slice(0, 10),
              updated_at: new Date().toISOString(),
            })
            .eq("id", (internal as any).id);

          if (error) console.error("customer.subscription.deleted update error:", error);
        } else {
          const { error: eUp } = await supabase
            .from("subscriptions")
            .update({
              status: "CANCELED",
              end_date: new Date().toISOString().slice(0, 10),
              updated_at: new Date().toISOString(),
            })
            .or(
              `stripe_subscription_id.eq.${stripe_subscription_id},provider_subscription_id.eq.${stripe_subscription_id}`,
            );

          if (eUp) console.error("customer.subscription.deleted fallback update error:", eUp);
        }

        const ctx = internal
          ? { customer_id: (internal as any).customer_id ?? null, app_id: (internal as any).app_id ?? null }
          : await resolveEventContext({ stripe_subscription_id, stripe_customer_id });

        await logEvent({
          stripe_event_id: event.id,
          type: event.type,
          customer_id: ctx.customer_id ?? null,
          app_id: ctx.app_id ?? null,
          stripe_customer_id,
          stripe_subscription_id,
          payload: { status: sub.status },
        });

        return json(req, 200, { ok: true, received: true });
      }

      default: {
        await logEvent({
          stripe_event_id: event.id,
          type: event.type,
          payload: { note: "unhandled_event" },
        });
        return json(req, 200, { ok: true, received: true, unhandled: event.type });
      }
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    // Stripe considera 5xx como “retry”; esto está bien si realmente falló.
    return json(req, 500, { ok: false, error: "request_failed", detail: "webhook_handler_failed" });
  }
});
