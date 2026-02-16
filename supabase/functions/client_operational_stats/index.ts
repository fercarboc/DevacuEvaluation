// supabase/functions/debacu_eval_stats_operativas_get/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

const DEFAULT_APP_ID = "DEBACU_EVAL";

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://debacu.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(req) },
  });
}

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

/** YYYY-MM-DD -> {startISO, endExclusiveISO} en UTC */
function dayRangeUTC(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const start = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0));
  const endExclusive = new Date(start);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { startISO: start.toISOString(), endExclusiveISO: endExclusive.toISOString() };
}

/** Rango inclusivo [from..to] (YYYY-MM-DD) -> startISO UTC y endExclusiveISO UTC */
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

function hourUTC(iso: string) {
  return new Date(iso).getUTCHours();
}

type DailyPoint = {
  date: string;        // YYYY-MM-DD
  count: number;       // consultas totales
  highRisk: number;    // ALTO
  mediumRisk: number;  // MEDIO
  lowRisk: number;     // BAJO
  records: number;     // registros creados ese día
};

type HourlyPoint = {
  hour: number;        // 0..23
  count: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
};

/* ======================================================
 * JWT + tenant resolution (org -> customer)
 * ====================================================== */
function userClient(req: Request, supabaseUrl: string, anonKey: string) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
}

function adminClient(supabaseUrl: string, serviceKey: string) {
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireJwtUser(req: Request, supabaseUrl: string, anonKey: string) {
  const sb = userClient(req, supabaseUrl, anonKey);
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");
  return data.user;
}

async function requireOrgMemberAndCustomerId(admin: ReturnType<typeof createClient>, user_id: string) {
  const { data: mem, error: memErr } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, role, created_at")
    .eq("user_id", user_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memErr) throw new Error(`MEMBERSHIP_FAILED:${memErr.message}`);
  if (!mem?.org_id) throw new Error("FORBIDDEN_NO_ORG");

  const org_id = String(mem.org_id);

  // 1) entitlements view si existe
  let customer_id: string | null = null;
  try {
    const { data: ent, error: entErr } = await admin
      .from("debacu_eval_org_entitlements_v")
      .select("customer_id")
      .eq("org_id", org_id)
      .maybeSingle();

    if (!entErr && ent?.customer_id) customer_id = String(ent.customer_id);
  } catch {
    // ignore
  }

  // 2) fallback organizations
  if (!customer_id) {
    const { data: org, error: orgErr } = await admin
      .from("debacu_eval_organizations")
      .select("customer_id")
      .eq("id", org_id)
      .maybeSingle();

    if (orgErr) throw new Error(`ORG_LOOKUP_FAILED:${orgErr.message}`);
    if (!org?.customer_id) throw new Error("FORBIDDEN_NO_CUSTOMER");
    customer_id = String(org.customer_id);
  }

  return { org_id, customer_id };
}

/* ======================================================
 * Main
 * ====================================================== */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "method_not_allowed" });
  }

  try {
    const SUPABASE_URL = mustEnv("SUPABASE_URL");
    const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = mustEnv("SUPABASE_ANON_KEY");

    // 1) JWT obligatorio
    const user = await requireJwtUser(req, SUPABASE_URL, ANON_KEY);

    // 2) tenant: org -> customer
    const admin = adminClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { org_id, customer_id } = await requireOrgMemberAndCustomerId(admin, user.id);

    const body = await req.json().catch(() => ({} as any));

    // Compat: aceptamos period_from/period_to (nuevo) o from/to (viejo)
    const periodFrom = String(body?.period_from ?? body?.from ?? "");
    const periodTo = String(body?.period_to ?? body?.to ?? "");
    const appId = String(body?.app_id ?? DEFAULT_APP_ID);

    if (!periodFrom || !periodTo) {
      return json(req, 400, { ok: false, error: "missing_period_from_to" });
    }

    // Validación simple formato YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(periodTo)) {
      return json(req, 400, { ok: false, error: "invalid_date_format", detail: "Use YYYY-MM-DD" });
    }

    const isSingleDay = periodFrom === periodTo;
    const { startISO, endExclusiveISO } = rangeUTC(periodFrom, periodTo);

    // 3) Cargar consultas CHECK_SIGNALS del rango (audit_log)
    const { data: auditRows, error: aErr } = await admin
      .from("debacu_eval_audit_log")
      .select("created_at, event_type, action, meta, customer_id, app_id")
      .eq("customer_id", customer_id)
      .eq("app_id", appId)
      .eq("event_type", "CHECK_SIGNALS")
      .gte("created_at", startISO)
      .lt("created_at", endExclusiveISO);

    if (aErr) {
      return json(req, 500, { ok: false, error: "failed_load_audit_rows", detail: aErr.message });
    }

    // 4) Cargar registros creados por el hotel en el rango (evaluations)
    // ⚠️ Si tu tabla real es "debacu_eval_evaluations", cambia aquí.
    const { data: evalRows, error: eErr } = await admin
      .from("debacu_evaluations")
      // .from("debacu_eval_evaluations")
      .select("created_at")
      .eq("creator_customer_uuid", customer_id)
      .gte("created_at", startISO)
      .lt("created_at", endExclusiveISO);

    if (eErr) {
      return json(req, 500, { ok: false, error: "failed_load_evaluation_rows", detail: eErr.message });
    }

    // 5) Construir daily con días completos aunque no haya datos
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

    // 6) Agregar consultas por día + riesgo
    let totalConsultas = 0;
    let totalHigh = 0;
    let totalMed = 0;
    let totalLow = 0;

    for (const row of auditRows ?? []) {
      const createdAt = String((row as any)?.created_at ?? "");
      if (!createdAt) continue;

      const dayKey = createdAt.slice(0, 10); // YYYY-MM-DD
      const p = dailyMap.get(dayKey) ?? {
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

    // 7) Agregar registros creados por día
    let totalRegistros = 0;

    for (const row of evalRows ?? []) {
      const createdAt = String((row as any)?.created_at ?? "");
      if (!createdAt) continue;

      const dayKey = createdAt.slice(0, 10);
      const p = dailyMap.get(dayKey) ?? {
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

    // 8) HOURLY si es un solo día
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
      meta: {
        app_id: appId,
        org_id,
        customer_id,
        period_from: periodFrom,
        period_to: periodTo,
        mode: isSingleDay ? "HOURLY" : "DAILY",
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
      hourly, // null si no aplica
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const status =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg.startsWith("FORBIDDEN") || msg.startsWith("MEMBERSHIP_FAILED") || msg.startsWith("ORG_LOOKUP_FAILED")
          ? 403
          : 500;

    console.error("debacu_eval_stats_operativas_get ERROR", e);
    return json(req, status, { ok: false, error: "request_failed", detail: msg });
  }
});
