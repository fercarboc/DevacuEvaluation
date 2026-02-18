// supabase/functions/debacu_eval_auth_postlogin/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, requireAdmin, supabaseServiceClient } from "../_shared/auth.ts";

const DEFAULT_APP_CODE = "DEBACU_EVAL";
const DEFAULT_APP_ID = "DEBACU_EVAL";

type Body = {
  appCode?: string; // "DEBACU_EVAL"
  org_id?: string; // ✅ recomendado: UI siempre lo manda
};

type PaywallErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "missing_org_id"
  | "invalid_org_id"
  | "NO_ORG_MEMBERSHIP"
  | "NO_ORG"
  | "NO_ENTITLEMENTS"
  | "PLAN_NOT_ACTIVE"
  | "DATA_INCONSISTENT"
  | "DB_ERROR"
  | "METHOD_NOT_ALLOWED";

function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

async function readJsonSafe<T>(req: Request): Promise<T | null> {
  try {
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function fail(req: Request, status: number, code: PaywallErrorCode, extra?: Record<string, unknown>) {
  return json(req, status, {
    ok: false,
    error: "request_failed",
    detail: code,
    ...(extra ?? {}),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return fail(req, 405, "METHOD_NOT_ALLOWED");

  // 1) Auth (JWT-only)
  let authUser: any;
  try {
    authUser = await requireUser(req);
  } catch {
    return fail(req, 401, "UNAUTHENTICATED");
  }

  // 2) Body
  const body = (await readJsonSafe<Body>(req)) ?? {};
  const appCode = safeStr(body.appCode) || DEFAULT_APP_CODE;
  const appId = appCode || DEFAULT_APP_ID;

  const requestedOrgId = safeStr(body.org_id ?? "");

  // 3) Service client para DB (consistencia)
  const sb = supabaseServiceClient();

  // 4) Resolver org_id + validar membership ACTIVE
  // ⚠️ IMPORTANTE: org_members usa auth_user_id (no user_id)
  let orgId: string | null = requestedOrgId || null;
  let memberRole: string | null = null;
  let memberStatus: string | null = null;

  if (orgId) {
    const { data: mem, error: memErr } = await sb
      .from("debacu_eval_org_members")
      .select("org_id, role, status")
      .eq("org_id", orgId)
      .eq("auth_user_id", authUser.id)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (memErr) return fail(req, 500, "DB_ERROR");
    if (!mem?.org_id) return fail(req, 403, "NO_ORG_MEMBERSHIP", { org_id: orgId });

    memberRole = mem.role ?? null;
    memberStatus = mem.status ?? "ACTIVE";
  } else {
    // fallback determinista: primera ACTIVE por created_at asc
    const { data: mem, error: memErr } = await sb
      .from("debacu_eval_org_members")
      .select("org_id, role, status, created_at")
      .eq("auth_user_id", authUser.id)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (memErr) return fail(req, 500, "DB_ERROR");
    if (!mem?.org_id) return fail(req, 403, "NO_ORG_MEMBERSHIP");

    orgId = String(mem.org_id);
    memberRole = mem.role ?? null;
    memberStatus = mem.status ?? "ACTIVE";
  }

  // 5) org -> customer_id
  const { data: org, error: orgErr } = await sb
    .from("debacu_eval_organizations")
    .select("id, customer_id")
    .eq("id", orgId)
    .maybeSingle();

  if (orgErr) return fail(req, 500, "DB_ERROR");
  if (!org?.customer_id) return fail(req, 403, "NO_ORG", { org_id: orgId });

  const customerId = String(org.customer_id);

  // 6) Entitlements (view)
  const { data: ent, error: entErr } = await sb
    .from("debacu_eval_org_entitlements_v")
    .select(
      [
        "org_id",
        "customer_id",
        "seats_used",
        "plan_code",
        "max_users",
        "extra_seats",
        "seats_total",
        "seats_available",
        "subscription_status",
      ].join(","),
    )
    .eq("org_id", orgId)
    .maybeSingle();

  if (entErr) return fail(req, 500, "DB_ERROR");

  // Consistencia: ent.customer_id debe coincidir con org.customer_id
  if (ent?.customer_id && String(ent.customer_id) !== customerId) {
    return fail(req, 500, "DATA_INCONSISTENT", {
      appCode,
      appId,
      org_id: orgId,
      orgCustomerId: customerId,
      entitlementCustomerId: ent.customer_id,
    });
  }

  // 7) Admin bypass (por tabla debacu_eval_admin_users via requireAdmin)
  let isPlatformAdmin = false;
  try {
    await requireAdmin(req);
    isPlatformAdmin = true;
  } catch {
    isPlatformAdmin = false;
  }

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
          extra_seats: Number((ent as any)?.extra_seats ?? 0),
          seats_total: Number((ent as any)?.seats_total ?? 999999),
          seats_available: Number((ent as any)?.seats_available ?? 999999),
        },
      },
    });
  }

  // 8) Normal users: requiere entitlement activo
  if (!ent?.subscription_status || !ent?.plan_code) {
    return fail(req, 402, "PLAN_NOT_ACTIVE", {
      appCode,
      appId,
      org_id: orgId,
      customer_id: customerId,
      subscription_status: ent?.subscription_status ?? null,
      plan_code: ent?.plan_code ?? null,
    });
  }

  const status = String(ent.subscription_status);
  const entitled = status === "ACTIVE" || status === "TRIAL_ACTIVE";

  if (!entitled) {
    return fail(req, 402, "PLAN_NOT_ACTIVE", {
      appCode,
      appId,
      org_id: orgId,
      customer_id: customerId,
      subscription_status: status,
    });
  }

  return json(req, 200, {
    ok: true,
    data: {
      user: { id: authUser.id, email: authUser.email },
      customer: { id: customerId },
      membership: { org_id: orgId, role: memberRole ?? "USER", status: memberStatus ?? "ACTIVE" },
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
});
