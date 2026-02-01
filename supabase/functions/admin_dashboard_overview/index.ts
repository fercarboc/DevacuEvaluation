// supabase/functions/admin_dashboard_overview/index.ts
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =======================
// CORS (simple y seguro)
// =======================
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(req),
    },
  });
}

// =======================
// Env + helpers
// =======================
function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

function getBearer(req: Request) {
  const h = req.headers.get("authorization") ??
    req.headers.get("Authorization") ??
    "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function parseAllowedEmails(csv: string | null) {
  const raw = (csv ?? "").trim();
  if (!raw) return ["admin@debacu.com"];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function supabaseUserClient(token: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
}

function supabaseServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function requireAdmin(req: Request) {
  const token = getBearer(req);
  if (!token) return { ok: false as const, status: 401, error: "missing_bearer" as const };

  const sbUser = supabaseUserClient(token);

  const { data: userData, error: userErr } = await sbUser.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false as const, status: 401, error: "invalid_token" as const };
  }

  const allowed = parseAllowedEmails(Deno.env.get("ADMIN_EMAILS"));
  const email = (userData.user.email ?? "").toLowerCase().trim();
  const isAdmin = allowed.includes(email);

  if (!isAdmin) return { ok: false as const, status: 403, error: "forbidden" as const };
  return { ok: true as const, user: userData.user };
}

// =======================
// Utils
// =======================
function isoDate(d: Date) {
  // YYYY-MM-DD
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDayUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
}

function addDaysUTC(d: Date, days: number) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function safeString(x: any) {
  if (x === null || x === undefined) return null;
  return String(x);
}

// =======================
// Main
// =======================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  const admin = await requireAdmin(req);
  if (!admin.ok) return json(req, admin.status, { ok: false, error: admin.error });

  try {
    const sb = supabaseServiceClient();
    const body = await req.json().catch(() => ({}));
    const range = (body?.range === "7d" || body?.range === "30d") ? body.range : "30d";
    const app_id = String(body?.app_id ?? "DEBACU_EVAL");

    // -----------------------
    // 1) METRICS (cards)
    // -----------------------
    // Clientes activos: customers.is_active = true AND customers.app_id = app_id
    const { count: activeCustomers, error: e1 } = await sb
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("app_id", app_id)
      .eq("is_active", true);

    if (e1) return json(req, 500, { ok: false, error: "db_error", detail: e1.message });

    // Solicitudes pendientes: debacu_eval_access_requests.status = 'PENDING'
    const { count: pendingAccess, error: e2 } = await sb
      .from("debacu_eval_access_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "PENDING");

    if (e2) return json(req, 500, { ok: false, error: "db_error", detail: e2.message });

    // Consultas hoy: usamos debacu_eval_audit_log (hoy) - heurística:
    // cuenta filas con search_value_hash o search_value_masked no null
    const today = startOfDayUTC(new Date());
    const tomorrow = addDaysUTC(today, 1);

    const { data: todayLogs, error: e3 } = await sb
      .from("debacu_eval_audit_log")
      .select("id, created_at, search_value_hash, search_value_masked")
      .gte("created_at", today.toISOString())
      .lt("created_at", tomorrow.toISOString())
      .limit(5000);

    if (e3) return json(req, 500, { ok: false, error: "db_error", detail: e3.message });

    const consultasHoy = (todayLogs ?? []).filter((r: any) =>
      r?.search_value_hash || r?.search_value_masked
    ).length;

    // Alertas activas: OPEN o ACKNOWLEDGED
    const { count: activeAlerts, error: e4 } = await sb
      .from("debacu_eval_usage_alerts")
      .select("id", { count: "exact", head: true })
      .in("status", ["OPEN", "ACKNOWLEDGED"]);

    if (e4) return json(req, 500, { ok: false, error: "db_error", detail: e4.message });

    const metrics = {
      clientes_activos: activeCustomers ?? 0,
      solicitudes_pendientes: pendingAccess ?? 0,
      consultas_hoy: consultasHoy,
      alertas_activas: activeAlerts ?? 0,
    };

    // -----------------------
    // 2) SERIES (7d/30d)
    // -----------------------
    const days = range === "7d" ? 7 : 30;
    const fromDay = startOfDayUTC(addDaysUTC(today, -(days - 1)));
    const toDay = addDaysUTC(today, 1);

    const { data: logsRange, error: e5 } = await sb
      .from("debacu_eval_audit_log")
      .select("created_at, search_value_hash, search_value_masked")
      .gte("created_at", fromDay.toISOString())
      .lt("created_at", toDay.toISOString())
      .limit(50000);

    if (e5) return json(req, 500, { ok: false, error: "db_error", detail: e5.message });

    const countsByDay = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      countsByDay.set(isoDate(addDaysUTC(fromDay, i)), 0);
    }

    for (const r of logsRange ?? []) {
      if (!(r?.search_value_hash || r?.search_value_masked)) continue;
      const dt = new Date(r.created_at);
      const key = isoDate(startOfDayUTC(dt));
      if (countsByDay.has(key)) countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
    }

    const series = Array.from(countsByDay.entries()).map(([ts, value]) => ({ ts, value }));

    // -----------------------
    // 3) RECENT ALERTS
    // -----------------------
    const { data: alerts, error: e6 } = await sb
      .from("debacu_eval_usage_alerts")
      .select("id, detected_at, customer_id, severity, alert_type, status, reason")
      .order("detected_at", { ascending: false })
      .limit(8);

    if (e6) return json(req, 500, { ok: false, error: "db_error", detail: e6.message });

    const customerIds = [...new Set((alerts ?? []).map((a: any) => a.customer_id).filter(Boolean))] as string[];
    const custMap = new Map<string, { name: string | null; email: string | null }>();

    if (customerIds.length) {
      const { data: custs, error: eC } = await sb
        .from("customers")
        .select("id, name, email")
        .in("id", customerIds);

      if (!eC) {
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
        severity: (a.severity ?? "LOW"),
        alert_type: String(a.alert_type ?? "UNKNOWN"),
        status: String(a.status ?? "OPEN"),
        reason: a.reason ?? null,
      };
    });

    // -----------------------
    // 4) RECENT ACTIVITY (feed mezclado)
    // -----------------------
    // cogemos: subscription_events, audit_exports, settings_audit_log
    const [ev1, ev2, ev3] = await Promise.all([
      sb.from("subscription_events")
        .select("id, created_at, type, stripe_subscription_id, stripe_customer_id")
        .order("created_at", { ascending: false })
        .limit(10),
      sb.from("audit_exports")
        .select("id, created_at, format, status, customer_id, type, provided_to_type")
        .order("created_at", { ascending: false })
        .limit(10),
      sb.from("settings_audit_log")
        .select("id, changed_at, table_name, action, record_id")
        .order("changed_at", { ascending: false })
        .limit(10),
    ]);

    if (ev1.error) return json(req, 500, { ok: false, error: "db_error", detail: ev1.error.message });
    if (ev2.error) return json(req, 500, { ok: false, error: "db_error", detail: ev2.error.message });
    if (ev3.error) return json(req, 500, { ok: false, error: "db_error", detail: ev3.error.message });

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

    // -----------------------
    // 5) HEALTH (honesto)
    // -----------------------
    // Si todavía no tienes telemetría real, NO inventamos.
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
      },
    });
  } catch (e: any) {
    return json(req, 500, { ok: false, error: "unexpected", detail: e?.message ?? String(e) });
  }
});
