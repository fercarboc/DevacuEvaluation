// supabase/functions/debacu_eval_channel_leak_detail_get/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type PeriodField = "evaluation_date" | "created_at";
type ChannelGroup = "OTA" | "DIRECTO" | "B2B" | "OTROS";

type InputBody = {
  channel_group?: ChannelGroup;
  platform_key?: string;

  period_from?: string; // YYYY-MM-DD
  period_to?: string; // YYYY-MM-DD
  period_field?: PeriodField;

  // tolerancia camelCase
  channelGroup?: ChannelGroup;
  platformKey?: string;

  periodFrom?: string;
  periodTo?: string;
  periodField?: string;

  limit?: number;
  offset?: number;
};

type RowOut = {
  id: string;
  evaluation_date: string | null;
  created_at: string | null;

  platform: string | null;
  platform_key: string;
  channel_group: ChannelGroup | "OTROS";

  rating: number;
  risk_bucket: "HIGH" | "MEDIUM" | "LOW";

  incident_type: string | null;

  gross: number;
  recovered: number;
  net: number;

  document: string | null;
  full_name: string | null;
};

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

function normPlatform(platform: unknown): string {
  return String(platform ?? "").trim().toUpperCase();
}

function platformKeyFromNorm(pn: string): string {
  if (!pn) return "UNKNOWN";
  if (pn.includes("BOOKING")) return "BOOKING";
  if (pn.includes("AIRBNB")) return "AIRBNB";
  if (pn.includes("EXPEDIA")) return "EXPEDIA";

  if (pn === "WEB" || pn.includes("WEB ")) return "WEB";
  if (pn === "DIRECT" || pn === "DIRECTA" || pn.includes("DIRECT")) return "DIRECT";
  if (pn.includes("RESERVADOR")) return "RESERVADOR";
  if (pn.includes("MOTOR_PROPIO") || pn.includes("MOTOR PROPIO")) return "MOTOR_PROPIO";
  if (pn.includes("MIRAI")) return "MIRAI";

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
  if (s === "evaluationDate") return "evaluation_date";
  if (s === "createdAt") return "created_at";
  if (s.toLowerCase() === "evaluation_date") return "evaluation_date";
  if (s.toLowerCase() === "created_at") return "created_at";
  return "evaluation_date";
}

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

  let customer_id: string | null = null;
  try {
    const { data: ent, error: entErr } = await admin
      .from("debacu_eval_org_entitlements_v")
      .select("customer_id")
      .eq("org_id", org_id)
      .maybeSingle();
    if (!entErr && ent?.customer_id) customer_id = String(ent.customer_id);
  } catch {}

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { ok: false, error: "method_not_allowed" }, 405);

  try {
    const SUPABASE_URL = mustEnv("SUPABASE_URL");
    const SERVICE_ROLE = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = mustEnv("SUPABASE_ANON_KEY");

    const user = await requireJwtUser(req, SUPABASE_URL, ANON_KEY);
    const admin = adminClient(SUPABASE_URL, SERVICE_ROLE);
    const { org_id, customer_id } = await requireOrgMemberAndCustomerId(admin, user.id);

    const body = (await req.json().catch(() => ({} as any))) as InputBody;

    const channel_group = String(body.channel_group ?? body.channelGroup ?? "").trim().toUpperCase() as ChannelGroup;
    const platform_key_in = String(body.platform_key ?? body.platformKey ?? "").trim().toUpperCase();

    const period_from = String(body.period_from ?? body.periodFrom ?? "").trim();
    const period_to = String(body.period_to ?? body.periodTo ?? "").trim();
    const period_field = normalizePeriodField(body.period_field ?? body.periodField);

    const limit = Math.max(1, Math.min(200, Math.trunc(toNumber(body.limit ?? 25))));
    const offset = Math.max(0, Math.trunc(toNumber(body.offset ?? 0)));

    if (!channel_group || !["OTA", "DIRECTO", "B2B", "OTROS"].includes(channel_group)) {
      return json(req, { ok: false, error: "INVALID_CHANNEL_GROUP" }, 400);
    }
    if (!platform_key_in) return json(req, { ok: false, error: "INVALID_PLATFORM_KEY" }, 400);
    if (!isIsoDate(period_from) || !isIsoDate(period_to)) {
      return json(req, { ok: false, error: "INVALID_PERIOD_FORMAT" }, 400);
    }

    const fromDate = new Date(`${period_from}T00:00:00.000Z`);
    const toDate = new Date(`${period_to}T00:00:00.000Z`);
    if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime())) {
      return json(req, { ok: false, error: "INVALID_PERIOD_VALUE" }, 400);
    }
    if (fromDate.getTime() > toDate.getTime()) return json(req, { ok: false, error: "PERIOD_FROM_GT_TO" }, 400);
    const toPlus1 = new Date(toDate.getTime() + 24 * 60 * 60 * 1000);

    // ✅ RAW (igual que el agregador): NO dependemos de la vista ni de patterns.
    type EvalRow = {
      id: string;
      evaluation_date: string | null;
      created_at: string | null;
      platform: string | null;
      rating: number | null;
      incident_type: string | null;
      economic_impact_gross: number | string | null;
      economic_recovered: number | string | null;
      economic_net_loss: number | string | null;
      document: string | null;
      full_name: string | null;
    };

    let q = admin
      .from("debacu_evaluations")
      .select(
        [
          "id",
          "evaluation_date",
          "created_at",
          "platform",
          "rating",
          "incident_type",
          "economic_impact_gross",
          "economic_recovered",
          "economic_net_loss",
          "document",
          "full_name",
          "customer_id",
        ].join(","),
        { count: "exact" },
      )
      .eq("customer_id", customer_id);

    if (period_field === "evaluation_date") {
      q = q.gte("evaluation_date", period_from).lte("evaluation_date", period_to);
    } else {
      q = q.gte("created_at", fromDate.toISOString()).lt("created_at", toPlus1.toISOString());
    }

    q = q
      .order("evaluation_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false });

    const { data, error, count } = await q;
    if (error) return json(req, { ok: false, error: "QUERY_FAILED", detail: error.message }, 500);

    const all = (data ?? []) as EvalRow[];

    // Filtrado EXACTO en JS (mismo algoritmo)
    const filtered: RowOut[] = [];
    for (const r of all) {
      const pk = platformKeyFromNorm(normPlatform(r.platform));
      const cg = channelGroupFromPlatformKey(pk);

      if (cg !== channel_group) continue;
      if (pk !== platform_key_in) continue;

      const rating = Math.max(1, Math.min(5, Math.trunc(toNumber(r.rating))));
      const risk_bucket = riskBucketFromRating(rating);

      const gross = toNumber(r.economic_impact_gross);
      const recovered = toNumber(r.economic_recovered);
      const net = computeNetLoss(gross, recovered, toNumber(r.economic_net_loss));

      filtered.push({
        id: r.id,
        evaluation_date: r.evaluation_date,
        created_at: r.created_at,
        platform: r.platform,
        platform_key: pk,
        channel_group: cg,
        rating,
        risk_bucket,
        incident_type: r.incident_type,
        gross,
        recovered,
        net,
        document: r.document,
        full_name: r.full_name,
      });
    }

    const totalExact = filtered.length;
    const page = filtered.slice(offset, offset + limit);

    return json(req, {
      ok: true,
      data: {
        meta: {
          app_id: "DEBACU_EVAL",
          org_id,
          customer_id,
          channel_group,
          platform_key: platform_key_in,
          period_from,
          period_to,
          period_field,
        },
        rows: page,
        total: totalExact,
        limit,
        offset,
        // opcional: info de count SQL bruto
        total_in_period_raw: Number(count ?? all.length),
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

    console.error("debacu_eval_channel_leak_detail_get ERROR", e);
    return json(req, { ok: false, error: "request_failed", detail: msg }, status);
  }
});
