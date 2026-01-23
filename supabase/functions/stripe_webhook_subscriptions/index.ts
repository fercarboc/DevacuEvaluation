import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

/** log best-effort (dedupe si stripe_event_id es UNIQUE en DB) */
async function logEvent(params: {
  stripe_event_id: string;
  type: string;
  customer_id?: string | null;
  app_id?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  payload?: any;
}) {
  const { error } = await supabase.from("subscription_events").insert({
    stripe_event_id: params.stripe_event_id,
    type: params.type,
    payload: params.payload ?? null,
    created_at: new Date().toISOString(),
    customer_id: params.customer_id ?? null,
    app_id: params.app_id ?? null,
    stripe_customer_id: params.stripe_customer_id ?? null,
    stripe_subscription_id: params.stripe_subscription_id ?? null,
  });

  if (error) {
    const msg = String((error as any)?.message ?? "").toLowerCase();
    // si tienes UNIQUE(stripe_event_id) esto evita ruido por reintentos
    if (!(msg.includes("duplicate") || msg.includes("unique"))) {
      console.error("subscription_events insert error:", error);
    }
  }
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
 * Evita violar el único ACTIVE (por customer_id + app_id):
 * - marca cualquier ACTIVE como REPLACED antes de activar la nueva
 */
async function replaceAnyActive(customer_id: string, app_id: string, exceptId?: string) {
  const { data: activeRows, error } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("customer_id", customer_id)
    .eq("app_id", app_id)
    .eq("status", "ACTIVE");

  if (error) {
    console.error("replaceAnyActive find error:", error);
    return;
  }

  const toReplace = (activeRows ?? [])
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

  // idempotencia
  if (sub.status === "ACTIVE") return { ok: true as const, alreadyActive: true as const };

  // 1) evita único ACTIVE
  await replaceAnyActive(sub.customer_id, sub.app_id, sub.id);

  // 2) si reemplaza otra, marcar REPLACED
  await markReplacedById(sub.replaces_subscription_id ?? null);

  // 3) activar
  const today = new Date().toISOString().slice(0, 10);

  const patch: Record<string, unknown> = {
    status: "ACTIVE",
    provider: "stripe",
    updated_at: new Date().toISOString(),

    provider_checkout_id: opts.stripe_checkout_session_id ?? sub.provider_checkout_id ?? null,
    stripe_checkout_session_id: opts.stripe_checkout_session_id ?? sub.stripe_checkout_session_id ?? null,

    provider_subscription_id: opts.stripe_subscription_id ?? sub.provider_subscription_id ?? null,
    stripe_subscription_id: opts.stripe_subscription_id ?? sub.stripe_subscription_id ?? null,

    stripe_price_id: opts.stripe_price_id ?? sub.stripe_price_id ?? null,

    start_date: sub.start_date ?? today,
    next_billing_date: opts.period_end_unix
      ? isoDateFromUnix(opts.period_end_unix)
      : (sub.next_billing_date ?? null),
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

  const payload: Record<string, unknown> = {
    stripe_invoice_id,
    stripe_customer_id,
    stripe_subscription_id,

    customer_id,
    app_id,

    status: inv.status ?? "unknown",
    currency: inv.currency ?? null,

    amount_subtotal: inv.subtotal ?? null,
    amount_tax: inv.tax ?? null,
    amount_total: inv.total ?? null,
    amount_due: inv.amount_due ?? null,

    invoice_number: inv.number ?? null,
    hosted_invoice_url: inv.hosted_invoice_url ?? null,
    invoice_pdf: inv.invoice_pdf ?? null,

    period_start: isoTsFromUnix(inv.period_start ?? null),
    period_end: isoTsFromUnix(inv.period_end ?? null),
    created_at: isoTsFromUnix(inv.created ?? null),
    paid_at: inv.status === "paid" ? new Date().toISOString() : null,

    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("debacu_eval_invoices")
    .upsert(payload, { onConflict: "stripe_invoice_id" });

  if (error) console.error("debacu_eval_invoices upsert error:", error);

  if (stripe_subscription_id && inv.period_end) {
    await supabase
      .from("subscriptions")
      .update({
        next_billing_date: isoDateFromUnix(inv.period_end),
        updated_at: new Date().toISOString(),
      })
      .or(
        `stripe_subscription_id.eq.${stripe_subscription_id},provider_subscription_id.eq.${stripe_subscription_id}`,
      );
  }

  return { customer_id, app_id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return json(400, { error: "Missing stripe-signature header" });

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return json(400, { error: "Invalid signature" });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const stripe_subscription_id =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id ?? null;

        const stripe_customer_id =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id ?? null;

        const pending_subscription_id =
          mdGet(session.metadata, "pending_subscription_id", "pendingSubscriptionId");
        const app_id = mdGet(session.metadata, "app_id", "appId");
        const customer_id = mdGet(session.metadata, "customer_id", "customerId");

        let stripe_price_id: string | null = null;
        let period_end_unix: number | null = null;

        if (stripe_subscription_id) {
          const s = await stripe.subscriptions.retrieve(stripe_subscription_id);
          stripe_price_id = s.items.data?.[0]?.price?.id ?? null;
          period_end_unix = s.current_period_end ?? null;
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
          return json(200, { received: true, warning: "missing_pending_subscription_id" });
        }

        const act = await activatePendingSubscription({
          pending_subscription_id,
          stripe_subscription_id,
          stripe_checkout_session_id: session.id,
          stripe_price_id,
          period_end_unix,
        });

        return json(200, { received: true, activate: act });
      }

      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;

        const stripe_subscription_id =
          typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id ?? null;

        const stripe_customer_id =
          typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? null;

        const ctx = await upsertDebacuEvalInvoice(inv);

        await logEvent({
          stripe_event_id: event.id,
          type: event.type,
          customer_id: ctx.customer_id ?? null,
          app_id: ctx.app_id ?? null,
          stripe_customer_id,
          stripe_subscription_id,
          payload: { stripe_invoice_id: inv.id, status: inv.status, total: inv.total },
        });

        return json(200, { received: true });
      }

      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;

        const stripe_subscription_id =
          typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id ?? null;

        const stripe_customer_id =
          typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? null;

        const ctx = await upsertDebacuEvalInvoice(inv);

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
          customer_id: ctx.customer_id ?? null,
          app_id: ctx.app_id ?? null,
          stripe_customer_id,
          stripe_subscription_id,
          payload: { stripe_invoice_id: inv.id, status: inv.status },
        });

        return json(200, { received: true });
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const stripe_subscription_id = sub.id;

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

          await logEvent({
            stripe_event_id: event.id,
            type: event.type,
            customer_id: (internal as any).customer_id ?? null,
            app_id: (internal as any).app_id ?? null,
            stripe_customer_id:
              typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
            stripe_subscription_id,
            payload: { status: sub.status, cancel_at_period_end: sub.cancel_at_period_end },
          });
        } else {
          await logEvent({
            stripe_event_id: event.id,
            type: event.type,
            stripe_subscription_id,
            payload: { warning: "subscription_not_found_in_db", status: sub.status },
          });
        }

        return json(200, { received: true });
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const stripe_subscription_id = sub.id;

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

          await logEvent({
            stripe_event_id: event.id,
            type: event.type,
            customer_id: (internal as any).customer_id ?? null,
            app_id: (internal as any).app_id ?? null,
            stripe_subscription_id,
            payload: { status: sub.status },
          });
        } else {
          await logEvent({
            stripe_event_id: event.id,
            type: event.type,
            stripe_subscription_id,
            payload: { warning: "subscription_not_found_in_db" },
          });
        }

        return json(200, { received: true });
      }

      default: {
        await logEvent({
          stripe_event_id: event.id,
          type: event.type,
          payload: { note: "unhandled_event" },
        });
        return json(200, { received: true, unhandled: event.type });
      }
    }

    return json(200, { received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return json(500, { error: "Webhook handler failed" });
  }
});
