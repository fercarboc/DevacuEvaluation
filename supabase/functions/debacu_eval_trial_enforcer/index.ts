import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const DEFAULT_APP_ID = "DEBACU_EVAL";

function mustEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

const supabaseUrl = mustEnv("SUPABASE_URL");
const supabaseKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function insertEvent(params: {
  app_id: string;
  customer_id: string;
  type: string;
  payload?: Record<string, unknown>;
}) {
  await supabase.from("subscription_events").insert({
    stripe_event_id: `cron_${crypto.randomUUID()}`,
    type: params.type,
    payload: params.payload ?? {},
    created_at: new Date().toISOString(),
    customer_id: params.customer_id,
    app_id: params.app_id,
    stripe_customer_id: null,
    stripe_subscription_id: null,
  });
}

Deno.serve(async (req) => {
  try {
    // (Opcional) protege con header secreto si lo llamas manual:
    // const key = req.headers.get("x-cron-key"); if (key !== Deno.env.get("CRON_KEY")) return json(401,{error:"unauthorized"})

    const now = new Date();
    const nowIso = now.toISOString();
    const app_id = DEFAULT_APP_ID;

    // 1) TRIAL_ACTIVE expirados -> PAYMENT_REQUIRED + gracia 15 días + plan BASIC anual por defecto
    {
      const { data: trials, error } = await supabase
        .from("subscriptions")
        .select("id, customer_id, trial_ends_at")
        .eq("app_id", app_id)
        .eq("status", "TRIAL_ACTIVE")
        .lt("trial_ends_at", nowIso)
        .limit(500);

      if (error) throw error;

      for (const s of trials ?? []) {
        const graceEnds = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString();

        const { error: updErr } = await supabase
          .from("subscriptions")
          .update({
            status: "PAYMENT_REQUIRED",
            required_plan_code: "BASIC",
            required_billing_frequency: "YEARLY",
            grace_ends_at: graceEnds,
            updated_at: nowIso,
          })
          .eq("id", s.id);

        if (updErr) throw updErr;

        await insertEvent({
          app_id,
          customer_id: s.customer_id,
          type: "TRIAL_ENDED_PAYMENT_REQUIRED",
          payload: {
            subscription_id: s.id,
            required_plan_code: "BASIC",
            required_billing_frequency: "YEARLY",
            grace_ends_at: graceEnds,
          },
        });
      }
    }

    // 2) PAYMENT_REQUIRED expirados -> SUSPENDED
    {
      const { data: unpaid, error } = await supabase
        .from("subscriptions")
        .select("id, customer_id, grace_ends_at")
        .eq("app_id", app_id)
        .eq("status", "PAYMENT_REQUIRED")
        .lt("grace_ends_at", nowIso)
        .limit(500);

      if (error) throw error;

      for (const s of unpaid ?? []) {
        const { error: updErr } = await supabase
          .from("subscriptions")
          .update({
            status: "SUSPENDED",
            suspended_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", s.id);

        if (updErr) throw updErr;

        await insertEvent({
          app_id,
          customer_id: s.customer_id,
          type: "SUSPENDED_FOR_NON_PAYMENT",
          payload: { subscription_id: s.id },
        });
      }
    }

    return json(200, { ok: true, ran_at: nowIso });
  } catch (e) {
    console.error("trial_enforcer error", e);
    return json(500, { error: "unhandled", detail: String(e) });
  }
});
