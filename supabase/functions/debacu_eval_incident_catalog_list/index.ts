import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/* ======================================================
 * CONST
 * ====================================================== */
const APP_ID = "DEBACU_EVAL";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

/* ======================================================
 * CORS + RESP
 * ====================================================== */
function corsHeaders(origin: string | null) {
  const o = origin ?? "";
  const allowOrigin = ALLOWED_ORIGINS.has(o) ? o : "https://debacu.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

/* ======================================================
 * Utils
 * ====================================================== */
function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`MISSING_ENV:${name}`);
  return v;
}

function logLine(payload: Record<string, unknown>) {
  console.log(JSON.stringify(payload));
}

/* ======================================================
 * Auth (JWT-only)
 * ====================================================== */
function userClient(req: Request, supabaseUrl: string, anonKey: string) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
}

async function requireJwtUser(req: Request, supabaseUrl: string, anonKey: string) {
  const sbUser = userClient(req, supabaseUrl, anonKey);
  const { data, error } = await sbUser.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");
  return data.user;
}

function adminClient(supabaseUrl: string, serviceRole: string) {
  return createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Resuelve tenant context:
 * - org_members: user_id -> org_id
 * - entitlements view (si existe): org_id -> customer_id
 * - fallback: organizations: org_id -> customer_id
 */
async function requireOrgMemberAndCustomerId(
  admin: ReturnType<typeof createClient>,
  userId: string,
) {
  const { data: mem, error: memErr } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memErr) throw new Error(`ORG_MEMBER_LOOKUP_FAILED:${memErr.message}`);
  if (!mem?.org_id) throw new Error("NO_ORG_MEMBERSHIP");

  const org_id = String(mem.org_id);

  // 1) intentar entitlements view
  const { data: ent, error: entErr } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id")
    .eq("org_id", org_id)
    .maybeSingle();

  if (!entErr && ent?.customer_id) {
    return {
      org_id,
      org_role: mem.role ?? null,
      customer_id: String(ent.customer_id),
      app_id: APP_ID,
    };
  }

  // 2) fallback: organizations
  const { data: org, error: orgErr } = await admin
    .from("debacu_eval_organizations")
    .select("id, customer_id")
    .eq("id", org_id)
    .maybeSingle();

  if (orgErr) throw new Error(`ORG_LOOKUP_FAILED:${orgErr.message}`);
  if (!org?.customer_id) throw new Error("ORG_WITHOUT_CUSTOMER");

  return {
    org_id,
    org_role: mem.role ?? null,
    customer_id: String(org.customer_id),
    app_id: APP_ID,
  };
}

/* ======================================================
 * Types
 * ====================================================== */
type BaseIncident = {
  incident_type: string;
  title: string | null;
  description: string | null;
  severity: number | null;
  default_gross_min: number | null;
  default_gross_max: number | null;
  default_recovery_pct: number | null;
  suggested_actions: string | null;
  is_active: boolean;
};

type HotelOverride = {
  incident_type: string;

  // si el hotel quiere desactivar un tipo global, esto debe poder ser false
  is_active: boolean | null;

  severity_override: number | null;
  default_gross_min_override: number | null;
  default_gross_max_override: number | null;
  default_recovery_pct_override: number | null;

  title_override: string | null;
  description_override: string | null;
  suggested_actions_override: string | null;
};

/* ======================================================
 * Handler
 * ====================================================== */
