// supabase/functions/debacu-eval-login/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { json, preflight } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const APP_ID = "DEBACU_EVAL";

function supabaseServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function err(req: Request, status: number, detail: string) {
  return json(req, status, { ok: false, error: "request_failed", detail });
}

async function readJson(req: Request) {
  try {
    const t = await req.text();
    if (!t) return {};
    return JSON.parse(t);
  } catch {
    return {};
  }
}

function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function toYMD(v: any): string | null {
  if (!v) return null;
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : null;
}
function todayYMD(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ======================================================
 * Multi-org resolution
 * - body.org_id recomendado
 * - si no viene: primera membership ACTIVE (determinista)
 * ====================================================== */
async function resolveOrgForUser(
  sb: ReturnType<typeof supabaseServiceClient>,
  userId: string,
  orgId?: string,
) {
  const org_id_in = safeStr(orgId);

  if (org_id_in) {
    const { data, error } = await sb
      .from("debacu_eval_org_members")
      .select("org_id, role, status, created_at")
      .eq("user_id", userId)
      .eq("org_id", org_id_in)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (error) throw new Error("membership_check_failed");
    if (!data?.org_id) throw new Error("FORBIDDEN");
    return { org_id: String(data.org_id), role: data.role ?? null };
  }

  const { data, error } = await sb
    .from("debacu_eval_org_members")
    .select("org_id, role, status, created_at")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("membership_lookup_failed");
  if (!data?.org_id) throw new Error("FORBIDDEN");
  return { org_id: String(data.org_id), role: data.role ?? null };
}

async function resolveCustomerIdForOrg(sb: ReturnType<typeof supabaseServiceClient>, org_id: string) {
  // 1) entitlements view si existe
  try {
    const { data: ent, error: entErr } = await sb
      .from("debacu_eval_org_entitlements_v")
      .select("customer_id")
      .eq("org_id", org_id)
      .maybeSingle();

    if (!entErr && ent?.customer_id) return String(ent.customer_id);
  } catch {
    // ignore
  }

  // 2) organizations fallback
  const { data: org, error } = await sb
    .from("debacu_eval_organizations")
    .select("customer_id")
    .eq("id", org_id)
    .maybeSingle();

  if (error) throw new Error("org_lookup_failed");
  if (!org?.customer_id) throw new Error("FORBIDDEN");
  return String(org.customer_id);
}

async function isAdminUser(sb: ReturnType<typeof supabaseServiceClient>, userId: string) {
  const { data, error } = await sb
    .from("debacu_eval_admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return false;
  return !!data?.user_id;
}

/* ======================================================
 * Subscription resolution
 * - ACTIVE/TRIAL_ACTIVE preferente
 * - si no hay: 402 PLAN_NOT_ACTIVE
 * ====================================================== */
async function getActiveSubscription(
  sb: ReturnType<typeof supabaseServiceClient>,
  customer_id: string,
  app_id: string,
) {
  const { data: activeSubs, error } = await sb
    .from("subscriptions")
    .select("id, plan_id, status, start_date, end_date, next_billing_date, billing_frequency, created_at, updated_at")
    .eq("customer_id", customer_id)
    .eq("app_id", app_id)
    .in("status", ["ACTIVE", "TRIAL_ACTIVE"])
    .order("start_date", { ascending: false })
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw new Error("db_subscriptions_read_failed");

  if (!activeSubs || activeSubs.length === 0) {
    // Opcional: puedes mirar la última para reportar estado, pero tu estándar pide PLAN_NOT_ACTIVE
    throw new Error("PLAN_NOT_ACTIVE");
  }

  const sub = activeSubs[0] as any;
  const status = String(sub.status ?? "").toUpperCase();

  // Validación extra de trial caducada
  if (status === "TRIAL_ACTIVE") {
    const endYMD = toYMD(sub.end_date);
    const today = todayYMD();
    if (endYMD && endYMD < today) throw new Error("PLAN_NOT_ACTIVE");
  }

  return sub;
}

async function getPlanInfo(sb: ReturnType<typeof supabaseServiceClient>, plan_id: string) {
  const { data, error } = await sb
    .from("plans")
    .select("id, name, code, price_monthly")
    .eq("id", plan_id)
    .maybeSingle();

  if (error || !data) return null;
  return data as any;
}

function planTypeFromCode(codeRaw: any) {
  const code = String(codeRaw ?? "").toUpperCase();
  if (!code) return "UNKNOWN";
  if (code === "FREE") return "FREE";
  if (code.includes("BASIC")) return "BASIC";
  if (code.includes("MEDIUM")) return "MEDIUM";
  if (code.includes("PREMIUM")) return "PREMIUM";
  return code;
}

/* ======================================================
 * Main
 * ====================================================== */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return err(req, 405, "method_not_allowed");

  try {
    // ✅ JWT-only
    const user = await requireUser(req);

    const sb = supabaseServiceClient();
    const body = await readJson(req);

    // multi-org
    const org_id = safeStr(body?.org_id ?? body?.orgId ?? "");
    const { org_id: resolvedOrgId } = await resolveOrgForUser(sb, user.id, org_id || undefined);
    const customer_id = await resolveCustomerIdForOrg(sb, resolvedOrgId);

    // customer (para nombre/email, etc.)
    const { data: customer, error: custErr } = await sb
      .from("customers")
      .select("id, name, email, is_active, start_date")
      .eq("id", customer_id)
      .maybeSingle();

    if (custErr) return err(req, 500, "db_customer_read_failed");
    if (!customer?.id) return err(req, 403, "FORBIDDEN");
    if (customer.is_active === false) return err(req, 403, "FORBIDDEN");

    const adminFlag = await isAdminUser(sb, user.id);

    // subscripción / plan (si admin, no forzamos plan)
    let sub: any = null;
    let planCode: string | null = null;
    let planType = adminFlag ? "ADMIN" : "UNKNOWN";
    let monthlyFee = 0;

    if (!adminFlag) {
      sub = await getActiveSubscription(sb, customer_id, APP_ID);

      if (sub?.plan_id) {
        const plan = await getPlanInfo(sb, String(sub.plan_id));
        if (plan) {
          planCode = String(plan.code ?? "").toUpperCase() || null;
          planType = planTypeFromCode(planCode);
          monthlyFee = Number(plan.price_monthly ?? 0);
        }
      }
    }

    const user_payload = {
      id: customer_id,
      customerId: customer_id,
      orgId: resolvedOrgId,
      fullName: customer.name ?? "Cliente",
      email: String(customer.email ?? user.email ?? "").toLowerCase(),
      plan: planType,
      planCode,
      planStartDate: customer.start_date ?? (sub?.start_date ?? ""),
      monthlyFee,
      isAdmin: adminFlag,
      subscriptionStatus: sub?.status ?? (adminFlag ? "ADMIN" : null),
      billingFrequency: sub?.billing_frequency ?? null,
      subscriptionId: sub?.id ?? null,
    };

    // ✅ Ya no devolvemos session_token (legacy eliminado)
    return json(req, 200, { ok: true, user: user_payload });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    // mapping estricto
    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") return err(req, 401, "UNAUTHORIZED");
    if (msg === "FORBIDDEN") return err(req, 403, "FORBIDDEN");
    if (msg === "PLAN_NOT_ACTIVE") return err(req, 402, "PLAN_NOT_ACTIVE");
    if (msg.startsWith("missing_") || msg.startsWith("invalid_")) return err(req, 400, msg);

    return err(req, 500, "internal_error");
  }
});
