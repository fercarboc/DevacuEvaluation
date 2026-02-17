// supabase/functions/admin_dashboard_metrics/index.ts
// deno-lint-ignore-file no-explicit-any

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
 * Devuelve rango UTC [start, end) correspondiente al "día local actual"
 * según el offset proporcionado (minutos respecto a UTC).
 *
 * Estrategia:
 * - Construimos "localNow" = utcNow + offset
 * - Sacamos el Y/M/D de localNow (en términos UTC del objeto)
 * - Construimos "localMidnight" como Date.UTC(Y,M,D,0,0,0)
 * - Convertimos ese "localMidnight" a UTC real restando offset
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
  };
}

Deno.serve(async (req) => {
  // ✅ CORS
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "method_not_allowed" });
  }

  try {
    // ✅ Admin real (JWT-only; sin RPC)
    await requireAdmin(req);

    const sb = supabaseServiceClient();

    const body = await req.json().catch(() => ({}));

    // tz_offset_minutes: +60 invierno / +120 verano en Madrid (si viene del front correcto)
    const tzRaw = cleanInt(body?.tz_offset_minutes, 60);
    const tz_offset_minutes = clampInt(tzRaw, -720, 840);

    const { startIso: todayStartUtc, endIso: todayEndUtc } =
      todayLocalUtcRange(tz_offset_minutes);

    // 1) Clientes activos
    const clientesQ = sb
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    // 2) Solicitudes pendientes
    const solicitudesQ = sb
      .from("debacu_eval_access_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "PENDING");

    // 3) Consultas hoy (audit log: búsquedas)
    const consultasQ = sb
      .from("debacu_eval_audit_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStartUtc)
      .lt("created_at", todayEndUtc)
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

    if (cErr) return json(req, 500, { ok: false, error: "db_error", detail: `customers: ${cErr.message}` });
    if (rErr) return json(req, 500, { ok: false, error: "db_error", detail: `access_requests: ${rErr.message}` });
    if (qErr) return json(req, 500, { ok: false, error: "db_error", detail: `audit_log: ${qErr.message}` });
    if (aErr) return json(req, 500, { ok: false, error: "db_error", detail: `usage_alerts: ${aErr.message}` });

    // ✅ Firma homogénea: ok + data (incluye meta dentro)
    return json(req, 200, {
      ok: true,
      data: {
        clientes_activos: clientesCount ?? 0,
        solicitudes_pendientes: solicitudesCount ?? 0,
        consultas_hoy: consultasCount ?? 0,
        alertas_activas: alertasCount ?? 0,
        meta: {
          tz_offset_minutes,
          today_start_utc: todayStartUtc,
          today_end_utc: todayEndUtc,
        },
      },
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);

    if (msg === "UNAUTHORIZED") return json(req, 401, { ok: false, error: "unauthorized" });
    if (msg === "FORBIDDEN") return json(req, 403, { ok: false, error: "forbidden" });
    if (msg === "ADMIN_CHECK_FAILED") return json(req, 500, { ok: false, error: "admin_check_failed" });

    return json(req, 500, { ok: false, error: "unexpected", detail: msg });
  }
});
