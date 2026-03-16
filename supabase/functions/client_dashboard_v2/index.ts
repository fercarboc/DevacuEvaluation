// supabase/functions/client_dashboard_v2/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" })
  : null;

const APP_ID = "DEBACU_EVAL";

// ─── Utils ────────────────────────────────────────────────────────────────

function isUuid(v: unknown): v is string {
  if (typeof v !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function safeUpper(v?: string | null) {
  return (v ?? "").toUpperCase();
}

function asNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

function monthStartISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Resolución de org ────────────────────────────────────────────────────

type Sb = ReturnType<typeof supabaseServiceClient>;

async function resolveOrgId(
  sb: Sb,
  authUserId: string,
  requestedOrgId?: string | null,
): Promise<{ ok: true; org_id: string } | { ok: false; status: number; detail: string }> {
  if (requestedOrgId) {
    if (!isUuid(requestedOrgId)) return { ok: false, status: 400, detail: "invalid_org_id" };

    const { data, error } = await sb
      .from("debacu_eval_org_members")
      .select("org_id")
      .eq("auth_user_id", authUserId)
      .eq("org_id", requestedOrgId)
      .eq("status", "ACTIVE")
      .limit(1)
      .maybeSingle();

    if (error) return { ok: false, status: 500, detail: "DB_ERROR" };
    if (!data?.org_id) return { ok: false, status: 403, detail: "NO_ORG_MEMBERSHIP" };
    return { ok: true, org_id: String(data.org_id) };
  }

  const { data, error } = await sb
    .from("debacu_eval_org_members")
    .select("org_id, created_at")
    .eq("auth_user_id", authUserId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false, status: 500, detail: "DB_ERROR" };
  if (!data?.org_id) return { ok: false, status: 403, detail: "NO_ORG_MEMBERSHIP" };
  return { ok: true, org_id: String(data.org_id) };
}

// ─── Entitlements ─────────────────────────────────────────────────────────

type EntRow = {
  org_id: string;
  customer_id: string | null;
  subscription_status: string | null;
  plan_code: string | null;
  max_users: number | null;
  seats_used: number | null;
};

async function loadEntitlements(
  sb: Sb,
  orgId: string,
): Promise<{ ok: true; ent: EntRow } | { ok: false; status: number; detail: string }> {
  const { data, error } = await sb
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, subscription_status, plan_code, max_users, seats_used")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, detail: "DB_ERROR" };
  if (!data?.customer_id) return { ok: false, status: 403, detail: "NO_ENTITLEMENTS" };
  return { ok: true, ent: data as EntRow };
}

function planActive(ent: EntRow): boolean {
  const st = safeUpper(ent.subscription_status);
  return st === "ACTIVE" || st === "TRIAL_ACTIVE";
}

// ─── Plan card ────────────────────────────────────────────────────────────

const STATUS_ORDER = ["ACTIVE", "TRIAL_ACTIVE", "SUSPENDED", "PENDING_PAYMENT"] as const;

function scoreStatus(s?: string | null) {
  const idx = STATUS_ORDER.indexOf(safeUpper(s) as any);
  return idx === -1 ? 999 : idx;
}

async function getBestSubscription(sb: Sb, customerId: string) {
  const { data, error } = await sb
    .from("subscriptions")
    .select(
      "id,status,billing_frequency,next_billing_date,plan_id,created_at,updated_at,start_date,stripe_subscription_id,provider_subscription_id",
    )
    .eq("customer_id", customerId)
    .eq("app_id", APP_ID)
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(25);

  if (error) throw new Error(`subscriptions_failed:${error.message}`);

  const rows = (data ?? []).filter((r: any) => safeUpper(r?.status) !== "REPLACED");
  if (!rows.length) return null;

  rows.sort((a: any, b: any) => {
    const sa = scoreStatus(a.status);
    const sb2 = scoreStatus(b.status);
    if (sa !== sb2) return sa - sb2;
    const da = String(a.start_date ?? "");
    const db = String(b.start_date ?? "");
    if (da && db && da !== db) return db.localeCompare(da);
    const ua = String(a.updated_at ?? "");
    const ub = String(b.updated_at ?? "");
    if (ua && ub && ua !== ub) return ub.localeCompare(ua);
    return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
  });

  return rows[0] as any;
}

async function getPlan(sb: Sb, planId?: string | null) {
  if (!planId) return null;
  const { data, error } = await sb
    .from("plans")
    .select("id,name,code,max_queries_per_month")
    .eq("id", planId)
    .eq("app_id", APP_ID)
    .maybeSingle();
  if (error) return null;
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

// ─── Helper: lookup en debacu_eval_guest_index por lotes ─────────────────
//
// debacu_eval_guest_index es la tabla canónica para datos de riesgo.
// No tiene org_id — es un índice global por identity_key.
// El filtro por org/propiedad viene siempre de debacu_eval_guest_stays.

const BATCH_SIZE = 200;

async function batchGuestIndex(
  sb: Sb,
  identityKeys: string[],
): Promise<Map<string, { risk_band: string; incidents_count: number; total_net_loss: number }>> {
  const result = new Map<string, { risk_band: string; incidents_count: number; total_net_loss: number }>();
  if (!identityKeys.length) return result;

  for (let i = 0; i < identityKeys.length; i += BATCH_SIZE) {
    const chunk = identityKeys.slice(i, i + BATCH_SIZE);
    const { data, error } = await sb
      .from("debacu_eval_guest_index")
      .select("identity_key, risk_band, incidents_count, total_net_loss")
      .in("identity_key", chunk);

    if (!error && data) {
      for (const g of data as any[]) {
        result.set(String(g.identity_key), {
          risk_band: safeUpper(g.risk_band),
          incidents_count: asNumber(g.incidents_count),
          total_net_loss: asNumber(g.total_net_loss),
        });
      }
    }
  }

  return result;
}

// ─── Usage summary ────────────────────────────────────────────────────────

async function buildUsageSummary(sb: Sb, customerId: string, orgId: string, monthStart: string) {
  // Consultas manuales de screening (CHECK_SIGNALS en audit log)
  let manualQueryCount = 0;
  try {
    const { count, error } = await sb
      .from("debacu_eval_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .eq("event_type", "CHECK_SIGNALS")
      .gte("created_at", monthStart);
    if (!error) manualQueryCount = count ?? 0;
  } catch { /* best-effort */ }

  // Lotes CSV de screening
  let csvScreeningCount = 0;
  try {
    const { count, error } = await sb
      .from("screening_runs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .in("run_type", ["FUTURE_BOOKINGS", "HISTORICAL_STAYS", "HISTORICAL_BOOKINGS", "INHOUSE_TODAY"])
      .gte("created_at", monthStart);
    if (!error) csvScreeningCount = count ?? 0;
  } catch { /* best-effort */ }

  // Subidas CSV de revenue
  let csvRevenueCount = 0;
  try {
    const { count, error } = await sb
      .from("debacu_eval_import_batches")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("created_at", monthStart);
    if (!error) csvRevenueCount = count ?? 0;
  } catch { /* best-effort */ }

  // Estancias registradas este mes (debacu_eval_guest_stays es la tabla canónica)
  let createdThisMonth = 0;
  try {
    const { count, error } = await sb
      .from("debacu_eval_guest_stays")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("created_at", monthStart);
    if (!error) createdThisMonth = count ?? 0;
  } catch { /* best-effort */ }

  return {
    plan_query_total: manualQueryCount + csvScreeningCount,
    manual_query_count: manualQueryCount,
    csv_screening_count: csvScreeningCount,
    csv_revenue_count: csvRevenueCount,
    created_this_month: createdThisMonth,
  };
}

// ─── Propiedades activas de la org ────────────────────────────────────────

async function loadProperties(sb: Sb, orgId: string) {
  const { data, error } = await sb
    .from("debacu_eval_properties")
    .select("id, name, city")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) return [];

  return (data ?? []).map((p: any) => ({
    id: String(p.id),
    name: String(p.name),
    location: (p.city ?? null) as string | null,
  }));
}

// ─── Comparativa entre propiedades ────────────────────────────────────────
//
// Fuente: debacu_eval_guest_stays (org/propiedad/periodo) + debacu_eval_guest_index (riesgo/impacto)
// Nota: total_net_loss en guest_index es el impacto acumulado histórico del huésped (no del mes).
// Aquí lo usamos como indicador de riesgo relativo entre propiedades.

async function buildPropertyComparison(
  sb: Sb,
  orgId: string,
  properties: Array<{ id: string; name: string; location: string | null }>,
  monthStart: string,
) {
  if (properties.length === 0) return [];

  const propertyIds = properties.map((p) => p.id);

  // 1) Estancias del mes por org/propiedad
  const { data: stays, error: staysErr } = await sb
    .from("debacu_eval_guest_stays")
    .select("identity_key, property_id")
    .eq("org_id", orgId)
    .in("property_id", propertyIds)
    .gte("checkin_date", monthStart);

  if (staysErr || !stays?.length) {
    return properties.map((p) => ({
      property_id: p.id,
      property_name: p.name,
      incidents_count: 0,
      gross_loss: 0,
      recovered: 0,
      net_loss: 0,
      risk_high_count: 0,
      revenue_impacted: 0,
    }));
  }

  // 2) Lookup en guest_index para los identity_keys encontrados
  const allKeys = [...new Set((stays as any[]).map((s: any) => String(s.identity_key)).filter(Boolean))];
  const guestMap = await batchGuestIndex(sb, allKeys);

  // 3) Acumular por propiedad
  type Acc = {
    incidents_count: number;
    net_loss: number;
    risk_high_count: number;
  };

  const acc = new Map<string, Acc>();

  for (const stay of stays as any[]) {
    const pid = String(stay.property_id ?? "");
    const guest = guestMap.get(String(stay.identity_key ?? ""));
    if (!pid || !guest) continue;

    const isIncident = guest.incidents_count > 0 || guest.risk_band === "HIGH" || guest.risk_band === "MEDIUM";
    if (!isIncident) continue;

    const cur = acc.get(pid) ?? { incidents_count: 0, net_loss: 0, risk_high_count: 0 };
    cur.incidents_count += 1;
    cur.net_loss += guest.total_net_loss;
    if (guest.risk_band === "HIGH") cur.risk_high_count += 1;
    acc.set(pid, cur);
  }

  return properties
    .map((p) => {
      const a = acc.get(p.id);
      const net = Number((a?.net_loss ?? 0).toFixed(2));
      return {
        property_id: p.id,
        property_name: p.name,
        incidents_count: a?.incidents_count ?? 0,
        // gross_loss y recovered no están disponibles en debacu_eval_guest_index.
        // Se mostrarán en 0 hasta que el modelo tenga esos campos desagregados.
        gross_loss: net,
        recovered: 0,
        net_loss: net,
        risk_high_count: a?.risk_high_count ?? 0,
        revenue_impacted: net,
      };
    })
    .sort((a, b) => b.net_loss - a.net_loss);
}

// ─── Próximas alarmas de riesgo ───────────────────────────────────────────
//
// Fuente: screening_results (ya tiene checkin_date, identity_key, risk_band, org_id, property_id)
// Los datos de impacto (incidents_count, total_net_loss) vienen del propio screening_results,
// que los copia de debacu_eval_guest_index en el momento del run.

async function loadUpcomingRiskAlerts(
  sb: Sb,
  orgId: string,
  properties: Array<{ id: string; name: string; location: string | null }>,
) {
  const today = todayISO();
  const propMap = new Map(properties.map((p) => [p.id, p.name]));

  const { data, error } = await sb
    .from("screening_results")
    .select("id, run_id, property_id, identity_key, risk_band, checkin_date, incidents_count, total_net_loss")
    .eq("org_id", orgId)
    .in("risk_band", ["HIGH", "MEDIUM"])
    .gte("checkin_date", today)
    .order("checkin_date", { ascending: true })
    .limit(50);

  if (error || !data?.length) return [];

  // Obtener source_ref (batch_ref) de los runs
  const runIds = [...new Set((data as any[]).map((r: any) => r.run_id).filter(Boolean))];
  const runRefMap = new Map<string, string | null>();

  if (runIds.length > 0) {
    try {
      const { data: runs, error: runErr } = await sb
        .from("screening_runs")
        .select("id, source_ref")
        .in("id", runIds);

      if (!runErr && runs) {
        for (const r of runs as any[]) {
          runRefMap.set(String(r.id), r.source_ref ?? null);
        }
      }
    } catch { /* best-effort */ }
  }

  return (data as any[]).map((r: any) => ({
    id: String(r.id),
    checkin_date: String(r.checkin_date ?? ""),
    property_id: String(r.property_id ?? ""),
    property_name: propMap.get(String(r.property_id ?? "")) ?? "—",
    risk_band: safeUpper(r.risk_band) as "HIGH" | "MEDIUM" | "LOW",
    identity_key: String(r.identity_key ?? ""),
    batch_ref: runRefMap.get(String(r.run_id)) ?? null,
    incidents_count: r.incidents_count != null ? Number(r.incidents_count) : null,
    total_net_loss: r.total_net_loss != null ? Number(r.total_net_loss) : null,
  }));
}

// ─── Main ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "request_failed", detail: "method_not_allowed" });
  }

  let user: any;
  try {
    user = await requireUser(req);
  } catch {
    return json(req, 401, { ok: false, error: "request_failed", detail: "UNAUTHENTICATED" });
  }

  const sb = supabaseServiceClient();

  try {
    const body = await req.json().catch(() => ({} as any));

    // 1) Org
    const orgRes = await resolveOrgId(sb, user.id, body?.org_id ?? null);
    if (!orgRes.ok) {
      return json(req, orgRes.status, { ok: false, error: "request_failed", detail: orgRes.detail });
    }
    const orgId = orgRes.org_id;

    // 2) Entitlements
    const entRes = await loadEntitlements(sb, orgId);
    if (!entRes.ok) {
      return json(req, entRes.status, { ok: false, error: "request_failed", detail: entRes.detail });
    }
    if (!planActive(entRes.ent)) {
      return json(req, 402, { ok: false, error: "request_failed", detail: "PLAN_NOT_ACTIVE" });
    }

    const customerId = String(entRes.ent.customer_id!);
    const monthStart = monthStartISO();

    // 3) Plan card
    const sub = await getBestSubscription(sb, customerId).catch(() => null);
    const plan = sub?.plan_id ? await getPlan(sb, sub.plan_id) : null;

    let planCard: {
      name: string;
      status: string;
      billing_frequency: string | null;
      next_billing: string | null;
      limit: number | null;
    } | null = null;

    if (sub) {
      let nextBilling: string | null = sub?.next_billing_date ?? null;
      if (!nextBilling) nextBilling = await fallbackNextBillingFromStripe(sub);
      const limitRaw = plan?.max_queries_per_month;
      const limit = limitRaw == null ? null : Number(limitRaw);
      planCard = {
        name: plan?.name ?? "Plan",
        status: sub?.status ?? "UNKNOWN",
        billing_frequency: sub?.billing_frequency ?? null,
        next_billing: nextBilling,
        limit: Number.isFinite(limit as any) ? (limit as number) : null,
      };
    }

    // 4) Usage summary
    const usageSummary = await buildUsageSummary(sb, customerId, orgId, monthStart);

    // 5) Propiedades activas
    const properties = await loadProperties(sb, orgId);

    // 6) Comparativa entre propiedades
    const propertyComparison = await buildPropertyComparison(sb, orgId, properties, monthStart);

    // 7) Próximas alarmas
    const upcomingRiskAlerts = await loadUpcomingRiskAlerts(sb, orgId, properties);

    return json(req, 200, {
      ok: true,
      data: {
        customer_id: customerId,
        month_start: monthStart,
        org_summary: { plan_card: planCard },
        usage_summary: usageSummary,
        properties,
        property_comparison: propertyComparison,
        upcoming_risk_alerts: upcomingRiskAlerts,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "");
    console.error("client_dashboard_v2 error:", msg);

    if (msg.startsWith("UNAUTHORIZED") || msg === "UNAUTHENTICATED") {
      return json(req, 401, { ok: false, error: "request_failed", detail: "UNAUTHENTICATED" });
    }
    return json(req, 500, { ok: false, error: "request_failed", detail: "internal_error" });
  }
});
