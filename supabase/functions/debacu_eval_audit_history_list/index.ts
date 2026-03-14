// supabase/functions/debacu_eval_audit_history_list/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

import { resolvePropertyContextOrThrow } from "../_shared/screeningProperty.ts";

type ReqBody = {
  property_id?: string;

  page?: number;
  limit?: number;

  filters?: {
    event_type?: string;
    user_id?: string;
    identity_key?: string;

    date_from?: string;
    date_to?: string;
  };
};

function clean(v?: string | null) {
  return String(v ?? "").trim();
}

function toInt(v: any, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

function isISODate(v: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(v);
}

Deno.serve(async (req: Request) => {

  if (req.method === "OPTIONS") return preflight(req);

  if (req.method !== "POST") {
    return json(req, 405, {
      ok: false,
      error: "request_failed",
      detail: "method_not_allowed"
    });
  }

  const sb = supabaseServiceClient();

  try {

    const user = await requireUser(req);

    const body = (await req.json().catch(() => ({}))) as ReqBody;

    const propertyId = clean(body.property_id);
    if (!propertyId) throw new Error("PROPERTY_ID_REQUIRED");

    const ctx = await resolvePropertyContextOrThrow({
      supabaseAdmin: sb,
      authUserId: user.id,
      propertyId
    });

    const page = toInt(body.page, 1);
    const limit = Math.min(toInt(body.limit, 50), 200);

    const offset = (page - 1) * limit;

    const filters = body.filters ?? {};

    const eventType = clean(filters.event_type);
    const userId = clean(filters.user_id);
    const identityKey = clean(filters.identity_key);

    const dateFrom = clean(filters.date_from);
    const dateTo = clean(filters.date_to);

    let query = sb
      .from("debacu_eval_audit_timeline_v")
      .select(`
        id,
        event_type,
        org_id,
        property_id,
        actor_user_id,
        identity_key,
        previous_risk_level,
        new_risk_level,
        source_table,
        source_id,
        payload,
        created_at
      `, { count: "exact" })
      .eq("org_id", ctx.org_id)
      .eq("property_id", ctx.property_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (eventType) {
      query = query.eq("event_type", eventType);
    }

    if (userId) {
      query = query.eq("actor_user_id", userId);
    }

    if (identityKey) {
      query = query.eq("identity_key", identityKey);
    }

    if (dateFrom && isISODate(dateFrom)) {
      query = query.gte("created_at", dateFrom);
    }

    if (dateTo && isISODate(dateTo)) {
      query = query.lte("created_at", dateTo);
    }

    const { data, count, error } = await query;

    if (error) throw error;

    const rows = (data ?? []).map((r: any) => ({

      id: r.id,

      eventType: r.event_type,

      actorUserId: r.actor_user_id,

      identityKey: r.identity_key,

      riskTransition: {
        previous: r.previous_risk_level,
        next: r.new_risk_level
      },

      source: {
        table: r.source_table,
        id: r.source_id
      },

      payload: r.payload,

      createdAt: r.created_at

    }));

    return json(req, 200, {
      ok: true,
      data: {

        propertyId: ctx.property_id,
        orgId: ctx.org_id,

        pagination: {
          page,
          limit,
          total: count ?? 0
        },

        rows
      }
    });

  } catch (e: any) {

    const msg = String(e?.message ?? e);

    if (msg === "UNAUTHENTICATED") {
      return json(req, 401, { ok: false, error: "request_failed", detail: "UNAUTHENTICATED" });
    }

    if (msg === "PROPERTY_ID_REQUIRED") {
      return json(req, 400, { ok: false, error: "request_failed", detail: msg });
    }

    if (msg === "NO_ORG_MEMBERSHIP") {
      return json(req, 403, { ok: false, error: "request_failed", detail: "NO_ORG_MEMBERSHIP" });
    }

    console.error("audit_history_list error:", msg);

    return json(req, 500, {
      ok: false,
      error: "request_failed",
      detail: "internal_error"
    });
  }

});
