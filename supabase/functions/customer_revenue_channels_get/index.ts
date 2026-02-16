// supabase/functions/customer_revenue_channels_get/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type PeriodField = "evaluation_date" | "created_at";
type ChannelGroup = "OTA" | "DIRECTO" | "B2B" | "OTROS";

type InputBody = {
  period_from?: string; // YYYY-MM-DD
  period_to?: string; // YYYY-MM-DD
  period_field?: PeriodField;

  // tolerancia camelCase
  periodFrom?: string;
  periodTo?: string;
  periodField?: string;
};

type RowOut = {
  channel_group: ChannelGroup;
  platform_key: string;

  total_records: number;

  risk_high: number;
  risk_medium: number;
  risk_low: number;

  pct_high: number;
  pct_medium: number;
  pct_low: number;

  gross_total: number;
  recovered_total: number;
  net_total: number;

  pct_net_share: number;
};

/* ======================================================
 * CORS allowlist
 * ====================================================== */
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://debacu.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    Vary: "Origin",
    // ✅ JWT-only
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(req) },
  });
}

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/* ======================================================
 * Helpers
 * ====================================================== */
function isIsoDate(d: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function normPlatform(platform: unknown): string {
  return String(platform ?? "").trim().toUpperCase();
}

function platformKeyFromNorm(pn: string): string {
  if (!pn) return "UNKNOWN";

  // OTA
  if (pn.includes("BOOKING")) return "BOOKING";
  if (pn.includes("AIRBNB")) return "AIRBNB";
  if (pn.includes("EXPEDIA")) return "EXPEDIA";

  // DIRECTO
  if (pn === "WEB" || pn.includes("WEB ")) return "WEB";
  if (pn === "DIRECT" || pn === "DIRECTA" || pn.includes("DIRECT")) return "DIRECT";
  if (pn.includes("RESERVADOR")) return "RESERVADOR";
  if (pn.includes("MOTOR_PROPIO") || pn.includes("MOTOR PROPIO")) return "MOTOR_PROPIO";
  if (pn.includes("MIRAI")) return "MIRAI";

  // B2B
  if (pn.startsWith("AGENCIA") || pn.includes("AGENCIA")) return "AGENCIA";
  if (pn.includes("VIAJES")) return "VIAJES";

  return pn.replace(/\s+/g, "_");
}

function channelGroupFromPlatformKey(pk: string): ChannelGroup {
  const k = pk.toUpperCase();

  if (k === "BOOKING" || k === "AIRBNB" || k === "EXPEDIA") return "OTA";

  if (k === "WEB" || k === "DIRECT" || k === "DIRECTA" || k === "RESERVADOR" || k === "MOTOR_PROPIO" || k === "MIRAI")
    return "DIRECTO";

  if (k.startsWith("AGENCIA") || k === "VIAJES") return "B2B";

  return "OTROS";
}

function riskBucketFromRating(rating: number): "HIGH" | "MEDIUM" | "LOW" {
  if (rating <= 2) return "HIGH";
  if (rating === 3) return "MEDIUM";
  return "LOW";
}

function computeNetLoss(gross: number, recovered: number, netLossRaw: number): number {
  if (!netLossRaw || netLossRaw === 0) {
    const calc = gross - recovered;
    return calc > 0 ? calc : 0;
  }
  return netLossRaw > 0 ? netLossRaw : 0;
}

function normalizePeriodField(v: unknown): PeriodField {
  const s = String(v ?? "").trim();
  if (!s) return "evaluation_date";
  if (s === "evaluation_date" || s === "created_at") return s;

  // tolerancia camelCase
  if (s === "evaluationDate") return "evaluation_date";
  if (s === "createdAt") return "created_at";

  // tolerancia “accidental”
  if (s.toLowerCase() === "evaluation_date") return "evaluation_date";
  if (s.toLowerCase() === "created_at") return "created_at";

  return "evaluation_date";
}

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
  const origin = req.headers.get("Origin") ?? "";

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, { ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const SUPABASE_URL = mustEnv("SUPABASE_URL");
    const SERVICE_ROLE = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = mustEnv("SUPABASE_ANON_KEY");

    // 1) JWT obligatorio
    const user = await requireJwtUser(req, SUPABASE_URL, ANON_KEY);

    // 2) tenant: org -> customer
    const admin = adminClient(SUPABASE_URL, SERVICE_ROLE);
    const { org_id, customer_id } = await requireOrgMemberAndCustomerId(admin, user.id);

    const body = (await req.json().catch(() => ({} as any))) as InputBody;

    const period_from = String(body.period_from ?? body.periodFrom ?? "").trim();
    const period_to = String(body.period_to ?? body.periodTo ?? "").trim();
    const period_field = normalizePeriodField(body.period_field ?? body.periodField);

    if (!isIsoDate(period_from) || !isIsoDate(period_to)) {
      return json(req, { ok: false, error: "INVALID_PERIOD_FORMAT" }, 400);
    }

    const fromDate = new Date(`${period_from}T00:00:00.000Z`);
    const toDate = new Date(`${period_to}T00:00:00.000Z`);
    if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime())) {
      return json(req, { ok: false, error: "INVALID_PERIOD_VALUE" }, 400);
    }
    if (fromDate.getTime() > toDate.getTime()) {
      return json(req, { ok: false, error: "PERIOD_FROM_GT_TO" }, 400);
    }
    const toPlus1 = new Date(toDate.getTime() + 24 * 60 * 60 * 1000);

    // Query paginada
    const selectCols =
      "platform,rating,economic_impact_gross,economic_recovered,economic_net_loss,evaluation_date,created_at";

    const PAGE_SIZE = 2000;
    let offset = 0;

    type EvalRow = {
      platform: string | null;
      rating: number | null;
      economic_impact_gross: number | string | null;
      economic_recovered: number | string | null;
      economic_net_loss: number | string | null;
      evaluation_date: string | null;
      created_at: string | null;
    };

    const acc = new Map<string, RowOut>(); // key `${channel}|${platform_key}`
    let totalFetched = 0;

    for (;;) {
      let q = admin
        .from("debacu_evaluations")
        .select(selectCols)
        .eq("customer_id", customer_id)
        .range(offset, offset + PAGE_SIZE - 1);

      if (period_field === "evaluation_date") {
        q = q.gte("evaluation_date", period_from).lte("evaluation_date", period_to);
      } else {
        q = q.gte("created_at", fromDate.toISOString()).lt("created_at", toPlus1.toISOString());
      }

      const { data, error } = await q;
      if (error) return json(req, { ok: false, error: "QUERY_FAILED", detail: error.message }, 500);

      const rows = (data ?? []) as EvalRow[];
      totalFetched += rows.length;

      for (const r of rows) {
        const pn = normPlatform(r.platform);
        const platform_key = platformKeyFromNorm(pn);
        const channel_group = channelGroupFromPlatformKey(platform_key);

        const rating = Math.max(1, Math.min(5, Math.trunc(toNumber(r.rating))));
        const risk = riskBucketFromRating(rating);

        const gross = toNumber(r.economic_impact_gross);
        const recovered = toNumber(r.economic_recovered);
        const netLossRaw = toNumber(r.economic_net_loss);
        const net = computeNetLoss(gross, recovered, netLossRaw);

        const k = `${channel_group}|${platform_key}`;
        const cur =
          acc.get(k) ??
          ({
            channel_group,
            platform_key,
            total_records: 0,
            risk_high: 0,
            risk_medium: 0,
            risk_low: 0,
            pct_high: 0,
            pct_medium: 0,
            pct_low: 0,
            gross_total: 0,
            recovered_total: 0,
            net_total: 0,
            pct_net_share: 0,
          } as RowOut);

        cur.total_records += 1;
        if (risk === "HIGH") cur.risk_high += 1;
        else if (risk === "MEDIUM") cur.risk_medium += 1;
        else cur.risk_low += 1;

        cur.gross_total += gross;
        cur.recovered_total += recovered;
        cur.net_total += net;

        acc.set(k, cur);
      }

      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;

      // guard anti-rango enorme accidental
      if (offset > 20000) break;
    }

    const out = Array.from(acc.values());

    // % riesgos por fila
    for (const r of out) {
      const denom = r.total_records || 1;
      r.pct_high = clamp01(r.risk_high / denom);
      r.pct_medium = clamp01(r.risk_medium / denom);
      r.pct_low = clamp01(r.risk_low / denom);
    }

    // % net share global
    const netSum = out.reduce((s, r) => s + (Number.isFinite(r.net_total) ? r.net_total : 0), 0);
    for (const r of out) {
      r.pct_net_share = netSum > 0 ? clamp01(r.net_total / netSum) : 0;
    }

    // Orden
    const groupOrder: Record<ChannelGroup, number> = { OTA: 0, DIRECTO: 1, B2B: 2, OTROS: 3 };
    out.sort((a, b) => {
      const ga = groupOrder[a.channel_group];
      const gb = groupOrder[b.channel_group];
      if (ga !== gb) return ga - gb;
      return (b.net_total ?? 0) - (a.net_total ?? 0);
    });

    return json(req, {
      ok: true,
      data: {
        meta: {
          app_id: "DEBACU_EVAL",
          org_id,
          customer_id,
          period_from,
          period_to,
          period_field,
          total_fetched: totalFetched,
        },
        rows: out,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const status =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg.startsWith("FORBIDDEN") || msg.startsWith("MEMBERSHIP_FAILED") || msg.startsWith("ORG_LOOKUP_FAILED")
        ? 403
        : 500;

    console.error("customer_revenue_channels_get ERROR", e);
    return json(req, { ok: false, error: "request_failed", detail: msg }, status);
  }
});
