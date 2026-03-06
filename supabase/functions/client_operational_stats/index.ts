// supabase/functions/client_operational_stats/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

const DEFAULT_APP_ID = "DEBACU_EVAL";

// membership ACTIVE
const MEMBERSHIP_STATUS_COLUMN = "status";
const MEMBERSHIP_ACTIVE_VALUE = "ACTIVE";

/** YYYY-MM-DD -> {startISO, endExclusiveISO} en UTC */
function dayRangeUTC(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const start = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0));
  const endExclusive = new Date(start);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { startISO: start.toISOString(), endExclusiveISO: endExclusive.toISOString() };
}

/** Rango inclusivo [from..to] */
function rangeUTC(from: string, to: string) {
  const { startISO } = dayRangeUTC(from);
  const { endExclusiveISO } = dayRangeUTC(to);
  return { startISO, endExclusiveISO };
}

function toISODateUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysUTC(date: Date, days: number) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

type RiskBucket = "ALTO" | "MEDIO" | "BAJO" | "DESCONOCIDO";

function riskFromMeta(meta: any): RiskBucket {
  const r = String(meta?.risk ?? meta?.risk_level ?? meta?.riskLevel ?? "").toUpperCase();
  if (r.includes("ALTO") || r === "HIGH") return "ALTO";
  if (r.includes("MEDIO") || r === "MEDIUM") return "MEDIO";
  if (r.includes("BAJO") || r === "LOW") return "BAJO";
  return "DESCONOCIDO";
}

function ratingToRisk(rating: number | null | undefined): RiskBucket {
  const v = Number(rating);
  if (!Number.isFinite(v)) return "DESCONOCIDO";
  if (v <= 2) return "ALTO";
  if (v === 3) return "MEDIO";
  return "BAJO";
}

function hourUTC(iso: string) {
  return new Date(iso).getUTCHours();
}

type DailyPoint = {
  date: string; // YYYY-MM-DD
  count: number; // consultas totales
  highRisk: number; // ALTO
  mediumRisk: number; // MEDIO
  lowRisk: number; // BAJO
  records: number; // registros creados ese día
};

type HourlyPoint = {
  hour: number; // 0..23
  count: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
};

type ReqBody = {
  org_id?: string;
  period_from?: string;
  period_to?: string;
  from?: string;
  to?: string;
  app_id?: string;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

/** ======================================================
 * ORG + ENTITLEMENTS
 * ====================================================== */
async function resolveOrgIdOrThrow(
  admin: SupabaseClient,
  userId: string,
  requestedOrgId?: string | null,
): Promise<{ org_id: string; org_id_resolved_by: "requested" | "first_active" | "first_any" }> {
  const uid = String(userId);

  if (requestedOrgId) {
    const orgId = String(requestedOrgId).trim();
    if (!isUuid(orgId)) throw new Error("invalid_org_id");

    try {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id")
        .eq("org_id", orgId)
        .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
        .eq(MEMBERSHIP_STATUS_COLUMN, MEMBERSHIP_ACTIVE_VALUE)
        .maybeSingle();

      if (error) throw error;
      if (!data?.org_id) throw new Error("FORBIDDEN");
      return { org_id: String(data.org_id), org_id_resolved_by: "requested" };
    } catch {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id")
        .eq("org_id", orgId)
        .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
        .maybeSingle();

      if (error || !data?.org_id) throw new Error("FORBIDDEN");
      return { org_id: String(data.org_id), org_id_resolved_by: "requested" };
    }
  }

  try {
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, created_at")
      .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
      .eq(MEMBERSHIP_STATUS_COLUMN, MEMBERSHIP_ACTIVE_VALUE)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data?.org_id) throw new Error("FORBIDDEN");
    return { org_id: String(data.org_id), org_id_resolved_by: "first_active" };
  } catch {
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, created_at")
      .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data?.org_id) throw new Error("FORBIDDEN");
    return { org_id: String(data.org_id), org_id_resolved_by: "first_any" };
  }
}

