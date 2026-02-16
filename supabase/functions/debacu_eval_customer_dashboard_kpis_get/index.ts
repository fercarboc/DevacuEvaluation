import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/* ======================================================
 * ENV
 * ====================================================== */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_APP_CODE = "DEBACU_EVAL";

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/* ======================================================
 * CORS allowlist (igual que tus otras Edge)
 * ====================================================== */
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

function corsHeaders(origin: string | null) {
  const o = origin ?? "";
  const allowOrigin = ALLOWED_ORIGINS.has(o) ? o : "https://debacu.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-session-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

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
 * Auth sesión (x-session-token)
 * - valida revoked_at / expires_at
 * - devuelve customer_id + app_code
 * ====================================================== */
async function requireSession(req: Request) {
  const token = req.headers.get("x-session-token")?.trim();
  if (!token) throw new Error("missing_session_token");

  const { data, error } = await supabaseAdmin
    .from("debacu_eval_sessions")
    .select("token, customer_id, app_code, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("invalid_session");

  if (data.revoked_at) throw new Error("session_revoked");

  if (data.expires_at) {
    const exp = new Date(data.expires_at);
    if (!Number.isNaN(exp.getTime()) && exp.getTime() <= Date.now()) {
      throw new Error("session_expired");
    }
  }

  return {
    customer_id: data.customer_id as string,
    app_code: (data.app_code as string) || DEFAULT_APP_CODE,
  };
}

/* ======================================================
 * Main
 * ====================================================== */
serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(origin, 405, { ok: false, error: "method_not_allowed" });

  try {
    const { customer_id, app_code } = await requireSession(req);

    const body = await req.json().catch(() => ({}));
    const months_back_raw = Number(body?.months_back ?? 6);
    const months_back = Number.isFinite(months_back_raw)
      ? Math.min(24, Math.max(3, Math.floor(months_back_raw)))
      : 6;

    // Periodo: MES NATURAL ACTUAL
    const now = new Date();
    const fromMonth = startOfMonth(now);
    const toMonth = startOfNextMonth(now); // exclusive

    // Para tendencias: pedimos desde (mes actual - (months_back-1))
    const trendFrom = addMonthsUTC(fromMonth, -(months_back - 1));
    const trendTo = toMonth;

    // Traemos SOLO columnas necesarias
    // IMPORTANTE: ajusta nombres si difieren en tu tabla
    // - evaluation_date (date o timestamp)
    // - channel (texto o enum)
    // - rating (int 1..5)
    // - economic_net_loss (num)
    const pageSize = 1000;
    let from = 0;

    const rows: Array<{
      evaluation_date: string | null;
      channel: string | null;
      rating: number | null;
      economic_net_loss: number | null;
    }> = [];

    while (true) {
      const { data, error } = await supabaseAdmin
        .from("debacu_evaluations")
        .select("evaluation_date, channel, rating, economic_net_loss")
        .eq("customer_id", customer_id)
        .eq("app_id", app_code)
        .gte("evaluation_date", trendFrom.toISOString().slice(0, 10)) // YYYY-MM-DD
        .lt("evaluation_date", trendTo.toISOString().slice(0, 10))
        .order("evaluation_date", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      const batch = (data ?? []) as any[];
      for (const r of batch) rows.push(r);

      if (batch.length < pageSize) break;
      from += pageSize;
    }

    // ---- agregación JS ----
    // buckets mensuales
    const series = new Map<string, { net_loss: number; total: number; high: number }>();
    const byChannel = new Map<string, { net_loss: number; incidents: number }>();

    // helpers parse date
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

      // series
      const s = series.get(k) ?? { net_loss: 0, total: 0, high: 0 };
      s.net_loss += net;
      s.total += 1;
      if (isHigh) s.high += 1;
      series.set(k, s);

      // current month totals
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
      month: string; // YYYY-MM
      net_loss: number;
      total: number;
      high_risk_pct: number; // %
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

    return json(origin, 200, {
      ok: true,
      data: {
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
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "unknown_error");
    const code =
      msg.includes("missing_session_token") ? 401 :
      msg.includes("invalid_session") ? 401 :
      msg.includes("session_revoked") ? 401 :
      msg.includes("session_expired") ? 401 :
      400;

    return json(origin, code, { ok: false, error: msg });
  }
});
