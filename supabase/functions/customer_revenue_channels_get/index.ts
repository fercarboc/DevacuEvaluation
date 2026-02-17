// supabase/functions/customer_revenue_channels_get/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

type PeriodField = "evaluation_date" | "created_at";
type ChannelGroup = "OTA" | "DIRECTO" | "B2B" | "OTROS";

type InputBody = {
  org_id?: string | null;

  period_from?: string; // YYYY-MM-DD
  period_to?: string; // YYYY-MM-DD
  period_field?: PeriodField;

  // tolerancia camelCase legacy
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

type EntitlementsRow = {
  org_id: string;
  customer_id: string | null;
  subscription_status: string | null; // ACTIVE | null
  plan_code: string | null;
};

type EvalRow = {
  platform: string | null;
  rating: number | null;
  economic_impact_gross: number | string | null;
  economic_recovered: number | string | null;
  economic_net_loss: number | string | null;
  evaluation_date: string | null;
  created_at: string | null;
  customer_id: string | null;
  creator_customer_uuid: string | null;
};

/* ======================================================
 * Helpers (validation + math)
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

function normalizePeriodField(v: unknown): PeriodField {
  const s = String(v ?? "").trim();
  if (!s) return "evaluation_date";
  if (s === "evaluation_date" || s === "created_at") return s;

  // tolerancia camelCase
  if (s === "evaluationDate") return "evaluation_date";
  if (s === "createdAt") return "created_at";

  // tolerancia accidental
  if (s.toLowerCase() === "evaluation_date") return "evaluation_date";
  if (s.toLowerCase() === "created_at") return "created_at";

  return "evaluation_date";
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

  if (
    k === "WEB" ||
    k === "DIRECT" ||
    k === "DIRECTA" ||
    k === "RESERVADOR" ||
    k === "MOTOR_PROPIO" ||
    k === "MIRAI"
  ) {
    return "DIRECTO";
  }

  if (k.startsWith("AGENCIA") || k === "VIAJES") return "B2B";

  return "OTROS";
}

function riskBucketFromRating(rating: number): "HIGH" | "MEDIUM" | "LOW" {
  if (rating <= 2) return "HIGH";
  if (rating === 3) return "MEDIUM";
  return "LOW";
}

function computeNetLoss(gross: number, recovered: number, netLossRaw: number): number {
  // si net_loss está vacío o 0, calculamos gross - recovered
  if (!netLossRaw || netLossRaw === 0) {
    const calc = gross - recovered;
    return calc > 0 ? calc : 0;
  }
  return netLossRaw > 0 ? netLossRaw : 0;
}

/* ======================================================
 * Multi-org + entitlements (service role)
 * ====================================================== */
async function resolveOrgIdForUserOrThrow(
  admin: ReturnType<typeof createClient>,
  userId: string,
  requestedOrgId?: string | null
): Promise<string> {
  // UI debería mandar org_id; si viene, validamos membership activa (o al menos existente).
  if (requestedOrgId) {
    try {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id")
        .eq("org_id", requestedOrgId)
        .eq("user_id", userId)
        .eq("status", "ACTIVE")
        .maybeSingle();

      if (error) throw error;
      if (!data?.org_id) throw new Error("FORBIDDEN");
      return String(data.org_id);
    } catch {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id")
        .eq("org_id", requestedOrgId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error || !data?.org_id) throw new Error("FORBIDDEN");
      return String(data.org_id);
    }
  }

  // fallback determinista: primera ACTIVE; si no, primera por created_at
  try {
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, created_at")
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data?.org_id) throw new Error("FORBIDDEN");
    return String(data.org_id);
  } catch {
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data?.org_id) throw new Error("FORBIDDEN");
    return String(data.org_id);
  }
}

async function loadEntitlementsOrThrow(admin: ReturnType<typeof createClient>, orgId: string) {
  const { data, error } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, subscription_status, plan_code")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error || !data?.org_id) throw new Error("FORBIDDEN");
  return data as EntitlementsRow;
}

function assertPlanActiveOrThrow(ent: EntitlementsRow) {
  if (ent.subscription_status !== "ACTIVE") throw new Error("PLAN_NOT_ACTIVE");
  if (!ent.customer_id) throw new Error("FORBIDDEN");
}

/* ======================================================
 * Query (paginado) + agregación
 * ====================================================== */
