import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/* ======================================================
 * ENV
 * ====================================================== */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
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
    // ✅ JWT-only: quitamos x-session-token
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

type BuildReq = {
  period_from: string; // YYYY-MM-DD
  period_to: string; // YYYY-MM-DD
  period_field?: PeriodField; // preferred
  filters?: { period_field?: PeriodField }; // compat con front legacy
};

type EvalRow = {
  rating: number | null;
  evaluation_date: string | null; // date
  created_at: string; // timestamptz
  economic_impact_gross: string | number | null;
  economic_recovered: string | number | null;
  economic_net_loss: string | number | null;

  creator_customer_uuid: string | null;
  customer_id: string | null;
};

export type WeeklySeriesRow = {
  day: string; // YYYY-MM-DD
  incidents: number;

  risk_high: number;
  risk_medium: number;
  risk_low: number;

  gross: number;
  recovered: number;
  net: number;
};

type EntitlementsRow = {
  org_id: string;
  customer_id: string;
  seats_used: number;
  plan_code: string | null;
  max_users: number | null;
  subscription_status: string | null; // ACTIVE | null
};

/* ======================================================
 * HELPERS
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

function getRowDateKey(r: EvalRow, periodField: PeriodField): string {
  if (periodField === "evaluation_date") {
    const d = (r.evaluation_date ?? "").slice(0, 10);
    if (d) return d;
  }
  return String(r.created_at).slice(0, 10);
}

function riskBucketFromRating(rating: number | null) {
  const v = Number(rating);
  if (!Number.isFinite(v)) return "UNKNOWN";
  if (v <= 2) return "HIGH";
  if (v === 3) return "MEDIUM";
  return "LOW";
}

function addDaysUtc(isoDay: string, delta: number) {
  const d = new Date(`${isoDay}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function fillMissingDays(rows: WeeklySeriesRow[], from: string, to: string): WeeklySeriesRow[] {
  const map = new Map<string, WeeklySeriesRow>();
  for (const r of rows) map.set(r.day, r);

  const out: WeeklySeriesRow[] = [];
  for (let day = from; day <= to; day = addDaysUtc(day, 1)) {
    out.push(
      map.get(day) ?? {
        day,
        incidents: 0,
        risk_high: 0,
        risk_medium: 0,
        risk_low: 0,
        gross: 0,
        recovered: 0,
        net: 0,
      }
    );
  }
  return out;
}

/* ======================================================
 * SUPABASE CLIENTS
 * ====================================================== */
function sbAdmin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

// ✅ JWT-only: user client con ANON + Authorization del request
function sbUser(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: auth } },
  });
}

async function getAuthUserIdOrThrow(sb: ReturnType<typeof sbUser>) {
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user?.id) throw new Error("UNAUTHENTICATED");
  return data.user.id;
}

/* ======================================================
 * AUTH CONTEXT: user -> org -> entitlements -> customer_id
 * ====================================================== */
async function resolveOrgIdForUserOrThrow(
  admin: ReturnType<typeof sbAdmin>,
  userId: string
): Promise<string> {
  const { data, error } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.org_id) throw new Error("NO_ORG_MEMBERSHIP");
  return String(data.org_id);
}

async function getEntitlementsForOrgOrThrow(
  admin: ReturnType<typeof sbAdmin>,
  orgId: string
): Promise<EntitlementsRow> {
  const { data, error } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, seats_used, plan_code, max_users, subscription_status")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.org_id || !data?.customer_id) throw new Error("ORG_NOT_FOUND");
  return data as unknown as EntitlementsRow;
}

function assertSubscriptionActiveOrThrow(ent: EntitlementsRow) {
  // Tu view hoy devuelve ACTIVE o null. Si mañana metes TRIAL_ACTIVE, aquí lo adaptas.
  if (ent.subscription_status !== "ACTIVE") throw new Error("PLAN_NOT_ACTIVE");
  if (!ent.plan_code || !Number.isFinite(Number(ent.max_users))) throw new Error("PLAN_LIMITS_MISSING");
}

/* ======================================================
 * FETCH
 * ====================================================== */
