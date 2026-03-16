// ============================================================
// DEBACU — Edge Function: debacu_eval_client_dashboard_v2
// ============================================================
// Renombrada de client_dashboard_v2 → debacu_eval_client_dashboard_v2
//
// Cambios respecto a la versión anterior:
//  ✅ Nombre normalizado a debacu_eval_*
//  ✅ loadUpcomingRiskAlerts lee de debacu_eval_risk_alerts
//     (agente nocturno) con fallback a screening_results
//  ✅ buildPropertyComparison lee gross/recovered de
//     debacu_eval_org_guest_evidence (ahora tiene property_id)
//  ✅ Resto de lógica idéntica a la versión original
// ============================================================

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

type Sb = ReturnType<typeof supabaseServiceClient>;

// ─── Resolución de org ────────────────────────────────────────────────────

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
    .select("id,status,billing_frequency,next_billing_date,plan_id,created_at,updated_at,start_date,stripe_subscription_id,provider_subscription_id")
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

// ─── Batch lookup guest index ─────────────────────────────────────────────

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

  let csvRevenueCount = 0;
  try {
    const { count, error } = await sb
      .from("debacu_eval_import_batches")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("created_at", monthStart);
    if (!error) csvRevenueCount = count ?? 0;
  } catch { /* best-effort */ }

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

// ─── Propiedades activas ──────────────────────────────────────────────────

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
// ✅ MEJORADO: ahora lee gross/recovered de debacu_eval_org_guest_evidence
// que tiene property_id desde la migración 05_migration_v3_corrected.sql

async function buildPropertyComparison(
  sb: Sb,
  orgId: string,
  properties: Array<{ id: string; name: string; location: string | null }>,
  monthStart: string,
) {
  if (properties.length === 0) return [];

  const propertyIds = properties.map((p) => p.id);

  // 1) Agregar impacto económico real desde debacu_eval_org_guest_evidence
  //    (ahora tiene property_id y datos de gross/recovered del mes)
  const { data: evidence, error: evidenceErr } = await sb
    .from("debacu_eval_org_guest_evidence")
    .select("property_id, identity_key, incident_type, economic_impact_gross, economic_recovered, economic_net_loss")
    .eq("org_id", orgId)
    .in("property_id", propertyIds)
    .gte("event_date", monthStart)
    .not("incident_type", "is", null);

  type EvidenceAcc = {
    incidents_count: number;
    gross_loss: number;
    recovered: number;
    net_loss: number;
    identity_keys: Set<string>;
  };

  const evidenceAcc = new Map<string, EvidenceAcc>();

  if (!evidenceErr && evidence?.length) {
    for (const ev of evidence as any[]) {
      const pid = String(ev.property_id ?? "");
      if (!pid || pid === "null") continue;

      const cur = evidenceAcc.get(pid) ?? {
        incidents_count: 0,
        gross_loss: 0,
        recovered: 0,
        net_loss: 0,
        identity_keys: new Set<string>(),
      };

      cur.incidents_count++;
      cur.gross_loss += asNumber(ev.economic_impact_gross);
      cur.recovered += asNumber(ev.economic_recovered);
      cur.net_loss += asNumber(ev.economic_net_loss);
      if (ev.identity_key) cur.identity_keys.add(String(ev.identity_key));

      evidenceAcc.set(pid, cur);
    }
  }

  // 2) Conteo de riesgo alto desde debacu_eval_guest_stays + guest_index
  const { data: stays, error: staysErr } = await sb
    .from("debacu_eval_guest_stays")
    .select("identity_key, property_id")
    .eq("org_id", orgId)
    .in("property_id", propertyIds)
    .gte("checkin_date", monthStart);

  const riskHighMap = new Map<string, number>();

  if (!staysErr && stays?.length) {
    const allKeys = [...new Set((stays as any[]).map((s: any) => String(s.identity_key)).filter(Boolean))];
    const guestMap = await batchGuestIndex(sb, allKeys);

    for (const stay of stays as any[]) {
      const pid = String(stay.property_id ?? "");
      const guest = guestMap.get(String(stay.identity_key ?? ""));
      if (!pid || !guest) continue;
      if (guest.risk_band === "HIGH" || guest.risk_band === "CRITICAL") {
        riskHighMap.set(pid, (riskHighMap.get(pid) ?? 0) + 1);
      }
    }
  }

  return properties
    .map((p) => {
      const ev = evidenceAcc.get(p.id);
      const net = Number((ev?.net_loss ?? 0).toFixed(2));
      const gross = Number((ev?.gross_loss ?? 0).toFixed(2));
      const recovered = Number((ev?.recovered ?? 0).toFixed(2));

      return {
        property_id: p.id,
        property_name: p.name,
        incidents_count: ev?.incidents_count ?? 0,
        gross_loss: gross,
        recovered: recovered,
        net_loss: net,
        risk_high_count: riskHighMap.get(p.id) ?? 0,
        revenue_impacted: net,
      };
    })
    .sort((a, b) => b.net_loss - a.net_loss);
}