export default Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const FN = "debacu_eval_incident_catalog_list";

  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json(origin, 405, { ok: false, error: "method_not_allowed" });
  }

  try {
    const SUPABASE_URL = mustEnv("SUPABASE_URL");
    const ANON_KEY = mustEnv("SUPABASE_ANON_KEY");
    const SERVICE_ROLE = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    // 1) JWT obligatorio
    const user = await requireJwtUser(req, SUPABASE_URL, ANON_KEY);

    // 2) tenant context
    const admin = adminClient(SUPABASE_URL, SERVICE_ROLE);
    const ctx = await requireOrgMemberAndCustomerId(admin, user.id);

    logLine({
      fn: FN,
      stage: "start",
      user_id: user.id,
      org_id: ctx.org_id,
      customer_id: ctx.customer_id,
      app_id: ctx.app_id,
    });

    // (body opcional, solo para compatibilidad de appId si lo mandas)
    const body = await req.json().catch(() => ({} as any));
    const appId: string = body?.appId ?? ctx.app_id;

    // 3) Catálogo base (global) activo
    const { data: base, error: e1 } = await admin
      .from("debacu_incident_catalog")
      .select(
        "incident_type,title,description,severity,default_gross_min,default_gross_max,default_recovery_pct,suggested_actions,is_active",
      )
      .eq("is_active", true)
      .order("incident_type", { ascending: true });

    if (e1) {
      logLine({ fn: FN, stage: "db_base_failed", error: e1.message });
      return json(origin, 500, { ok: false, error: "db_base_failed", detail: e1.message });
    }

    // 4) Overrides del hotel (leer TODOS, incluidos is_active=false)
    const { data: overrides, error: e2 } = await admin
      .from("debacu_hotel_incident_overrides")
      .select(
        "incident_type,is_active,severity_override,default_gross_min_override,default_gross_max_override,default_recovery_pct_override,title_override,description_override,suggested_actions_override",
      )
      .eq("customer_id", ctx.customer_id);

    if (e2) {
      logLine({ fn: FN, stage: "db_overrides_failed", error: e2.message });
      return json(origin, 500, { ok: false, error: "db_overrides_failed", detail: e2.message });
    }

    const overrideByType = new Map<string, HotelOverride>();
    for (const row of (overrides ?? []) as any[]) {
      const k = String(row?.incident_type ?? "").trim();
      if (!k) continue;
      overrideByType.set(k, {
        incident_type: k,
        is_active: row?.is_active ?? null,
        severity_override: row?.severity_override ?? null,
        default_gross_min_override: row?.default_gross_min_override ?? null,
        default_gross_max_override: row?.default_gross_max_override ?? null,
        default_recovery_pct_override: row?.default_recovery_pct_override ?? null,
        title_override: row?.title_override ?? null,
        description_override: row?.description_override ?? null,
        suggested_actions_override: row?.suggested_actions_override ?? null,
      });
    }

    // 5) Merge effective (global + override)
    const items = ((base ?? []) as any[])
      .map((b) => {
        const g: BaseIncident = {
          incident_type: String(b.incident_type),
          title: b.title ?? null,
          description: b.description ?? null,
          severity: b.severity ?? null,
          default_gross_min: b.default_gross_min ?? null,
          default_gross_max: b.default_gross_max ?? null,
          default_recovery_pct: b.default_recovery_pct ?? null,
          suggested_actions: b.suggested_actions ?? null,
          is_active: !!b.is_active,
        };

        const ov = overrideByType.get(g.incident_type) ?? null;

        // is_active efectivo:
        // - si hay override y pone false -> excluir
        // - si hay override null/true -> incluir
        const isActive = ov ? (ov.is_active ?? true) : g.is_active;
        if (!isActive) return null;

        return {
          incident_type: g.incident_type,
          title: ov?.title_override ?? g.title,
          description: ov?.description_override ?? g.description,
          severity: ov?.severity_override ?? g.severity,
          default_gross_min: ov?.default_gross_min_override ?? g.default_gross_min,
          default_gross_max: ov?.default_gross_max_override ?? g.default_gross_max,
          default_recovery_pct: ov?.default_recovery_pct_override ?? g.default_recovery_pct,
          suggested_actions: ov?.suggested_actions_override ?? g.suggested_actions,
          is_active: true,
          source: ov ? "OVERRIDE" : "GLOBAL",
        };
      })
      .filter(Boolean) as any[];

    items.sort((a: any, b: any) =>
      String(a.incident_type).localeCompare(String(b.incident_type)),
    );

    logLine({
      fn: FN,
      stage: "ok",
      user_id: user.id,
      org_id: ctx.org_id,
      customer_id: ctx.customer_id,
      app_id: ctx.app_id,
      status: 200,
      rows: items.length,
    });

    return json(origin, 200, {
      ok: true,
      appId,
      org_id: ctx.org_id,
      customerId: ctx.customer_id,
      app_id: ctx.app_id,
      items,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    const status =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg.startsWith("MISSING_ENV:")
        ? 500
        : msg === "NO_ORG_MEMBERSHIP"
        ? 403
        : msg.startsWith("ORG_")
        ? 500
        : 500;

    logLine({ fn: "debacu_eval_incident_catalog_list", stage: "error", status, detail: msg });

    return json(origin, status, { ok: false, error: "request_failed", detail: msg });
  }
});
