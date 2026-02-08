import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "http://localhost:3000";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-session-token",
    "Access-Control-Max-Age": "86400",
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8" },
  });
}

function okOptions(req: Request) {
  return new Response("ok", { status: 200, headers: corsHeaders(req) });
}

type ReqBody = {
  customer_id: string;
  app_id?: string;
};

function safeUpper(v?: string | null) {
  return (v ?? "").toUpperCase();
}

// Prioridad de “lo que realmente es el plan vigente”
const STATUS_ORDER = ["ACTIVE", "TRIAL_ACTIVE", "SUSPENDED", "PENDING_PAYMENT"] as const;

function scoreStatus(s?: string | null) {
  const up = safeUpper(s);
  const idx = STATUS_ORDER.indexOf(up as any);
  return idx === -1 ? 999 : idx;
}

async function fallbackNextBillingFromStripe(stripe: Stripe | null, sub: any): Promise<string | null> {
  if (!stripe) return null;
  const stripeSubId = sub?.stripe_subscription_id ?? sub?.provider_subscription_id ?? null;
  if (!stripeSubId) return null;

  try {
    const s = await stripe.subscriptions.retrieve(String(stripeSubId));
    const end = (s as any)?.current_period_end as number | undefined;
    return end ? new Date(end * 1000).toISOString().slice(0, 10) : null;
  } catch {
    return null;
  }
}

async function getBestSubscription(admin: any, customer_id: string, app_id: string) {
  const { data, error } = await admin
    .from("subscriptions")
    .select(
      "id,status,billing_frequency,next_billing_date,plan_id,start_date,end_date,created_at,updated_at,replaces_subscription_id,stripe_subscription_id,provider_subscription_id,stripe_schedule_id",
    )
    .eq("customer_id", customer_id)
    .eq("app_id", app_id)
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  const rows = (data ?? []).filter((r: any) => safeUpper(r?.status) !== "REPLACED");
  if (!rows.length) return null;

  // 🔧 Penaliza filas “colgadas” (típico: programar bajada crea algo sin next_billing_date)
  function penalty(r: any) {
    let p = 0;
    // si no tiene next_billing_date y tampoco tiene subscription id, huele a placeholder/manual
    const hasProviderId = !!(r?.stripe_subscription_id || r?.provider_subscription_id);
    if (!r?.next_billing_date) p += 10;
    if (!hasProviderId) p += 10;
    // si tiene end_date, también peor para “actual”
    if (r?.end_date) p += 5;
    return p;
  }

  rows.sort((a: any, b: any) => {
    const sa = scoreStatus(a.status);
    const sb = scoreStatus(b.status);
    if (sa !== sb) return sa - sb;

    const pa = penalty(a);
    const pb = penalty(b);
    if (pa !== pb) return pa - pb;

    // desempate por start_date / updated_at / created_at desc
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return okOptions(req);
  if (req.method !== "POST") return json(req, 405, { error: "Method not allowed" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

  const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" }) : null;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(req, 500, { error: "Missing Supabase env vars" });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(req, 401, { error: "Missing Authorization Bearer token" });
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(req, 401, { error: "Invalid session" });
  const authUid = userData.user.id;

  let body: ReqBody;
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { error: "Invalid JSON body" });
  }

  const customer_id = String(body.customer_id ?? "").trim();
  const app_id = String(body.app_id ?? "DEBACU_EVAL").trim();
  if (!customer_id) return json(req, 400, { error: "customer_id is required" });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 🔒 Membership (org.customer_id == customer_id)
  const { data: mem, error: memErr } = await admin
    .from("debacu_eval_org_members")
    .select("id, role, org_id, debacu_eval_organizations!inner(customer_id)")
    .eq("user_id", authUid)
    .eq("debacu_eval_organizations.customer_id", customer_id)
    .maybeSingle();

  if (memErr) return json(req, 500, { error: memErr.message });
  if (!mem) return json(req, 403, { error: "Forbidden" });

  // ✅ Suscripción “principal” para UI (robusta)
  let sub: any = null;
  try {
    sub = await getBestSubscription(admin, customer_id, app_id);
  } catch (e: any) {
    return json(req, 500, { error: String(e?.message ?? e) });
  }

  // ✅ Plan asociado
  let planRow: any = null;
  if (sub?.plan_id) {
    const { data: plan, error: planErr } = await admin
      .from("plans")
      .select("*")
      .eq("id", sub.plan_id)
      .maybeSingle();

    if (planErr) return json(req, 500, { error: planErr.message });
    planRow = plan;
  }

  // ✅ next_billing_date: si falta, fallback Stripe
  let next_billing_date: string | null = sub?.next_billing_date ?? null;
  if (!next_billing_date && sub) {
    next_billing_date = await fallbackNextBillingFromStripe(stripe, sub);
  }

  const plan_code = String(planRow?.code ?? "FREE").toUpperCase();

  return json(req, 200, {
    status: sub?.status ?? "FREE",
    plan_code,
    plan_display_name: planRow?.name ?? plan_code,
    limits_max_queries_per_month: planRow?.max_queries_per_month ?? null,

    next_billing_date,

    // compatibilidad: dejo estos campos aunque ya no los uses igual
    active_subscription: safeUpper(sub?.status) === "ACTIVE" ? sub : null,
    pending_subscription: safeUpper(sub?.status) === "PENDING_PAYMENT" ? sub : null,

    subscription: sub ?? null,
    plan: planRow ?? null,
    member_role: (mem as any).role ?? null,
    org_id: (mem as any).org_id ?? null,
  });
});