// ─── Próximas alarmas de riesgo ───────────────────────────────────────────
// ✅ MEJORADO: lee de debacu_eval_risk_alerts (agente nocturno)
//    con fallback a screening_results si la tabla está vacía

async function loadUpcomingRiskAlerts(
  sb: Sb,
  orgId: string,
  properties: Array<{ id: string; name: string; location: string | null }>,
) {
  const today = todayISO();
  const propMap = new Map(properties.map((p) => [p.id, p.name]));

  // ── Intentar debacu_eval_risk_alerts (agente nocturno) ──────────────
  try {
    const { data, error } = await sb
      .from("debacu_eval_risk_alerts")
      .select("id, property_id, identity_key, risk_level, risk_score, checkin_date, incidents_count, total_net_loss, import_batch_id")
      .eq("org_id", orgId)
      .eq("is_resolved", false)
      .in("risk_level", ["high", "medium", "critical"])
      .gte("checkin_date", today)
      .order("checkin_date", { ascending: true })
      .limit(50);

    if (!error && data && data.length > 0) {
      // Obtener batch_ref desde import_batches
      const batchIds = [...new Set((data as any[]).map((r: any) => r.import_batch_id).filter(Boolean))];
      const batchRefMap = new Map<string, string | null>();

      if (batchIds.length > 0) {
        const { data: batches } = await sb
          .from("debacu_eval_import_batches")
          .select("id, file_name")
          .in("id", batchIds);

        if (batches) {
          for (const b of batches as any[]) {
            // Extraer nombre corto del fichero
            const parts = String(b.file_name ?? "").split("/");
            batchRefMap.set(String(b.id), parts[parts.length - 1] ?? null);
          }
        }
      }

      return (data as any[]).map((r: any) => ({
        id: String(r.id),
        checkin_date: String(r.checkin_date ?? ""),
        property_id: String(r.property_id ?? ""),
        property_name: propMap.get(String(r.property_id ?? "")) ?? "—",
        risk_band: (safeUpper(r.risk_level) === "CRITICAL" ? "HIGH" : safeUpper(r.risk_level)) as "HIGH" | "MEDIUM" | "LOW",
        identity_key: String(r.identity_key ?? ""),
        batch_ref: batchRefMap.get(String(r.import_batch_id)) ?? null,
        incidents_count: r.incidents_count != null ? Number(r.incidents_count) : null,
        total_net_loss: r.total_net_loss != null ? Number(r.total_net_loss) : null,
      }));
    }
  } catch (e) {
    console.warn("debacu_eval_risk_alerts read failed, falling back:", e);
  }

  // ── Fallback: screening_results (tabla anterior) ─────────────────────
  const { data, error } = await sb
    .from("screening_results")
    .select("id, run_id, property_id, identity_key, risk_band, checkin_date, incidents_count, total_net_loss")
    .eq("org_id", orgId)
    .in("risk_band", ["HIGH", "MEDIUM"])
    .gte("checkin_date", today)
    .order("checkin_date", { ascending: true })
    .limit(50);

  if (error || !data?.length) return [];

  const runIds = [...new Set((data as any[]).map((r: any) => r.run_id).filter(Boolean))];
  const runRefMap = new Map<string, string | null>();

  if (runIds.length > 0) {
    try {
      const { data: runs } = await sb
        .from("screening_runs")
        .select("id, source_ref")
        .in("id", runIds);

      if (runs) {
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

    const orgRes = await resolveOrgId(sb, user.id, body?.org_id ?? null);
    if (!orgRes.ok) {
      return json(req, orgRes.status, { ok: false, error: "request_failed", detail: orgRes.detail });
    }
    const orgId = orgRes.org_id;

    const entRes = await loadEntitlements(sb, orgId);
    if (!entRes.ok) {
      return json(req, entRes.status, { ok: false, error: "request_failed", detail: entRes.detail });
    }
    if (!planActive(entRes.ent)) {
      return json(req, 402, { ok: false, error: "request_failed", detail: "PLAN_NOT_ACTIVE" });
    }

    const customerId = String(entRes.ent.customer_id!);
    const monthStart = monthStartISO();

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

    const [usageSummary, properties] = await Promise.all([
      buildUsageSummary(sb, customerId, orgId, monthStart),
      loadProperties(sb, orgId),
    ]);

    const [propertyComparison, upcomingRiskAlerts] = await Promise.all([
      buildPropertyComparison(sb, orgId, properties, monthStart),
      loadUpcomingRiskAlerts(sb, orgId, properties),
    ]);

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
    console.error("debacu_eval_client_dashboard_v2 error:", msg);

    if (msg.startsWith("UNAUTHORIZED") || msg === "UNAUTHENTICATED") {
      return json(req, 401, { ok: false, error: "request_failed", detail: "UNAUTHENTICATED" });
    }
    return json(req, 500, { ok: false, error: "request_failed", detail: "internal_error" });
  }
});