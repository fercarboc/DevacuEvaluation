// supabase/functions/client_dashboard/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" })
  : null;

const APP_ID = "DEBACU_EVAL";

// membership ACTIVE (ajusta si tu schema difiere)
const MEMBERSHIP_STATUS_COLUMN = "status";
const MEMBERSHIP_ACTIVE_VALUE = "ACTIVE";

type ReqBody = {
  org_id?: string; // recomendado: UI siempre manda org_id
};

function supabaseServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

// ✅ ISO local YYYY-MM-01 (evita offset UTC)
function monthStartLocalISODate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function safeUpper(v?: string | null) {
  return (v ?? "").toUpperCase();
}

function prettyEvent(eventType?: string | null, action?: string | null) {
  const e = safeUpper(eventType);
  const a = safeUpper(action);
  if (e === "CHECK_SIGNALS") return "Consulta";
  if (a === "INSERT" || a === "CREATE") return "Registro";
  if (a === "UPDATE") return "Actualización";
  if (a === "DELETE") return "Eliminación";
  return "Actividad";
}

function prettyDetail(entity?: string | null) {
  const en = safeUpper(entity);
  if (en === "EVALUATION_SEARCH") return "Consulta de registro";
  if (en === "EVALUATION_CREATE") return "Alta de registro";
  if (en === "EVALUATION_UPDATE") return "Edición de registro";
  return "—";
}

/** ======================================================
 * ORG + ENTITLEMENTS (source of truth)
 * ====================================================== */
async function resolveOrgIdOrThrow(
  admin: ReturnType<typeof supabaseServiceClient>,
  userId: string,
  requestedOrgId?: string | null,
) {
  if (requestedOrgId) {
    const orgId = String(requestedOrgId).trim();
    if (!isUuid(orgId)) throw new Error("invalid_org_id");

    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .eq(MEMBERSHIP_STATUS_COLUMN, MEMBERSHIP_ACTIVE_VALUE)
      .maybeSingle();

    if (error) throw new Error(`membership_lookup_failed:${error.message}`);
    if (!data?.org_id) throw new Error("FORBIDDEN");
    return orgId;
  }

  const { data, error } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, created_at")
    .eq("user_id", userId)
    .eq(MEMBERSHIP_STATUS_COLUMN, MEMBERSHIP_ACTIVE_VALUE)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`membership_lookup_failed:${error.message}`);
  if (!data?.org_id) throw new Error("FORBIDDEN");
  return String(data.org_id);
}

type EntitlementsRow = {
  org_id: string;
  customer_id: string | null;
  subscription_status: string | null;
  plan_code: string | null;
  max_users: number | null;
  seats_used: number | null;
};

async function loadEntitlementsOrThrow(
  admin: ReturnType<typeof supabaseServiceClient>,
  orgId: string,
) {
  const { data, error } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, subscription_status, plan_code, max_users, seats_used")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`entitlements_failed:${error.message}`);
  if (!data?.customer_id) throw new Error("FORBIDDEN");

  return data as EntitlementsRow;
}

function assertPlanActiveOrThrow(ent: EntitlementsRow) {
  // Dashboard normalmente debe estar accesible solo con plan activo (según tu regla).
  if (ent.subscription_status !== "ACTIVE") throw new Error("PLAN_NOT_ACTIVE");
}

/** ======================================================
 * SUBSCRIPTION + PLAN (no RPC)
 * ====================================================== */
const STATUS_ORDER = ["ACTIVE", "TRIAL_ACTIVE", "SUSPENDED", "PENDING_PAYMENT"] as const;

function scoreStatus(s?: string | null) {
  const up = safeUpper(s);
  const idx = STATUS_ORDER.indexOf(up as any);
  return idx === -1 ? 999 : idx;
}

