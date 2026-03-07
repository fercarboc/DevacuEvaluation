import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

const MEMBERSHIP_ACTIVE_VALUE = "ACTIVE";

type ReqBody = {
  action?: "CREATE" | "UPDATE" | "TOGGLE_ACTIVE" | "DELETE";
  org_id?: string | null;
  property_id?: string | null;
  id?: string | null;
  code?: string | null;
  name?: string | null;
  capacity?: number | null;
  rooms_count?: number | null;
  base_price?: number | null;
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

async function resolveOrgIdOrThrow(
  sb: ReturnType<typeof supabaseServiceClient>,
  authUserId: string,
  requestedOrgId?: string | null
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
  orgId: string
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
  if (role !== "OWNER" && role !== "ADMIN") throw new Error("ORG_ADMIN_REQUIRED");
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
  if (st !== "ACTIVE" && st !== "TRIAL_ACTIVE") throw new Error("PLAN_NOT_ACTIVE");
}

async function getPropertyOrThrow(
  sb: ReturnType<typeof supabaseServiceClient>,
  orgId: string,
  propertyId?: string | null
) {
  const id = String(propertyId ?? "").trim();
  if (!id || !isUuid(id)) throw new Error("invalid_property_id");

  const { data, error } = await sb
    .from("debacu_eval_properties")
    .select("id, org_id")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`property_lookup_failed:${error.message}`);
  if (!data?.id) throw new Error("PROPERTY_NOT_FOUND");
  return data;
}

async function getRoomTypeOrThrow(
  sb: ReturnType<typeof supabaseServiceClient>,
  orgId: string,
  id?: string | null
) {
  const roomTypeId = String(id ?? "").trim();
  if (!roomTypeId || !isUuid(roomTypeId)) throw new Error("invalid_room_type_id");

  const { data, error } = await sb
    .from("debacu_eval_property_room_types")
    .select("id, org_id, property_id, code, name, capacity, rooms_count, base_price, is_active")
    .eq("id", roomTypeId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`room_type_lookup_failed:${error.message}`);
  if (!data?.id) throw new Error("ROOM_TYPE_NOT_FOUND");
  return data;
}

async function roomTypeCodeExists(
  sb: ReturnType<typeof supabaseServiceClient>,
  propertyId: string,
  code: string,
  excludeId?: string | null
) {
  let q = sb
    .from("debacu_eval_property_room_types")
    .select("id")
    .eq("property_id", propertyId)
    .eq("code", code)
    .limit(1);

  if (excludeId) q = q.neq("id", excludeId);

  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`room_type_code_check_failed:${error.message}`);
  return !!data?.id;
}