async function fetchEvaluationsForRange(
  admin: ReturnType<typeof sbAdmin>,
  customerId: string,
  periodField: PeriodField,
  from: string,
  to: string
): Promise<EvalRow[]> {
  const selectCols = [
    "rating",
    "evaluation_date",
    "created_at",
    "economic_impact_gross",
    "economic_recovered",
    "economic_net_loss",
    "creator_customer_uuid",
    "customer_id",
  ].join(",");

  // filtro robusto: algunos inserts pueden usar customer_id, otros creator_customer_uuid
  const base = admin
    .from("debacu_evaluations")
    .select(selectCols)
    .or(`customer_id.eq.${customerId},creator_customer_uuid.eq.${customerId}`);

  if (periodField === "evaluation_date") {
    const { data, error } = await base
      .gte("evaluation_date", from)
      .lte("evaluation_date", to)
      .order("evaluation_date", { ascending: true });

    if (error) throw new Error(`QUERY_FAILED:${error.message}`);
    return (data ?? []) as any;
  }

  const fromTs = `${from}T00:00:00.000Z`;
  const toTs = `${to}T23:59:59.999Z`;

  const { data, error } = await base
    .gte("created_at", fromTs)
    .lte("created_at", toTs)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`QUERY_FAILED:${error.message}`);
  return (data ?? []) as any;
}

/* ======================================================
 * AGG (Daily series)
 * ====================================================== */
function buildDailySeries(rows: EvalRow[], periodField: PeriodField): WeeklySeriesRow[] {
  const map = new Map<string, WeeklySeriesRow>();

  for (const r of rows) {
    const day = getRowDateKey(r, periodField);

    const gross = toNumber(r.economic_impact_gross);
    const recovered = toNumber(r.economic_recovered);
    const netStored = r.economic_net_loss == null ? null : toNumber(r.economic_net_loss);
    const net = computeNet(gross, recovered, netStored);

    const cur =
      map.get(day) ??
      ({
        day,
        incidents: 0,
        risk_high: 0,
        risk_medium: 0,
        risk_low: 0,
        gross: 0,
        recovered: 0,
        net: 0,
      } as WeeklySeriesRow);

    cur.incidents += 1;

    const bucket = riskBucketFromRating(r.rating);
    if (bucket === "HIGH") cur.risk_high += 1;
    else if (bucket === "MEDIUM") cur.risk_medium += 1;
    else if (bucket === "LOW") cur.risk_low += 1;

    cur.gross += gross;
    cur.recovered += recovered;
    cur.net += net;

    map.set(day, cur);
  }

  return Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day));
}

/* ======================================================
 * MAIN
 * ====================================================== */
export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  try {
    // ✅ JWT-only: exigir Authorization
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.toLowerCase().startsWith("bearer ")) {
      return json(req, 401, { ok: false, error: "missing_authorization" });
    }

    let body: BuildReq;
    try {
      body = (await req.json()) as BuildReq;
    } catch {
      return json(req, 400, { ok: false, error: "invalid_json" });
    }

    const periodFrom = String(body.period_from ?? "");
    const periodTo = String(body.period_to ?? "");

    const periodField: PeriodField =
      (body.period_field as any) || ((body as any)?.filters?.period_field as any) || "evaluation_date";

    assertDate(periodFrom);
    assertDate(periodTo);
    if (periodFrom > periodTo) return json(req, 400, { ok: false, error: "invalid_period_range" });

    // clientes
    const userSb = sbUser(req);
    const adminSb = sbAdmin();

    // 1) userId desde JWT
    const userId = await getAuthUserIdOrThrow(userSb);

    // 2) orgId desde membership
    const orgId = await resolveOrgIdForUserOrThrow(adminSb, userId);

    // 3) entitlements (customer_id + plan + seats)
    const ent = await getEntitlementsForOrgOrThrow(adminSb, orgId);
    assertSubscriptionActiveOrThrow(ent);

    // 4) data
    const evalRows = await fetchEvaluationsForRange(
      adminSb,
      ent.customer_id,
      periodField,
      periodFrom,
      periodTo
    );

    const seriesRaw = buildDailySeries(evalRows, periodField);
    const series = fillMissingDays(seriesRaw, periodFrom, periodTo);

    return json(req, 200, {
      ok: true,
      app_code: DEFAULT_APP_CODE,
      org_id: orgId,
      customer_id: ent.customer_id,
      plan_code: ent.plan_code,
      max_users: ent.max_users,
      seats_used: ent.seats_used,

      period_from: periodFrom,
      period_to: periodTo,
      period_field: periodField,
      total_rows: evalRows.length,
      series,
    });
  } catch (e: any) {
    // devuelve error “limpio” y útil
    const msg = String(e?.message ?? e);

    // map rápido a 401/403 cuando aplica
    if (msg === "UNAUTHENTICATED" || msg === "missing_authorization") {
      return json(req, 401, { ok: false, error: msg });
    }
    if (msg === "NO_ORG_MEMBERSHIP" || msg === "PLAN_NOT_ACTIVE" || msg === "PLAN_LIMITS_MISSING") {
      return json(req, 403, { ok: false, error: msg });
    }

    return json(req, 500, { ok: false, error: "request_failed", detail: msg });
  }
});
