// supabase/functions/debacu_eval_account_bundle/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const APP_ID = "DEBACU_EVAL";

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
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`MISSING_ENV:${name}`);
  return v;
}

function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function readJson(req: Request) {
  const t = await req.text();
  if (!t) return {};
  try {
    return JSON.parse(t);
  } catch {
    return {};
  }
}

function logLine(payload: Record<string, unknown>) {
  console.log(JSON.stringify(payload));
}

/** ======================================================
 * Clients
 * ====================================================== */
function userClient(req: Request, supabaseUrl: string, anonKey: string) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
}

function adminClient(supabaseUrl: string, serviceKey: string) {
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** ======================================================
 * AuthN (JWT)
 * ====================================================== */
async function requireJwtUser(sbUser: ReturnType<typeof createClient>) {
  const { data, error } = await sbUser.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");
  return data.user;
}

/** ======================================================
 * AuthZ / Tenant
 * ====================================================== */
async function requireOrgMemberAndCustomerId(params: {
  admin: ReturnType<typeof createClient>;
  user_id: string;
}) {
  const { admin, user_id } = params;

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

    if (entErr) {
      logLine({ fn: "debacu_eval_account_bundle", stage: "entitlements_err", org_id, detail: entErr.message });
    } else if (ent?.customer_id) {
      customer_id = String(ent.customer_id);
    }
  } catch (e) {
    // si la vista no existe, no pasa nada
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

/** ======================================================
 * Subscription helpers
 * ====================================================== */
const STATUS_ORDER = ["ACTIVE", "TRIAL_ACTIVE", "SUSPENDED", "PAST_DUE", "PENDING_PAYMENT"] as const;

function safeUpper(v?: string | null) {
  return (v ?? "").toUpperCase();
}
function scoreStatus(s?: string | null) {
  const up = safeUpper(s);
  const idx = STATUS_ORDER.indexOf(up as any);
  return idx === -1 ? 999 : idx;
}

async function getBestSubscription(params: {
  admin: ReturnType<typeof createClient>;
  customer_id: string;
  app_id: string;
}) {
  const { admin, customer_id, app_id } = params;

  const { data, error } = await admin
    .from("subscriptions")
    .select("id,status,billing_frequency,next_billing_date,plan_id,created_at,updated_at,start_date,stripe_subscription_id,provider_subscription_id")
    .eq("customer_id", customer_id)
    .eq("app_id", app_id)
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(25);

  if (error) throw new Error(`DB_SUBSCRIPTIONS:${error.message}`);

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

/** ======================================================
 * Handler
 * ====================================================== */
Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const FN = "debacu_eval_account_bundle";

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json(origin, 405, { ok: false, error: "method_not_allowed" });
  }

  try {
    const SUPABASE_URL = mustEnv("SUPABASE_URL");
    const SERVICE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = mustEnv("SUPABASE_ANON_KEY");

    const admin = adminClient(SUPABASE_URL, SERVICE_KEY);
    const sbUser = userClient(req, SUPABASE_URL, ANON_KEY);

    // 1) JWT
    const user = await requireJwtUser(sbUser);

    // 2) tenant
    const { org_id, role, customer_id } = await requireOrgMemberAndCustomerId({
      admin,
      user_id: user.id,
    });

    // body opcional solo para compatibilidad (no usamos app_id del body)
    await readJson(req).catch(() => ({}));

    logLine({ fn: FN, stage: "start", user_id: user.id, org_id, customer_id, app_id: APP_ID });

    // 3) customer
    const { data: customer, error: custErr } = await admin
      .from("customers")
      .select("id, name, nif, address, city, province, country, phone, email, iban, swift, bank_name, bank_address, is_active, app_id, updated_at, created_at")
      .eq("id", customer_id)
      .maybeSingle();

    if (custErr) return json(origin, 500, { ok: false, error: "db_error_customers", detail: custErr.message });
    if (!customer) return json(origin, 404, { ok: false, error: "customer_not_found" });

    // 4) hotel_profile (best-effort)
    let hotel_profile: any = null;
    const { data: hp, error: hpErr } = await admin
      .from("debacu_hotel_profile")
      .select("customer_id,hotel_category,adr_real,adr_reference,adr_effective,monthly_stays_estimated,season_mult_high,season_mult_low,updated_at")
      .eq("customer_id", customer_id)
      .maybeSingle();

    if (!hpErr) hotel_profile = hp ?? null;
    else logLine({ fn: FN, stage: "hotel_profile_err", detail: hpErr.message });

    // 5) subscription + plan
    const subRow = await getBestSubscription({ admin, customer_id, app_id: APP_ID }).catch((e) => {
      logLine({ fn: FN, stage: "sub_err", detail: String(e?.message ?? e) });
      return null;
    });

    let plan: any = null;
    if (subRow?.plan_id) {
      const { data: planRow, error: planErr } = await admin
        .from("plans")
        .select("id, app_id, code, name, price_monthly, price_yearly, max_queries_per_month")
        .eq("id", subRow.plan_id)
        .maybeSingle();

      if (planErr) return json(origin, 500, { ok: false, error: "db_error_plan", detail: planErr.message });
      plan = planRow ?? null;
    }

    // 6) plans disponibles
    const { data: plans, error: plansErr } = await admin
      .from("plans")
      .select("id, app_id, code, name, price_monthly, price_yearly, max_queries_per_month")
      .eq("app_id", APP_ID)
      .order("price_monthly", { ascending: true });

    if (plansErr) return json(origin, 500, { ok: false, error: "db_error_plans", detail: plansErr.message });

    // 7) invoices (solo si procede)
    const billingFreq = safeUpper(subRow?.billing_frequency ?? "");
    const planCode = safeUpper(plan?.code ?? "");
    const subStatus = safeUpper(subRow?.status ?? "");

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

      if (invErr) return json(origin, 500, { ok: false, error: "db_error_invoices", detail: invErr.message });
      invoices = (inv ?? []).filter((r: any) => String(r.status ?? "").toLowerCase() === "paid");
    }

    logLine({ fn: FN, stage: "ok", user_id: user.id, org_id, customer_id, app_id: APP_ID, status: 200 });

    return json(origin, 200, {
      ok: true,
      meta: {
        customer_id,
        app_id: APP_ID,
        org_id,
        member_role: role,
        server_date: toISODate(new Date()),
      },
      customer,
      hotel_profile,
      subscription: subRow ?? null,
      plan,
      plans: plans ?? [],
      invoices,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    const code =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg.startsWith("FORBIDDEN") || msg.startsWith("MEMBERSHIP_FAILED") || msg.startsWith("ORG_LOOKUP_FAILED")
        ? 403
        : msg.startsWith("MISSING_ENV:")
        ? 500
        : 500;

    logLine({ fn: "debacu_eval_account_bundle", stage: "error", status: code, detail: msg });

    return json(origin, code, { ok: false, error: "request_failed", detail: msg });
  }
});
