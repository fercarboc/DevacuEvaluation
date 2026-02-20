// supabase/functions/debacu_eval_subscription_state_get/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

const DEFAULT_APP_ID = "DEBACU_EVAL";

// Stripe opcional: si no está, no hacemos fallback
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

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
  detail: "UNAUTHENTICATED" | "FORBIDDEN" | "missing_org_id" | "invalid_app_id" | "invalid_org_id" | "request_failed",
) {
  return json(req, status, { ok: false, error: "request_failed", detail });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

/** =========================
 * Tenant context (STRICT)
 * - org_id obligatorio
 * - membership ACTIVE requerida
 * - role puede ser STAFF (leer estado sí)
 * - FIX STAFF: user_id OR auth_user_id
 * ========================= */
async function requireOrgContext(
  admin: ReturnType<typeof supabaseServiceClient>,
  user_id: string,
  org_id: string,
) {
  const uid = String(user_id);
  const oid = String(org_id).trim();

  if (!isUuid(oid)) throw new Error("invalid_org_id");

  // membership ACTIVE (tolerancia: si alguna vez auth_user_id = user.id)
  const { data: mem, error: memErr } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, role, status")
    .eq("org_id", oid)
    .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (memErr || !mem?.org_id) return null;

  // customer_id preferente por view (source of truth)
  let customer_id: string | null = null;

  const { data: ent, error: entErr } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("customer_id")
    .eq("org_id", oid)
    .maybeSingle();

  if (!entErr && ent?.customer_id) customer_id = String(ent.customer_id);

  // fallback organizations
  if (!customer_id) {
    const { data: org, error: orgErr } = await admin
      .from("debacu_eval_organizations")
      .select("customer_id")
      .eq("id", oid)
      .maybeSingle();

    if (orgErr || !org?.customer_id) return null;
    customer_id = String(org.customer_id);
  }

  return { org_id: oid, role: mem.role ?? null, customer_id };
}

/** =========================
 * Best subscription selector
 * ========================= */
const STATUS_ORDER = ["ACTIVE", "TRIAL_ACTIVE", "SUSPENDED", "PAST_DUE", "PENDING_PAYMENT"] as const;

function scoreStatus(s?: string | null) {
  const up = safeUpper(s);
  const idx = STATUS_ORDER.indexOf(up as any);
  return idx === -1 ? 999 : idx;
}

async function getBestSubscription(
  admin: ReturnType<typeof supabaseServiceClient>,
  customer_id: string,
  app_id: string,
) {
  const { data, error } = await admin
    .from("subscriptions")
    .select(
      [
        "id",
        "status",
        "billing_frequency",
        "next_billing_date",
        "plan_id",
        "start_date",
        "end_date",
        "created_at",
        "updated_at",
        "replaces_subscription_id",
        "stripe_subscription_id",
        "provider_subscription_id",
        "stripe_schedule_id",
      ].join(","),
    )
    .eq("customer_id", customer_id)
    .eq("app_id", app_id)
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error("DB_SUBSCRIPTIONS_FAILED");

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

export default Deno.serve(async (req) => {
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

    const admin = supabaseServiceClient();

    const ctx = await requireOrgContext(admin, user.id, org_id);
    if (!ctx) return err(req, 403, "FORBIDDEN");

    // Anti-tampering: si mandan customer_id debe coincidir
    const customer_id_in = pickString(body, "customer_id", "customerId");
    if (customer_id_in && customer_id_in !== ctx.customer_id) return err(req, 403, "FORBIDDEN");

    const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" }) : null;

    const sub = await getBestSubscription(admin, ctx.customer_id, app_id).catch(() => null);

    // plan asociado
    let planRow: any = null;
    if (sub?.plan_id) {
      const { data: plan, error: planErr } = await admin.from("plans").select("*").eq("id", sub.plan_id).maybeSingle();
      if (planErr) throw new Error("DB_PLAN_READ_FAILED");
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
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg === "invalid_org_id") return err(req, 400, "invalid_org_id");

    console.error("debacu_eval_subscription_state_get error:", msg);
    // No leaks
    return err(req, 500, "request_failed");
  }
});