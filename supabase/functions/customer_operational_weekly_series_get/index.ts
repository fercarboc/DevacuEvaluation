// supabase/functions/customer_operational_weekly_series_get/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

type BuildReq = {
  org_id?: string | null;

  period_from: string; // YYYY-MM-DD
  period_to: string; // YYYY-MM-DD

  period_field?: PeriodField; // preferred
  filters?: { period_field?: PeriodField }; // compat front legacy
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
  customer_id: string | null;
  subscription_status: string | null; // ACTIVE | null
  plan_code: string | null;
  max_users: number | null;
  seats_used: number | null;
  app_code?: string | null;
};

/* ======================================================
 * HELPERS
 * ====================================================== */
function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

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
      },
    );
  }
  return out;
}

/* ======================================================
 * MULTI-ORG + ENTITLEMENTS (JWT-only, tolerant user_id/auth_user_id)
 * ====================================================== */
async function resolveOrgIdForUserOrThrow(
  admin: ReturnType<typeof supabaseServiceClient>,
  userId: string,
  requestedOrgId?: string | null,
): Promise<string> {
  const uid = String(userId);
  const requested = (requestedOrgId ?? "").trim() || null;

  if (requested && !isUuid(requested)) throw new Error("invalid_org_id");

  if (requested) {
    // membership ACTIVE, tolerante a user_id o auth_user_id
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id")
      .eq("org_id", requested)
      .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (error) throw new Error("request_failed");
    if (!data?.org_id) throw new Error("FORBIDDEN");
    return String(data.org_id);
  }

  // fallback determinista: primera ACTIVE por created_at
  const { data, error } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, created_at")
    .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("request_failed");
  if (!data?.org_id) throw new Error("FORBIDDEN");
  return String(data.org_id);
}

async function loadEntitlementsOrThrow(admin: ReturnType<typeof supabaseServiceClient>, orgId: string) {
  const { data, error } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, subscription_status, plan_code, max_users, seats_used, app_code")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error || !data?.org_id) throw new Error("FORBIDDEN");
  return data as EntitlementsRow;
}

function assertPlanActiveOrThrow(ent: EntitlementsRow) {
  if (ent.subscription_status !== "ACTIVE") throw new Error("PLAN_NOT_ACTIVE");
  if (!ent.customer_id) throw new Error("FORBIDDEN");
}

/* ======================================================
 * FETCH
 * ====================================================== */
async function fetchEvaluationsForRange(
  admin: ReturnType<typeof supabaseServiceClient>,
  customerId: string,
  periodField: PeriodField,
  from: string,
  to: string,
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

  // compat datos sucios: customer_id o creator_customer_uuid
  const q = admin
    .from("debacu_evaluations")
    .select(selectCols)
    .or(`customer_id.eq.${customerId},creator_customer_uuid.eq.${customerId}`);

  if (periodField === "evaluation_date") {
    const { data, error } = await q
      .gte("evaluation_date", from)
      .lte("evaluation_date", to)
      .order("evaluation_date", { ascending: true });

    if (error) throw new Error("request_failed");
    return (data ?? []) as any;
  }

  const fromTs = `${from}T00:00:00.000Z`;
  const toTs = `${to}T23:59:59.999Z`;

  const { data, error } = await q
    .gte("created_at", fromTs)
    .lte("created_at", toTs)
    .order("created_at", { ascending: true });

  if (error) throw new Error("request_failed");
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
 * ERRORS
 * ====================================================== */
function mapErrorToHttp(e: unknown): { status: number; detail: string } {
  const msg = String((e as any)?.message ?? e ?? "request_failed");

  if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") return { status: 401, detail: "UNAUTHENTICATED" };
  if (msg === "PLAN_NOT_ACTIVE") return { status: 402, detail: "PLAN_NOT_ACTIVE" };
  if (msg === "FORBIDDEN") return { status: 403, detail: "FORBIDDEN" };

  if (msg.startsWith("invalid_")) return { status: 400, detail: msg };
  if (msg === "unsupported_period_field") return { status: 400, detail: "invalid_period_field" };
  if (msg === "request_failed") return { status: 500, detail: "request_failed" };

  return { status: 500, detail: "request_failed" };
}

/* ======================================================
 * MAIN
 * ====================================================== */
export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "request_failed", detail: "method_not_allowed" });
  }

  const admin = supabaseServiceClient();

  try {
    // Log mínimo útil (puedes quitarlo luego)
    console.log("customer_operational_weekly_series_get hit");

    const user = await requireUser(req);

    const body = (await req.json().catch(() => null)) as BuildReq | null;
    if (!body) return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_json" });

    const periodFrom = String(body.period_from ?? "").trim();
    const periodTo = String(body.period_to ?? "").trim();

    const periodFieldRaw =
      (body.period_field as PeriodField | undefined) ??
      ((body.filters?.period_field as PeriodField | undefined) ?? "evaluation_date");

    if (periodFieldRaw !== "evaluation_date" && periodFieldRaw !== "created_at") {
      throw new Error("unsupported_period_field");
    }

    assertDate(periodFrom, "period_from");
    assertDate(periodTo, "period_to");
    if (periodFrom > periodTo) {
      return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_period_range" });
    }

    const orgId = await resolveOrgIdForUserOrThrow(admin, user.id, body.org_id ? String(body.org_id) : null);

    const ent = await loadEntitlementsOrThrow(admin, orgId);
    assertPlanActiveOrThrow(ent);

    const customerId = String(ent.customer_id);
    const app_code = String(ent.app_code ?? DEFAULT_APP_CODE);

    const evalRows = await fetchEvaluationsForRange(admin, customerId, periodFieldRaw, periodFrom, periodTo);

    const seriesRaw = buildDailySeries(evalRows, periodFieldRaw);
    const series = fillMissingDays(seriesRaw, periodFrom, periodTo);

    return json(req, 200, {
      ok: true,
      app_code,
      org_id: orgId,
      customer_id: customerId,
      plan_code: ent.plan_code ?? null,
      max_users: ent.max_users ?? null,
      seats_used: ent.seats_used ?? null,

      period_from: periodFrom,
      period_to: periodTo,
      period_field: periodFieldRaw,
      total_rows: evalRows.length,
      series,
    });
  } catch (e) {
    const mapped = mapErrorToHttp(e);
    return json(req, mapped.status, { ok: false, error: "request_failed", detail: mapped.detail });
  }
});