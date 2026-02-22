// supabase/functions/customer_operational_weekly_series_get/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";
import { getOrgEntitlementsOrThrow, assertOrgEnabledOrThrow } from "../_shared/plan.ts";

const DEFAULT_APP_CODE = "DEBACU_EVAL";

type PeriodField = "evaluation_date" | "created_at";

type BuildReq = {
  org_id?: string | null;
  period_from: string;
  period_to: string;
  period_field?: PeriodField;
  filters?: { period_field?: PeriodField };
};

type EntitlementsRow = {
  org_id: string;
  customer_id: string | null;
  subscription_status: string | null;
  plan_code: string | null;
  max_users: number | null;
  seats_used: number | null;
};

type EvalRow = {
  rating: number | null;
  evaluation_date: string | null;
  created_at: string;
  economic_impact_gross: string | number | null;
  economic_recovered: string | number | null;
  economic_net_loss: string | number | null;
  creator_customer_uuid: string | null;
  customer_id: string | null;
};

type WeeklySeriesRow = {
  day: string;
  incidents: number;
  risk_high: number;
  risk_medium: number;
  risk_low: number;
  gross: number;
  recovered: number;
  net: number;
};

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
function riskBucketFromRating(rating: number | null) {
  const v = Number(rating);
  if (!Number.isFinite(v)) return "UNKNOWN";
  if (v <= 2) return "HIGH";
  if (v === 3) return "MEDIUM";
  return "LOW";
}
function getRowDateKey(r: EvalRow, periodField: PeriodField): string {
  if (periodField === "evaluation_date") {
    const d = (r.evaluation_date ?? "").slice(0, 10);
    if (d) return d;
  }
  return String(r.created_at).slice(0, 10);
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

/**
 * ✅ Resuelve el org_id validando membership ACTIVE.
 * Robusto:
 * - match por user_id OR auth_user_id OR invited_email (email del JWT)
 * - si entra por invited_email y auth_user_id está null => autopatch auth_user_id=user.id
 */
async function resolveOrgIdForUserOrThrow(
  admin: ReturnType<typeof supabaseServiceClient>,
  userId: string,
  userEmail: string | null,
  requestedOrgId?: string | null,
): Promise<string> {
  const uid = String(userId);
  const email = (userEmail ?? "").trim().toLowerCase();
  const requested = (requestedOrgId ?? "").trim() || null;

  console.log("[weekly_series] resolveOrg", { uid, email: email || null, requested });

  if (requested && !isUuid(requested)) throw new Error("invalid_org_id");

  async function findInOrg(orgId: string) {
    const orParts = [`user_id.eq.${uid}`, `auth_user_id.eq.${uid}`];
    if (email) orParts.push(`invited_email.eq.${email}`);

    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("id, org_id, role, status, user_id, auth_user_id, invited_email")
      .eq("org_id", orgId)
      .eq("status", "ACTIVE")
      .or(orParts.join(","))
      .order("created_at", { ascending: true })
      .limit(1);

    console.log("[weekly_series] member_lookup_requested", {
      orgId,
      ok: !error,
      error: error?.message ?? null,
      rows: (data ?? []).length,
      first: (data ?? [])[0] ?? null,
    });

    if (error) throw new Error("request_failed");
    if (!data || data.length === 0) return null;
    return data[0] as any;
  }

  if (requested) {
    const m = await findInOrg(requested);
    if (!m) throw new Error("FORBIDDEN");

    if (!m.auth_user_id && email && String(m.invited_email ?? "").toLowerCase() === email) {
      console.log("[weekly_series] autopatch_auth_user_id", { member_id: m.id, org_id: m.org_id, uid });
      const { error: upErr } = await admin
        .from("debacu_eval_org_members")
        .update({ auth_user_id: uid })
        .eq("id", m.id);
      if (upErr) console.log("[weekly_series] autopatch_auth_user_id_error", upErr.message);
    }

    return String(m.org_id);
  }

  const orParts = [`user_id.eq.${uid}`, `auth_user_id.eq.${uid}`];
  if (email) orParts.push(`invited_email.eq.${email}`);

  const { data, error } = await admin
    .from("debacu_eval_org_members")
    .select("id, org_id, created_at, auth_user_id, invited_email")
    .eq("status", "ACTIVE")
    .or(orParts.join(","))
    .order("created_at", { ascending: true })
    .limit(1);

  console.log("[weekly_series] member_lookup_fallback", {
    ok: !error,
    error: error?.message ?? null,
    rows: (data ?? []).length,
    first: (data ?? [])[0] ?? null,
  });

  if (error) throw new Error("request_failed");
  if (!data || data.length === 0) throw new Error("FORBIDDEN");

  const m = data[0] as any;

  if (!m.auth_user_id && email && String(m.invited_email ?? "").toLowerCase() === email) {
    console.log("[weekly_series] autopatch_auth_user_id_fallback", { member_id: m.id, org_id: m.org_id, uid });
    const { error: upErr } = await admin.from("debacu_eval_org_members").update({ auth_user_id: uid }).eq("id", m.id);
    if (upErr) console.log("[weekly_series] autopatch_auth_user_id_error", upErr.message);
  }

  return String(m.org_id);
}

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

  const q = admin
    .from("debacu_evaluations")
    .select(selectCols)
    .or(`customer_id.eq.${customerId},creator_customer_uuid.eq.${customerId}`);

  if (periodField === "evaluation_date") {
    const { data, error } = await q.gte("evaluation_date", from).lte("evaluation_date", to);
    if (error) throw new Error("request_failed");
    return (data ?? []) as any;
  }

  const fromTs = `${from}T00:00:00.000Z`;
  const toTs = `${to}T23:59:59.999Z`;
  const { data, error } = await q.gte("created_at", fromTs).lte("created_at", toTs);

  if (error) throw new Error("request_failed");
  return (data ?? []) as any;
}

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

