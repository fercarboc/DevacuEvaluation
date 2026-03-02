// supabase/functions/debacu_eval_account_bundle/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

const APP_ID = "DEBACU_EVAL";

/* ======================================================
 * Utils
 * ====================================================== */
function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function readJsonSafe<T>(req: Request): Promise<T | null> {
  try {
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function safeUpper(v?: string | null) {
  return (v ?? "").toUpperCase();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

/* ======================================================
 * Types
 * ====================================================== */
type Body = {
  org_id?: string;
};

type OrgResolvedBy = "requested" | "first_active" | "first_any";

/* ======================================================
 * Subscription helpers
 * ====================================================== */
const STATUS_ORDER = ["ACTIVE", "TRIAL_ACTIVE", "SUSPENDED", "PAST_DUE", "PENDING_PAYMENT"] as const;

function scoreStatus(s?: string | null) {
  const up = safeUpper(s);
  const idx = STATUS_ORDER.indexOf(up as any);
  return idx === -1 ? 999 : idx;
}

async function getBestSubscription(params: {
  admin: ReturnType<typeof supabaseServiceClient>;
  customer_id: string;
  app_id: string;
}) {
  const { admin, customer_id, app_id } = params;

  const { data, error } = await admin
    .from("subscriptions")
    .select(
      "id,status,billing_frequency,next_billing_date,plan_id,created_at,updated_at,start_date,stripe_subscription_id,provider_subscription_id,required_plan_code,required_billing_frequency,stripe_schedule_id",
    )
    .eq("customer_id", customer_id)
    .eq("app_id", app_id)
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(25);

  if (error) throw new Error("DB_SUBSCRIPTIONS_FAILED");

  const rows = (data ?? []).filter((r: any) => safeUpper(r?.status) !== "REPLACED");
  if (!rows.length) return null;

  rows.sort((a: any, b: any) => {
    const sa = scoreStatus(a.status);
    const sb = scoreStatus(b.status);
    if (sa !== sb) return sa - sb;

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

/* ======================================================
 * Tenant resolution
 * ====================================================== */
async function resolveOrgForUser(params: {
  admin: ReturnType<typeof supabaseServiceClient>;
  user_id: string;
  org_id?: string | null;
}): Promise<{ org_id: string; role: string | null; resolvedBy: OrgResolvedBy }> {
  const { admin, user_id } = params;
  const requestedOrgId = (params.org_id ?? "").trim() || null;
  const uid = String(user_id);

  if (requestedOrgId) {
    if (!isUuid(requestedOrgId)) throw new Error("invalid_org_id");

    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, role")
      .eq("org_id", requestedOrgId)
      .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (error || !data?.org_id) throw new Error("FORBIDDEN");
    return { org_id: String(data.org_id), role: data.role ?? null, resolvedBy: "requested" };
  }

  const { data, error } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, role, created_at")
    .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data?.org_id) throw new Error("FORBIDDEN");
  return { org_id: String(data.org_id), role: data.role ?? null, resolvedBy: "first_active" };
}

async function resolveCustomerId(params: { admin: ReturnType<typeof supabaseServiceClient>; org_id: string }) {
  const { admin, org_id } = params;

  const { data: org, error } = await admin
    .from("debacu_eval_organizations")
    .select("customer_id")
    .eq("id", org_id)
    .maybeSingle();

  if (error || !org?.customer_id) throw new Error("FORBIDDEN");
  return String(org.customer_id);
}

/* ======================================================
 * Handler
 * ====================================================== */
export default Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "request_failed", detail: "METHOD_NOT_ALLOWED" });
  }

  const admin = supabaseServiceClient();

  try {
    const user = await requireUser(req);
    const body = (await readJsonSafe<Body>(req)) ?? {};
    const org_id = (body.org_id ?? "").trim() || null;

    const { org_id: resolvedOrgId, role, resolvedBy } = await resolveOrgForUser({
      admin,
      user_id: user.id,
      org_id,
    });

    const customer_id = await resolveCustomerId({ admin, org_id: resolvedOrgId });

    const { data: customer } = await admin.from("customers").select("*").eq("id", customer_id).maybeSingle();

    const subscription = await getBestSubscription({ admin, customer_id, app_id: APP_ID }).catch(() => null);

    let plan: any = null;
    if (subscription?.plan_id) {
      const { data: planRow } = await admin
        .from("plans")
        .select("*")
        .eq("id", subscription.plan_id)
        .maybeSingle();
      plan = planRow ?? null;
    }

    const { data: plans } = await admin
      .from("plans")
      .select("*")
      .eq("app_id", APP_ID)
      .order("price_monthly", { ascending: true });

    /* ======================================================
     * 🔵 NUEVO: construir objeto downgrade explícito
     * ====================================================== */

    let downgrade: any = null;

    const requiredPlan = subscription?.required_plan_code ?? null;
    const scheduleId = subscription?.stripe_schedule_id ?? null;

    if (requiredPlan || scheduleId) {
      downgrade = {
        scheduled: true,
        target_plan_code: requiredPlan ?? null,
        billing_frequency: subscription?.required_billing_frequency ?? null,
        effective_date: subscription?.next_billing_date ?? null,
        schedule_id: scheduleId ?? null,
      };
    }

    return json(req, 200, {
      ok: true,
      meta: {
        customer_id,
        app_id: APP_ID,
        org_id: resolvedOrgId,
        org_id_resolved_by: resolvedBy,
        member_role: role,
        server_date: toISODate(new Date()),
      },
      customer,
      subscription: subscription ?? null,
      plan,
      plans: plans ?? [],
      invoices: [],
      downgrade, // ✅ AQUÍ VA
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    console.error("debacu_eval_account_bundle error:", msg);
    return json(req, 500, { ok: false, error: "request_failed", detail: msg });
  }
});