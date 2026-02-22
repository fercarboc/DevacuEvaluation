// supabase/functions/debacu_eval_subscription_change/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

/**
 * ACTIONS:
 * - UPGRADE              -> crea PENDING_PAYMENT + Checkout Session (NO permite FREE)
 * - SCHEDULE_DOWNGRADE   -> programa bajada al final de periodo (NO permite FREE)
 * - CANCEL_DOWNGRADE     -> cancela schedule y limpia required_plan_code/stripe_schedule_id
 *
 * Reglas:
 * - target_plan_code: BASIC|MEDIUM|PREMIUM
 * - nunca FREE
 * - si hay PENDING_PAYMENT => 409
 */

type PlanCode = "BASIC" | "MEDIUM" | "PREMIUM";
type BillingFrequency = "MONTHLY" | "YEARLY";

type Action = "UPGRADE" | "SCHEDULE_DOWNGRADE" | "CANCEL_DOWNGRADE";

type Body = {
  org_id?: string;
  app_id?: string;
  app_code?: string;

  action?: Action | string;

  target_plan_code?: string;
  billing_frequency?: string;

  return_to?: string; // opcional, para volver donde estabas tras Stripe
};

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

function toBilling(v: string): BillingFrequency {
  const x = v.toUpperCase().trim();
  return x === "YEARLY" ? "YEARLY" : "MONTHLY";
}

function toAction(v: string): Action | null {
  const x = v.toUpperCase().trim();
  if (x === "UPGRADE" || x === "SCHEDULE_DOWNGRADE" || x === "CANCEL_DOWNGRADE") return x;
  return null;
}

async function readJsonSafe<T>(req: Request): Promise<T> {
  try {
    const t = await req.text();
    if (!t) return {} as T;
    return JSON.parse(t) as T;
  } catch {
    return {} as T;
  }
}

function fail(req: Request, status: number, detail: string, extra?: Record<string, unknown>) {
  return json(req, status, { ok: false, error: "request_failed", detail, ...(extra ?? {}) });
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
  } catch {
    // ignore
  }

  if (!res.ok) {
    const stripeCode = j?.error?.code ? String(j.error.code) : "stripe_error";
    throw new Error(`STRIPE_${stripeCode}`);
  }

  return j;
}

/* ======================================================
 * Resolve org + customer_id (service role)
 * ====================================================== */