function mapRoomType(data: any) {
  return {
    id: data.id,
    orgId: data.org_id,
    propertyId: data.property_id,
    code: data.code,
    name: data.name,
    capacity: data.capacity,
    roomsCount: data.rooms_count,
    basePrice: data.base_price,
    isActive: data.is_active,
  };
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

    if (!action) return json(req, 400, { ok: false, error: "request_failed", detail: "missing_action" });

    const orgId = await resolveOrgIdOrThrow(sb, user.id, body.org_id ?? null);
    await assertOrgAdminOrThrow(sb, user.id, orgId);

    const ent = await loadEntitlementsOrThrow(sb, orgId);
    assertPlanActiveOrThrow(ent);

    if (action === "CREATE") {
      const property = await getPropertyOrThrow(sb, orgId, body.property_id);
      const code = normalizeCode(body.code);
      const name = cleanText(body.name);

      if (!code) return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_code" });
      if (!name) return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_name" });

      const capacity = Number(body.capacity ?? 0);
      const roomsCount = Number(body.rooms_count ?? 0);
      const basePrice = Number(body.base_price ?? 0);

      if (!Number.isFinite(capacity) || capacity < 1) {
        return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_capacity" });
      }
      if (!Number.isFinite(roomsCount) || roomsCount < 1) {
        return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_rooms_count" });
      }
      if (!Number.isFinite(basePrice) || basePrice < 0) {
        return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_base_price" });
      }

      const exists = await roomTypeCodeExists(sb, property.id, code);
      if (exists) {
        return json(req, 409, { ok: false, error: "request_failed", detail: "ROOM_TYPE_CODE_ALREADY_EXISTS" });
      }

      const { data, error } = await sb
        .from("debacu_eval_property_room_types")
        .insert({
          org_id: orgId,
          property_id: property.id,
          code,
          name,
          capacity,
          rooms_count: roomsCount,
          base_price: basePrice,
          is_active: body.is_active ?? true,
        })
        .select("id, org_id, property_id, code, name, capacity, rooms_count, base_price, is_active")
        .single();

      if (error) throw new Error(`room_type_insert_failed:${error.message}`);

      return json(req, 200, {
        ok: true,
        data: mapRoomType(data),
        meta: { orgId, propertyId: property.id },
      });
    }

    if (action === "UPDATE") {
      const current = await getRoomTypeOrThrow(sb, orgId, body.id);
      const code = normalizeCode(body.code);
      const name = cleanText(body.name);

      if (!code) return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_code" });
      if (!name) return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_name" });

      const capacity = Number(body.capacity ?? 0);
      const roomsCount = Number(body.rooms_count ?? 0);
      const basePrice = Number(body.base_price ?? 0);

      if (!Number.isFinite(capacity) || capacity < 1) {
        return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_capacity" });
      }
      if (!Number.isFinite(roomsCount) || roomsCount < 1) {
        return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_rooms_count" });
      }
      if (!Number.isFinite(basePrice) || basePrice < 0) {
        return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_base_price" });
      }

      const exists = await roomTypeCodeExists(sb, current.property_id, code, current.id);
      if (exists) {
        return json(req, 409, { ok: false, error: "request_failed", detail: "ROOM_TYPE_CODE_ALREADY_EXISTS" });
      }

      const { data, error } = await sb
        .from("debacu_eval_property_room_types")
        .update({
          code,
          name,
          capacity,
          rooms_count: roomsCount,
          base_price: basePrice,
          is_active: body.is_active ?? true,
        })
        .eq("id", current.id)
        .eq("org_id", orgId)
        .select("id, org_id, property_id, code, name, capacity, rooms_count, base_price, is_active")
        .single();

      if (error) throw new Error(`room_type_update_failed:${error.message}`);

      return json(req, 200, {
        ok: true,
        data: mapRoomType(data),
        meta: { orgId, propertyId: current.property_id },
      });
    }

    if (action === "TOGGLE_ACTIVE") {
      const current = await getRoomTypeOrThrow(sb, orgId, body.id);

      if (typeof body.is_active !== "boolean") {
        return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_is_active" });
      }

      const { data, error } = await sb
        .from("debacu_eval_property_room_types")
        .update({ is_active: body.is_active })
        .eq("id", current.id)
        .eq("org_id", orgId)
        .select("id, org_id, property_id, code, name, capacity, rooms_count, base_price, is_active")
        .single();

      if (error) throw new Error(`room_type_toggle_failed:${error.message}`);

      return json(req, 200, {
        ok: true,
        data: mapRoomType(data),
        meta: { orgId, propertyId: current.property_id },
      });
    }

    if (action === "DELETE") {
      const current = await getRoomTypeOrThrow(sb, orgId, body.id);

      const { error } = await sb
        .from("debacu_eval_property_room_types")
        .delete()
        .eq("id", current.id)
        .eq("org_id", orgId);

      if (error) throw new Error(`room_type_delete_failed:${error.message}`);

      return json(req, 200, {
        ok: true,
        meta: { orgId, propertyId: current.property_id },
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
    if (msg === "ROOM_TYPE_NOT_FOUND") {
      return json(req, 404, { ok: false, error: "request_failed", detail: "ROOM_TYPE_NOT_FOUND" });
    }
    if (msg.startsWith("invalid_")) {
      return json(req, 400, { ok: false, error: "request_failed", detail: msg });
    }

    console.error("debacu_eval_revenue_room_types_manage error:", msg);
    return json(req, 500, { ok: false, error: "request_failed", detail: "internal_error" });
  }
});