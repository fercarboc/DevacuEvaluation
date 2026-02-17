// supabase/functions/debacu_eval_dashboard_channel_month/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

const DEFAULT_APP_CODE = "DEBACU_EVAL";

/* ======================================================
 * Helpers fechas
 * ====================================================== */
function startOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0));
}
function startOfNextMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0));
}
function yyyymm(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function addMonthsUTC(d: Date, delta: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1, 0, 0, 0));
}

/* ======================================================
 * Utils
 * ====================================================== */
function isUuid(v: unknown): v is string {
  if (typeof v !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function isMissingColumnError(msg: string) {
  return /column .* does not exist/i.test(msg);
}

/* ======================================================
 * Multi-org: resolve org_id (validate membership ACTIVE if exists)
 * ====================================================== */
async function resolveOrgIdForUser(
  sbAdmin: ReturnType<typeof createClient>,
  userId: string,
  requestedOrgId?: string,
): Promise<{ ok: true; org_id: string } | { ok: false; status: number; detail: string }> {
  // Si viene org_id => validar membership
  if (requestedOrgId) {
    // Preferimos status=ACTIVE si existe
    const q1 = await sbAdmin
      .from("debacu_eval_org_members")
      .select("org_id")
      .eq("user_id", userId)
      .eq("org_id", requestedOrgId)
      .eq("status", "ACTIVE")
      .limit(1)
      .maybeSingle();

    if (q1.error) {
      if (isMissingColumnError(q1.error.message)) {
        const q2 = await sbAdmin
          .from("debacu_eval_org_members")
          .select("org_id")
          .eq("user_id", userId)
          .eq("org_id", requestedOrgId)
          .limit(1)
          .maybeSingle();

        if (q2.error) return { ok: false, status: 500, detail: "request_failed" };
        if (!q2.data?.org_id) return { ok: false, status: 403, detail: "FORBIDDEN" };
        return { ok: true, org_id: String(q2.data.org_id) };
      }
      return { ok: false, status: 500, detail: "request_failed" };
    }

    if (!q1.data?.org_id) return { ok: false, status: 403, detail: "FORBIDDEN" };
    return { ok: true, org_id: String(q1.data.org_id) };
  }

  // Fallback determinista: primera membership ACTIVE por created_at
  const q1 = await sbAdmin
    .from("debacu_eval_org_members")
    .select("org_id, created_at")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (q1.error) {
    if (isMissingColumnError(q1.error.message)) {
      const q2 = await sbAdmin
        .from("debacu_eval_org_members")
        .select("org_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (q2.error) return { ok: false, status: 500, detail: "request_failed" };
      if (!q2.data?.org_id) return { ok: false, status: 403, detail: "FORBIDDEN" };
      return { ok: true, org_id: String(q2.data.org_id) };
    }
    return { ok: false, status: 500, detail: "request_failed" };
  }

  if (!q1.data?.org_id) return { ok: false, status: 403, detail: "FORBIDDEN" };
  return { ok: true, org_id: String(q1.data.org_id) };
}

async function loadEntitlements(
  sbAdmin: ReturnType<typeof createClient>,
  orgId: string,
): Promise<
  | {
      ok: true;
      customer_id: string;
      subscription_status: string | null;
      app_code: string;
    }
  | { ok: false; status: number; detail: string }
> {
  // Si tu view ya devuelve app_id/app_code, aquí lo coges.
  // Si no, mantenemos DEFAULT_APP_CODE.
  const { data, error } = await sbAdmin
    .from("debacu_eval_org_entitlements_v")
    .select("customer_id, subscription_status, app_id, app_code")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, detail: "request_failed" };

  const customer_id = data?.customer_id ? String(data.customer_id) : "";
  if (!customer_id) return { ok: false, status: 403, detail: "FORBIDDEN" };

  const subscription_status = (data as any)?.subscription_status ?? null;
  const app_code =
    String((data as any)?.app_code ?? (data as any)?.app_id ?? DEFAULT_APP_CODE) || DEFAULT_APP_CODE;

  return { ok: true, customer_id, subscription_status, app_code };
}

function planIsActive(subscription_status: string | null) {
  if (!subscription_status) return true; // por si tu view no lo trae aún
  return subscription_status === "ACTIVE";
}

/* ======================================================
 * Main
 * ====================================================== */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);

  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "request_failed", detail: "method_not_allowed" });
  }

  // JWT-only
  const user = await requireUser(req);

  // Service role (consistencia)
  const sbAdmin = supabaseServiceClient();

  try {
    const body = await req.json().catch(() => ({} as any));

    // multi-org
    const requestedOrgId = (body?.org_id ?? body?.orgId ?? "") ? String(body.org_id ?? body.orgId) : undefined;
    if (requestedOrgId && !isUuid(requestedOrgId)) {
      return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_org_id" });
    }

    const orgRes = await resolveOrgIdForUser(sbAdmin, user.id, requestedOrgId);
    if (!orgRes.ok) {
      return json(req, orgRes.status, { ok: false, error: "request_failed", detail: orgRes.detail });
    }

    const entRes = await loadEntitlements(sbAdmin, orgRes.org_id);
    if (!entRes.ok) {
      return json(req, entRes.status, { ok: false, error: "request_failed", detail: entRes.detail });
    }

    if (!planIsActive(entRes.subscription_status)) {
      return json(req, 402, { ok: false, error: "request_failed", detail: "PLAN_NOT_ACTIVE" });
    }

    const customer_id = entRes.customer_id;
    const app_code = entRes.app_code || DEFAULT_APP_CODE;

    const months_back_raw = Number(body?.months_back ?? 6);
    const months_back = Number.isFinite(months_back_raw)
      ? Math.min(24, Math.max(3, Math.floor(months_back_raw)))
      : 6;

    // Periodo: MES NATURAL ACTUAL
    const now = new Date();
    const fromMonth = startOfMonth(now);
    const toMonth = startOfNextMonth(now); // exclusive

    // Tendencias: desde (mes actual - (months_back-1))
    const trendFrom = addMonthsUTC(fromMonth, -(months_back - 1));
    const trendTo = toMonth;

    // Traemos SOLO columnas necesarias
    const pageSize = 1000;
    let from = 0;

    const rows: Array<{
      evaluation_date: string | null;
      channel: string | null;
      rating: number | null;
      economic_net_loss: number | null;
      app_id?: string | null;
    }> = [];

    // Detectar si existe app_id (sin “joins raros”)
    // Si tu tabla ya no tiene app_id, no queremos romper.
    const tryWithAppId = async () => {
      const { data, error } = await sbAdmin
        .from("debacu_evaluations")
        .select("evaluation_date, channel, rating, economic_net_loss, app_id")
        .eq("customer_id", customer_id)
        .eq("app_id", app_code)
        .gte("evaluation_date", trendFrom.toISOString().slice(0, 10))
        .lt("evaluation_date", trendTo.toISOString().slice(0, 10))
        .order("evaluation_date", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) {
        // si no existe columna app_id, caemos a query sin app_id
        if (isMissingColumnError(error.message)) return { missingAppId: true as const };
        throw error;
      }

      return { batch: (data ?? []) as any[] };
    };

    const tryWithoutAppId = async () => {
      const { data, error } = await sbAdmin
        .from("debacu_evaluations")
        .select("evaluation_date, channel, rating, economic_net_loss")
        .eq("customer_id", customer_id)
        .gte("evaluation_date", trendFrom.toISOString().slice(0, 10))
        .lt("evaluation_date", trendTo.toISOString().slice(0, 10))
        .order("evaluation_date", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      return (data ?? []) as any[];
    };

    // Paging
    let hasAppId = true;
    while (true) {
      let batch: any[] = [];

      if (hasAppId) {
        const r = await tryWithAppId();
        if ((r as any).missingAppId) {
          hasAppId = false;
          continue; // reintenta mismo page con query sin app_id
        }
        batch = (r as any).batch ?? [];
      } else {
        batch = await tryWithoutAppId();
      }

      for (const r of batch) rows.push(r);

      if (batch.length < pageSize) break;
      from += pageSize;
    }

    // ---- agregación JS ----
    const series = new Map<string, { net_loss: number; total: number; high: number }>();
    const byChannel = new Map<string, { net_loss: number; incidents: number }>();

    const inCurrentMonth = (iso: string) => {
      const d = new Date(`${iso}T00:00:00Z`);
      return d >= fromMonth && d < toMonth;
    };

    let month_net_loss = 0;
    let month_total = 0;
    let month_high = 0;

    for (const r of rows) {
      const dateISO = (r.evaluation_date ?? "").slice(0, 10);
      if (!dateISO) continue;

      const d = new Date(`${dateISO}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) continue;

      const k = yyyymm(d);
      const net = Number(r.economic_net_loss ?? 0) || 0;
      const rating = typeof r.rating === "number" ? r.rating : null;
      const isHigh = rating != null && rating <= 2;

      const s = series.get(k) ?? { net_loss: 0, total: 0, high: 0 };
      s.net_loss += net;
      s.total += 1;
      if (isHigh) s.high += 1;
      series.set(k, s);

      if (inCurrentMonth(dateISO)) {
        month_net_loss += net;
        month_total += 1;
        if (isHigh) month_high += 1;

        const ch = (r.channel ?? "—").trim() || "—";
        const c = byChannel.get(ch) ?? { net_loss: 0, incidents: 0 };
        c.net_loss += net;
        c.incidents += 1;
        byChannel.set(ch, c);
      }
    }

    // top channel mes actual
    let top_channel: { channel: string; net_loss: number; incidents: number } | null = null;
    for (const [channel, v] of byChannel.entries()) {
      if (!top_channel || v.net_loss > top_channel.net_loss) {
        top_channel = { channel, net_loss: v.net_loss, incidents: v.incidents };
      }
    }

    const high_risk_pct =
      month_total > 0 ? Math.round((month_high / month_total) * 1000) / 10 : 0; // 1 decimal

    // construir array ordenado months_back (del más antiguo al actual)
    const series_out: Array<{
      month: string;
      net_loss: number;
      total: number;
      high_risk_pct: number;
    }> = [];

    for (let i = months_back - 1; i >= 0; i--) {
      const m = yyyymm(addMonthsUTC(fromMonth, -i));
      const v = series.get(m) ?? { net_loss: 0, total: 0, high: 0 };
      const pct = v.total > 0 ? Math.round((v.high / v.total) * 1000) / 10 : 0;

      series_out.push({
        month: m,
        net_loss: Math.round(v.net_loss * 100) / 100,
        total: v.total,
        high_risk_pct: pct,
      });
    }

    return json(req, 200, {
      ok: true,
      data: {
        meta: {
          app_id: DEFAULT_APP_CODE,
          org_id: orgRes.org_id,
          customer_id,
        },
        period: {
          month: yyyymm(fromMonth),
          from: fromMonth.toISOString().slice(0, 10),
          to_exclusive: toMonth.toISOString().slice(0, 10),
        },
        kpis: {
          net_loss: Math.round(month_net_loss * 100) / 100,
          total_incidents: month_total,
          high_risk_pct,
          top_channel,
        },
        trends: {
          months_back,
          series: series_out,
        },
      },
    });
  } catch {
    return json(req, 500, { ok: false, error: "request_failed", detail: "internal_error" });
  }
});