async function resolveOrgAndCustomerId(
  sb: ReturnType<typeof supabaseServiceClient>,
  authUserId: string,
  orgIdIn?: string,
  app_id?: string,
) {
  const requested = safeStr(orgIdIn);
  const appId = app_id || APP_ID_DEFAULT;

  if (!requested) throw new Error("MISSING_ORG_ID");

  const { data: mem, error: memErr } = await sb
    .from("debacu_eval_org_members")
    .select("org_id, status")
    .eq("org_id", requested)
    .eq("auth_user_id", authUserId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (memErr) throw new Error("DB_ERROR");
  if (!mem?.org_id) throw new Error("NO_ORG_MEMBERSHIP");

  const org_id = String(mem.org_id);

  // customer_id desde entitlements view -> organizations fallback
  let customer_id: string | null = null;

  try {
    const { data: ent, error: entErr } = await sb
      .from("debacu_eval_org_entitlements_v")
      .select("customer_id")
      .eq("org_id", org_id)
      .maybeSingle();
    if (!entErr && ent?.customer_id) customer_id = String(ent.customer_id);
  } catch {
    // ignore
  }

  if (!customer_id) {
    const { data: org, error: orgErr } = await sb
      .from("debacu_eval_organizations")
      .select("customer_id")
      .eq("id", org_id)
      .maybeSingle();
    if (orgErr) throw new Error("DB_ERROR");
    if (!org?.customer_id) throw new Error("NO_ORG");
    customer_id = String(org.customer_id);
  }

  return { org_id, customer_id, app_id: appId };
}

async function getPlanId(sb: ReturnType<typeof supabaseServiceClient>, app_id: string, plan_code: PlanCode) {
  const { data, error } = await sb
    .from("plans")
    .select("id")
    .eq("app_id", app_id)
    .eq("code", plan_code)
    .maybeSingle();

  if (error) throw new Error("DB_ERROR");
  if (!data?.id) throw new Error("INVALID_PLAN");
  return String(data.id);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed");

  let pendingSubscriptionId: string | null = null;

  try {
    // 1) JWT obligatorio (es front)
    const user = await requireUser(req);

    // 2) env
    const STRIPE_SECRET_KEY = mustEnv("STRIPE_SECRET_KEY");

    const SUCCESS_URL = Deno.env.get("STRIPE_SUCCESS_URL") || "http://localhost:3000/login?paid=1";
    const CANCEL_URL = Deno.env.get("STRIPE_CANCEL_URL") || "http://localhost:3000/login?cancel=1";

    // 3) body
    const body = await readJsonSafe<Body>(req);
    const app_id = safeStr(body.app_id ?? body.app_code) || APP_ID_DEFAULT;

    const action = toAction(safeStr(body.action));
    if (!action) return fail(req, 400, "invalid_action");

    const billing_frequency = toBilling(safeStr(body.billing_frequency));
    const return_to = safeStr(body.return_to) || "";

    const plan_code_raw = safeStr(body.target_plan_code);
    const target_plan_code = plan_code_raw ? toPlanCode(plan_code_raw) : null;

    // 4) service role DB
    const sb = supabaseServiceClient();

    const { org_id, customer_id } = await resolveOrgAndCustomerId(sb, user.id, body.org_id, app_id);

    // 5) customer row
    const { data: customer, error: cErr } = await sb
      .from("customers")
      .select("id,name,email,is_active,stripe_customer_id")
      .eq("id", customer_id)
      .maybeSingle();

    if (cErr) return fail(req, 500, "db_read_failed");
    if (!customer?.id) return fail(req, 403, "FORBIDDEN");
    if (customer.is_active === false) return fail(req, 403, "FORBIDDEN");

    // 6) bloquear si hay pending
    const { data: pending, error: pendingErr } = await sb
      .from("subscriptions")
      .select("id")
      .eq("customer_id", customer_id)
      .eq("app_id", app_id)
      .eq("status", "PENDING_PAYMENT")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingErr) return fail(req, 500, "db_read_failed");
    if (pending?.id) return fail(req, 409, "pending_change_exists", { pending_subscription_id: pending.id });

    // ======================================================
    // ACTION: CANCEL_DOWNGRADE
    // ======================================================
    if (action === "CANCEL_DOWNGRADE") {
      // buscamos ACTIVE
      const { data: active, error: aErr } = await sb
        .from("subscriptions")
        .select("id, stripe_schedule_id")
        .eq("customer_id", customer_id)
        .eq("app_id", app_id)
        .eq("status", "ACTIVE")
        .maybeSingle();

      if (aErr) return fail(req, 500, "db_read_failed");
      if (!active?.id) return fail(req, 409, "no_active_subscription");

      const stripe_schedule_id = (active as any).stripe_schedule_id as string | null;

      // cancelar en Stripe si existe schedule
      if (stripe_schedule_id) {
        try {
          await stripePost(`subscription_schedules/${stripe_schedule_id}/cancel`, STRIPE_SECRET_KEY, {});
        } catch (e) {
          // si falla, igualmente limpiamos DB para no bloquear usuario
          console.error("Stripe schedule cancel failed:", e);
        }
      }

      const { error: upErr } = await sb
        .from("subscriptions")
        .update({
          required_plan_code: null,
          required_billing_frequency: null,
          stripe_schedule_id: null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", active.id);

      if (upErr) return fail(req, 500, "db_write_failed");

      return json(req, 200, { ok: true, data: { canceled: true } });
    }

    // Para UPGRADE / SCHEDULE_DOWNGRADE necesitamos target_plan_code
    if (!target_plan_code) return fail(req, 400, "invalid_plan_code");

    // ======================================================
    // ACTION: SCHEDULE_DOWNGRADE (al final del periodo)
    // ======================================================
    if (action === "SCHEDULE_DOWNGRADE") {
      // plan_id destino (solo validación)
      await getPlanId(sb, app_id, target_plan_code);

      // localizar ACTIVE
      const { data: active, error: aErr } = await sb
        .from("subscriptions")
        .select("id, stripe_subscription_id, provider_subscription_id, stripe_schedule_id, stripe_customer_id, required_plan_code")
        .eq("customer_id", customer_id)
        .eq("app_id", app_id)
        .eq("status", "ACTIVE")
        .maybeSingle();

      if (aErr) return fail(req, 500, "db_read_failed");
      if (!active?.id) return fail(req, 409, "no_active_subscription");

      const stripe_subscription_id =
        (active as any).stripe_subscription_id ??
        (active as any).provider_subscription_id ??
        null;

      if (!stripe_subscription_id) return fail(req, 409, "missing_stripe_subscription_id");

      // si ya hay schedule, no creamos otro (más seguro)
      if ((active as any).stripe_schedule_id) {
        return fail(req, 409, "downgrade_already_scheduled");
      }

      // crear schedule desde subscription
      const sched = await stripePost("subscription_schedules", STRIPE_SECRET_KEY, {
        from_subscription: String(stripe_subscription_id),
      });

      const scheduleId = String(sched.id);

      // Fases: mantenemos la fase actual y añadimos una 2ª con el nuevo price.
      // Para eso, necesitamos el price destino (env map).
      const priceEnvKey = `STRIPE_PRICE_ID_DEBACU_EVAL_${target_plan_code}_${billing_frequency}`;
      const stripe_price_id = mustEnv(priceEnvKey);

      // Recupera schedule expandido para obtener phases y end_date
      const sched2 = await fetch(`https://api.stripe.com/v1/subscription_schedules/${scheduleId}?expand[]=phases`, {
        headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
      }).then(r => r.json());

      const phases = (sched2?.phases ?? []) as any[];

      // primera fase: tal cual está (si no existe, Stripe suele poner una)
      const first = phases[0] ?? null;
      const currentEnd = first?.end_date ?? null;

      if (!currentEnd) {
        // sin end_date no podemos encajar “al final”; fallback: lo dejamos registrado y que el webhook/operador lo revise
        console.error("Schedule without end_date. scheduleId:", scheduleId, "phases:", phases);
      }

      // actualizamos schedule con 2 fases:
      // - fase 0: igual, terminando en end_date
      // - fase 1: nuevo price desde end_date en adelante
      const updateForm: Record<string, string> = {
        // phase 0
        "phases[0][start_date]": String(first?.start_date ?? "now"),
      };

      if (first?.end_date) updateForm["phases[0][end_date]"] = String(first.end_date);

      // copiamos items de fase 0 (para no romper)
      const firstItem = first?.items?.[0] ?? null;
      if (firstItem?.price) updateForm["phases[0][items][0][price]"] = String(firstItem.price);
      if (firstItem?.quantity) updateForm["phases[0][items][0][quantity]"] = String(firstItem.quantity);

      // phase 1
      updateForm["phases[1][start_date]"] = String(first?.end_date ?? "now");
      updateForm["phases[1][items][0][price]"] = stripe_price_id;
      updateForm["phases[1][items][0][quantity]"] = "1";

      const schedUpd = await stripePost(`subscription_schedules/${scheduleId}`, STRIPE_SECRET_KEY, updateForm);

      // guarda en DB para UI + control
      const { error: upErr } = await sb
        .from("subscriptions")
        .update({
          required_plan_code: target_plan_code,
          required_billing_frequency: billing_frequency,
          stripe_schedule_id: String(schedUpd.id),
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", active.id);

      if (upErr) return fail(req, 500, "db_write_failed");

      return json(req, 200, {
        ok: true,
        data: {
          scheduled: true,
          stripe_schedule_id: String(schedUpd.id),
          required_plan_code: target_plan_code,
          billing_frequency,
        },
      });
    }

    // ======================================================
    // ACTION: UPGRADE -> Checkout Session + PENDING_PAYMENT
    // ======================================================
    // plan_id destino
    const plan_id = await getPlanId(sb, app_id, target_plan_code);

    // price map por env (mensual/anual)
    const priceEnvKey = `STRIPE_PRICE_ID_DEBACU_EVAL_${target_plan_code}_${billing_frequency}`;
    const stripe_price_id = mustEnv(priceEnvKey);

    // ensure stripe_customer_id existe
    let stripe_customer_id = (customer.stripe_customer_id as string | null) ?? null;

    if (!stripe_customer_id) {
      const email = String(customer.email ?? user.email ?? "").trim().toLowerCase();
      if (!email || !email.includes("@")) return fail(req, 409, "customer_no_email");

      const sc = await stripePost("customers", STRIPE_SECRET_KEY, {
        email,
        name: String(customer.name ?? email),
        "metadata[customer_id]": customer_id,
        "metadata[org_id]": org_id,
        "metadata[app_id]": app_id,
        "metadata[auth_user_id]": user.id,
      });

      stripe_customer_id = String(sc.id);

      const { error: upCust } = await sb
        .from("customers")
        .update({ stripe_customer_id, updated_at: new Date().toISOString() })
        .eq("id", customer_id);

      if (upCust) return fail(req, 500, "db_write_failed");
    }

    // localizar ACTIVE actual (opcional) para setear replaces_subscription_id
    const { data: active, error: aErr } = await sb
      .from("subscriptions")
      .select("id,status")
      .eq("customer_id", customer_id)
      .eq("app_id", app_id)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (aErr) return fail(req, 500, "db_read_failed");

    const nowIso = new Date().toISOString();

    // crear pending subscription
    const { data: pendingSub, error: insErr } = await sb
      .from("subscriptions")
      .insert({
        customer_id,
        app_id,
        plan_id,
        billing_frequency,
        start_date: todayISO(),
        status: "PENDING_PAYMENT",
        provider: "stripe",
        stripe_customer_id,
        stripe_price_id,
        replaces_subscription_id: active?.id ?? null,
        created_at: nowIso,
        updated_at: nowIso,
      } as any)
      .select("id")
      .single();

    if (insErr) return fail(req, 500, "db_write_failed");

    pendingSubscriptionId = String(pendingSub.id);

    // crear checkout session (subscription)
    const successUrl =
      return_to
        ? `${SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}&return_to=${encodeURIComponent(return_to)}`
        : `${SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`;

    const cs = await stripePost("checkout/sessions", STRIPE_SECRET_KEY, {
      mode: "subscription",
      customer: stripe_customer_id,
      success_url: successUrl,
      cancel_url: CANCEL_URL,
      allow_promotion_codes: "true",
      "line_items[0][price]": stripe_price_id,
      "line_items[0][quantity]": "1",

      // metadata para webhook
      "metadata[pending_subscription_id]": pendingSubscriptionId,
      "metadata[pendingSubscriptionId]": pendingSubscriptionId, // compat
      "metadata[customer_id]": customer_id,
      "metadata[org_id]": org_id,
      "metadata[app_id]": app_id,
      "metadata[plan_code]": target_plan_code,
      "metadata[billing_frequency]": billing_frequency,
      "metadata[auth_user_id]": user.id,
    });

    const checkout_session_id = String(cs.id);
    const url = String(cs.url);

    // best-effort: guardamos checkout id
    await sb
      .from("subscriptions")
      .update({ stripe_checkout_session_id: checkout_session_id, updated_at: new Date().toISOString() })
      .eq("id", pendingSubscriptionId);

    return json(req, 200, {
      ok: true,
      data: {
        checkout_url: url,
        pending_subscription_id: pendingSubscriptionId,
        stripe_checkout_session_id: checkout_session_id,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    // cleanup best-effort
    try {
      if (pendingSubscriptionId) {
        const sb = supabaseServiceClient();
        await sb.from("subscriptions").update({ status: "FAILED", updated_at: new Date().toISOString() } as any).eq("id", pendingSubscriptionId);
      }
    } catch {
      // ignore
    }

    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") return fail(req, 401, "UNAUTHORIZED");
    if (msg === "NO_ORG_MEMBERSHIP") return fail(req, 403, "NO_ORG_MEMBERSHIP");
    if (msg === "NO_ORG") return fail(req, 403, "NO_ORG");
    if (msg === "MISSING_ORG_ID") return fail(req, 400, "missing_org_id");
    if (msg === "INVALID_PLAN") return fail(req, 400, "invalid_plan_code");
    if (msg.startsWith("missing_env_")) return fail(req, 500, "missing_server_configuration");
    if (msg.startsWith("STRIPE_")) return fail(req, 502, "stripe_request_failed");

    return fail(req, 500, "internal_error");
  }
});