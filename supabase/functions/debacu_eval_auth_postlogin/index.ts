// supabase/functions/debacu_eval_auth_postlogin/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, requireAdmin, supabaseServiceClient } from "../_shared/auth.ts";

const DEFAULT_APP_CODE = "DEBACU_EVAL";
const DEFAULT_APP_ID = "DEBACU_EVAL";

type Body = {
  appCode?: string; // "DEBACU_EVAL"
  org_id?: string; // recomendado: UI lo manda
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
function normalizeEmail(v: any) {
  return safeStr(v).toLowerCase();
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

  const authUserId = safeStr(authUser?.id);
  const authEmail = normalizeEmail(authUser?.email);

  if (!authUserId) return fail(req, 401, "UNAUTHENTICATED");

  // 2) Body
  const body = (await readJsonSafe<Body>(req)) ?? {};
  const appCode = safeStr(body.appCode) || DEFAULT_APP_CODE;
  const appId = appCode || DEFAULT_APP_ID;

  const requestedOrgId = safeStr(body.org_id ?? "");

  // 3) Service client (consistencia + evitar líos de RLS en postlogin)
  const sb = supabaseServiceClient();

  /**
   * ======================================================
   * MEMBERSHIP HELPERS
   * ======================================================
   * Regla: CANÓNICO = auth_user_id
   * Soportamos legacy (user_id) SOLO para auto-fix (si existe).
   */
  async function fixLegacyMembershipAuthUserId(orgId: string) {
    // Si existe una fila legacy ACTIVE con user_id==authUserId y auth_user_id null, la reparamos.
    const { data: legacy, error: legacyErr } = await sb
      .from("debacu_eval_org_members")
      .select("id, org_id, status, role, user_id, auth_user_id")
      .eq("org_id", orgId)
      .eq("user_id", authUserId)
      .is("auth_user_id", null)
      .maybeSingle();

    if (legacyErr) return { ok: false as const, err: legacyErr };
    if (!legacy?.id) return { ok: true as const, changed: false as const };

    const { error: upErr } = await sb
      .from("debacu_eval_org_members")
      .update({
        auth_user_id: authUserId, // ✅ canónico
        updated_at: new Date().toISOString(),
      })
      .eq("id", legacy.id);

    if (upErr) return { ok: false as const, err: upErr };
    return { ok: true as const, changed: true as const };
  }

  async function promoteInviteToActive(orgId: string) {
    if (!authEmail) return { ok: false as const, reason: "no_email" as const };

    // Promociona INVITED -> ACTIVE vinculando auth_user_id (canónico).
    // Nota: NO tocamos user_id (puede quedarse null).
    const { data, error } = await sb
      .from("debacu_eval_org_members")
      .update({
        status: "ACTIVE",
        auth_user_id: authUserId,
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", orgId)
      .eq("status", "INVITED")
      .ilike("invited_email", authEmail)
      .select("org_id, role, status")
      .maybeSingle();

    if (error) return { ok: false as const, reason: "db" as const, err: error };
    if (!data?.org_id) return { ok: false as const, reason: "not_found" as const };
    return { ok: true as const, mem: data };
  }

  async function loadActiveMembershipInOrg(orgId: string) {
    // Primero intenta canónico
    const { data: mem, error: memErr } = await sb
      .from("debacu_eval_org_members")
      .select("id, org_id, role, status, auth_user_id")
      .eq("org_id", orgId)
      .eq("auth_user_id", authUserId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (memErr) return { kind: "error" as const, error: memErr };
    if (mem?.org_id) return { kind: "found" as const, mem };

    // Auto-fix legacy (user_id) si aplica
    const fix = await fixLegacyMembershipAuthUserId(orgId);
    if (!fix.ok) return { kind: "error" as const, error: fix.err };

    if (fix.changed) {
      const { data: mem2, error: mem2Err } = await sb
        .from("debacu_eval_org_members")
        .select("id, org_id, role, status, auth_user_id")
        .eq("org_id", orgId)
        .eq("auth_user_id", authUserId)
        .eq("status", "ACTIVE")
        .maybeSingle();
      if (mem2Err) return { kind: "error" as const, error: mem2Err };
      if (mem2?.org_id) return { kind: "found" as const, mem: mem2 };
    }

    // Si no hay ACTIVE, intenta promover invitación por email dentro de ese org
    const promoted = await promoteInviteToActive(orgId);
    if (promoted.ok) return { kind: "found" as const, mem: promoted.mem };
    if ((promoted as any).reason === "db") return { kind: "error" as const, error: (promoted as any).err };

    return { kind: "none" as const };
  }

  async function resolveOrgIdFallback() {
    // 1) Primera membership ACTIVE por auth_user_id
    const { data: memA, error: memAErr } = await sb
      .from("debacu_eval_org_members")
      .select("org_id, role, status, created_at")
      .eq("auth_user_id", authUserId)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (memAErr) return { kind: "error" as const, error: memAErr };
    if (memA?.org_id) return { kind: "found" as const, orgId: String(memA.org_id), role: memA.role, status: memA.status };

    // 2) Si no hay ACTIVE, intenta encontrar una invitación (INVITED) por email y promoverla.
    if (!authEmail) return { kind: "none" as const };

    const { data: inv, error: invErr } = await sb
      .from("debacu_eval_org_members")
      .select("org_id, created_at")
      .eq("status", "INVITED")
      .ilike("invited_email", authEmail)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (invErr) return { kind: "error" as const, error: invErr };
    if (!inv?.org_id) return { kind: "none" as const };

    const promoted = await promoteInviteToActive(String(inv.org_id));
    if (!promoted.ok) return { kind: "none" as const };

    return { kind: "found" as const, orgId: String(promoted.mem.org_id), role: promoted.mem.role, status: promoted.mem.status };
  }

  /**
   * ======================================================
   * 4) Resolver org_id + validar membership ACTIVE
   * ======================================================
   */
  let orgId: string | null = requestedOrgId || null;
  let memberRole: string | null = null;
  let memberStatus: string | null = null;

  if (orgId) {
    const res = await loadActiveMembershipInOrg(orgId);
    if (res.kind === "error") return fail(req, 500, "DB_ERROR");
    if (res.kind === "none") return fail(req, 403, "NO_ORG_MEMBERSHIP", { org_id: orgId });

    memberRole = res.mem.role ?? null;
    memberStatus = res.mem.status ?? "ACTIVE";
  } else {
    const res = await resolveOrgIdFallback();
    if (res.kind === "error") return fail(req, 500, "DB_ERROR");
    if (res.kind === "none") return fail(req, 403, "NO_ORG_MEMBERSHIP");

    orgId = res.orgId;
    memberRole = res.role ?? null;
    memberStatus = res.status ?? "ACTIVE";
  }

  /**
   * ======================================================
   * 5) org -> customer_id
   * ======================================================
   */
  const { data: org, error: orgErr } = await sb
    .from("debacu_eval_organizations")
    .select("id, customer_id")
    .eq("id", orgId)
    .maybeSingle();

  if (orgErr) return fail(req, 500, "DB_ERROR");
  if (!org?.customer_id) return fail(req, 403, "NO_ORG", { org_id: orgId });

  const customerId = String(org.customer_id);

  /**
   * ======================================================
   * 6) Entitlements (view)
   * ======================================================
   */
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

  /**
   * ======================================================
   * 7) Admin bypass (tabla debacu_eval_admin_users via requireAdmin)
   * ======================================================
   */
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
        user: { id: authUserId, email: authEmail || null },
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

  /**
   * ======================================================
   * 8) Normal users: requiere entitlement activo
   * ======================================================
   */
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
      user: { id: authUserId, email: authEmail || null },
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
