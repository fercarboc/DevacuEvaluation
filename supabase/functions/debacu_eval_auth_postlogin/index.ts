// supabase/functions/debacu_eval_auth_postlogin/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// PLATFORM_ADMIN_EMAILS="admin@debacu.com,otro@debacu.com"
const PLATFORM_ADMIN_EMAILS = (Deno.env.get("PLATFORM_ADMIN_EMAILS") ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const PLATFORM_ADMINS = new Set(PLATFORM_ADMIN_EMAILS);

const DEFAULT_APP_CODE = "DEBACU_EVAL";
const DEFAULT_APP_ID = "DEBACU_EVAL";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://debacu.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8" },
  });
}

function getBearer(req: Request) {
  const h = req.headers.get("Authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

type Body = {
  appCode?: string; // "DEBACU_EVAL"
};

type PaywallErrorCode =
  | "UNAUTHENTICATED"
  | "NO_ORG_MEMBERSHIP"
  | "NO_ORG"
  | "NO_ENTITLEMENTS"
  | "SUBSCRIPTION_NOT_ACTIVE"
  | "DATA_INCONSISTENT";

function paywall(req: Request, httpStatus: number, code: PaywallErrorCode, extra?: Record<string, unknown>) {
  return json(req, httpStatus, { ok: false, error_obj: { code, ...(extra ?? {}) } });
}

function safeLower(s: unknown) {
  return typeof s === "string" ? s.trim().toLowerCase() : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const appCode = (body.appCode ?? DEFAULT_APP_CODE).trim() || DEFAULT_APP_CODE;

    const token = getBearer(req);
    if (!token) return paywall(req, 401, "UNAUTHENTICATED");

    // Service role: valida JWT y lee tablas
    const sbAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 0) Validar JWT y obtener auth user
    const { data: u, error: uerr } = await sbAdmin.auth.getUser(token);
    if (uerr || !u?.user) return paywall(req, 401, "UNAUTHENTICATED");

    const authUser = u.user;
    const authEmail = safeLower(authUser.email);
    const isPlatformAdmin = authEmail ? PLATFORM_ADMINS.has(authEmail) : false;

    // 1) Resolver org membership (primera org del usuario)
    const { data: mem, error: memErr } = await sbAdmin
      .from("debacu_eval_org_members")
      .select("org_id, role, status, created_at")
      .eq("user_id", authUser.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (memErr) return json(req, 500, { ok: false, error_obj: { code: "DB_ERROR", message: memErr.message } });
    if (!mem?.org_id) return paywall(req, 403, "NO_ORG_MEMBERSHIP");

    const orgId = String(mem.org_id);
    const memberRole = String(mem.role ?? "USER");
    const memberStatus = String(mem.status ?? "ACTIVE");

    // 2) Resolver org -> customer_id (source of truth Debacu Eval)
    const { data: org, error: orgErr } = await sbAdmin
      .from("debacu_eval_organizations")
      .select("id, customer_id")
      .eq("id", orgId)
      .maybeSingle();

    if (orgErr) return json(req, 500, { ok: false, error_obj: { code: "DB_ERROR", message: orgErr.message } });
    if (!org?.customer_id) return paywall(req, 403, "NO_ORG", { orgId });

    const customerId = String(org.customer_id);
    const appId = appCode || DEFAULT_APP_ID;

    // 3) Entitlements view (org_id -> plan + seats + subscription_status)
    const { data: ent, error: entErr } = await sbAdmin
      .from("debacu_eval_org_entitlements_v")
      .select("org_id, customer_id, seats_used, plan_code, max_users, extra_seats, seats_total, seats_available, subscription_status")
      .eq("org_id", orgId)
      .maybeSingle();

    if (entErr) return json(req, 500, { ok: false, error_obj: { code: "DB_ERROR", message: entErr.message } });

    // Consistencia: ent.customer_id debe coincidir con org.customer_id
    if (ent?.customer_id && String(ent.customer_id) !== customerId) {
      return paywall(req, 409, "DATA_INCONSISTENT", {
        appCode,
        appId,
        orgId,
        orgCustomerId: customerId,
        entitlementCustomerId: ent.customer_id,
      });
    }

    // ==========================================================
    // PLATFORM ADMIN BYPASS
    // ==========================================================
    if (isPlatformAdmin) {
      return json(req, 200, {
        ok: true,
        data: {
          user: { id: authUser.id, email: authUser.email },
          customer: { id: customerId },
          membership: { org_id: orgId, role: "PLATFORM_ADMIN", status: "ACTIVE", base_role: memberRole },
          entitlement: {
            customer_id: customerId,
            plan_code: "INTERNAL_ADMIN",
            subscription_status: "ACTIVE",
            seats_used: Number(ent?.seats_used ?? 1),
            max_users: 999999,
          },
        },
      });
    }

    // ==========================================================
    // NORMAL USERS: requieren entitlement válido
    // ==========================================================
    if (!ent?.subscription_status || !ent?.plan_code) {
      return paywall(req, 402, "NO_ENTITLEMENTS", {
        appCode,
        appId,
        orgId,
        customerId,
        subscription_status: ent?.subscription_status ?? null,
        plan_code: ent?.plan_code ?? null,
      });
    }

    const status = String(ent.subscription_status);
    const entitled = status === "ACTIVE" || status === "TRIAL_ACTIVE";

    if (!entitled) {
      return paywall(req, 402, "SUBSCRIPTION_NOT_ACTIVE", {
        appCode,
        appId,
        orgId,
        customerId,
        status,
      });
    }

    return json(req, 200, {
      ok: true,
      data: {
        user: { id: authUser.id, email: authUser.email },
        customer: { id: customerId },
        membership: { org_id: orgId, role: memberRole, status: memberStatus },
        entitlement: {
          customer_id: customerId,
          plan_code: ent.plan_code,
          subscription_status: status,
          seats_used: Number(ent.seats_used ?? 0),
          max_users: Number(ent.max_users ?? 0),
          extra_seats: Number((ent as any).extra_seats ?? 0),
          seats_total: Number((ent as any).seats_total ?? 0),
          seats_available: Number((ent as any).seats_available ?? 0),
        },
      },
    });
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e ?? "UNKNOWN");
    return json(req, 500, { ok: false, error_obj: { code: "UNEXPECTED", message: msg } });
  }
});
