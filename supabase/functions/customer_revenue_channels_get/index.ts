// supabase/functions/customer_revenue_channels_get/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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
  subscription_status: string | null; // ACTIVE | TRIAL_ACTIVE | null
  plan_code: string | null; // FREE | BASIC | MEDIUM | PREMIUM | ...
};

type EvidenceRow = {
  platform_code: string | null;
  platform_raw: string | null;
  channel_code: string | null;
  rating: number | null;
  economic_impact_gross: number | string | null;
  economic_recovered: number | string | null;
  economic_net_loss: number | string | null;
  event_date: string | null;
  created_at: string | null;
};

type OrgResolvedBy = "requested" | "first_active" | "first_any";

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

function normText(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

function platformKeyFromRow(r: EvidenceRow): string {
  const pCode = normText(r.platform_code);
  const pRaw = normText(r.platform_raw);

  const base = pCode || pRaw;
  if (!base) return "UNKNOWN";

  if (base.includes("BOOKING")) return "BOOKING";
  if (base.includes("AIRBNB")) return "AIRBNB";
  if (base.includes("EXPEDIA")) return "EXPEDIA";

  if (base === "WEB" || base.includes("WEB ")) return "WEB";
  if (base === "DIRECT" || base === "DIRECTA" || base.includes("DIRECT")) return "DIRECT";
  if (base.includes("RESERVADOR")) return "RESERVADOR";
  if (base.includes("MOTOR_PROPIO") || base.includes("MOTOR PROPIO")) return "MOTOR_PROPIO";
  if (base.includes("MIRAI")) return "MIRAI";

  if (base.startsWith("AGENCIA") || base.includes("AGENCIA")) return "AGENCIA";
  if (base.includes("VIAJES")) return "VIAJES";

  return base.replace(/\s+/g, "_");
}

function channelGroupFromRow(r: EvidenceRow, platformKey: string): ChannelGroup {
  const cCode = normText(r.channel_code);
  const pk = platformKey.toUpperCase();

  if (cCode === "OTA") return "OTA";
  if (cCode === "DIRECTO" || cCode === "DIRECT") return "DIRECTO";
  if (cCode === "B2B") return "B2B";
  if (cCode === "OTROS" || cCode === "OTHER") return "OTROS";

  if (pk === "BOOKING" || pk === "AIRBNB" || pk === "EXPEDIA") return "OTA";

  if (
    pk === "WEB" ||
    pk === "DIRECT" ||
    pk === "DIRECTA" ||
    pk === "RESERVADOR" ||
    pk === "MOTOR_PROPIO" ||
    pk === "MIRAI"
  ) {
    return "DIRECTO";
  }

  if (pk.startsWith("AGENCIA") || pk === "VIAJES") return "B2B";

  return "OTROS";
}

function riskBucketFromRating(ratingRaw: unknown): "HIGH" | "MEDIUM" | "LOW" {
  const rating = Math.max(1, Math.min(5, Math.trunc(toNumber(ratingRaw))));
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

/* ======================================================
 * Multi-org + entitlements (service role)
 * ====================================================== */
async function resolveOrgIdForUserOrThrow(
  admin: SupabaseClient,
  userId: string,
  requestedOrgId?: string | null,
): Promise<{ orgId: string; resolvedBy: OrgResolvedBy }> {
  const uid = String(userId);

  if (requestedOrgId) {
    try {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id")
        .eq("org_id", requestedOrgId)
        .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
        .eq("status", "ACTIVE")
        .maybeSingle();

      if (error) throw error;
      if (!data?.org_id) throw new Error("FORBIDDEN");
      return { orgId: String(data.org_id), resolvedBy: "requested" };
    } catch {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id")
        .eq("org_id", requestedOrgId)
        .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
        .maybeSingle();

      if (error || !data?.org_id) throw new Error("FORBIDDEN");
      return { orgId: String(data.org_id), resolvedBy: "requested" };
    }
  }

  try {
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, created_at")
      .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data?.org_id) throw new Error("FORBIDDEN");
    return { orgId: String(data.org_id), resolvedBy: "first_active" };
  } catch {
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, created_at")
      .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data?.org_id) throw new Error("FORBIDDEN");
    return { orgId: String(data.org_id), resolvedBy: "first_any" };
  }
}

async function loadEntitlementsOrThrow(admin: SupabaseClient, orgId: string) {
  const { data, error } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, subscription_status, plan_code")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error || !data?.org_id) throw new Error("FORBIDDEN");
  return data as EntitlementsRow;
}

