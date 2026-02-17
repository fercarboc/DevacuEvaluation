// supabase/functions/debacu_eval_channel_leak_detail_get/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

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

  // multi-org
  org_id?: string;
  orgId?: string;
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

function isUuid(v: unknown): v is string {
  if (typeof v !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function isMissingColumnError(msg: string) {
  return /column .* does not exist/i.test(msg);
}

/** =====================================================
 * Multi-org: resolve org_id (validate membership ACTIVE)
 * ===================================================== */
async function resolveOrgIdForUser(
  sbAdmin: ReturnType<typeof createClient>,
  userId: string,
  requestedOrgId?: string,
): Promise<{ ok: true; org_id: string } | { ok: false; status: number; detail: string }> {
  // 1) Si viene org_id => validar membership
  if (requestedOrgId) {
    // Intento con status=ACTIVE (schema final)
    const q1 = await sbAdmin
      .from("debacu_eval_org_members")
      .select("org_id")
      .eq("user_id", userId)
      .eq("org_id", requestedOrgId)
      .eq("status", "ACTIVE")
      .limit(1)
      .maybeSingle();

    if (q1.error) {
      // Fallback si no existe columna status
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

  // 2) Fallback determinista: primera membership ACTIVE
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
  | { ok: true; customer_id: string; subscription_status: string | null; plan_code: string | null }
  | { ok: false; status: number; detail: string }
> {
  const { data, error } = await sbAdmin
    .from("debacu_eval_org_entitlements_v")
    .select("customer_id, subscription_status, plan_code")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, detail: "request_failed" };
  const customer_id = data?.customer_id ? String(data.customer_id) : "";
  if (!customer_id) return { ok: false, status: 403, detail: "FORBIDDEN" };

  return { ok: true, customer_id, subscription_status: (data as any)?.subscription_status ?? null, plan_code: (data as any)?.plan_code ?? null };
}

function assertPlanActive(subscription_status: string | null) {
  // Según tu regla: 402 cuando aplique.
  // Si tu view solo devuelve ACTIVE, esto no molesta. Si mañana mete más estados, te cubre.
  if (subscription_status && subscription_status !== "ACTIVE") return false;
  return true;
}

/** =====================================================
 * Handler
 * ===================================================== */
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
    const body = (await req.json().catch(() => ({} as any))) as InputBody;

    const channel_group = String(body.channel_group ?? body.channelGroup ?? "")
      .trim()
      .toUpperCase() as ChannelGroup;

    const platform_key_in = String(body.platform_key ?? body.platformKey ?? "")
      .trim()
      .toUpperCase();

    const period_from = String(body.period_from ?? body.periodFrom ?? "").trim();
    const period_to = String(body.period_to ?? body.periodTo ?? "").trim();
    const period_field = normalizePeriodField(body.period_field ?? body.periodField);

    const limit = Math.max(1, Math.min(200, Math.trunc(toNumber(body.limit ?? 25))));
    const offset = Math.max(0, Math.trunc(toNumber(body.offset ?? 0)));

    const requestedOrgId = (body.org_id ?? body.orgId ?? "") ? String(body.org_id ?? body.orgId) : undefined;
    if (requestedOrgId != null && requestedOrgId !== undefined && requestedOrgId !== "" && !isUuid(requestedOrgId)) {
      return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_org_id" });
    }

    if (!channel_group || !["OTA", "DIRECTO", "B2B", "OTROS"].includes(channel_group)) {
      return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_channel_group" });
    }
    if (!platform_key_in) {
      return json(req, 400, { ok: false, error: "request_failed", detail: "missing_platform_key" });
    }
    if (!isIsoDate(period_from) || !isIsoDate(period_to)) {
      return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_period_format" });
    }

    const fromDate = new Date(`${period_from}T00:00:00.000Z`);
    const toDate = new Date(`${period_to}T00:00:00.000Z`);
    if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime())) {
      return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_period_value" });
    }
    if (fromDate.getTime() > toDate.getTime()) {
      return json(req, 400, { ok: false, error: "request_failed", detail: "period_from_gt_to" });
    }
    const toPlus1 = new Date(toDate.getTime() + 24 * 60 * 60 * 1000);

    // Resolve org (multi-org) + entitlements
    const orgRes = await resolveOrgIdForUser(sbAdmin, user.id, requestedOrgId && requestedOrgId !== "" ? requestedOrgId : undefined);
    if (!orgRes.ok) {
      return json(req, orgRes.status, { ok: false, error: "request_failed", detail: orgRes.detail });
    }

    const entRes = await loadEntitlements(sbAdmin, orgRes.org_id);
    if (!entRes.ok) {
      return json(req, entRes.status, { ok: false, error: "request_failed", detail: entRes.detail });
    }

    if (!assertPlanActive(entRes.subscription_status)) {
      return json(req, 402, { ok: false, error: "request_failed", detail: "PLAN_NOT_ACTIVE" });
    }

    const customer_id = entRes.customer_id;

    // =====================================================
    // Query RAW (igual que agregador) + filtrado exacto en JS
    // =====================================================
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

    let q = sbAdmin
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
    if (error) {
      return json(req, 500, { ok: false, error: "request_failed", detail: "request_failed" });
    }

    const all = (data ?? []) as EvalRow[];

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

    return json(req, 200, {
      ok: true,
      data: {
        meta: {
          app_id: "DEBACU_EVAL",
          org_id: orgRes.org_id,
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
        total_in_period_raw: Number(count ?? all.length),
      },
    });
  } catch {
    // higiene: no filtrar stack
    return json(req, 500, { ok: false, error: "request_failed", detail: "internal_error" });
  }
});
