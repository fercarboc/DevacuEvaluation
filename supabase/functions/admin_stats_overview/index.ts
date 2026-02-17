// supabase/functions/admin_stats_overview/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";

/* =======================
 * Helpers
 * ======================= */
function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function getISODateNDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function safeErr(e: unknown) {
  if (e instanceof Error) return { message: e.message, name: e.name, stack: e.stack };
  if (typeof e === "string") return { message: e };
  try {
    return { message: JSON.stringify(e) };
  } catch {
    return { message: String(e) };
  }
}

function supabaseServiceClient() {
  const SUPABASE_URL = requireEnv("SUPABASE_URL");
  const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

type StatsOverview = {
  customers_activos: number;

  activos_por_plan: Array<{
    plan_name: string;
    plan_code: string | null;
    total: number;
  }>;

  nuevos_clientes_30d: number;

  alertas_por_severidad_30d: Array<{
    severity: string;
    total: number;
  }>;

  solicitudes_por_estado_30d: Array<{
    status: string;
    total: number;
  }>;

  solicitudes_ultimas_24h: number;

  tokens_activos: number;
  tokens_30d: number;

  consultas_diarias_30d: Array<{
    day: string; // YYYY-MM-DD
    total: number;
  }>;

  tendencia_consultas: {
    last_30: number | null;
    prev_30: number | null;
    pct_change: number | null;
  };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  try {
    // ✅ JWT-only + admin gate centralizado
    await requireAdmin(req);

    const svc = supabaseServiceClient();

    const since30 = getISODateNDaysAgo(30);
    const since60 = getISODateNDaysAgo(60);
    const since24h = getISODateNDaysAgo(1);
    const nowIso = new Date().toISOString();

    /* -------------------------------------------------------
     * 1) customers activos
     * ----------------------------------------------------- */
    const { count: customers_activos, error: e1 } = await svc
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
    if (e1) throw e1;

    /* -------------------------------------------------------
     * 2) activos por plan (sin join)
     * ----------------------------------------------------- */
    const { data: custPlans, error: e2 } = await svc
      .from("customers")
      .select("plan_id")
      .eq("is_active", true);
    if (e2) throw e2;

    const planIds = Array.from(
      new Set((custPlans ?? []).map((r: any) => (r?.plan_id ? String(r.plan_id) : "")).filter(Boolean))
    );

    const planMap = new Map<string, { name: string; code: string | null }>();

    if (planIds.length) {
      const { data: plans, error: e2b } = await svc.from("plans").select("id, name, code").in("id", planIds);
      if (e2b) throw e2b;

      for (const p of plans ?? []) {
        planMap.set(String((p as any).id), {
          name: String((p as any).name ?? "Sin nombre"),
          code: (p as any).code ?? null,
        });
      }
    }

    const planAgg = new Map<string, { plan_name: string; plan_code: string | null; total: number }>();
    for (const r of custPlans ?? []) {
      const pid = r?.plan_id ? String(r.plan_id) : "NO_PLAN";
      const meta = planMap.get(pid);

      const plan_name = meta?.name ?? (pid === "NO_PLAN" ? "Sin plan" : "Plan desconocido");
      const plan_code = meta?.code ?? null;

      const cur = planAgg.get(pid) ?? { plan_name, plan_code, total: 0 };
      cur.total += 1;
      planAgg.set(pid, cur);
    }
    const activos_por_plan = Array.from(planAgg.values()).sort((a, b) => b.total - a.total);

    /* -------------------------------------------------------
     * 3) nuevos clientes 30d
     * ----------------------------------------------------- */
    const { count: nuevos_clientes_30d, error: e3 } = await svc
      .from("customers")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since30);
    if (e3) throw e3;

    /* -------------------------------------------------------
     * 4) alertas por severidad 30d
     * (sin group by en PostgREST -> mínimo: severity + detected_at)
     * ----------------------------------------------------- */
    const { data: alerts, error: e4 } = await svc
      .from("debacu_eval_usage_alerts")
      .select("severity")
      .gte("detected_at", since30);
    if (e4) throw e4;

    const sevAgg = new Map<string, number>();
    for (const a of alerts ?? []) {
      const s = String((a as any).severity ?? "UNKNOWN");
      sevAgg.set(s, (sevAgg.get(s) ?? 0) + 1);
    }
    const alertas_por_severidad_30d = Array.from(sevAgg.entries())
      .map(([severity, total]) => ({ severity, total }))
      .sort((a, b) => b.total - a.total);

    /* -------------------------------------------------------
     * 5) solicitudes por estado 30d + últimas 24h
     * ----------------------------------------------------- */
    const { data: reqs30, error: e5 } = await svc
      .from("debacu_eval_access_requests")
      .select("status, created_at")
      .gte("created_at", since30);
    if (e5) throw e5;

    const statusAgg = new Map<string, number>();
    let solicitudes_ultimas_24h = 0;
    const since24 = new Date(since24h).getTime();

    for (const r of reqs30 ?? []) {
      const st = String((r as any).status ?? "UNKNOWN");
      statusAgg.set(st, (statusAgg.get(st) ?? 0) + 1);

      const t = new Date((r as any).created_at).getTime();
      if (!Number.isNaN(t) && t >= since24) solicitudes_ultimas_24h += 1;
    }

    const solicitudes_por_estado_30d = Array.from(statusAgg.entries())
      .map(([status, total]) => ({ status, total }))
      .sort((a, b) => b.total - a.total);

    /* -------------------------------------------------------
     * 6) tokens activos + tokens 30d (debacu_eval_sessions)
     * ----------------------------------------------------- */
    const { count: tokens_activos, error: e6 } = await svc
      .from("debacu_eval_sessions")
      .select("id", { count: "exact", head: true })
      .is("revoked_at", null)
      .gt("expires_at", nowIso);
    if (e6) throw e6;

    const { count: tokens_30d, error: e7 } = await svc
      .from("debacu_eval_sessions")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since30);
    if (e7) throw e7;

    /* -------------------------------------------------------
     * 7) consultas diarias 30d (aprox = sesiones por día)
     * ----------------------------------------------------- */
    const { data: sess30, error: e8 } = await svc
      .from("debacu_eval_sessions")
      .select("created_at")
      .gte("created_at", since30);
    if (e8) throw e8;

    const dayAgg = new Map<string, number>();
    for (const s of sess30 ?? []) {
      const iso = String((s as any).created_at ?? "");
      const day = iso.slice(0, 10);
      if (day.length === 10) dayAgg.set(day, (dayAgg.get(day) ?? 0) + 1);
    }

    const consultas_diarias_30d: Array<{ day: string; total: number }> = [];
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - 29);
    start.setUTCHours(0, 0, 0, 0);

    for (let i = 0; i < 30; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      consultas_diarias_30d.push({ day: key, total: dayAgg.get(key) ?? 0 });
    }

    /* -------------------------------------------------------
     * 8) tendencia last30 vs prev30 (sessions)
     * ----------------------------------------------------- */
    const { count: last_30, error: e9 } = await svc
      .from("debacu_eval_sessions")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since30);
    if (e9) throw e9;

    const { count: prev_30, error: e10 } = await svc
      .from("debacu_eval_sessions")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since60)
      .lt("created_at", since30);
    if (e10) throw e10;

    const last30n = typeof last_30 === "number" ? last_30 : null;
    const prev30n = typeof prev_30 === "number" ? prev_30 : null;

    const pct_change =
      last30n !== null && prev30n !== null && prev30n > 0
        ? Math.round(((last30n - prev30n) / prev30n) * 1000) / 10
        : null;

    const data: StatsOverview = {
      customers_activos: customers_activos ?? 0,
      activos_por_plan,
      nuevos_clientes_30d: nuevos_clientes_30d ?? 0,
      alertas_por_severidad_30d,
      solicitudes_por_estado_30d,
      solicitudes_ultimas_24h,
      tokens_activos: tokens_activos ?? 0,
      tokens_30d: tokens_30d ?? 0,
      consultas_diarias_30d,
      tendencia_consultas: { last_30: last30n, prev_30: prev30n, pct_change },
    };

    return json(req, 200, { ok: true, data });
  } catch (e: any) {
    const msg = e?.message ?? String(e);

    if (msg === "UNAUTHORIZED" || msg === "missing_bearer" || msg === "invalid_token") {
      return json(req, 401, { ok: false, error: "unauthorized" });
    }
    if (msg === "FORBIDDEN" || msg === "forbidden_admin_only" || msg === "admin_denied") {
      return json(req, 403, { ok: false, error: "forbidden" });
    }

    const info = safeErr(e);
    return json(req, 500, { ok: false, error: info.message || "unexpected", detail: info });
  }
});
