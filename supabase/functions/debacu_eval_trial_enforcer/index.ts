// supabase/functions/debacu_eval_trial_enforcer/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const CRON_SECRET = mustEnv("CRON_SECRET");

const APP_ID = Deno.env.get("APP_ID") ?? "DEBACU_EVAL";

// configurables
const GRACE_DAYS = Number(Deno.env.get("GRACE_DAYS") ?? "15");
const BATCH_LIMIT = Number(Deno.env.get("BATCH_LIMIT") ?? "500");
const DEFAULT_REQUIRED_PLAN_CODE = (Deno.env.get("DEFAULT_REQUIRED_PLAN_CODE") ?? "BASIC").toUpperCase();
const DEFAULT_REQUIRED_BILLING_FREQUENCY = (Deno.env.get("DEFAULT_REQUIRED_BILLING_FREQUENCY") ?? "YEARLY").toUpperCase();

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function unauthorized() {
  // sin detalles
  return json(401, { ok: false, error: "request_failed", detail: "UNAUTHORIZED" });
}

function requireCron(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1] ?? "";
  return token && token === CRON_SECRET;
}

function yyyyMmDd(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function insertEvent(params: {
  app_id: string;
  customer_id: string;
  type: string;
  payload?: Record<string, unknown>;
  // para idempotencia
  stripe_event_id: string;
}) {
  const { error } = await sb.from("subscription_events").insert({
    stripe_event_id: params.stripe_event_id,
    type: params.type,
    payload: params.payload ?? {},
    created_at: new Date().toISOString(),
    customer_id: params.customer_id,
    app_id: params.app_id,
    stripe_customer_id: null,
    stripe_subscription_id: null,
  });

  if (error) {
    const msg = String((error as any)?.message ?? "").toLowerCase();
    // ignorar duplicados si hay unique sobre stripe_event_id
    if (!(msg.includes("duplicate") || msg.includes("unique"))) throw error;
  }
}

Deno.serve(async (req) => {
  // Cron endpoint: NO CORS, NO OPTIONS
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "request_failed", detail: "METHOD_NOT_ALLOWED" });
  }

  if (!requireCron(req)) return unauthorized();

  const now = new Date();
  const nowIso = now.toISOString();
  const today = yyyyMmDd(now);

  try {
    let processed_trial = 0;
    let processed_unpaid = 0;

    // 1) TRIAL_ACTIVE expirados -> PAYMENT_REQUIRED (+ grace)
    {
      const { data: trials, error } = await sb
        .from("subscriptions")
        .select("id, customer_id, trial_ends_at")
        .eq("app_id", APP_ID)
        .eq("status", "TRIAL_ACTIVE")
        .lt("trial_ends_at", nowIso)
        .limit(BATCH_LIMIT);

      if (error) throw error;

      for (const s of trials ?? []) {
        const graceEnds = new Date(now.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();

        // Idempotencia: solo actualiza si sigue TRIAL_ACTIVE
        const { error: updErr } = await sb
          .from("subscriptions")
          .update({
            status: "PAYMENT_REQUIRED",
            required_plan_code: DEFAULT_REQUIRED_PLAN_CODE,
            required_billing_frequency: DEFAULT_REQUIRED_BILLING_FREQUENCY,
            grace_ends_at: graceEnds,
            updated_at: nowIso,
          })
          .eq("id", s.id)
          .eq("status", "TRIAL_ACTIVE");

        if (updErr) throw updErr;

        await insertEvent({
          app_id: APP_ID,
          customer_id: s.customer_id,
          type: "TRIAL_ENDED_PAYMENT_REQUIRED",
          stripe_event_id: `cron_${s.id}_${today}_TRIAL_ENDED_PAYMENT_REQUIRED`,
          payload: {
            subscription_id: s.id,
            required_plan_code: DEFAULT_REQUIRED_PLAN_CODE,
            required_billing_frequency: DEFAULT_REQUIRED_BILLING_FREQUENCY,
            grace_ends_at: graceEnds,
          },
        });

        processed_trial++;
      }
    }

    // 2) PAYMENT_REQUIRED expirados -> SUSPENDED
    {
      const { data: unpaid, error } = await sb
        .from("subscriptions")
        .select("id, customer_id, grace_ends_at")
        .eq("app_id", APP_ID)
        .eq("status", "PAYMENT_REQUIRED")
        .lt("grace_ends_at", nowIso)
        .limit(BATCH_LIMIT);

      if (error) throw error;

      for (const s of unpaid ?? []) {
        const { error: updErr } = await sb
          .from("subscriptions")
          .update({
            status: "SUSPENDED",
            suspended_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", s.id)
          .eq("status", "PAYMENT_REQUIRED");

        if (updErr) throw updErr;

        await insertEvent({
          app_id: APP_ID,
          customer_id: s.customer_id,
          type: "SUSPENDED_FOR_NON_PAYMENT",
          stripe_event_id: `cron_${s.id}_${today}_SUSPENDED_FOR_NON_PAYMENT`,
          payload: { subscription_id: s.id },
        });

        processed_unpaid++;
      }
    }

    return json(200, {
      ok: true,
      ran_at: nowIso,
      app_id: APP_ID,
      processed: { trial_to_payment_required: processed_trial, payment_required_to_suspended: processed_unpaid },
      limits: { batch_limit: BATCH_LIMIT, grace_days: GRACE_DAYS },
    });
  } catch (e) {
    console.error("debacu_eval_trial_enforcer error:", e);
    return json(500, { ok: false, error: "request_failed", detail: "request_failed" });
  }
});
