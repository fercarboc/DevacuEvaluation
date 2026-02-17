// supabase/functions/debacu_eval_subscription_state_get/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";

/** =========================
 * CORS
 * ========================= */
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // ✅ JWT-only: NO x-session-token
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

/** =========================
 * Helpers
 * ========================= */
function safeUpper(v?: string | null) {
  return String(v ?? "").toUpperCase();
}

const STATUS_ORDER = ["ACTIVE", "TRIAL_ACTIVE", "SUSPENDED", "PENDING_PAYMENT"] as const;

function scoreStatus(s?: string | null) {
  const up = safeUpper(s);
  const idx = STATUS_ORDER.indexOf(up as any);
  return idx === -1 ? 999 : idx;
}

async function fallbackNextBillingFromStripe(
  stripe: Stripe | null,
  sub: any,
): Promise<string | null> {
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

  function penalty(r: any) {
    let p = 0;
    const hasProviderId = !!(r?.stripe_subscription_id || r?.provider_subscription_id);
    if (!r?.next_billing_date) p += 10;
    if (!hasProviderId) p += 10;
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

/** =========================
 * Auth (JWT-only)
 * ========================= */
function userClient(req: Request, supabaseUrl: string, anonKey: string) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
}

async function requireJwtUser(req: Request, supabaseUrl: string, anonKey: string) {
  const sb = userClient(req, supabaseUrl, anonKey);
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");
  return data.user;
}

/** =========================
 * Tenant context (org -> customer_id)
 * ========================= */
async function requireOrgContext(admin: any, user_id: string) {
  const { data: mem, error: memErr } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, role, created_at")
    .eq("user_id", user_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memErr) throw new Error(`MEMBERSHIP_FAILED:${memErr.message}`);
  if (!mem?.org_id) throw new Error("FORBIDDEN_NO_ORG");

  const org_id = String(mem.org_id);
  const role = mem.role ?? null;

  let customer_id: string | null = null;

  // 1) entitlements view (si existe)
  try {
    const { data: ent, error: entErr } = await admin
      .from("debacu_eval_org_entitlements_v")
      .select("customer_id")
      .eq("org_id", org_id)
      .maybeSingle();

    if (!entErr && ent?.customer_id) customer_id = String(ent.customer_id);
  } catch {
    // ignore
  }

  // 2) fallback organizations
  if (!customer_id) {
    const { data: org, error: orgErr } = await admin
      .from("debacu_eval_organizations")
      .select("customer_id")
      .eq("id", org_id)
      .maybeSingle();

    if (orgErr) throw new Error(`ORG_LOOKUP_FAILED:${orgErr.message}`);
    if (!org?.customer_id) throw new Error("FORBIDDEN_NO_CUSTOMER");
    customer_id = String(org.customer_id);
  }

  return { org_id, role, customer_id };
}

/** =========================
 * Server
 * ========================= */
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json(origin, 405, { ok: false, error: "method_not_allowed" });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
      return json(origin, 500, { ok: false, error: "Missing Supabase env vars" });
    }

    // ✅ JWT obligatorio
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(origin, 401, { ok: false, error: "Missing Authorization Bearer token" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) usuario JWT
    const user = await requireJwtUser(req, SUPABASE_URL, SUPABASE_ANON_KEY);

    // 2) tenant context seguro
    const ctx = await requireOrgContext(admin, user.id);

    // 3) body (solo para app_id y validación opcional)
    const body = await req.json().catch(() => ({} as any));
    const app_id = String(body?.app_id ?? body?.appId ?? "DEBACU_EVAL").trim();

    // 🔒 anti-tampering: si te envían customer_id, debe coincidir
    const customer_id_in = String(body?.customer_id ?? body?.customerId ?? "").trim();
    if (customer_id_in && customer_id_in !== ctx.customer_id) {
      return json(origin, 403, {
        ok: false,
        error: "FORBIDDEN_CUSTOMER_MISMATCH",
        detail: "customer_id does not match authenticated tenant context",
      });
    }

    const stripe = STRIPE_SECRET_KEY
      ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" })
      : null;

    // ✅ sub “principal” robusta
    const sub = await getBestSubscription(admin, ctx.customer_id, app_id);

    // ✅ plan asociado
    let planRow: any = null;
    if (sub?.plan_id) {
      const { data: plan, error: planErr } = await admin
        .from("plans")
        .select("*")
        .eq("id", sub.plan_id)
        .maybeSingle();
      if (planErr) return json(origin, 500, { ok: false, error: planErr.message });
      planRow = plan;
    }

    // ✅ next_billing_date fallback stripe
    let next_billing_date: string | null = sub?.next_billing_date ?? null;
    if (!next_billing_date && sub) {
      next_billing_date = await fallbackNextBillingFromStripe(stripe, sub);
    }

    const plan_code = safeUpper(planRow?.code ?? "FREE");

    return json(origin, 200, {
      ok: true,
      status: sub?.status ?? "FREE",
      plan_code,
      plan_display_name: planRow?.name ?? plan_code,
      limits_max_queries_per_month: planRow?.max_queries_per_month ?? null,
      next_billing_date,

      // compat (igual que tu salida)
      active_subscription: safeUpper(sub?.status) === "ACTIVE" ? sub : null,
      pending_subscription: safeUpper(sub?.status) === "PENDING_PAYMENT" ? sub : null,

      subscription: sub ?? null,
      plan: planRow ?? null,
      member_role: safeUpper(ctx.role ?? "") || null,
      org_id: ctx.org_id,
      customer_id: ctx.customer_id,
      app_id,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const code =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg.startsWith("FORBIDDEN")
        ? 403
        : msg.startsWith("MEMBERSHIP_FAILED") || msg.startsWith("ORG_LOOKUP_FAILED")
        ? 403
        : 500;

    console.error("debacu_eval_subscription_state_get error:", e);
    return json(origin, code, { ok: false, error: "request_failed", detail: msg });
  }
});
