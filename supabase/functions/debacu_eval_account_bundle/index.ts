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
  org_id?: string; // ✅ UI debe mandar esto siempre (multi-org)
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
      "id,status,billing_frequency,next_billing_date,plan_id,created_at,updated_at,start_date,stripe_subscription_id,provider_subscription_id",
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
 * Tenant (org) resolution
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

    // preferimos ACTIVE; toleramos membership existente si el status está raro
    try {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id, role")
        .eq("org_id", requestedOrgId)
        .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
        .eq("status", "ACTIVE")
        .maybeSingle();

      if (error) throw error;
      if (!data?.org_id) throw new Error("FORBIDDEN");
      return { org_id: String(data.org_id), role: (data.role ?? null) as string | null, resolvedBy: "requested" };
    } catch {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id, role")
        .eq("org_id", requestedOrgId)
        .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
        .maybeSingle();

      if (error || !data?.org_id) throw new Error("FORBIDDEN");
      return { org_id: String(data.org_id), role: (data.role ?? null) as string | null, resolvedBy: "requested" };
    }
  }

  // fallback determinista: primera ACTIVE; si no, primera por created_at
  try {
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, role, created_at")
      .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data?.org_id) throw new Error("FORBIDDEN");
    return { org_id: String(data.org_id), role: (data.role ?? null) as string | null, resolvedBy: "first_active" };
  } catch {
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, role, created_at")
      .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data?.org_id) throw new Error("FORBIDDEN");
    return { org_id: String(data.org_id), role: (data.role ?? null) as string | null, resolvedBy: "first_any" };
  }
}

