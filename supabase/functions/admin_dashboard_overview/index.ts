// supabase/functions/admin_dashboard_overview/index.ts
// deno-lint-ignore-file no-explicit-any

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireAdmin, supabaseServiceClient } from "../_shared/auth.ts";

/* -----------------------
   Time helpers (LOCAL day -> UTC range)
   tz_offset_minutes: recomendado desde front:
     tz_offset_minutes = -new Date().getTimezoneOffset()
   (Madrid: +60 invierno / +120 verano)
----------------------- */

function clampInt(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function cleanInt(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Rango UTC [start, end) del "día local actual" según offset.
 */
function todayLocalUtcRange(tzOffsetMinutes: number) {
  const utcNow = Date.now();
  const localNow = new Date(utcNow + tzOffsetMinutes * 60_000);

  const y = localNow.getUTCFullYear();
  const m = localNow.getUTCMonth();
  const d = localNow.getUTCDate();

  const localMidnightAsUtc = Date.UTC(y, m, d, 0, 0, 0);
  const utcStartMs = localMidnightAsUtc - tzOffsetMinutes * 60_000;
  const utcEndMs = utcStartMs + 24 * 60 * 60 * 1000;

  return {
    startIso: new Date(utcStartMs).toISOString(),
    endIso: new Date(utcEndMs).toISOString(),
    startMs: utcStartMs,
  };
}

function isoDateUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * defensivo: evita null/undefined
 */
function safeString(x: any) {
  if (x === null || x === undefined) return null;
  return String(x);
}

Deno.serve(async (req) => {
  // ✅ CORS
  if (req.method === "OPTIONS") return preflight(req);

  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "request_failed", detail: "method_not_allowed" });
  }

  try {
    // ✅ Admin real (JWT-only)
    await requireAdmin(req);

    const sb = supabaseServiceClient();
    const body = await req.json().catch(() => ({}));

    const range: "7d" | "30d" = body?.range === "7d" || body?.range === "30d" ? body.range : "30d";
    const app_id = String(body?.app_id ?? "DEBACU_EVAL");

    // tz_offset_minutes: por defecto +60 (Madrid invierno) si no viene del front
    const tzRaw = cleanInt(body?.tz_offset_minutes, 60);
    const tz_offset_minutes = clampInt(tzRaw, -720, 840);

    const { startIso: todayStartUtc, endIso: todayEndUtc, startMs: todayStartMs } =
      todayLocalUtcRange(tz_offset_minutes);

    /* -----------------------
       1) METRICS (cards)
    ----------------------- */

    // Clientes activos: customers.is_active = true AND customers.app_id = app_id
    const activeCustomersQ = sb
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("app_id", app_id)
      .eq("is_active", true);

    // Solicitudes pendientes: debacu_eval_access_requests.status = 'PENDING'
    const pendingAccessQ = sb
      .from("debacu_eval_access_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "PENDING");

    // Consultas hoy: audit log (hoy local) — heurística: search_kind IS NOT NULL
    const consultasHoyQ = sb
      .from("debacu_eval_audit_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStartUtc)
      .lt("created_at", todayEndUtc)
      .not("search_kind", "is", null);

    // Alertas activas: OPEN o ACKNOWLEDGED
    const activeAlertsQ = sb
      .from("debacu_eval_usage_alerts")
      .select("id", { count: "exact", head: true })
      .in("status", ["OPEN", "ACKNOWLEDGED"]);

    const [
      { count: activeCustomers, error: e1 },
      { count: pendingAccess, error: e2 },
      { count: consultasHoy, error: e3 },
      { count: activeAlerts, error: e4 },
    ] = await Promise.all([activeCustomersQ, pendingAccessQ, consultasHoyQ, activeAlertsQ]);

    if (e1) {
      console.error("admin_dashboard_overview: customers query failed", e1);
      return json(req, 500, { ok: false, error: "request_failed", detail: "customers_query_failed" });
    }
    if (e2) {
      console.error("admin_dashboard_overview: access_requests query failed", e2);
      return json(req, 500, { ok: false, error: "request_failed", detail: "access_requests_query_failed" });
    }
    if (e3) {
      console.error("admin_dashboard_overview: audit_log(today) query failed", e3);
      return json(req, 500, { ok: false, error: "request_failed", detail: "audit_log_today_query_failed" });
    }
    if (e4) {
      console.error("admin_dashboard_overview: usage_alerts(active) query failed", e4);
      return json(req, 500, { ok: false, error: "request_failed", detail: "usage_alerts_active_query_failed" });
    }

    const metrics = {
      clientes_activos: activeCustomers ?? 0,
      solicitudes_pendientes: pendingAccess ?? 0,
      consultas_hoy: consultasHoy ?? 0,
      alertas_activas: activeAlerts ?? 0,
    };

    /* -----------------------
       2) SERIES (7d/30d) — conteo por día local
       - sin RPC
       - agregación JS con dataset acotado
    ----------------------- */

    const days = range === "7d" ? 7 : 30;

    // fromDayUtcStart = inicio UTC del día local de hace (days-1) días
    const fromDayStartMs = todayStartMs - (days - 1) * 24 * 60 * 60 * 1000;
    const toDayEndMs = todayStartMs + 24 * 60 * 60 * 1000;

    const fromDayIso = new Date(fromDayStartMs).toISOString();
    const toDayIso = new Date(toDayEndMs).toISOString();

    // Traemos solo lo mínimo para bucketing
    const { data: logsRange, error: e5 } = await sb
      .from("debacu_eval_audit_log")
      .select("created_at, search_kind")
      .gte("created_at", fromDayIso)
      .lt("created_at", toDayIso)
      .not("search_kind", "is", null)
      .limit(50000);

    if (e5) {
      console.error("admin_dashboard_overview: audit_log(range) query failed", e5);
      return json(req, 500, { ok: false, error: "request_failed", detail: "audit_log_range_query_failed" });
    }

    // Inicializa buckets (key = YYYY-MM-DD)
    const countsByDay = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const bucketStartMs = fromDayStartMs + i * 24 * 60 * 60 * 1000;
      countsByDay.set(isoDateUTC(new Date(bucketStartMs)), 0);
    }

    // Bucketing por día local:
    // - created_at UTC → localMs sumando offset
    // - obtenemos Y/M/D "local"
    // - reconstruimos local midnight y lo pasamos a UTC bucket
    for (const r of logsRange ?? []) {
      const createdAt = r?.created_at ? Date.parse(String(r.created_at)) : NaN;
      if (!Number.isFinite(createdAt)) continue;

      const localMs = createdAt + tz_offset_minutes * 60_000;
      const local = new Date(localMs);
      const y = local.getUTCFullYear();
      const m = local.getUTCMonth();
      const d = local.getUTCDate();

      const localMidnightAsUtc = Date.UTC(y, m, d, 0, 0, 0);
      const bucketUtcStartMs = localMidnightAsUtc - tz_offset_minutes * 60_000;

      const key = isoDateUTC(new Date(bucketUtcStartMs));
      if (countsByDay.has(key)) countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
    }

    const series = Array.from(countsByDay.entries()).map(([ts, value]) => ({ ts, value }));

    /* -----------------------
       3) RECENT ALERTS
    ----------------------- */

    const { data: alerts, error: e6 } = await sb
      .from("debacu_eval_usage_alerts")
      .select("id, detected_at, customer_id, severity, alert_type, status, reason")
      .order("detected_at", { ascending: false })
      .limit(8);

    if (e6) {
      console.error("admin_dashboard_overview: usage_alerts(recent) query failed", e6);
      return json(req, 500, { ok: false, error: "request_failed", detail: "usage_alerts_recent_query_failed" });
    }

    const customerIds = [...new Set((alerts ?? []).map((a: any) => a.customer_id).filter(Boolean))] as string[];
    const custMap = new Map<string, { name: string | null; email: string | null }>();

    if (customerIds.length) {
      const { data: custs, error: eC } = await sb.from("customers").select("id, name, email").in("id", customerIds);
      if (eC) {
        // no rompemos el dashboard por no poder “decorar”
        console.error("admin_dashboard_overview: customers(in) for alerts failed", eC);
      } else {
        for (const c of custs ?? []) {
          custMap.set(String(c.id), { name: c.name ?? null, email: c.email ?? null });
        }
      }
    }

    const recent_alerts = (alerts ?? []).map((a: any) => {
      const cid = safeString(a.customer_id);
      const c = cid ? custMap.get(cid) : null;
      return {
        id: String(a.id),
        detected_at: String(a.detected_at),
        customer_id: cid,
        customer_name: c?.name ?? null,
        severity: String(a.severity ?? "LOW"),
        alert_type: String(a.alert_type ?? "UNKNOWN"),
        status: String(a.status ?? "OPEN"),
        reason: a.reason ?? null,
      };
    });

    /* -----------------------
       4) RECENT ACTIVITY (feed mezclado)
       - sin joins raros: 3 queries + merge en JS
    ----------------------- */

    const [ev1, ev2, ev3] = await Promise.all([
      sb
        .from("subscription_events")
        .select("id, created_at, type, stripe_subscription_id, stripe_customer_id")
        .order("created_at", { ascending: false })
        .limit(10),
      sb
        .from("audit_exports")
        .select("id, created_at, format, status, customer_id, type, provided_to_type")
        .order("created_at", { ascending: false })
        .limit(10),
      sb
        .from("settings_audit_log")
        .select("id, changed_at, table_name, action, record_id")
        .order("changed_at", { ascending: false })
        .limit(10),
    ]);

    if (ev1.error) {
      console.error("admin_dashboard_overview: subscription_events query failed", ev1.error);
      return json(req, 500, { ok: false, error: "request_failed", detail: "subscription_events_query_failed" });
    }
    if (ev2.error) {
      console.error("admin_dashboard_overview: audit_exports query failed", ev2.error);
      return json(req, 500, { ok: false, error: "request_failed", detail: "audit_exports_query_failed" });
    }
    if (ev3.error) {
      console.error("admin_dashboard_overview: settings_audit_log query failed", ev3.error);
      return json(req, 500, { ok: false, error: "request_failed", detail: "settings_audit_log_query_failed" });
    }

    const activity: any[] = [];

    for (const e of ev1.data ?? []) {
      activity.push({
        id: `stripe_${e.id}`,
        created_at: String(e.created_at),
        kind: "STRIPE",
        title: `Stripe event: ${e.type}`,
        detail: e.stripe_subscription_id ? `sub: ${e.stripe_subscription_id}` : null,
        ref: e.stripe_customer_id ?? e.stripe_subscription_id ?? null,
      });
    }

    for (const x of ev2.data ?? []) {
      activity.push({
        id: `export_${x.id}`,
        created_at: String(x.created_at),
        kind: "EXPORT",
        title: `Export ${x.format} (${x.status})`,
        detail: `type: ${x.type ?? "-"} / to: ${x.provided_to_type ?? "-"}`,
        ref: String(x.id),
      });
    }

    for (const s of ev3.data ?? []) {
      activity.push({
        id: `cfg_${s.id}`,
        created_at: String(s.changed_at),
        kind: "ADMIN",
        title: `Config change: ${s.table_name}`,
        detail: `${s.action}${s.record_id ? ` / record: ${s.record_id}` : ""}`,
        ref: String(s.id),
      });
    }

    activity.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const recent_activity = activity.slice(0, 12);

    /* -----------------------
       5) HEALTH (placeholder estable)
    ----------------------- */
    const health = {
      uptime_pct: null,
      api_latency_ms: null,
      api_error_pct: null,
    };

    return json(req, 200, {
      ok: true,
      data: {
        metrics,
        series,
        recent_alerts,
        recent_activity,
        health,
        meta: {
          app_id,
          range,
          tz_offset_minutes,
          today_start_utc: todayStartUtc,
          today_end_utc: todayEndUtc,
        },
      },
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);

    // 🔒 errores estándar
    if (msg === "UNAUTHORIZED" || msg === "UNAUTHENTICATED") {
      return json(req, 401, { ok: false, error: "request_failed", detail: "UNAUTHORIZED" });
    }
    if (msg === "FORBIDDEN") {
      return json(req, 403, { ok: false, error: "request_failed", detail: "FORBIDDEN" });
    }
    if (msg === "ADMIN_CHECK_FAILED") {
      return json(req, 500, { ok: false, error: "request_failed", detail: "admin_check_failed" });
    }

    console.error("admin_dashboard_overview unexpected error:", e);
    return json(req, 500, { ok: false, error: "request_failed", detail: "internal_error" });
  }
});
