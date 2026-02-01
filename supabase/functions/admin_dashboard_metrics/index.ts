// supabase/functions/admin_dashboard_metrics/index.ts
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(req: Request, status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "content-type": "application/json; charset=utf-8" },
  });
}

function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SRV_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

function getBearer(req: Request) {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
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

function sbUser(token: string) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
}

function sbSrv() {
  return createClient(SUPABASE_URL, SRV_KEY, { auth: { persistSession: false } });
}

// -----------------------
// Time helpers (LOCAL day -> UTC range)
// -----------------------
function startOfLocalDayUTC(tzOffsetMinutes: number) {
  const now = new Date();

  // "Local now" = UTC now + offset
  const localNow = new Date(now.getTime() + tzOffsetMinutes * 60_000);

  // Local 00:00 (constructed in UTC terms)
  const localStart = new Date(
    Date.UTC(
      localNow.getUTCFullYear(),
      localNow.getUTCMonth(),
      localNow.getUTCDate(),
      0,
      0,
      0
    )
  );

  // Convert back to real UTC by subtracting offset
  const utcStart = new Date(localStart.getTime() - tzOffsetMinutes * 60_000);
  return utcStart.toISOString();
}

function endOfLocalDayUTC(tzOffsetMinutes: number) {
  const start = new Date(startOfLocalDayUTC(tzOffsetMinutes));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return end.toISOString();
}

async function requireAdmin(req: Request) {
  const token = getBearer(req);
  if (!token) return { ok: false as const, status: 401, error: "missing_bearer" };

  const userClient = sbUser(token);
  const { data: u, error: uErr } = await userClient.auth.getUser();
  if (uErr || !u?.user) return { ok: false as const, status: 401, error: "invalid_token" };

  const allowed = parseAllowedEmails(Deno.env.get("ADMIN_EMAILS"));
  const email = (u.user.email ?? "").toLowerCase().trim();
  if (!allowed.includes(email)) return { ok: false as const, status: 403, error: "forbidden" };

  return { ok: true as const, user: u.user };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  const admin = await requireAdmin(req);
  if (!admin.ok) return json(req, admin.status, { ok: false, error: admin.error });

  try {
    const sb = sbSrv();

    const body = await req.json().catch(() => ({}));

    // tz_offset_minutes: +60 invierno / +120 verano en Madrid
    // Front recomendado: -new Date().getTimezoneOffset()
    const tzRaw = Number(body?.tz_offset_minutes ?? 60);
    const tz_offset_minutes =
      Number.isFinite(tzRaw) ? Math.min(Math.max(tzRaw, -720), 840) : 60;

    const todayStart = startOfLocalDayUTC(tz_offset_minutes);
    const todayEnd = endOfLocalDayUTC(tz_offset_minutes);

    // 1) Clientes activos
    // Si quieres contar TODOS los clientes, quita el .eq("is_active", true)
    const clientesQ = sb
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    // 2) Solicitudes pendientes (count directo, sin traer filas)
    const solicitudesQ = sb
      .from("debacu_eval_access_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "PENDING");

    // 3) Consultas hoy (audit log: búsquedas)
    // En tu schema existe search_kind (text). Usamos eso como señal de consulta/búsqueda.
    const consultasQ = sb
      .from("debacu_eval_audit_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStart)
      .lt("created_at", todayEnd)
      .not("search_kind", "is", null);

    // 4) Alertas activas (OPEN)
    const alertasQ = sb
      .from("debacu_eval_usage_alerts")
      .select("id", { count: "exact", head: true })
      .eq("status", "OPEN");

    const [
      { count: clientesCount, error: cErr },
      { count: solicitudesCount, error: rErr },
      { count: consultasCount, error: qErr },
      { count: alertasCount, error: aErr },
    ] = await Promise.all([clientesQ, solicitudesQ, consultasQ, alertasQ]);

    if (cErr) return json(req, 500, { ok: false, error: "db_error", detail: cErr.message });
    if (rErr) return json(req, 500, { ok: false, error: "db_error", detail: rErr.message });
    if (qErr) return json(req, 500, { ok: false, error: "db_error", detail: qErr.message });
    if (aErr) return json(req, 500, { ok: false, error: "db_error", detail: aErr.message });

    return json(req, 200, {
      ok: true,
      data: {
        clientes_activos: clientesCount ?? 0,
        solicitudes_pendientes: solicitudesCount ?? 0,
        consultas_hoy: consultasCount ?? 0,
        alertas_activas: alertasCount ?? 0,
      },
      meta: {
        tz_offset_minutes,
        today_start_utc: todayStart,
        today_end_utc: todayEnd,
      },
    });
  } catch (e: any) {
    return json(req, 500, { ok: false, error: "unexpected", detail: e?.message ?? String(e) });
  }
});