async function resolveCustomerId(params: { admin: ReturnType<typeof supabaseServiceClient>; org_id: string }) {
  const { admin, org_id } = params;

  // 1) preferimos entitlements view si existe
  try {
    const { data: ent, error: entErr } = await admin
      .from("debacu_eval_org_entitlements_v")
      .select("customer_id")
      .eq("org_id", org_id)
      .maybeSingle();

    if (!entErr && ent?.customer_id) return String(ent.customer_id);
  } catch {
    // vista puede no existir -> fallback
  }

  // 2) fallback organizations
  const { data: org, error: orgErr } = await admin
    .from("debacu_eval_organizations")
    .select("customer_id")
    .eq("id", org_id)
    .maybeSingle();

  if (orgErr) throw new Error("DB_ORG_LOOKUP_FAILED");
  if (!org?.customer_id) throw new Error("FORBIDDEN");
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
    // ✅ JWT-only
    const user = await requireUser(req);

    const body = (await readJsonSafe<Body>(req)) ?? {};
    const org_id = (body.org_id ?? "").trim() || null;

    // 1) tenant: org + role (ACTIVE membership)
    const { org_id: resolvedOrgId, role, resolvedBy: org_id_resolved_by } = await resolveOrgForUser({
      admin,
      user_id: user.id,
      org_id,
    });

    // 2) customer_id asociado al org
    const customer_id = await resolveCustomerId({ admin, org_id: resolvedOrgId });

    console.log(
      JSON.stringify({
        fn: "debacu_eval_account_bundle",
        stage: "start",
        user_id: user.id,
        org_id: resolvedOrgId,
        customer_id,
        app_id: APP_ID,
      }),
    );

    // 3) customer
    const { data: customer, error: custErr } = await admin
      .from("customers")
      .select(
        "id, name, nif, address, city, province, country, phone, email, iban, swift, bank_name, bank_address, is_active, app_id, updated_at, created_at",
      )
      .eq("id", customer_id)
      .maybeSingle();

    if (custErr) return json(req, 500, { ok: false, error: "request_failed", detail: "DB_CUSTOMERS_READ_FAILED" });
    if (!customer) return json(req, 404, { ok: false, error: "request_failed", detail: "CUSTOMER_NOT_FOUND" });

    // 4) hotel_profile (best-effort)
    let hotel_profile: any = null;
    const { data: hp, error: hpErr } = await admin
      .from("debacu_hotel_profile")
      .select(
        "customer_id,hotel_category,adr_real,adr_reference,adr_effective,monthly_stays_estimated,season_mult_high,season_mult_low,updated_at",
      )
      .eq("customer_id", customer_id)
      .maybeSingle();

    if (!hpErr) hotel_profile = hp ?? null;

    // 5) subscription + plan
    const subscription = await getBestSubscription({ admin, customer_id, app_id: APP_ID }).catch(() => null);

    let plan: any = null;
    if (subscription?.plan_id) {
      const { data: planRow, error: planErr } = await admin
        .from("plans")
        .select("id, app_id, code, name, price_monthly, price_yearly, max_queries_per_month")
        .eq("id", subscription.plan_id)
        .maybeSingle();

      if (planErr) return json(req, 500, { ok: false, error: "request_failed", detail: "DB_PLAN_READ_FAILED" });
      plan = planRow ?? null;
    }

    // 6) plans disponibles
    const { data: plans, error: plansErr } = await admin
      .from("plans")
      .select("id, app_id, code, name, price_monthly, price_yearly, max_queries_per_month")
      .eq("app_id", APP_ID)
      .order("price_monthly", { ascending: true });

    if (plansErr) return json(req, 500, { ok: false, error: "request_failed", detail: "DB_PLANS_READ_FAILED" });

    // 7) invoices (solo si procede)
    const billingFreq = safeUpper(subscription?.billing_frequency ?? "");
    const planCode = safeUpper(plan?.code ?? "");
    const subStatus = safeUpper(subscription?.status ?? "");

    const isFreeLike =
      planCode === "FREE" ||
      billingFreq === "FREE_TRIAL" ||
      Number(plan?.price_monthly ?? 0) === 0 ||
      Number(plan?.price_yearly ?? 0) === 0;

    let invoices: any[] = [];
    if (!isFreeLike && (subStatus === "ACTIVE" || subStatus === "PAST_DUE")) {
      const { data: inv, error: invErr } = await admin
        .from("debacu_eval_invoices")
        .select("*")
        .eq("customer_id", customer_id)
        .order("invoice_created_at", { ascending: false })
        .limit(50);

      if (invErr) return json(req, 500, { ok: false, error: "request_failed", detail: "DB_INVOICES_READ_FAILED" });

      invoices = (inv ?? []).filter((r: any) => String(r.status ?? "").toLowerCase() === "paid");
    }

    console.log(
      JSON.stringify({
        fn: "debacu_eval_account_bundle",
        stage: "ok",
        user_id: user.id,
        org_id: resolvedOrgId,
        customer_id,
        status: 200,
      }),
    );

    return json(req, 200, {
      ok: true,
      meta: {
        customer_id,
        app_id: APP_ID,
        org_id: resolvedOrgId,
        org_id_resolved_by,
        member_role: role,
        server_date: toISODate(new Date()),
      },
      customer,
      hotel_profile,
      subscription: subscription ?? null,
      plan,
      plans: plans ?? [],
      invoices,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return json(req, 401, { ok: false, error: "request_failed", detail: "UNAUTHENTICATED" });
    }

    if (msg === "invalid_org_id") {
      return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_org_id" });
    }

    if (msg === "FORBIDDEN") {
      return json(req, 403, { ok: false, error: "request_failed", detail: "FORBIDDEN" });
    }

    if (
      msg === "DB_MEMBERSHIP_FAILED" ||
      msg === "DB_ORG_LOOKUP_FAILED" ||
      msg === "DB_SUBSCRIPTIONS_FAILED" ||
      msg === "DB_ORG_LOOKUP_FAILED"
    ) {
      return json(req, 500, { ok: false, error: "request_failed", detail: "DB_ERROR" });
    }

    console.error("debacu_eval_account_bundle error:", msg);
    return json(req, 500, { ok: false, error: "request_failed", detail: "INTERNAL_ERROR" });
  }
});