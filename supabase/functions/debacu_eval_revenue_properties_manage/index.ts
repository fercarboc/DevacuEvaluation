import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

const APP_ID = "DEBACU_EVAL";
const MEMBERSHIP_ACTIVE_VALUE = "ACTIVE";

type ReqBody = {
  action?: "CREATE" | "UPDATE" | "TOGGLE_ACTIVE" | "DELETE";
  org_id?: string | null;
  id?: string | null;
  code?: string | null;
  name?: string | null;
  category?: number | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  timezone?: string | null;
  is_active?: boolean | null;
};

type EntitlementsRow = {
  org_id: string;
  customer_id: string | null;
  subscription_status: string | null;
  plan_code: string | null;
  max_users: number | null;
  seats_used: number | null;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function safeUpper(v?: string | null) {
  return (v ?? "").toUpperCase();
}

function cleanText(v?: string | null) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function normalizeCode(v?: string | null) {
  const s = String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  return s.length ? s : null;
}

function getPlanPropertyLimit(planCode?: string | null): number | null {
  switch (safeUpper(planCode)) {
    case "FREE":
      return 1;
    case "BASIC":
      return 1;
    case "MEDIUM":
      return 2;
    case "PREMIUM":
      return 4;
    case "ENTERPRISE":
      return null; // configurable / sin límite fijo aquí
    default:
      return 1;
  }
}

async function resolveOrgIdOrThrow(
  sb: ReturnType<typeof supabaseServiceClient>,
  authUserId: string,
  requestedOrgId?: string | null,
) {
  if (requestedOrgId) {
    const orgId = String(requestedOrgId).trim();
    if (!isUuid(orgId)) throw new Error("invalid_org_id");

    const { data, error } = await sb
      .from("debacu_eval_org_members")
      .select("org_id")
      .eq("auth_user_id", authUserId)
      .eq("org_id", orgId)
      .eq("status", MEMBERSHIP_ACTIVE_VALUE)
      .maybeSingle();

    if (error) throw new Error(`membership_lookup_failed:${error.message}`);
    if (!data?.org_id) throw new Error("NO_ORG_MEMBERSHIP");
    return orgId;
  }

  const { data, error } = await sb
    .from("debacu_eval_org_members")
    .select("org_id, created_at")
    .eq("auth_user_id", authUserId)
    .eq("status", MEMBERSHIP_ACTIVE_VALUE)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`membership_lookup_failed:${error.message}`);
  if (!data?.org_id) throw new Error("NO_ORG_MEMBERSHIP");
  return String(data.org_id);
}

async function assertOrgAdminOrThrow(
  sb: ReturnType<typeof supabaseServiceClient>,
  authUserId: string,
  orgId: string,
) {
  const { data, error } = await sb
    .from("debacu_eval_org_members")
    .select("role, status")
    .eq("auth_user_id", authUserId)
    .eq("org_id", orgId)
    .eq("status", MEMBERSHIP_ACTIVE_VALUE)
    .maybeSingle();

  if (error) throw new Error(`org_admin_check_failed:${error.message}`);
  if (!data) throw new Error("NO_ORG_MEMBERSHIP");

  const role = safeUpper(data.role);
  if (role !== "OWNER" && role !== "ADMIN") {
    throw new Error("ORG_ADMIN_REQUIRED");
  }
}

async function loadEntitlementsOrThrow(sb: ReturnType<typeof supabaseServiceClient>, orgId: string) {
  const { data, error } = await sb
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, subscription_status, plan_code, max_users, seats_used")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`entitlements_failed:${error.message}`);
  if (!data?.customer_id) throw new Error("NO_ENTITLEMENTS");

  return data as EntitlementsRow;
}

function assertPlanActiveOrThrow(ent: EntitlementsRow) {
  const st = safeUpper(ent.subscription_status);
  const ok = st === "ACTIVE" || st === "TRIAL_ACTIVE";
  if (!ok) throw new Error("PLAN_NOT_ACTIVE");
}

