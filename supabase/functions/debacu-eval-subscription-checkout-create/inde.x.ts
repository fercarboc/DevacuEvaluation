// supabase/functions/debacu_eval_checkout_create/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

type PlanCode = "BASIC" | "MEDIUM" | "PREMIUM";
type BillingFrequency = "MONTHLY" | "YEARLY";

type Body = {
  org_id?: string;
  app_id?: string;
  app_code?: string;
  plan_code?: string;
  billing_frequency?: string;
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

function toBilling(v: string): BillingFrequency | null {
  const x = v.toUpperCase().trim();
  if (x === "MONTHLY" || x === "YEARLY") return x;
  return null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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
    // NO filtramos mensajes internos a cliente; aquí solo lanzamos código genérico
    const stripeCode = j?.error?.code ? String(j.error.code) : "stripe_error";
    throw new Error(`STRIPE_${stripeCode}`);
  }

  return j;
}

/* ======================================================
 * Multi-org: resolve org + customer_id (service role)
 * ====================================================== */
async function resolveOrgAndCustomerId(
  sb: ReturnType<typeof supabaseServiceClient>,
  authUserId: string,
  orgIdIn?: string,
) {
  const requested = safeStr(orgIdIn);

  if (requested) {
    const { data: mem, error: memErr } = await sb
      .from("debacu_eval_org_members")
      .select("org_id, role, status")
      .eq("org_id", requested)
      .eq("auth_user_id", authUserId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (memErr) throw new Error("DB_ERROR");
    if (!mem?.org_id) throw new Error("NO_ORG_MEMBERSHIP");

    const org_id = String(mem.org_id);

    // customer_id: entitlements view -> organizations fallback
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

    return { org_id, customer_id };
  }

  // fallback determinista
  const { data: mem, error: memErr } = await sb
    .from("debacu_eval_org_members")
    .select("org_id, role, status, created_at")
    .eq("auth_user_id", authUserId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memErr) throw new Error("DB_ERROR");
  if (!mem?.org_id) throw new Error("NO_ORG_MEMBERSHIP");

  const org_id = String(mem.org_id);

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

  return { org_id, customer_id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed");

  let pendingSubscriptionId: string | null = null;

  try {
    // 1) JWT obligatorio
    const user = await requireUser(req);

    // 2) env + price map
    const STRIPE_SECRET_KEY = mustEnv("STRIPE_SECRET_KEY");
    const SUCCESS_URL = Deno.env.get("STRIPE_SUCCESS_URL") || "http://localhost:3000/login?paid=1";
    const CANCEL_URL = Deno.env.get("STRIPE_CANCEL_URL") || "http://localhost:3000/login?cancel=1";

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

    // 3) body
    const body = await readJsonSafe<Body>(req);
    const app_id = safeStr(body.app_id ?? body.app_code) || APP_ID_DEFAULT;

    const plan_code = toPlanCode(safeStr(body.plan_code));
    const billing_frequency = toBilling(safeStr(body.billing_frequency)) ?? "MONTHLY";

    if (!plan_code) return fail(req, 400, "invalid_plan_code");
    const stripe_price_id = PRICE_MAP[plan_code][billing_frequency];

    // 4) DB (service role)
    const sb = supabaseServiceClient();

    // 5) resolve tenant (org -> customer) con org_id recomendado
    const { org_id, customer_id } = await resolveOrgAndCustomerId(sb, user.id, body.org_id);

    // 6) customer row
    const { data: customer, error: cErr } = await sb
      .from("customers")
      .select("id,name,email,is_active,stripe_customer_id")
      .eq("id", customer_id)
      .maybeSingle();

    if (cErr) return fail(req, 500, "db_read_failed");
    if (!customer?.id) return fail(req, 403, "FORBIDDEN");
    if (customer.is_active === false) return fail(req, 403, "FORBIDDEN");

    // 7) evita doble pending
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
    if (pending?.id) {
      return fail(req, 409, "pending_change_exists", { pending_subscription_id: pending.id });
    }

    // 8) plan_id correcto por app_id
    const { data: planRow, error: pErr } = await sb
      .from("plans")
      .select("id")
      .eq("app_id", app_id)
      .eq("code", plan_code)
      .maybeSingle();

    if (pErr) return fail(req, 500, "db_read_failed");
    if (!planRow?.id) return fail(req, 400, "invalid_plan_code");

    // 9) Stripe customer
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

      const { error: upErr } = await sb.from("customers").update({ stripe_customer_id }).eq("id", customer_id);
      if (upErr) return fail(req, 500, "db_write_failed");
    }

    // 10) crear pending subscription (mínimo seguro)
    const start_date = todayISO();
    const nowIso = new Date().toISOString();

    const { data: pendingSub, error: insErr } = await sb
      .from("subscriptions")
      .insert({
        customer_id,
        app_id,
        plan_id: planRow.id,
        billing_frequency,
        start_date,
        status: "PENDING_PAYMENT",
        provider: "stripe",
        stripe_customer_id,
        stripe_price_id,
        created_at: nowIso,
        updated_at: nowIso,
      } as any)
      .select("id, created_at")
      .single();

    if (insErr) return fail(req, 500, "db_write_failed");
    pendingSubscriptionId = String(pendingSub.id);

    // 11) checkout session
    const cs = await stripePost("checkout/sessions", STRIPE_SECRET_KEY, {
      mode: "subscription",
      customer: stripe_customer_id,
      success_url: `${SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: CANCEL_URL,
      allow_promotion_codes: "true",
      "line_items[0][price]": stripe_price_id,
      "line_items[0][quantity]": "1",

      // metadata para webhook
      "metadata[pendingSubscriptionId]": pendingSubscriptionId,
      "metadata[customer_id]": customer_id,
      "metadata[org_id]": org_id,
      "metadata[app_id]": app_id,
      "metadata[plan_code]": plan_code,
      "metadata[billing_frequency]": billing_frequency,
      "metadata[auth_user_id]": user.id,
    });

    const checkout_session_id = String(cs.id);
    const url = String(cs.url);

    // 12) guarda checkout id (best-effort)
    await sb
      .from("subscriptions")
      .update({ stripe_checkout_session_id: checkout_session_id, updated_at: new Date().toISOString() })
      .eq("id", pendingSubscriptionId);

    return json(req, 200, {
      ok: true,
      data: {
        url,
        pending_subscription_id: pendingSubscriptionId,
        stripe_checkout_session_id: checkout_session_id,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    // cleanup best-effort: si ya creamos pending y Stripe falló, marcamos FAILED
    try {
      if (pendingSubscriptionId) {
        const sb = supabaseServiceClient();
        await sb
          .from("subscriptions")
          .update({ status: "FAILED", updated_at: new Date().toISOString() } as any)
          .eq("id", pendingSubscriptionId);
      }
    } catch {
      // ignore
    }

    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") return fail(req, 401, "UNAUTHORIZED");
    if (msg === "NO_ORG_MEMBERSHIP") return fail(req, 403, "NO_ORG_MEMBERSHIP");
    if (msg === "NO_ORG") return fail(req, 403, "NO_ORG");
    if (msg.startsWith("missing_env_")) return fail(req, 500, "missing_server_configuration");
    if (msg.startsWith("STRIPE_")) return fail(req, 502, "stripe_request_failed");

    return fail(req, 500, "internal_error");
  }
});