async function getBestSubscription(
  admin: ReturnType<typeof supabaseServiceClient>,
  customer_id: string,
) {
  const { data, error } = await admin
    .from("subscriptions")
    .select(
      "id,status,billing_frequency,next_billing_date,plan_id,created_at,updated_at,start_date,stripe_subscription_id,provider_subscription_id",
    )
    .eq("customer_id", customer_id)
    .eq("app_id", APP_ID)
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(25);

  if (error) throw new Error(`subscriptions_failed:${error.message}`);

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

async function getPlan(
  admin: ReturnType<typeof supabaseServiceClient>,
  plan_id?: string | null,
) {
  if (!plan_id) return null;
  const { data, error } = await admin
    .from("plans")
    .select("id,name,code,max_queries_per_month")
    .eq("id", plan_id)
    .eq("app_id", APP_ID)
    .maybeSingle();

  if (error) throw new Error(`plan_failed:${error.message}`);
  return data as any;
}

async function fallbackNextBillingFromStripe(sub: any): Promise<string | null> {
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

/** ======================================================
 * MAIN
 * ====================================================== */
export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  const admin = supabaseServiceClient();

  try {
    const user = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as ReqBody;

    // 1) org + entitlements
    const orgId = await resolveOrgIdOrThrow(admin, user.id, body?.org_id ?? null);
    const ent = await loadEntitlementsOrThrow(admin, orgId);
    assertPlanActiveOrThrow(ent);

    const customerId = String(ent.customer_id);
    const monthStart = monthStartLocalISODate();

    // 2) best subscription + plan (si existe)
    const sub = await getBestSubscription(admin, customerId);
    const plan = sub?.plan_id ? await getPlan(admin, sub.plan_id) : null;

    let planCard: {
      name: string;
      code: string;
      status: string;
      billingFrequency: string | null;
      nextBilling: string | null;
      limit: number | null;
    } | null = null;

    if (sub) {
      let nextBilling: string | null = sub?.next_billing_date ?? null;
      if (!nextBilling) nextBilling = await fallbackNextBillingFromStripe(sub);

      const limitRaw = plan?.max_queries_per_month;
      const limit = limitRaw == null ? null : Number(limitRaw);

      planCard = {
        name: plan?.name ?? "Plan",
        code: plan?.code ?? "—",
        status: sub?.status ?? "UNKNOWN",
        billingFrequency: sub?.billing_frequency ?? null,
        nextBilling,
        limit: Number.isFinite(limit as any) ? (limit as number) : null,
      };
    } else {
      planCard = null;
    }

    // 3) queryCount (best-effort)
    let queryCount = 0;
    try {
      const { count, error } = await admin
        .from("debacu_eval_audit_log")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", customerId)
        .eq("event_type", "CHECK_SIGNALS")
        .gte("created_at", monthStart);

      if (!error) queryCount = count ?? 0;
    } catch {
      queryCount = 0;
    }

    // 4) createdThisMonth (best-effort; mantengo tus dos posibles campos)
    let createdThisMonth = 0;

    try {
      const { count, error } = await admin
        .from("debacu_evaluations")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", customerId)
        .gte("created_at", monthStart);

      if (!error) createdThisMonth = count ?? 0;
    } catch {
      // fallback
      try {
        const { count, error } = await admin
          .from("debacu_evaluations")
          .select("id", { count: "exact", head: true })
          .eq("creator_customer_id", customerId)
          .gte("created_at", monthStart);

        if (!error) createdThisMonth = count ?? 0;
      } catch {
        createdThisMonth = 0;
      }
    }

    // 5) activity (best-effort)
    let activity: Array<{
      id: string;
      date: string;
      type: string;
      label: string;
      contact: string;
      rating: number | null;
    }> = [];

    try {
      const { data: audits, error } = await admin
        .from("debacu_eval_audit_log")
        .select("id, created_at, action, event_type, entity, meta, search_value_masked")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(12);

      if (!error) {
        activity = (audits ?? []).map((r: any) => {
          let avg: number | null = null;
          const meta = r?.meta;

          if (meta && typeof meta === "object" && meta?.avg_stars != null) {
            const n = Number(meta.avg_stars);
            avg = Number.isFinite(n) ? n : null;
          } else if (typeof meta === "string") {
            // si algún registro antiguo serializó meta
            try {
              const m = JSON.parse(meta);
              const n = Number(m?.avg_stars);
              avg = Number.isFinite(n) ? n : null;
            } catch {
              avg = null;
            }
          }

          return {
            id: r.id,
            date: new Date(r.created_at).toLocaleString(),
            type: prettyEvent(r.event_type, r.action),
            label: prettyDetail(r.entity),
            contact: r.search_value_masked ?? "-",
            rating: avg,
          };
        });
      }
    } catch {
      activity = [];
    }

    return json(req, 200, {
      ok: true,
      data: {
        orgId,
        customerId,
        monthStart,
        planCard,
        queryCount,
        createdThisMonth,
        activity,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return json(req, 401, { ok: false, error: "UNAUTHENTICATED" });
    }

    if (msg === "PLAN_NOT_ACTIVE") {
      return json(req, 402, { ok: false, error: "PLAN_NOT_ACTIVE" });
    }

    if (msg.startsWith("missing_") || msg.startsWith("invalid_")) {
      return json(req, 400, { ok: false, error: msg });
    }

    if (msg === "FORBIDDEN" || msg.startsWith("forbidden_")) {
      return json(req, 403, { ok: false, error: "FORBIDDEN" });
    }

    console.error("client_dashboard error:", msg);
    return json(req, 500, { ok: false, error: "request_failed", detail: "internal_error" });
  }
});
