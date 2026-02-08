// supabase/functions/debacu_eval_subscription_manage/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type PlanCode = "BASIC" | "MEDIUM" | "PREMIUM";
type BillingFrequency = "MONTHLY" | "YEARLY";
type ManageAction = "CHANGE" | "SCHEDULE_DOWNGRADE" | "CANCEL_DOWNGRADE";

const DEFAULT_APP_ID = "DEBACU_EVAL";

/** ======================================================
 *  ENV
 *  ====================================================== */
function mustEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = mustEnv("SUPABASE_ANON_KEY");

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

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

/** ======================================================
 *  CORS (whitelist + preflight 204)
 *  ====================================================== */
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

function corsHeaders(origin: string | null) {
  const o = origin ?? "";
  const allowOrigin = ALLOWED_ORIGINS.has(o) ? o : "https://debacu.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    Vary: "Origin",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-session-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Max-Age": "86400",
  };
}

function json(status: number, origin: string | null, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function errToString(e: unknown) {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** ======================================================
 *  Helpers
 *  ====================================================== */
function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function pickString(body: any, snake: string, camel?: string): string | undefined {
  const v = body?.[snake] ?? (camel ? body?.[camel] : undefined);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function pickPlanCode(body: any): PlanCode | undefined {
  const v = body?.target_plan_code ?? body?.targetPlanCode;
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
  const c = String(code ?? "").toUpperCase();
  if (c === "BASIC") return 1;
  if (c === "MEDIUM") return 2;
  if (c === "PREMIUM") return 3;
  return 0;
}

function isoDateFromUnix(sec?: number | null) {
  if (!sec) return null;
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

function readSessionToken(req: Request) {
  return safeStr(req.headers.get("x-session-token"));
}

/** ======================================================
 *  AuthN (JWT real) + AuthZ (org membership) + Session token
 *  ====================================================== */
function userClient(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
}

async function requireJwtUser(req: Request) {
  const sb = userClient(req);
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");
  return data.user;
}

async function requireEvalSession(token: string, customer_id: string, app_id: string) {
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("debacu_eval_sessions")
    .select("token, expires_at, revoked_at")
    .eq("token", token)
    .eq("customer_id", customer_id)
    .eq("app_code", app_id)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) throw new Error(`SESSION_CHECK_FAILED: ${error.message}`);
  if (!data) throw new Error("SESSION_INVALID");
  if (data.expires_at && String(data.expires_at) <= now) throw new Error("SESSION_EXPIRED");
}

async function requireOrgMember(customer_id: string, user_id: string) {
  const { data: org, error: orgErr } = await admin
    .from("debacu_eval_organizations")
    .select("id")
    .eq("customer_id", customer_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (orgErr) throw new Error(`ORG_LOOKUP_FAILED: ${orgErr.message}`);
  if (!org?.id) throw new Error("FORBIDDEN_NO_ORG");

  const { data: mem, error: memErr } = await admin
    .from("debacu_eval_org_members")
    .select("id, role")
    .eq("org_id", org.id)
    .eq("user_id", user_id)
    .maybeSingle();

  if (memErr) throw new Error(`MEMBERSHIP_FAILED: ${memErr.message}`);
  if (!mem?.id) throw new Error("FORBIDDEN");

  return { org_id: org.id, role: mem.role ?? null };
}

/** ======================================================
 *  DB helpers (mínimos cambios: GET robusto)
 *  ====================================================== */
async function getActiveSubscription(customer_id: string, app_id: string) {
  const { data, error } = await admin
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
  return data;
}

async function getPendingSubscription(customer_id: string, app_id: string) {
  const { data, error } = await admin
    .from("subscriptions")
    .select("*")
    .eq("customer_id", customer_id)
    .eq("app_id", app_id)
    .eq("status", "PENDING_PAYMENT")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ✅ Antes: "latest por created_at" podía devolver REPLACED y next_billing_date null.
// ✅ Ahora: elegimos la mejor suscripción para UI (prioriza ACTIVE y filtra REPLACED).
const STATUS_ORDER = ["ACTIVE", "TRIAL_ACTIVE", "SUSPENDED", "PENDING_PAYMENT"] as const;

function scoreStatus(s?: string | null) {
  const up = String(s ?? "").toUpperCase();
  const idx = STATUS_ORDER.indexOf(up as any);
  return idx === -1 ? 999 : idx;
}

async function getBestSubscription(customer_id: string, app_id: string) {
  const { data, error } = await admin
    .from("subscriptions")
    .select("*")
    .eq("customer_id", customer_id)
    .eq("app_id", app_id)
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  const rows = (data ?? []).filter((r: any) => String(r?.status ?? "").toUpperCase() !== "REPLACED");
  if (!rows.length) return null;

  rows.sort((a: any, b: any) => {
    const sa = scoreStatus(a.status);
    const sb = scoreStatus(b.status);
    if (sa !== sb) return sa - sb;

    // Penaliza filas "colgadas" sin fecha o sin ids de stripe
    const pa =
      (!a.next_billing_date ? 10 : 0) +
      (!(a.stripe_subscription_id || a.provider_subscription_id) ? 10 : 0);
    const pb =
      (!b.next_billing_date ? 10 : 0) +
      (!(b.stripe_subscription_id || b.provider_subscription_id) ? 10 : 0);
    if (pa !== pb) return pa - pb;

    const da = String(a.start_date ?? a.created_at ?? "");
    const db = String(b.start_date ?? b.created_at ?? "");
    return db.localeCompare(da);
  });

  return rows[0] as any;
}

async function getPlanByCode(app_id: string, code: string) {
  const { data, error } = await admin
    .from("plans")
    .select("*")
    .eq("app_id", app_id)
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getPlanById(plan_id: string) {
  const { data, error } = await admin
    .from("plans")
    .select("*")
    .eq("id", plan_id)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getCustomerById(customer_id: string) {
  const { data, error } = await admin
    .from("customers")
    .select("id, email")
    .eq("id", customer_id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function insertEvent(params: {
  app_id: string;
  customer_id: string;
  type: string;
  payload?: Record<string, unknown>;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_event_id?: string | null;
}) {
  const stripe_event_id = params.stripe_event_id ?? `manage_${crypto.randomUUID()}`;

  const { error } = await admin.from("subscription_events").insert({
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
 *  Handlers (tu lógica, sin romper)
 *  ====================================================== */
async function handleGet(customer_id: string, app_id: string) {
  const best = await getBestSubscription(customer_id, app_id);
  const active = await getActiveSubscription(customer_id, app_id);
  const pending = await getPendingSubscription(customer_id, app_id);

  const plan =
    best?.plan_id && typeof best.plan_id === "string"
      ? await getPlanById(best.plan_id)
      : active?.plan_id && typeof active.plan_id === "string"
      ? await getPlanById(active.plan_id)
      : null;

  // Compatibilidad: "latest" ahora es la mejor para UI (no REPLACED)
  return { latest: best, active, pending, plan };
}

async function handleChange(body: any) {
  const customer_id = pickString(body, "customer_id", "customerId");
  const app_id = pickString(body, "app_id", "appId") ?? DEFAULT_APP_ID;

  if (!customer_id) return { status: 400, body: { error: "customer_id is required" } };

  const target_plan_code = pickPlanCode(body);
  if (!target_plan_code) return { status: 400, body: { error: "target_plan_code is required" } };

  const billing_frequency = pickBillingFrequency(body);
  const price_id = PRICE_MAP[target_plan_code][billing_frequency];
  if (!price_id) return { status: 400, body: { error: "stripe price not configured" } };

  const pending = await getPendingSubscription(customer_id, app_id);
  if (pending) {
    return {
      status: 409,
      body: {
        code: "PENDING_CHANGE",
        error: "Ya existe un cambio de plan pendiente",
        pending_subscription_id: pending.id,
        pendingSubscriptionId: pending.id,
      },
    };
  }

  const plan_row = await getPlanByCode(app_id, target_plan_code);
  if (!plan_row) {
    return { status: 400, body: { error: `Plan ${target_plan_code} no encontrado en BD` } };
  }

  const customer = await getCustomerById(customer_id);
  const active_sub = await getActiveSubscription(customer_id, app_id);

  const currentPlanRow = active_sub?.plan_id ? await getPlanById(active_sub.plan_id) : null;
  const current_code = String(currentPlanRow?.code ?? "").toUpperCase();

  const isDowngrade = active_sub && planRank(target_plan_code) < planRank(current_code);
  if (isDowngrade) {
    return {
      status: 400,
      body: {
        error: "Para bajar de plan usa action=SCHEDULE_DOWNGRADE (next_cycle).",
        code: "USE_SCHEDULE_DOWNGRADE",
      },
    };
  }

  const replaces_subscription_id = active_sub?.id ?? null;

  const pending_subscription_id = crypto.randomUUID();
  const now_iso = new Date().toISOString();
  const start_date = now_iso.slice(0, 10);

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: price_id, quantity: 1 }],
    payment_method_types: ["card"],
    customer_email: customer?.email ?? undefined,
    success_url: `${STRIPE_SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: STRIPE_CANCEL_URL,

    metadata: {
      app_id,
      customer_id,
      pending_subscription_id,
      target_plan_code,
      billing_frequency,
      replaces_subscription_id: replaces_subscription_id ?? "",

      // compat
      appId: app_id,
      customerId: customer_id,
      pendingSubscriptionId: pending_subscription_id,
      targetPlanCode: target_plan_code,
      billingFrequency: billing_frequency,
      replacesSubscriptionId: replaces_subscription_id ?? "",
    },

    client_reference_id: customer_id,
  });

  const { error: insertError } = await admin.from("subscriptions").insert({
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

    created_at: now_iso,
    updated_at: now_iso,
  });

  if (insertError) throw insertError;

  await insertEvent({
    app_id,
    customer_id,
    type: "CHECKOUT_CREATED",
    payload: {
      pending_subscription_id,
      checkout_session_id: checkoutSession.id,
      stripe_price_id: price_id,
      target_plan_code,
      billing_frequency,
      replaces_subscription_id,
    },
  });

  return {
    status: 200,
    body: {
      checkout_url: checkoutSession.url,
      pending_subscription_id,

      // compat
      checkoutUrl: checkoutSession.url,
      pendingSubscriptionId: pending_subscription_id,
    },
  };
}

async function handleScheduleDowngrade(body: any) {
  const customer_id = pickString(body, "customer_id", "customerId");
  const app_id = pickString(body, "app_id", "appId") ?? DEFAULT_APP_ID;

  if (!customer_id) return { status: 400, body: { error: "customer_id is required" } };

  const target_plan_code = pickPlanCode(body);
  if (!target_plan_code) return { status: 400, body: { error: "target_plan_code is required" } };

  const billing_frequency = pickBillingFrequency(body);
  const price_id = PRICE_MAP[target_plan_code][billing_frequency];
  if (!price_id) return { status: 400, body: { error: "stripe price not configured" } };

  const pending = await getPendingSubscription(customer_id, app_id);
  if (pending) {
    return {
      status: 409,
      body: {
        code: "PENDING_CHANGE",
        error: "Ya existe un cambio de plan pendiente",
        pending_subscription_id: pending.id,
        pendingSubscriptionId: pending.id,
      },
    };
  }

  const active_sub = await getActiveSubscription(customer_id, app_id);
  if (!active_sub) {
    return { status: 409, body: { error: "No hay suscripción ACTIVE para programar downgrade." } };
  }

  if ((active_sub as any)?.required_plan_code) {
    return {
      status: 409,
      body: {
        code: "DOWNGRADE_ALREADY_SCHEDULED",
        error: "Ya existe un downgrade programado",
        required_plan_code: (active_sub as any)?.required_plan_code,
        required_billing_frequency: (active_sub as any)?.required_billing_frequency ?? null,
        effective_date: (active_sub as any)?.next_billing_date ?? null,
      },
    };
  }

  const currentPlanRow = (active_sub as any)?.plan_id
    ? await getPlanById((active_sub as any).plan_id)
    : null;
  const current_code = String(currentPlanRow?.code ?? "").toUpperCase();

  if (!(planRank(target_plan_code) < planRank(current_code))) {
    return {
      status: 400,
      body: {
        error: "SCHEDULE_DOWNGRADE solo permite bajar de plan (target inferior al actual).",
        current_plan_code: current_code || null,
        target_plan_code,
      },
    };
  }

  const stripeSubId =
    (active_sub as any)?.stripe_subscription_id ??
    (active_sub as any)?.provider_subscription_id ??
    null;

  if (!stripeSubId) {
    return {
      status: 409,
      body: { error: "No hay stripe_subscription_id en la suscripción ACTIVE para hacer downgrade." },
    };
  }

  const stripeSub = await stripe.subscriptions.retrieve(stripeSubId, {
    expand: ["items.data.price", "customer"],
  });

  const currentPriceId = stripeSub.items.data?.[0]?.price?.id;
  const periodStart = (stripeSub as any).current_period_start as number | undefined;
  const periodEnd = (stripeSub as any).current_period_end as number | undefined;

  if (!currentPriceId || !periodStart || !periodEnd) {
    return { status: 500, body: { error: "Stripe subscription missing current price/period" } };
  }

  const schedule = await stripe.subscriptionSchedules.create({
    from_subscription: stripeSubId,
  });

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

  const { error: upErr } = await admin
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

  await insertEvent({
    app_id,
    customer_id,
    type: "DOWNGRADE_SCHEDULED",
    stripe_subscription_id: stripeSubId,
    stripe_customer_id:
      typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer?.id ?? null,
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
      current_plan_code: (current_code as any) || null,
      target_plan_code,
      schedule_id: schedule.id,
    },
  };
}

async function handleCancelDowngrade(body: any) {
  const customer_id = pickString(body, "customer_id", "customerId");
  const app_id = pickString(body, "app_id", "appId") ?? DEFAULT_APP_ID;

  if (!customer_id) return { status: 400, body: { error: "customer_id is required" } };

  const active_sub = await getActiveSubscription(customer_id, app_id);
  if (!active_sub) {
    return { status: 409, body: { error: "No hay suscripción ACTIVE." } };
  }

  const scheduleId = (active_sub as any)?.stripe_schedule_id ?? null;

  if (!scheduleId) {
    return {
      status: 400,
      body: { error: "NO_DOWNGRADE_SCHEDULED", code: "NO_DOWNGRADE_SCHEDULED" },
    };
  }

  const stripeSubId =
    (active_sub as any)?.stripe_subscription_id ??
    (active_sub as any)?.provider_subscription_id ??
    null;

  if (!stripeSubId) {
    return {
      status: 409,
      body: { error: "No hay stripe_subscription_id en la suscripción ACTIVE." },
    };
  }

  try {
    await stripe.subscriptionSchedules.release(scheduleId);
  } catch (e: any) {
    const msg = String(e?.message ?? e).toLowerCase();
    const code = String(e?.code ?? "");
    const isNotFound = code === "resource_missing" || msg.includes("no such subscription schedule");
    if (!isNotFound) throw e;
  }

  // Recuperar la fecha desde Stripe: si falla, NO pisar next_billing_date con null
  let effectiveNextDate: string | null = null;
  try {
    const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
    const end = (stripeSub as any)?.current_period_end as number | undefined;
    effectiveNextDate = end ? new Date(end * 1000).toISOString().slice(0, 10) : null;
  } catch {
    effectiveNextDate = null;
  }

  const nowIso = new Date().toISOString();

  // ✅ FIX: NO BORRAR next_billing_date si Stripe no devolvió la fecha
  const updatePayload: Record<string, any> = {
    required_plan_code: null,
    required_billing_frequency: null,
    stripe_schedule_id: null,
    updated_at: nowIso,
  };
  if (effectiveNextDate) {
    updatePayload.next_billing_date = effectiveNextDate;
  }

  const { error: upErr } = await admin
    .from("subscriptions")
    .update(updatePayload as any)
    .eq("id", (active_sub as any).id);

  if (upErr) throw upErr;

  await insertEvent({
    app_id,
    customer_id,
    type: "DOWNGRADE_CANCELLED",
    stripe_subscription_id: stripeSubId ?? null,
    stripe_customer_id: (active_sub as any)?.stripe_customer_id ?? null,
    payload: {
      stripe_schedule_id: scheduleId,
      action: "CANCEL_DOWNGRADE",
      next_billing_date: effectiveNextDate,
    },
  });

  return { status: 200, body: { ok: true, next_billing_date: effectiveNextDate } };
}

/** ======================================================
 *  Server (ahora con seguridad)
 *  ====================================================== */
Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  try {
    // ✅ 1) JWT obligatorio
    const user = await requireJwtUser(req);

    // ✅ 2) Parse de input (GET o POST)
    let customer_id: string | undefined;
    let app_id: string = DEFAULT_APP_ID;
    let action: ManageAction | "" = "";

    if (req.method === "GET") {
      const url = new URL(req.url);
      customer_id =
        url.searchParams.get("customer_id") ??
        url.searchParams.get("customerId") ??
        undefined;
      app_id =
        url.searchParams.get("app_id") ??
        url.searchParams.get("appId") ??
        DEFAULT_APP_ID;
      action = "CHANGE"; // no aplica, pero no se usa en GET
    } else {
      const body = await req.json().catch(() => ({}));
      action = String(body?.action ?? "").toUpperCase() as ManageAction;
      customer_id = pickString(body, "customer_id", "customerId");
      app_id = pickString(body, "app_id", "appId") ?? DEFAULT_APP_ID;

      // ✅ x-session-token obligatorio (en POST)
      const sessionToken = readSessionToken(req);
      if (!sessionToken) return json(401, origin, { error: "Missing x-session-token" });
      if (!customer_id) return json(400, origin, { error: "customer_id is required" });

      await requireEvalSession(sessionToken, customer_id, app_id);
      await requireOrgMember(customer_id, user.id);

      if (action === "CHANGE") {
        const result = await handleChange(body);
        return json(result.status, origin, result.body);
      }

      if (action === "SCHEDULE_DOWNGRADE") {
        const result = await handleScheduleDowngrade(body);
        return json(result.status, origin, result.body);
      }

      if (action === "CANCEL_DOWNGRADE") {
        const result = await handleCancelDowngrade(body);
        return json(result.status, origin, result.body);
      }

      return json(400, origin, { error: "Unsupported action" });
    }

    // ✅ GET: protegido (JWT + session + org)
    const sessionToken = readSessionToken(req);
    if (!sessionToken) return json(401, origin, { error: "Missing x-session-token" });
    if (!customer_id) return json(400, origin, { error: "customer_id query param required" });

    await requireEvalSession(sessionToken, customer_id, app_id);
    await requireOrgMember(customer_id, user.id);

    const data = await handleGet(customer_id, app_id);
    return json(200, origin, data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const code =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg === "SESSION_INVALID" || msg === "SESSION_EXPIRED"
        ? 401
        : msg.startsWith("FORBIDDEN")
        ? 403
        : 500;

    console.error("debacu_eval_subscription_manage error:", error);
    return json(code, origin, { error: "Request failed", detail: errToString(error) });
  }
});
