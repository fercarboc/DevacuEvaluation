// supabase/functions/debacu_eval_economic_metrics_get/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

/* ======================================================
 * CONST
 * ====================================================== */
const DEFAULT_APP_CODE = "DEBACU_EVAL";

/* ======================================================
 * TYPES
 * ====================================================== */
type PeriodField = "evaluation_date" | "created_at";

type Metric = "ECONOMIC_IMPACT_DAILY" | "ECONOMIC_IMPACT_MONTHLY";

type MetricsReq = {
  org_id?: string | null;

  metric: Metric;
  period_from: string; // YYYY-MM-DD
  period_to: string; // YYYY-MM-DD
  period_field?: PeriodField; // default evaluation_date
};

type EntitlementsRow = {
  org_id: string;
  customer_id: string | null;
  org_name?: string | null;
  subscription_status: string | null;
  app_code?: string | null;
};

type EvalRow = {
  evaluation_date: string | null; // date
  created_at: string; // timestamptz
  economic_impact_gross: string | number | null;
  economic_recovered: string | number | null;
  economic_net_loss: string | number | null;
};

/* ======================================================
 * HELPERS
 * ====================================================== */
function assertDate(s: string, name: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`invalid_${name}`);
}

function toNumber(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function computeNet(gross: number, recovered: number, netStored: number | null) {
  if (netStored != null && Number.isFinite(netStored)) return Math.max(0, netStored);
  return Math.max(0, gross - recovered);
}

function monthKeyFromDateStr(yyyy_mm_dd: string) {
  return String(yyyy_mm_dd).slice(0, 7); // YYYY-MM
}

function parseISODateOnly(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCHours(0, 0, 0, 0);
  return dt;
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDaysUTC(d: Date, days: number) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function getRowDateKey(r: EvalRow, periodField: PeriodField): string {
  if (periodField === "evaluation_date") {
    const d = (r.evaluation_date ?? "").slice(0, 10);
    if (d) return d;
  }
  return String(r.created_at).slice(0, 10);
}

/* ======================================================
 * MULTI-ORG + ENTITLEMENTS
 * ====================================================== */
async function resolveOrgForUserOrThrow(
  admin: ReturnType<typeof createClient>,
  userId: string,
  requestedOrgId?: string | null
): Promise<string> {
  if (requestedOrgId) {
    // prefer ACTIVE si existe status
    try {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id")
        .eq("org_id", requestedOrgId)
        .eq("user_id", userId)
        .eq("status", "ACTIVE")
        .maybeSingle();

      if (error) throw error;
      if (!data?.org_id) throw new Error("FORBIDDEN_NOT_MEMBER");
      return String(data.org_id);
    } catch {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id")
        .eq("org_id", requestedOrgId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw new Error("membership_lookup_failed");
      if (!data?.org_id) throw new Error("FORBIDDEN_NOT_MEMBER");
      return String(data.org_id);
    }
  }

  // fallback determinista: primera ACTIVE, si no, primera
  try {
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, created_at")
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data?.org_id) throw new Error("FORBIDDEN_NO_ORG");
    return String(data.org_id);
  } catch {
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error("membership_lookup_failed");
    if (!data?.org_id) throw new Error("FORBIDDEN_NO_ORG");
    return String(data.org_id);
  }
}

async function loadEntitlementsOrThrow(admin: ReturnType<typeof createClient>, orgId: string) {
  // intenta vista (source of truth)
  const { data, error } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, org_name, subscription_status, app_code")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error("entitlements_failed");
  if (!data?.org_id) throw new Error("FORBIDDEN_NO_ENTITLEMENTS");
  return data as EntitlementsRow;
}

function assertOrgActiveOrThrow(ent: EntitlementsRow) {
  if (ent.subscription_status !== "ACTIVE") throw new Error("PLAN_NOT_ACTIVE");
  if (!ent.customer_id) throw new Error("FORBIDDEN_NO_CUSTOMER");
}

/* ======================================================
 * FETCH evaluations in range
 * ====================================================== */
async function fetchEvaluationsForRange(
  sb: ReturnType<typeof createClient>,
  creatorCustomerUuid: string,
  periodField: PeriodField,
  from: string,
  to: string
): Promise<EvalRow[]> {
  const cols = [
    "evaluation_date",
    "created_at",
    "economic_impact_gross",
    "economic_recovered",
    "economic_net_loss",
  ].join(",");

  if (periodField === "evaluation_date") {
    const { data, error } = await sb
      .from("debacu_evaluations")
      .select(cols)
      .eq("creator_customer_uuid", creatorCustomerUuid)
      .gte("evaluation_date", from)
      .lte("evaluation_date", to)
      .order("evaluation_date", { ascending: true });

    if (error) throw new Error("query_failed");
    return (data ?? []) as any;
  }

  const fromTs = `${from}T00:00:00.000Z`;
  const toTs = `${to}T23:59:59.999Z`;

  const { data, error } = await sb
    .from("debacu_evaluations")
    .select(cols)
    .eq("creator_customer_uuid", creatorCustomerUuid)
    .gte("created_at", fromTs)
    .lte("created_at", toTs)
    .order("created_at", { ascending: true });

  if (error) throw new Error("query_failed");
  return (data ?? []) as any;
}

/* ======================================================
 * AGGREGATIONS
 * ====================================================== */
type EconPointDaily = {
  day: string; // YYYY-MM-DD
  incidents: number;
  gross: number;
  recovered: number;
  net: number;
};

type EconPointMonthly = {
  month: string; // YYYY-MM
  incidents: number;
  gross: number;
  recovered: number;
  net: number;
};

function buildEconomicImpactDaily(rows: EvalRow[], periodField: PeriodField, from: string, to: string) {
  const map = new Map<string, EconPointDaily>();

  // pre-fill todos los días
  const a = parseISODateOnly(from);
  const b = parseISODateOnly(to);
  for (let d = new Date(a.getTime()); d <= b; d = addDaysUTC(d, 1)) {
    const key = toISODate(d);
    map.set(key, { day: key, incidents: 0, gross: 0, recovered: 0, net: 0 });
  }

  for (const r of rows) {
    const day = getRowDateKey(r, periodField);
    if (!map.has(day)) continue;

    const gross = toNumber(r.economic_impact_gross);
    const recovered = toNumber(r.economic_recovered);
    const netStored = r.economic_net_loss == null ? null : toNumber(r.economic_net_loss);
    const net = computeNet(gross, recovered, netStored);

    const cur = map.get(day)!;
    cur.incidents += 1;
    cur.gross += gross;
    cur.recovered += recovered;
    cur.net += net;
  }

  const series = Array.from(map.values()).sort((x, y) => x.day.localeCompare(y.day));
  const totals = series.reduce(
    (acc, p) => {
      acc.incidents += p.incidents;
      acc.gross += p.gross;
      acc.recovered += p.recovered;
      acc.net += p.net;
      return acc;
    },
    { incidents: 0, gross: 0, recovered: 0, net: 0 }
  );

  return { series, totals };
}

function buildEconomicImpactMonthly(rows: EvalRow[], periodField: PeriodField) {
  const map = new Map<string, EconPointMonthly>();

  for (const r of rows) {
    const day = getRowDateKey(r, periodField);
    const month = monthKeyFromDateStr(day);

    const gross = toNumber(r.economic_impact_gross);
    const recovered = toNumber(r.economic_recovered);
    const netStored = r.economic_net_loss == null ? null : toNumber(r.economic_net_loss);
    const net = computeNet(gross, recovered, netStored);

    const cur = map.get(month) ?? { month, incidents: 0, gross: 0, recovered: 0, net: 0 };
    cur.incidents += 1;
    cur.gross += gross;
    cur.recovered += recovered;
    cur.net += net;
    map.set(month, cur);
  }

  const series = Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  const totals = series.reduce(
    (acc, p) => {
      acc.incidents += p.incidents;
      acc.gross += p.gross;
      acc.recovered += p.recovered;
      acc.net += p.net;
      return acc;
    },
    { incidents: 0, gross: 0, recovered: 0, net: 0 }
  );

  return { series, totals };
}

/* ======================================================
 * ERROR MAP (STRICT)
 * ====================================================== */
function mapError(e: unknown): { status: number; detail: string } {
  const msg = String((e as any)?.message ?? e ?? "request_failed");

  if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") return { status: 401, detail: "UNAUTHENTICATED" };
  if (msg === "PLAN_NOT_ACTIVE") return { status: 402, detail: "PLAN_NOT_ACTIVE" };

  if (msg.startsWith("FORBIDDEN") || msg === "membership_lookup_failed" || msg === "entitlements_failed") {
    return { status: 403, detail: "FORBIDDEN" };
  }

  if (msg.startsWith("invalid_")) return { status: 400, detail: msg };
  if (msg === "unsupported_metric") return { status: 400, detail: "invalid_metric" };
  if (msg === "query_failed") return { status: 500, detail: "INTERNAL" };

  return { status: 500, detail: "INTERNAL" };
}

/* ======================================================
 * MAIN
 * ====================================================== */
export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "method_not_allowed", detail: "method_not_allowed" });
  }

  const admin = supabaseServiceClient();

  try {
    const user = await requireUser(req);

    let body: MetricsReq | null = null;
    try {
      body = (await req.json()) as MetricsReq;
    } catch {
      return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_json" });
    }

    const metric = body.metric as Metric;
    const periodFrom = String(body.period_from ?? "").trim();
    const periodTo = String(body.period_to ?? "").trim();
    const periodField = (body.period_field as PeriodField) || "evaluation_date";

    if (metric !== "ECONOMIC_IMPACT_DAILY" && metric !== "ECONOMIC_IMPACT_MONTHLY") {
      throw new Error("unsupported_metric");
    }

    assertDate(periodFrom, "period_from");
    assertDate(periodTo, "period_to");
    if (periodFrom > periodTo) return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_period_range" });

    const org_id = await resolveOrgForUserOrThrow(admin, user.id, body.org_id ? String(body.org_id) : null);

    const ent = await loadEntitlementsOrThrow(admin, org_id);
    assertOrgActiveOrThrow(ent);

    const customer_id = String(ent.customer_id);
    const app_code = String(ent.app_code ?? DEFAULT_APP_CODE);

    const rows = await fetchEvaluationsForRange(admin, customer_id, periodField, periodFrom, periodTo);

    if (metric === "ECONOMIC_IMPACT_DAILY") {
      const { series, totals } = buildEconomicImpactDaily(rows, periodField, periodFrom, periodTo);
      return json(req, 200, {
        ok: true,
        app_code,
        org_id,
        customer_id,
        metric,
        period_from: periodFrom,
        period_to: periodTo,
        period_field: periodField,
        totals,
        series,
      });
    }

    const { series, totals } = buildEconomicImpactMonthly(rows, periodField);
    return json(req, 200, {
      ok: true,
      app_code,
      org_id,
      customer_id,
      metric,
      period_from: periodFrom,
      period_to: periodTo,
      period_field: periodField,
      totals,
      series,
    });
  } catch (e) {
    const mapped = mapError(e);
    return json(req, mapped.status, { ok: false, error: "request_failed", detail: mapped.detail });
  }
});
