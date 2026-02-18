// supabase/functions/debacu_eval_subscription_state_get/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";
import { json, preflight } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

const DEFAULT_APP_ID = "DEBACU_EVAL";

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`MISSING_ENV:${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

// Stripe es opcional aquí: si no está, no hacemos fallback
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

function sbService() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function safeUpper(v?: string | null) {
  return String(v ?? "").toUpperCase();
}
function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}
function pickString(body: any, snake: string, camel?: string): string | undefined {
  const v = body?.[snake] ?? (camel ? body?.[camel] : undefined);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function err(
  req: Request,
  status: number,
  detail:
    | "UNAUTHENTICATED"
    | "FORBIDDEN"
    | "missing_org_id"
    | "invalid_app_id"
    | "request_failed",
) {
  return json(req, status, { ok: false, error: "request_failed", detail });
}

/** =========================
 * Tenant context (STRICT)
 * - org_id obligatorio
 * - membership ACTIVE requerida
 * - role puede ser STAFF (leer estado sí)
 * ========================= */
async function requireOrgContext(
  sb: ReturnType<typeof sbService>,
  user_id: string,
  org_id: string,
) {
  const { data: mem, error: memErr } = await sb
    .from("debacu_eval_org_members")
    .select("org_id, role, status")
    .eq("user_id", user_id)
    .eq("org_id", org_id)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (memErr || !mem?.org_id) return null;

  // customer_id preferente por view
  let customer_id: string | null = null;

  const { data: ent, error: entErr } = await sb
    .from("debacu_eval_org_entitlements_v")
    .select("customer_id")
    .eq("org_id", org_id)
    .maybeSingle();

  if (!entErr && ent?.customer_id) customer_id = String(ent.customer_id);

  if (!customer_id) {
    const { data: org, error: orgErr } = await sb
      .from("debacu_eval_organizations")
      .select("customer_id")
      .eq("id", org_id)
      .maybeSingle();

    if (orgErr || !org?.customer_id) return null;
    customer_id = String(org.customer_id);
  }

  return { org_id, role: mem.role ?? null, customer_id };
}

/** =========================
 * Best subscription selector
 * ========================= */
const STATUS_ORDER = ["ACTIVE", "TRIAL_ACTIVE", "SUSPENDED", "PENDING_PAYMENT"] as const;

function scoreStatus(s?: string | null) {
  const up = safeUpper(s);
  const idx = STATUS_ORDER.indexOf(up as any);
  return idx === -1 ? 999 : idx;
}

async function getBestSubscription(sb: ReturnType<typeof sbService>, customer_id: string, app_id: string) {
  const { data, error } = await sb
    .from("subscriptions")
    .select("id,status,billing_frequency,next_billing_date,plan_id,start_date,end_date,created_at,updated_at,replaces_subscription_id,stripe_subscription_id,provider_subscription_id,stripe_schedule_id")
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
    const sb2 = scoreStatus(b.status);
    if (sa !== sb2) return sa - sb2;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST" && req.method !== "GET") {
    return json(req, 405, { ok: false, error: "request_failed", detail: "METHOD_NOT_ALLOWED" });
  }

  try {
    const user = await requireUser(req);
    if (!user?.id) return err(req, 401, "UNAUTHENTICATED");

    const url = new URL(req.url);

    let body: any = {};
    if (req.method === "POST") body = await req.json().catch(() => ({}));

    // org_id obligatorio: por body o por query (?org_id=)
    const org_id = pickString(body, "org_id", "orgId") ?? safeStr(url.searchParams.get("org_id"));
    if (!org_id) return err(req, 400, "missing_org_id");

    const app_id = (pickString(body, "app_id", "appId") ?? DEFAULT_APP_ID).trim();
    if (app_id !== DEFAULT_APP_ID) return err(req, 400, "invalid_app_id");

    const sb = sbService();

    const ctx = await requireOrgContext(sb, user.id, org_id);
    if (!ctx) return err(req, 403, "FORBIDDEN");

    // Anti-tampering: si mandan customer_id debe coincidir
    const customer_id_in = pickString(body, "customer_id", "customerId");
    if (customer_id_in && customer_id_in !== ctx.customer_id) return err(req, 403, "FORBIDDEN");

    const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" }) : null;

    const sub = await getBestSubscription(sb, ctx.customer_id, app_id);

    // plan asociado
    let planRow: any = null;
    if (sub?.plan_id) {
      const { data: plan, error: planErr } = await sb.from("plans").select("*").eq("id", sub.plan_id).maybeSingle();
      if (planErr) throw planErr;
      planRow = plan;
    }

    // next_billing_date fallback stripe (best-effort)
    let next_billing_date: string | null = sub?.next_billing_date ?? null;
    if (!next_billing_date && sub) {
      next_billing_date = await fallbackNextBillingFromStripe(stripe, sub);
    }

    const plan_code = safeUpper(planRow?.code ?? "FREE");
    const status = sub?.status ?? "FREE";

    return json(req, 200, {
      ok: true,

      status,
      plan_code,
      plan_display_name: planRow?.name ?? plan_code,
      limits_max_queries_per_month: planRow?.max_queries_per_month ?? null,
      next_billing_date,

      // compat
      active_subscription: safeUpper(status) === "ACTIVE" ? sub : null,
      pending_subscription: safeUpper(status) === "PENDING_PAYMENT" ? sub : null,

      subscription: sub ?? null,
      plan: planRow ?? null,
      member_role: safeUpper(ctx.role ?? "") || null,
      org_id: ctx.org_id,
      customer_id: ctx.customer_id,
      app_id,
    });
  } catch (e) {
    console.error("debacu_eval_subscription_state_get error:", e);
    // No leaks
    return err(req, 500, "request_failed");
  }
});
