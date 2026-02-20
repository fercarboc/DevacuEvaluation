// supabase/functions/debacu_eval_dashboard_revenue_month/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

/* ======================================================
 * Helpers (fechas / números)
 * ====================================================== */
function startOfMonthISO(d = new Date()): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0));
  return x.toISOString().slice(0, 10);
}

function addMonthsStartISO(monthsBack: number): string {
  const now = new Date();
  const x = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1, 0, 0, 0));
  return x.toISOString().slice(0, 10);
}

function asNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function isUuid(v: unknown): v is string {
  if (typeof v !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function safeUpper(v?: string | null) {
  return (v ?? "").toUpperCase();
}

/* ======================================================
 * Multi-org resolution (membership)
 * ====================================================== */
async function resolveOrgIdForUser(
  sb: ReturnType<typeof supabaseServiceClient>,
  authUserId: string,
  requestedOrgId?: string | null,
): Promise<{ ok: true; org_id: string } | { ok: false; status: number; detail: string }> {
  // Si viene org_id, lo validamos por membership ACTIVE (auth_user_id)
  if (requestedOrgId) {
    if (!isUuid(requestedOrgId)) return { ok: false, status: 400, detail: "invalid_org_id" };

    const { data, error } = await sb
      .from("debacu_eval_org_members")
      .select("org_id")
      .eq("auth_user_id", authUserId)
      .eq("org_id", requestedOrgId)
      .eq("status", "ACTIVE")
      .limit(1)
      .maybeSingle();

    if (error) return { ok: false, status: 500, detail: "DB_ERROR" };
    if (!data?.org_id) return { ok: false, status: 403, detail: "NO_ORG_MEMBERSHIP" };
    return { ok: true, org_id: String(data.org_id) };
  }

  // Fallback determinista: primera membership ACTIVE por created_at asc
  const { data, error } = await sb
    .from("debacu_eval_org_members")
    .select("org_id, created_at")
    .eq("auth_user_id", authUserId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false, status: 500, detail: "DB_ERROR" };
  if (!data?.org_id) return { ok: false, status: 403, detail: "NO_ORG_MEMBERSHIP" };
  return { ok: true, org_id: String(data.org_id) };
}

async function loadEntitlements(
  sb: ReturnType<typeof supabaseServiceClient>,
  orgId: string,
): Promise<
  | {
      ok: true;
      ent: {
        org_id: string;
        customer_id: string | null;
        seats_used: number | null;
        plan_code: string | null;
        max_users: number | null;
        subscription_status: string | null;
      };
    }
  | { ok: false; status: number; detail: string }
> {
  const { data, error } = await sb
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, seats_used, plan_code, max_users, subscription_status")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, detail: "DB_ERROR" };
  if (!data) return { ok: false, status: 403, detail: "NO_ENTITLEMENTS" };

  return { ok: true, ent: data as any };
}

function assertPlanActiveOrThrow(ent: { plan_code: string | null; max_users: number | null; subscription_status: string | null }) {
  const st = safeUpper(ent.subscription_status);
  const ok = st === "ACTIVE" || st === "TRIAL_ACTIVE";
  if (!ent.plan_code || st === "" || !ok) throw new Error("PLAN_NOT_ACTIVE");
}

/* ======================================================
 * Handler
 * ====================================================== */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);

  if (req.method !== "POST") {
    return json(req, 405, {
      ok: false,
      error: "request_failed",
      detail: "method_not_allowed",
    });
  }

  // Auth (JWT-only)
  let user: any;
  try {
    user = await requireUser(req);
  } catch {
    return json(req, 401, { ok: false, error: "request_failed", detail: "UNAUTHENTICATED" });
  }

  const sb = supabaseServiceClient();

  try {
    const body = await req.json().catch(() => ({} as any));
    const requestedOrgId = body?.org_id ?? null;

    // Resolve org (multi-org)
    const orgRes = await resolveOrgIdForUser(sb, user.id, requestedOrgId);
    if (!orgRes.ok) {
      return json(req, orgRes.status, {
        ok: false,
        error: "request_failed",
        detail: orgRes.detail,
      });
    }

    // Entitlements (customer_id + plan)
    const entRes = await loadEntitlements(sb, orgRes.org_id);
    if (!entRes.ok) {
      return json(req, entRes.status, {
        ok: false,
        error: "request_failed",
        detail: entRes.detail,
      });
    }

    // Plan enforcement
    try {
      assertPlanActiveOrThrow(entRes.ent);
    } catch {
      return json(req, 402, {
        ok: false,
        error: "request_failed",
        detail: "PLAN_NOT_ACTIVE",
      });
    }

    const customerId = entRes.ent.customer_id;
    if (!customerId) {
      return json(req, 403, {
        ok: false,
        error: "request_failed",
        detail: "NO_ENTITLEMENTS",
      });
    }

    // Business logic
    const month_from = startOfMonthISO();
    const trend_from = addMonthsStartISO(5); // 6 meses (incluye el actual)

    const { data: rows, error } = await sb
      .from("debacu_evaluations")
      .select("evaluation_date, platform, economic_impact_gross, economic_recovered, economic_net_loss")
      .eq("customer_id", customerId)
      .gte("evaluation_date", trend_from);

    if (error) {
      return json(req, 500, {
        ok: false,
        error: "request_failed",
        detail: "DB_ERROR",
      });
    }

    const list = Array.isArray(rows) ? rows : [];

    // Mes actual
    const monthRows = list.filter((r: any) => {
      const d = String(r.evaluation_date ?? "");
      return d >= month_from;
    });

    const month_incidents = monthRows.length;
    const month_gross = monthRows.reduce((a: number, r: any) => a + asNumber(r.economic_impact_gross), 0);
    const month_recovered = monthRows.reduce((a: number, r: any) => a + asNumber(r.economic_recovered), 0);
    const month_net = monthRows.reduce((a: number, r: any) => a + asNumber(r.economic_net_loss), 0);

    // Mes actual por platform
    const byPlatformMap = new Map<string, { platform: string; incidents: number; net_loss: number }>();
    for (const r of monthRows as any[]) {
      const p = (r.platform ?? "UNKNOWN").toString().trim() || "UNKNOWN";
      const cur = byPlatformMap.get(p) ?? { platform: p, incidents: 0, net_loss: 0 };
      cur.incidents += 1;
      cur.net_loss += asNumber(r.economic_net_loss);
      byPlatformMap.set(p, cur);
    }

    const by_platform = Array.from(byPlatformMap.values()).sort((a, b) => b.net_loss - a.net_loss);

    // Tendencia 6 meses por mes (YYYY-MM)
    const monthKey = (iso: string) => iso.slice(0, 7);
    const trendMap = new Map<string, number>();
    for (const r of list as any[]) {
      const d = String(r.evaluation_date ?? "");
      if (!d) continue;
      const k = monthKey(d);
      trendMap.set(k, (trendMap.get(k) ?? 0) + asNumber(r.economic_net_loss));
    }

    const now = new Date();
    const keys: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const x = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      keys.push(x.toISOString().slice(0, 7));
    }

    const last_6_months = keys.map((k) => ({
      month: k,
      net_loss: Number((trendMap.get(k) ?? 0).toFixed(2)),
    }));

    return json(req, 200, {
      ok: true,
      data: {
        org_id: orgRes.org_id,
        customer_id: customerId,
        month: month_from.slice(0, 7),
        impact: {
          incidents_count: month_incidents,
          gross_loss: Number(month_gross.toFixed(2)),
          recovered: Number(month_recovered.toFixed(2)),
          net_loss: Number(month_net.toFixed(2)),
        },
        by_platform,
        trends: { last_6_months },
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "");
    console.error("debacu_eval_dashboard_revenue_month error:", msg);

    return json(req, 500, {
      ok: false,
      error: "request_failed",
      detail: "internal_error",
    });
  }
});