type EntitlementsRow = {
  org_id: string;
  customer_id: string | null;
  subscription_status: string | null;
  plan_code?: string | null;
};

async function loadEntitlementsOrThrow(admin: SupabaseClient, orgId: string) {
  const { data, error } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, subscription_status, plan_code")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error || !data?.org_id) throw new Error("FORBIDDEN");
  return data as EntitlementsRow;
}

function assertPlanEnabledOrThrow(ent: EntitlementsRow) {
  const st = String(ent.subscription_status ?? "").toUpperCase();
  if (st !== "ACTIVE" && st !== "TRIAL_ACTIVE") throw new Error("PLAN_NOT_ACTIVE");
  if (!ent.customer_id) throw new Error("FORBIDDEN");
}

/* ======================================================
 * MAIN
 * ====================================================== */
export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  const admin = supabaseServiceClient();

  try {
    const user = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as ReqBody;

    const periodFrom = String(body?.period_from ?? body?.from ?? "").trim();
    const periodTo = String(body?.period_to ?? body?.to ?? "").trim();
    const appId = String(body?.app_id ?? DEFAULT_APP_ID).trim() || DEFAULT_APP_ID;

    if (!periodFrom || !periodTo) {
      return json(req, 400, { ok: false, error: "missing_period_from_to" });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(periodTo)) {
      return json(req, 400, { ok: false, error: "invalid_date_format" });
    }

    if (periodFrom > periodTo) {
      return json(req, 400, { ok: false, error: "invalid_period_range" });
    }

    const isSingleDay = periodFrom === periodTo;
    const { startISO, endExclusiveISO } = rangeUTC(periodFrom, periodTo);

    // org + plan
    const { org_id, org_id_resolved_by } = await resolveOrgIdOrThrow(admin, user.id, body?.org_id ?? null);
    const ent = await loadEntitlementsOrThrow(admin, org_id);
    assertPlanEnabledOrThrow(ent);

    const customer_id = String(ent.customer_id);

    // 1) CONSULTAS: audit_log CHECK_SIGNALS
    const { data: auditRows, error: aErr } = await admin
      .from("debacu_eval_audit_log")
      .select("created_at, meta")
      .eq("customer_id", customer_id)
      .eq("app_id", appId)
      .eq("event_type", "CHECK_SIGNALS")
      .gte("created_at", startISO)
      .lt("created_at", endExclusiveISO);

    if (aErr) throw new Error(`failed_load_audit_rows:${aErr.message}`);

    // 2) REGISTROS AÑADIDOS: NUEVA TABLA VIVA
    const { data: evidenceRows, error: evErr } = await admin
      .from("debacu_eval_org_guest_evidence")
      .select("created_at, event_date, rating")
      .eq("org_id", org_id)
      .gte("created_at", startISO)
      .lt("created_at", endExclusiveISO);

    if (evErr) throw new Error(`failed_load_evidence_rows:${evErr.message}`);

    // 3) Daily map con todos los días
    const dailyMap = new Map<string, DailyPoint>();

    const fromStart = new Date(dayRangeUTC(periodFrom).startISO);
    const toStart = new Date(dayRangeUTC(periodTo).startISO);

    for (let d = new Date(fromStart); d <= toStart; d = addDaysUTC(d, 1)) {
      const key = toISODateUTC(d);
      dailyMap.set(key, {
        date: key,
        count: 0,
        highRisk: 0,
        mediumRisk: 0,
        lowRisk: 0,
        records: 0,
      });
    }

    // 4) Agregar consultas por día + riesgo desde audit_log
    let totalConsultas = 0;
    let totalHigh = 0;
    let totalMed = 0;
    let totalLow = 0;

    for (const row of auditRows ?? []) {
      const createdAt = String((row as any)?.created_at ?? "");
      if (!createdAt) continue;

      const dayKey = createdAt.slice(0, 10);
      const p =
        dailyMap.get(dayKey) ?? {
          date: dayKey,
          count: 0,
          highRisk: 0,
          mediumRisk: 0,
          lowRisk: 0,
          records: 0,
        };

      p.count += 1;
      totalConsultas += 1;

      const risk = riskFromMeta((row as any)?.meta);
      if (risk === "ALTO") {
        p.highRisk += 1;
        totalHigh += 1;
      } else if (risk === "MEDIO") {
        p.mediumRisk += 1;
        totalMed += 1;
      } else if (risk === "BAJO") {
        p.lowRisk += 1;
        totalLow += 1;
      }

      dailyMap.set(dayKey, p);
    }

    // 5) Agregar registros creados por día desde org_guest_evidence
    let totalRegistros = 0;

    for (const row of evidenceRows ?? []) {
      const createdAt = String((row as any)?.created_at ?? "");
      if (!createdAt) continue;

      const dayKey = createdAt.slice(0, 10);
      const p =
        dailyMap.get(dayKey) ?? {
          date: dayKey,
          count: 0,
          highRisk: 0,
          mediumRisk: 0,
          lowRisk: 0,
          records: 0,
        };

      p.records += 1;
      totalRegistros += 1;

      dailyMap.set(dayKey, p);
    }

    const daily: DailyPoint[] = Array.from(dailyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => v);

    // 6) HOURLY si un solo día (solo consultas)
    let hourly: HourlyPoint[] | null = null;

    if (isSingleDay) {
      const hMap = new Map<number, HourlyPoint>();
      for (let h = 0; h < 24; h++) {
        hMap.set(h, { hour: h, count: 0, highRisk: 0, mediumRisk: 0, lowRisk: 0 });
      }

      for (const row of auditRows ?? []) {
        const createdAt = String((row as any)?.created_at ?? "");
        if (!createdAt) continue;

        const h = hourUTC(createdAt);
        const p = hMap.get(h)!;
        p.count += 1;

        const risk = riskFromMeta((row as any)?.meta);
        if (risk === "ALTO") p.highRisk += 1;
        else if (risk === "MEDIO") p.mediumRisk += 1;
        else if (risk === "BAJO") p.lowRisk += 1;

        hMap.set(h, p);
      }

      hourly = Array.from(hMap.values()).sort((a, b) => a.hour - b.hour);
    }

    return json(req, 200, {
      ok: true,

      // ✅ en raíz para que el front no quede ambiguo
      period_from: periodFrom,
      period_to: periodTo,
      mode: isSingleDay ? "HOURLY" : "DAILY",

      meta: {
        app_id: appId,
        org_id,
        org_id_resolved_by,
        customer_id,
        plan_code: (ent as any).plan_code ?? null,
        subscription_status: ent.subscription_status ?? null,
      },

      totals: {
        consultas: totalConsultas,
        registros: totalRegistros,
        risk: {
          high: totalHigh,
          medium: totalMed,
          low: totalLow,
          risky: totalHigh + totalMed,
        },
      },

      daily,
      hourly,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return json(req, 401, { ok: false, error: "UNAUTHENTICATED" });
    }

    if (msg === "PLAN_NOT_ACTIVE") {
      return json(req, 402, { ok: false, error: "PLAN_NOT_ACTIVE" });
    }

    if (msg === "invalid_org_id" || msg.startsWith("missing_") || msg.startsWith("invalid_")) {
      return json(req, 400, { ok: false, error: msg });
    }

    if (msg === "FORBIDDEN" || msg.startsWith("forbidden_")) {
      return json(req, 403, { ok: false, error: "FORBIDDEN" });
    }

    console.error("client_operational_stats error:", msg);
    return json(req, 500, { ok: false, error: "request_failed", detail: "internal_error" });
  }
});