function mapErrorToHttp(e: unknown): { status: number; detail: string } {
  const msg = String((e as any)?.message ?? e ?? "request_failed");
  if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") return { status: 401, detail: "UNAUTHENTICATED" };
  if (msg === "PLAN_NOT_ACTIVE") return { status: 402, detail: "PLAN_NOT_ACTIVE" };
  if (msg === "FORBIDDEN") return { status: 403, detail: "FORBIDDEN" };
  if (msg.startsWith("invalid_")) return { status: 400, detail: msg };
  if (msg === "unsupported_period_field") return { status: 400, detail: "invalid_period_field" };
  return { status: 500, detail: "request_failed" };
}

export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "request_failed", detail: "method_not_allowed" });

  const admin = supabaseServiceClient();

  try {
    console.log("[weekly_series] v2026-02-22-entitlements-trial-enabled");

    const user = await requireUser(req);
    const userEmail = String((user as any)?.email ?? "").trim() || null;

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

    console.log("[weekly_series] user", { user_id: user.id, email: userEmail });
    console.log("[weekly_series] body", { org_id: body.org_id ?? null, periodFrom, periodTo, periodFieldRaw });

    const orgId = await resolveOrgIdForUserOrThrow(
      admin,
      user.id,
      userEmail,
      body.org_id ? String(body.org_id) : null,
    );

    // ✅ Entitlements via helper + TRIAL_ACTIVE habilitado
    const ent = (await getOrgEntitlementsOrThrow(admin as any, orgId)) as unknown as EntitlementsRow;
    assertOrgEnabledOrThrow(ent as any); // acepta ACTIVE o TRIAL_ACTIVE

    const customerId = String(ent.customer_id);
    if (!customerId) throw new Error("FORBIDDEN");

    const app_code = DEFAULT_APP_CODE;

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
    console.log("[weekly_series] ERROR", { msg: String((e as any)?.message ?? e) });
    return json(req, mapped.status, { ok: false, error: "request_failed", detail: mapped.detail });
  }
});