async function countProperties(sb: ReturnType<typeof supabaseServiceClient>, orgId: string) {
  const { count, error } = await sb
    .from("debacu_eval_properties")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);

  if (error) throw new Error(`properties_count_failed:${error.message}`);
  return count ?? 0;
}

async function propertyExistsByCode(
  sb: ReturnType<typeof supabaseServiceClient>,
  orgId: string,
  code: string,
  excludeId?: string | null,
) {
  let q = sb
    .from("debacu_eval_properties")
    .select("id")
    .eq("org_id", orgId)
    .eq("code", code)
    .limit(1);

  if (excludeId) q = q.neq("id", excludeId);

  const { data, error } = await q.maybeSingle();

  if (error) throw new Error(`property_code_check_failed:${error.message}`);
  return !!data?.id;
}

async function getPropertyOrThrow(
  sb: ReturnType<typeof supabaseServiceClient>,
  orgId: string,
  id?: string | null,
) {
  const propertyId = String(id ?? "").trim();
  if (!propertyId) throw new Error("invalid_property_id");
  if (!isUuid(propertyId)) throw new Error("invalid_property_id");

  const { data, error } = await sb
    .from("debacu_eval_properties")
    .select("id, org_id, code, name, category, address, city, country, timezone, is_active")
    .eq("id", propertyId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`property_lookup_failed:${error.message}`);
  if (!data?.id) throw new Error("PROPERTY_NOT_FOUND");

  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "request_failed", detail: "method_not_allowed" });
  }

  const sb = supabaseServiceClient();

  try {
    const user = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as ReqBody;

    const action = safeUpper(body.action);
    if (!action) {
      return json(req, 400, { ok: false, error: "request_failed", detail: "missing_action" });
    }

    const orgId = await resolveOrgIdOrThrow(sb, user.id, body.org_id ?? null);
    await assertOrgAdminOrThrow(sb, user.id, orgId);

    const ent = await loadEntitlementsOrThrow(sb, orgId);
    assertPlanActiveOrThrow(ent);

    const planLimit = getPlanPropertyLimit(ent.plan_code);
    const usedProperties = await countProperties(sb, orgId);

    if (action === "CREATE") {
      const code = normalizeCode(body.code);
      const name = cleanText(body.name);

      if (!code) {
        return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_code" });
      }
      if (!name) {
        return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_name" });
      }

      if (planLimit !== null && usedProperties >= planLimit) {
        return json(req, 409, {
          ok: false,
          error: "request_failed",
          detail: "PROPERTY_LIMIT_REACHED",
          meta: {
            orgId,
            planCode: ent.plan_code,
            maxProperties: planLimit,
            usedProperties,
          },
        });
      }

      const exists = await propertyExistsByCode(sb, orgId, code, null);
      if (exists) {
        return json(req, 409, { ok: false, error: "request_failed", detail: "PROPERTY_CODE_ALREADY_EXISTS" });
      }

      const insertPayload = {
        org_id: orgId,
        code,
        name,
        category: body.category ?? null,
        address: cleanText(body.address),
        city: cleanText(body.city),
        country: cleanText(body.country),
        timezone: cleanText(body.timezone),
        is_active: body.is_active ?? true,
      };

      const { data, error } = await sb
        .from("debacu_eval_properties")
        .insert(insertPayload)
        .select("id, org_id, code, name, category, address, city, country, timezone, is_active")
        .single();

      if (error) throw new Error(`property_insert_failed:${error.message}`);

      return json(req, 200, {
        ok: true,
        data: {
          id: data.id,
          orgId: data.org_id,
          code: data.code,
          name: data.name,
          category: data.category,
          address: data.address,
          city: data.city,
          country: data.country,
          timezone: data.timezone,
          isActive: data.is_active,
        },
        meta: {
          orgId,
          planCode: ent.plan_code,
          maxProperties: planLimit,
          usedProperties: usedProperties + 1,
        },
      });
    }

    if (action === "UPDATE") {
      const current = await getPropertyOrThrow(sb, orgId, body.id);

      const code = normalizeCode(body.code);
      const name = cleanText(body.name);

      if (!code) {
        return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_code" });
      }
      if (!name) {
        return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_name" });
      }

      const exists = await propertyExistsByCode(sb, orgId, code, current.id);
      if (exists) {
        return json(req, 409, { ok: false, error: "request_failed", detail: "PROPERTY_CODE_ALREADY_EXISTS" });
      }

      const updatePayload = {
        code,
        name,
        category: body.category ?? null,
        address: cleanText(body.address),
        city: cleanText(body.city),
        country: cleanText(body.country),
        timezone: cleanText(body.timezone),
      };

      const { data, error } = await sb
        .from("debacu_eval_properties")
        .update(updatePayload)
        .eq("id", current.id)
        .eq("org_id", orgId)
        .select("id, org_id, code, name, category, address, city, country, timezone, is_active")
        .single();

      if (error) throw new Error(`property_update_failed:${error.message}`);

      return json(req, 200, {
        ok: true,
        data: {
          id: data.id,
          orgId: data.org_id,
          code: data.code,
          name: data.name,
          category: data.category,
          address: data.address,
          city: data.city,
          country: data.country,
          timezone: data.timezone,
          isActive: data.is_active,
        },
        meta: {
          orgId,
          planCode: ent.plan_code,
          maxProperties: planLimit,
          usedProperties,
        },
      });
    }

    if (action === "TOGGLE_ACTIVE") {
      const current = await getPropertyOrThrow(sb, orgId, body.id);

      if (typeof body.is_active !== "boolean") {
        return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_is_active" });
      }

      const { data, error } = await sb
        .from("debacu_eval_properties")
        .update({ is_active: body.is_active })
        .eq("id", current.id)
        .eq("org_id", orgId)
        .select("id, org_id, code, name, category, address, city, country, timezone, is_active")
        .single();

      if (error) throw new Error(`property_toggle_failed:${error.message}`);

      return json(req, 200, {
        ok: true,
        data: {
          id: data.id,
          orgId: data.org_id,
          code: data.code,
          name: data.name,
          category: data.category,
          address: data.address,
          city: data.city,
          country: data.country,
          timezone: data.timezone,
          isActive: data.is_active,
        },
        meta: {
          orgId,
          planCode: ent.plan_code,
          maxProperties: planLimit,
          usedProperties,
        },
      });
    }

    if (action === "DELETE") {
      const current = await getPropertyOrThrow(sb, orgId, body.id);

      const { error } = await sb
        .from("debacu_eval_properties")
        .delete()
        .eq("id", current.id)
        .eq("org_id", orgId);

      if (error) throw new Error(`property_delete_failed:${error.message}`);

      return json(req, 200, {
        ok: true,
        meta: {
          orgId,
          planCode: ent.plan_code,
          maxProperties: planLimit,
          usedProperties: Math.max(0, usedProperties - 1),
        },
      });
    }

    return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_action" });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return json(req, 401, { ok: false, error: "request_failed", detail: "UNAUTHENTICATED" });
    }
    if (msg === "PLAN_NOT_ACTIVE") {
      return json(req, 402, { ok: false, error: "request_failed", detail: "PLAN_NOT_ACTIVE" });
    }
    if (msg === "NO_ORG_MEMBERSHIP") {
      return json(req, 403, { ok: false, error: "request_failed", detail: "NO_ORG_MEMBERSHIP" });
    }
    if (msg === "NO_ENTITLEMENTS") {
      return json(req, 403, { ok: false, error: "request_failed", detail: "NO_ENTITLEMENTS" });
    }
    if (msg === "ORG_ADMIN_REQUIRED") {
      return json(req, 403, { ok: false, error: "request_failed", detail: "ORG_ADMIN_REQUIRED" });
    }
    if (msg === "PROPERTY_NOT_FOUND") {
      return json(req, 404, { ok: false, error: "request_failed", detail: "PROPERTY_NOT_FOUND" });
    }
    if (msg.startsWith("invalid_")) {
      return json(req, 400, { ok: false, error: "request_failed", detail: msg });
    }

    console.error("debacu_eval_revenue_properties_manage error:", msg);
    return json(req, 500, { ok: false, error: "request_failed", detail: "internal_error" });
  }
});