import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/* ======================================================
 * ENV
 * ====================================================== */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_APP_CODE = "DEBACU_EVAL";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

/* ======================================================
 * CORS + RESP
 * ====================================================== */
function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://debacu.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-session-token",
    "Access-Control-Max-Age": "86400",
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

/* ======================================================
 * TYPES
 * ====================================================== */
type PeriodField = "evaluation_date" | "created_at";

type Metric =
  | "ECONOMIC_IMPACT_DAILY"
  | "ECONOMIC_IMPACT_MONTHLY";

type MetricsReq = {
  metric: Metric;
  period_from: string; // YYYY-MM-DD
  period_to: string; // YYYY-MM-DD
  period_field?: PeriodField;
};

type SessionResolved = {
  customer_id: string;
  customer_name: string;
  app_code: string;
};

type EvalRow = {
  evaluation_date: string | null; // date
  created_at: string; // timestamptz
  economic_impact_gross: string | number | null;
  economic_recovered: string | number | null;
  economic_net_loss: string | number | null;
};

/* ======================================================
 * Helpers
 * ====================================================== */
function assertDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("invalid_date_format");
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
 * SESSION RESOLVE (x-session-token)
 * ====================================================== */
async function resolveSessionCustomer(
  sb: ReturnType<typeof createClient>,
  token: string
): Promise<SessionResolved> {
  const { data, error } = await sb
    .from("debacu_eval_sessions")
    .select("id, customer_id, customer_name, app_code, revoked_at, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("invalid_session_token");
  if (data.revoked_at) throw new Error("session_revoked");
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now())
    throw new Error("session_expired");

  return {
    customer_id: String(data.customer_id),
    customer_name: String(data.customer_name ?? ""),
    app_code: String(data.app_code ?? DEFAULT_APP_CODE),
  };
}

/* ======================================================
 * Fetch evaluations in range
 * ====================================================== */
async function fetchEvaluationsForRange(
  sb: ReturnType<typeof createClient>,
  creatorCustomerUuid: string,
  periodField: PeriodField,
  from: string,
  to: string
): Promise<EvalRow[]> {
  if (periodField === "evaluation_date") {
    const { data, error } = await sb
      .from("debacu_evaluations")
      .select(
        [
          "evaluation_date",
          "created_at",
          "economic_impact_gross",
          "economic_recovered",
          "economic_net_loss",
        ].join(",")
      )
      .eq("creator_customer_uuid", creatorCustomerUuid)
      .gte("evaluation_date", from)
      .lte("evaluation_date", to)
      .order("evaluation_date", { ascending: true });

    if (error) throw new Error(`QUERY_FAILED:${error.message}`);
    return (data ?? []) as any;
  }

  const fromTs = `${from}T00:00:00.000Z`;
  const toTs = `${to}T23:59:59.999Z`;

  const { data, error } = await sb
    .from("debacu_evaluations")
    .select(
      [
        "evaluation_date",
        "created_at",
        "economic_impact_gross",
        "economic_recovered",
        "economic_net_loss",
      ].join(",")
    )
    .eq("creator_customer_uuid", creatorCustomerUuid)
    .gte("created_at", fromTs)
    .lte("created_at", toTs)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`QUERY_FAILED:${error.message}`);
  return (data ?? []) as any;
}

/* ======================================================
 * Aggregations
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

  // 1) Pre-fill all days (important for “línea continua”)
  const a = parseISODateOnly(from);
  const b = parseISODateOnly(to);
  for (let d = new Date(a.getTime()); d <= b; d = addDaysUTC(d, 1)) {
    const key = toISODate(d);
    map.set(key, { day: key, incidents: 0, gross: 0, recovered: 0, net: 0 });
  }

  // 2) Aggregate
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
 * MAIN
 * ====================================================== */
export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  try {
    const sessionToken = req.headers.get("x-session-token") ?? "";
    if (!sessionToken) return json(req, 401, { ok: false, error: "missing_session_token" });

    let body: MetricsReq;
    try {
      body = (await req.json()) as MetricsReq;
    } catch {
      return json(req, 400, { ok: false, error: "invalid_json" });
    }

    const metric = body.metric as Metric;
    const periodFrom = String(body.period_from ?? "");
    const periodTo = String(body.period_to ?? "");
    const periodField = (body.period_field as PeriodField) || "evaluation_date";

    assertDate(periodFrom);
    assertDate(periodTo);
    if (periodFrom > periodTo) return json(req, 400, { ok: false, error: "invalid_period_range" });

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const sess = await resolveSessionCustomer(sb, sessionToken);

    const rows = await fetchEvaluationsForRange(sb, sess.customer_id, periodField, periodFrom, periodTo);

    if (metric === "ECONOMIC_IMPACT_DAILY") {
      const { series, totals } = buildEconomicImpactDaily(rows, periodField, periodFrom, periodTo);
      return json(req, 200, {
        ok: true,
        metric,
        period_from: periodFrom,
        period_to: periodTo,
        period_field: periodField,
        totals,
        series,
      });
    }

    if (metric === "ECONOMIC_IMPACT_MONTHLY") {
      const { series, totals } = buildEconomicImpactMonthly(rows, periodField);
      return json(req, 200, {
        ok: true,
        metric,
        period_from: periodFrom,
        period_to: periodTo,
        period_field: periodField,
        totals,
        series,
      });
    }

    return json(req, 400, { ok: false, error: "unsupported_metric" });
  } catch (e: any) {
    return json(req, 500, { ok: false, error: "request_failed", detail: String(e?.message ?? e) });
  }
});