/**
 * Gate del módulo Revenue:
 * - Suscripción habilitada: ACTIVE o TRIAL_ACTIVE
 * - Plan permitido: MEDIUM o PREMIUM
 */
function assertRevenueAllowedOrThrow(ent: EntitlementsRow) {
  const st = String(ent.subscription_status ?? "").toUpperCase();
  if (st !== "ACTIVE" && st !== "TRIAL_ACTIVE") throw new Error("PLAN_NOT_ACTIVE");

  const pc = String(ent.plan_code ?? "").toUpperCase();
  if (!pc) throw new Error("PLAN_NOT_ACTIVE");

  const ALLOWED_PLANS = new Set(["MEDIUM", "PREMIUM"]);
  if (!ALLOWED_PLANS.has(pc)) throw new Error("FORBIDDEN");

  if (!ent.customer_id) throw new Error("FORBIDDEN");
}

/* ======================================================
 * Query (paginado) + agregación
 * ====================================================== */
async function fetchAndAggregate(
  admin: SupabaseClient,
  orgId: string,
  periodField: PeriodField,
  periodFrom: string,
  periodTo: string,
) {
  const PAGE_SIZE = 2000;
  const HARD_LIMIT = 50000;
  let offset = 0;

  const fromIso = `${periodFrom}T00:00:00.000Z`;
  const toPlus1 = new Date(`${periodTo}T00:00:00.000Z`);
  toPlus1.setUTCDate(toPlus1.getUTCDate() + 1);
  const toIsoExclusive = toPlus1.toISOString();

  const selectCols = [
    "platform_code",
    "platform_raw",
    "channel_code",
    "rating",
    "economic_impact_gross",
    "economic_recovered",
    "economic_net_loss",
    "event_date",
    "created_at",
  ].join(",");

  const acc = new Map<string, RowOut>();
  let totalFetched = 0;

  for (;;) {
    let q = admin
      .from("debacu_eval_org_guest_evidence")
      .select(selectCols)
      .eq("org_id", orgId)
      .range(offset, offset + PAGE_SIZE - 1);

    if (periodField === "evaluation_date") {
      q = q.gte("event_date", periodFrom).lte("event_date", periodTo);
    } else {
      q = q.gte("created_at", fromIso).lt("created_at", toIsoExclusive);
    }

    const { data, error } = await q;
    if (error) throw new Error(`request_failed:${error.message}`);

    const rows = (data ?? []) as EvidenceRow[];
    totalFetched += rows.length;

    for (const r of rows) {
      const platform_key = platformKeyFromRow(r);
      const channel_group = channelGroupFromRow(r, platform_key);

      const risk = riskBucketFromRating(r.rating);

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
 * Errors
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

  return { status: 500, detail: msg.startsWith("request_failed:") ? msg : "request_failed" };
}

/* ======================================================
 * MAIN
 * ====================================================== */
export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed");

  const admin = supabaseServiceClient();

  try {
    const user = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as InputBody;

    const period_from = String(body.period_from ?? body.periodFrom ?? "").trim();
    const period_to = String(body.period_to ?? body.periodTo ?? "").trim();
    const period_field = normalizePeriodField(body.period_field ?? body.periodField);

    if (!period_from) return fail(req, 400, "missing_period_from");
    if (!period_to) return fail(req, 400, "missing_period_to");
    if (!isIsoDate(period_from)) return fail(req, 400, "invalid_period_from");
    if (!isIsoDate(period_to)) return fail(req, 400, "invalid_period_to");
    if (period_from > period_to) return fail(req, 400, "invalid_period_range");

    const { orgId: org_id, resolvedBy: org_id_resolved_by } = await resolveOrgIdForUserOrThrow(
      admin,
      user.id,
      body.org_id ? String(body.org_id) : null,
    );

    const ent = await loadEntitlementsOrThrow(admin, org_id);
    assertRevenueAllowedOrThrow(ent);

    const { rows, total_fetched } = await fetchAndAggregate(
      admin,
      org_id,
      period_field,
      period_from,
      period_to,
    );

    return json(req, 200, {
      ok: true,
      meta: {
        org_id,
        org_id_resolved_by,
        customer_id: ent.customer_id ?? null,
        period_from,
        period_to,
        period_field,
        total_fetched,
        source_table: "debacu_eval_org_guest_evidence",
        plan_code: ent.plan_code ?? null,
        subscription_status: ent.subscription_status ?? null,
      },
      rows,
    });
  } catch (e) {
    const mapped = mapError(e);
    return fail(req, mapped.status, mapped.detail);
  }
});