async function fetchAndAggregate(
  admin: ReturnType<typeof createClient>,
  customerId: string,
  periodField: PeriodField,
  periodFrom: string,
  periodTo: string
) {
  const PAGE_SIZE = 2000;
  const HARD_LIMIT = 50000; // evita reventar memoria por rangos absurdos
  let offset = 0;

  const fromIso = `${periodFrom}T00:00:00.000Z`;
  // created_at: [from, to+1)
  const toPlus1 = new Date(`${periodTo}T00:00:00.000Z`);
  toPlus1.setUTCDate(toPlus1.getUTCDate() + 1);
  const toIsoExclusive = toPlus1.toISOString();

  const selectCols =
    "platform,rating,economic_impact_gross,economic_recovered,economic_net_loss,evaluation_date,created_at,customer_id,creator_customer_uuid";

  const acc = new Map<string, RowOut>();
  let totalFetched = 0;

  for (;;) {
    let q = admin
      .from("debacu_evaluations")
      .select(selectCols)
      // compat datos sucios: customer_id o creator_customer_uuid
      .or(`customer_id.eq.${customerId},creator_customer_uuid.eq.${customerId}`)
      .range(offset, offset + PAGE_SIZE - 1);

    if (periodField === "evaluation_date") {
      q = q.gte("evaluation_date", periodFrom).lte("evaluation_date", periodTo);
    } else {
      q = q.gte("created_at", fromIso).lt("created_at", toIsoExclusive);
    }

    const { data, error } = await q;
    if (error) throw new Error("request_failed");

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

    if (totalFetched >= HARD_LIMIT) break;
  }

  const out = Array.from(acc.values());

  for (const r of out) {
    const denom = r.total_records || 1;
    r.pct_high = clamp01(r.risk_high / denom);
    r.pct_medium = clamp01(r.risk_medium / denom);
    r.pct_low = clamp01(r.risk_low / denom);
  }

  const netSum = out.reduce((s, r) => s + (Number.isFinite(r.net_total) ? r.net_total : 0), 0);
  for (const r of out) {
    r.pct_net_share = netSum > 0 ? clamp01(r.net_total / netSum) : 0;
  }

  const groupOrder: Record<ChannelGroup, number> = { OTA: 0, DIRECTO: 1, B2B: 2, OTROS: 3 };
  out.sort((a, b) => {
    const ga = groupOrder[a.channel_group];
    const gb = groupOrder[b.channel_group];
    if (ga !== gb) return ga - gb;
    return (b.net_total ?? 0) - (a.net_total ?? 0);
  });

  return { rows: out, total_fetched: totalFetched };
}

/* ======================================================
 * Errors (STRICT)
 * ====================================================== */
function fail(req: Request, status: number, detail: string) {
  return json(req, status, { ok: false, error: "request_failed", detail });
}

function mapError(e: unknown): { status: number; detail: string } {
  const msg = String((e as any)?.message ?? e ?? "request_failed");

  if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") return { status: 401, detail: "UNAUTHENTICATED" };
  if (msg === "PLAN_NOT_ACTIVE") return { status: 402, detail: "PLAN_NOT_ACTIVE" };
  if (msg === "FORBIDDEN") return { status: 403, detail: "FORBIDDEN" };

  if (msg.startsWith("missing_") || msg.startsWith("invalid_")) return { status: 400, detail: msg };

  // fallback
  return { status: 500, detail: "request_failed" };
}

/* ======================================================
 * MAIN (JWT-only, no RPC)
 * ====================================================== */
export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed");

  const admin = supabaseServiceClient();

  try {
    // 1) JWT user
    const user = await requireUser(req);

    // 2) body
    const body = (await req.json().catch(() => ({}))) as InputBody;

    const period_from = String(body.period_from ?? body.periodFrom ?? "").trim();
    const period_to = String(body.period_to ?? body.periodTo ?? "").trim();
    const period_field = normalizePeriodField(body.period_field ?? body.periodField);

    if (!period_from) return fail(req, 400, "missing_period_from");
    if (!period_to) return fail(req, 400, "missing_period_to");
    if (!isIsoDate(period_from)) return fail(req, 400, "invalid_period_from");
    if (!isIsoDate(period_to)) return fail(req, 400, "invalid_period_to");
    if (period_from > period_to) return fail(req, 400, "invalid_period_range");

    // 3) multi-org
    const org_id = await resolveOrgIdForUserOrThrow(admin, user.id, body.org_id ? String(body.org_id) : null);

    // 4) entitlements + plan gate
    const ent = await loadEntitlementsOrThrow(admin, org_id);
    assertPlanActiveOrThrow(ent);

    const customer_id = String(ent.customer_id);

    // 5) query + aggregate
    const { rows, total_fetched } = await fetchAndAggregate(admin, customer_id, period_field, period_from, period_to);

    return json(req, 200, {
      ok: true,
      meta: {
        org_id,
        customer_id,
        period_from,
        period_to,
        period_field,
        total_fetched,
        plan_code: ent.plan_code ?? null,
      },
      rows,
    });
  } catch (e) {
    const mapped = mapError(e);
    return fail(req, mapped.status, mapped.detail);
  }
});
