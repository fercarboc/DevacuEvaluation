import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

const APP_ID = "DEBACU_EVAL";
const MEMBERSHIP_ACTIVE_VALUE = "ACTIVE";

type ReqBody = {
  action?: "UPSERT" | "DELETE";
  org_id?: string | null;
  id?: string | null;
  property_id?: string | null;
  room_type_id?: string | null;
  date?: string | null;
  price?: number | null;
  min_stay?: number | null;
  closed?: boolean | null;
};

type EntitlementsRow = {
  org_id: string;
  customer_id: string | null;
  subscription_status: string | null;
  plan_code: string | null;
  max_users: number | null;
  seats_used: number | null;
};

type RoomPriceRow = {
  id: string;
  org_id: string;
  property_id: string;
  room_type_id: string;
  date: string;
  price: number | null;
  min_stay: number | null;
  closed: boolean;
  created_at: string;
  updated_at: string;
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

function normalizeDate(v?: string | null) {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function normalizeNumber(v: unknown, fallback: number) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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

async function loadEntitlementsOrThrow(
  sb: ReturnType<typeof supabaseServiceClient>,
  orgId: string,
) {
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

async function getPropertyOrThrow(
  sb: ReturnType<typeof supabaseServiceClient>,
  orgId: string,
  propertyId?: string | null,
) {
  const id = String(propertyId ?? "").trim();
  if (!id || !isUuid(id)) throw new Error("invalid_property_id");

  const { data, error } = await sb
    .from("debacu_eval_properties")
    .select("id, org_id, code, name, is_active")
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
  propertyId: string,
  roomTypeId?: string | null,
) {
  const id = String(roomTypeId ?? "").trim();
  if (!id || !isUuid(id)) throw new Error("invalid_room_type_id");

  const { data, error } = await sb
    .from("debacu_eval_property_room_types")
    .select("id, org_id, property_id, code, name, is_active")
    .eq("id", id)
    .eq("org_id", orgId)
    .eq("property_id", propertyId)
    .maybeSingle();

  if (error) throw new Error(`room_type_lookup_failed:${error.message}`);
  if (!data?.id) throw new Error("ROOM_TYPE_NOT_FOUND");

  return data;
}

async function getRoomPriceOrThrow(
  sb: ReturnType<typeof supabaseServiceClient>,
  orgId: string,
  id?: string | null,
) {
  const roomPriceId = String(id ?? "").trim();
  if (!roomPriceId || !isUuid(roomPriceId)) throw new Error("invalid_room_price_id");

  const { data, error } = await sb
    .from("debacu_eval_room_prices")
    .select("id, org_id, property_id, room_type_id, date, price, min_stay, closed, created_at, updated_at")
    .eq("id", roomPriceId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`room_price_lookup_failed:${error.message}`);
  if (!data?.id) throw new Error("ROOM_PRICE_NOT_FOUND");

  return data as RoomPriceRow;
}

function mapRoomPriceRow(row: RoomPriceRow) {
  return {
    id: row.id,
    orgId: row.org_id,
    propertyId: row.property_id,
    roomTypeId: row.room_type_id,
    date: row.date,
    price: row.price,
    minStay: row.min_stay,
    closed: row.closed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);

  if (req.method !== "POST") {
    return json(req, 405, {
      ok: false,
      error: "request_failed",
      detail: "method_not_allowed",
    });
  }

  const sb = supabaseServiceClient();

  try {
    const user = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as ReqBody;

    const action = safeUpper(body.action);
    if (!action) {
      return json(req, 400, {
        ok: false,
        error: "request_failed",
        detail: "missing_action",
      });
    }

    const orgId = await resolveOrgIdOrThrow(sb, user.id, body.org_id ?? null);
    await assertOrgAdminOrThrow(sb, user.id, orgId);

    const ent = await loadEntitlementsOrThrow(sb, orgId);
    assertPlanActiveOrThrow(ent);

    if (action === "UPSERT") {
      const propertyId = cleanText(body.property_id);
      const roomTypeId = cleanText(body.room_type_id);
      const date = normalizeDate(body.date);

      const price = normalizeNumber(body.price, 0);
      const minStay = Math.trunc(normalizeNumber(body.min_stay, 1));
      const closed = typeof body.closed === "boolean" ? body.closed : false;

      if (!propertyId || !isUuid(propertyId)) {
        return json(req, 400, {
          ok: false,
          error: "request_failed",
          detail: "invalid_property_id",
        });
      }

      if (!roomTypeId || !isUuid(roomTypeId)) {
        return json(req, 400, {
          ok: false,
          error: "request_failed",
          detail: "invalid_room_type_id",
        });
      }

      if (!date) {
        return json(req, 400, {
          ok: false,
          error: "request_failed",
          detail: "invalid_date",
        });
      }

      if (price < 0) {
        return json(req, 400, {
          ok: false,
          error: "request_failed",
          detail: "invalid_price",
        });
      }

      if (!Number.isInteger(minStay) || minStay < 1) {
        return json(req, 400, {
          ok: false,
          error: "request_failed",
          detail: "invalid_min_stay",
        });
      }

      await getPropertyOrThrow(sb, orgId, propertyId);
      await getRoomTypeOrThrow(sb, orgId, propertyId, roomTypeId);

      const payload = {
        org_id: orgId,
        property_id: propertyId,
        room_type_id: roomTypeId,
        date,
        price,
        min_stay: minStay,
        closed,
      };

      const { data, error } = await sb
        .from("debacu_eval_room_prices")
        .upsert(payload, {
          onConflict: "property_id,room_type_id,date",
        })
        .select("id, org_id, property_id, room_type_id, date, price, min_stay, closed, created_at, updated_at")
        .single();

      if (error) throw new Error(`room_price_upsert_failed:${error.message}`);

      return json(req, 200, {
        ok: true,
        data: mapRoomPriceRow(data as RoomPriceRow),
        meta: {
          orgId,
          planCode: ent.plan_code,
          appId: APP_ID,
        },
      });
    }

    if (action === "DELETE") {
      const current = await getRoomPriceOrThrow(sb, orgId, body.id);

      const { error } = await sb
        .from("debacu_eval_room_prices")
        .delete()
        .eq("id", current.id)
        .eq("org_id", orgId);

      if (error) throw new Error(`room_price_delete_failed:${error.message}`);

      return json(req, 200, {
        ok: true,
        meta: {
          orgId,
          planCode: ent.plan_code,
          appId: APP_ID,
        },
      });
    }

    return json(req, 400, {
      ok: false,
      error: "request_failed",
      detail: "invalid_action",
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return json(req, 401, {
        ok: false,
        error: "request_failed",
        detail: "UNAUTHENTICATED",
      });
    }

    if (msg === "PLAN_NOT_ACTIVE") {
      return json(req, 402, {
        ok: false,
        error: "request_failed",
        detail: "PLAN_NOT_ACTIVE",
      });
    }

    if (msg === "NO_ORG_MEMBERSHIP") {
      return json(req, 403, {
        ok: false,
        error: "request_failed",
        detail: "NO_ORG_MEMBERSHIP",
      });
    }

    if (msg === "NO_ENTITLEMENTS") {
      return json(req, 403, {
        ok: false,
        error: "request_failed",
        detail: "NO_ENTITLEMENTS",
      });
    }

    if (msg === "ORG_ADMIN_REQUIRED") {
      return json(req, 403, {
        ok: false,
        error: "request_failed",
        detail: "ORG_ADMIN_REQUIRED",
      });
    }

    if (msg === "PROPERTY_NOT_FOUND") {
      return json(req, 404, {
        ok: false,
        error: "request_failed",
        detail: "PROPERTY_NOT_FOUND",
      });
    }

    if (msg === "ROOM_TYPE_NOT_FOUND") {
      return json(req, 404, {
        ok: false,
        error: "request_failed",
        detail: "ROOM_TYPE_NOT_FOUND",
      });
    }

    if (msg === "ROOM_PRICE_NOT_FOUND") {
      return json(req, 404, {
        ok: false,
        error: "request_failed",
        detail: "ROOM_PRICE_NOT_FOUND",
      });
    }

    if (msg.startsWith("invalid_")) {
      return json(req, 400, {
        ok: false,
        error: "request_failed",
        detail: msg,
      });
    }

    console.error("debacu_eval_revenue_room_prices_manage error:", msg);

    return json(req, 500, {
      ok: false,
      error: "request_failed",
      detail: "internal_error",
    });
  }
});