// supabase/functions/debacu_eval_dashboard_revenue_month/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/* ======================================================
 * ENV
 * ====================================================== */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

/* ======================================================
 * CLIENTS
 * ====================================================== */
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/* ======================================================
 * CORS
 * ====================================================== */
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

function cors(origin: string | null) {
  const o = origin ?? "";
  const allow = ALLOWED_ORIGINS.has(o) ? o : "https://debacu.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    // ✅ JWT-only
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

/* ======================================================
 * Helpers
 * ====================================================== */
function startOfMonthISO(d = new Date()): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0));
  return x.toISOString().slice(0, 10); // YYYY-MM-DD
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

/* ======================================================
 * JWT auth + tenant resolution (no session legacy)
 * ====================================================== */
function userClient(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
}

async function requireJwtUser(req: Request) {
  const sb = userClient(req);
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user?.id) return { ok: false as const, status: 401, detail: "invalid_jwt" };
  return { ok: true as const, user_id: data.user.id };
}

async function requireOrgMemberAndCustomerId(user_id: string) {
  const { data: mem, error: memErr } = await supabaseAdmin
    .from("debacu_eval_org_members")
    .select("org_id, role, created_at")
    .eq("user_id", user_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memErr) return { ok: false as const, status: 403, detail: `membership_failed:${memErr.message}` };
  if (!mem?.org_id) return { ok: false as const, status: 403, detail: "forbidden_no_org" };

  const org_id = String(mem.org_id);

  // customer_id: prefer entitlements view if exists
  let customer_id: string | null = null;

  try {
    const { data: ent, error: entErr } = await supabaseAdmin
      .from("debacu_eval_org_entitlements_v")
      .select("customer_id")
      .eq("org_id", org_id)
      .maybeSingle();

    if (!entErr && ent?.customer_id) customer_id = String(ent.customer_id);
  } catch {
    // view may not exist; ignore
  }

  if (!customer_id) {
    const { data: org, error: orgErr } = await supabaseAdmin
      .from("debacu_eval_organizations")
      .select("customer_id")
      .eq("id", org_id)
      .maybeSingle();

    if (orgErr) return { ok: false as const, status: 403, detail: `org_lookup_failed:${orgErr.message}` };
    if (!org?.customer_id) return { ok: false as const, status: 403, detail: "forbidden_no_customer" };

    customer_id = String(org.customer_id);
  }

  return { ok: true as const, customer_id };
}

/* ======================================================
 * Handler
 * ====================================================== */
serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors(origin) });
  }

  if (req.method !== "POST") {
    return json(origin, 405, { ok: false, detail: "method_not_allowed" });
  }

  // 1) JWT
  const jwt = await requireJwtUser(req);
  if (!jwt.ok) return json(origin, jwt.status, { ok: false, detail: jwt.detail });

  // 2) tenant
  const tenant = await requireOrgMemberAndCustomerId(jwt.user_id);
  if (!tenant.ok) return json(origin, tenant.status, { ok: false, detail: tenant.detail });

  const customer_id = tenant.customer_id;

  try {
    const month_from = startOfMonthISO();
    const trend_from = addMonthsStartISO(5); // incluye mes actual => 6 meses (0..5)

    const { data: rows, error } = await supabaseAdmin
      .from("debacu_evaluations")
      .select("evaluation_date, platform, economic_impact_gross, economic_recovered, economic_net_loss")
      .eq("customer_id", customer_id)
      .gte("evaluation_date", trend_from);

    if (error) throw error;

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

    // Serie ordenada (últimos 6 meses)
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

    return json(origin, 200, {
      ok: true,
      data: {
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
    console.error("debacu_eval_dashboard_revenue_month error:", e);
    return json(origin, 500, { ok: false, detail: "internal_error" });
  }
});
