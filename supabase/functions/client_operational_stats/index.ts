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

function corsHeaders(origin: string | null) {
  const o = origin ?? "";
  const allowOrigin = ALLOWED_ORIGINS.has(o) ? o : "https://debacu.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-session-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
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

serve(async (req) => {
  const origin = req.headers.get("Origin");

  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
    if (req.method !== "POST") return json(origin, 405, { error: "Method not allowed" });

    const SUPABASE_URL = mustEnv("SUPABASE_URL");
    const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const sessionToken = req.headers.get("x-session-token") || "";
    if (!sessionToken) return json(origin, 401, { error: "Missing x-session-token" });

    const body = await req.json().catch(() => ({}));

    // Compat: aceptamos period_from/period_to (nuevo) o from/to (viejo)
    const periodFrom = String(body?.period_from ?? body?.from ?? "");
    const periodTo = String(body?.period_to ?? body?.to ?? "");
    const appId = String(body?.app_id ?? DEFAULT_APP_ID);

    if (!periodFrom || !periodTo) {
      return json(origin, 400, { error: "Missing period_from/period_to" });
    }

    // Validación simple formato YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(periodTo)) {
      return json(origin, 400, { error: "Invalid date format. Use YYYY-MM-DD." });
    }

    // 1) Validar sesión Debacu propia
    const { data: session, error: sessErr } = await supabase
      .from("debacu_eval_sessions")
      .select("customer_id, expires_at, revoked_at")
      .eq("token", sessionToken)
      .maybeSingle();

    if (sessErr || !session) return json(origin, 401, { error: "Invalid session" });
    if (session.revoked_at) return json(origin, 401, { error: "Session revoked" });
    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
      return json(origin, 401, { error: "Session expired" });
    }

    const customerId = String(session.customer_id ?? "");
    if (!customerId) return json(origin, 500, { error: "Session missing customer_id" });

    const isSingleDay = periodFrom === periodTo;
    const { startISO, endExclusiveISO } = rangeUTC(periodFrom, periodTo);

    // 2) Cargar consultas CHECK_SIGNALS del rango (audit_log)
    //    Nota: si el rango es grande y el volumen crece, habrá que paginar o pre-agregar.
    const { data: auditRows, error: aErr } = await supabase
      .from("debacu_eval_audit_log")
      .select("created_at, event_type, action, meta, customer_id, app_id")
      .eq("customer_id", customerId)
      .eq("app_id", appId)
      .eq("event_type", "CHECK_SIGNALS")
      .gte("created_at", startISO)
      .lt("created_at", endExclusiveISO);

    if (aErr) {
      return json(origin, 500, { error: "Failed to load audit rows", detail: aErr.message });
    }

    // 3) Cargar registros creados por el hotel en el rango (evaluations)
    const { data: evalRows, error: eErr } = await supabase
      .from("debacu_evaluations")
      .select("created_at")
      .eq("creator_customer_uuid", customerId)
      .gte("created_at", startISO)
      .lt("created_at", endExclusiveISO);

    if (eErr) {
      return json(origin, 500, { error: "Failed to load evaluation rows", detail: eErr.message });
    }

    // 4) Construir “daily” con días completos aunque no haya datos
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

    // 5) Agregar consultas por día + riesgo
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

    // 6) Agregar registros creados por día
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

    // 7) HOURLY si es un solo día
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

    return json(origin, 200, {
      ok: true,
      app_id: appId,
      customer_id: customerId,
      period_from: periodFrom,
      period_to: periodTo,
      mode: isSingleDay ? "HOURLY" : "DAILY",
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
  } catch (e) {
    return json(origin, 500, {
      error: "Unexpected error",
      detail: String((e as any)?.message ?? e),
    });
  }
});
