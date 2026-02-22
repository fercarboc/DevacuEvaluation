// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

type PlanCode = "BASIC" | "MEDIUM" | "PREMIUM";
type BillingFrequency = "MONTHLY" | "YEARLY";

const APP_ID_DEFAULT = "DEBACU_EVAL";

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing_env_${name}`);
  return v;
}

function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
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

async function stripePost(path: string, secret: string, body: any) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });

  const txt = await res.text();
  const json = JSON.parse(txt);

  if (!res.ok) throw new Error("STRIPE_ERROR");

  return json;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false });

  try {
    const user = await requireUser(req);
    const body = await req.json();

    const action = safeStr(body.action) || "CHANGE";
    const plan_code = toPlanCode(safeStr(body.plan_code));
    const billing_frequency = toBilling(safeStr(body.billing_frequency)) ?? "MONTHLY";
    const app_id = safeStr(body.app_id) || APP_ID_DEFAULT;

    const sb = supabaseServiceClient();

    // 1️⃣ Resolve org
    const { data: membership } = await sb
      .from("debacu_eval_org_members")
      .select("org_id")
      .eq("auth_user_id", user.id)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (!membership?.org_id) throw new Error("NO_ORG");

    const org_id = membership.org_id;

    // 2️⃣ Obtener ACTIVE subscription
    const { data: activeSub } = await sb
      .from("subscriptions")
      .select("*")
      .eq("app_id", app_id)
      .eq("status", "ACTIVE")
      .eq("customer_id", membership.org_id)
      .maybeSingle();

    if (!activeSub) throw new Error("NO_ACTIVE_SUBSCRIPTION");

    const STRIPE_SECRET = mustEnv("STRIPE_SECRET_KEY");

    // -------------------------------------------------
    // CANCELAR DOWNGRADE PROGRAMADO
    // -------------------------------------------------
    if (action === "CANCEL_DOWNGRADE") {
      if (!activeSub.stripe_schedule_id)
        throw new Error("NO_SCHEDULE");

      await stripePost(
        `subscription_schedules/${activeSub.stripe_schedule_id}/cancel`,
        STRIPE_SECRET,
        {}
      );

      await sb
        .from("subscriptions")
        .update({
          stripe_schedule_id: null,
          required_plan_code: null,
          required_billing_frequency: null,
        })
        .eq("id", activeSub.id);

      return json(req, 200, { ok: true });
    }

    if (!plan_code) throw new Error("INVALID_PLAN");

    if (plan_code === "FREE")
      throw new Error("FREE_NOT_ALLOWED");

    // 3️⃣ Obtener nuevo price_id
    const { data: planRow } = await sb
      .from("plans")
      .select("id,stripe_price_id_monthly,stripe_price_id_yearly")
      .eq("code", plan_code)
      .maybeSingle();

    if (!planRow) throw new Error("PLAN_NOT_FOUND");

    const newPriceId =
      billing_frequency === "YEARLY"
        ? planRow.stripe_price_id_yearly
        : planRow.stripe_price_id_monthly;

    // -------------------------------------------------
    // UPGRADE → inmediato
    // -------------------------------------------------
    if (planRow.id > activeSub.plan_id) {
      await stripePost(
        `subscriptions/${activeSub.stripe_subscription_id}`,
        STRIPE_SECRET,
        {
          "items[0][price]": newPriceId,
          proration_behavior: "create_prorations",
        }
      );

      await sb
        .from("subscriptions")
        .update({
          plan_id: planRow.id,
          stripe_price_id: newPriceId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", activeSub.id);

      return json(req, 200, { ok: true, upgrade: true });
    }

    // -------------------------------------------------
    // DOWNGRADE → programado
    // -------------------------------------------------
    const schedule = await stripePost(
      "subscription_schedules",
      STRIPE_SECRET,
      {
        from_subscription: activeSub.stripe_subscription_id,
      }
    );

    await sb
      .from("subscriptions")
      .update({
        stripe_schedule_id: schedule.id,
        required_plan_code: plan_code,
        required_billing_frequency: billing_frequency,
      })
      .eq("id", activeSub.id);

    return json(req, 200, { ok: true, downgrade_scheduled: true });
  } catch (e) {
    return json(req, 400, { ok: false });
  }
});