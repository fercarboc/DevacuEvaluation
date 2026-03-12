import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

const APP_ID = "DEBACU_EVAL";
const MEMBERSHIP_ACTIVE_VALUE = "ACTIVE";

type ReqBody = {
  org_id?: string | null;
  property_id?: string | null;
  from?: string | null;
  to?: string | null;
  mode?: "channel" | "segment" | "cross" | null;
  app_id?: string | null;
};

type RevenueDailyRow = {
  channel: string | null;
  segment: string | null;
  rooms_sold: number | string | null;
  revenue_total: number | string | null;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function asNumber(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeMode(v?: string | null): "channel" | "segment" | "cross" {
  const m = String(v ?? "channel").trim().toLowerCase();
  if (m === "segment" || m === "cross") return m;
  return "channel";
}

function isIsoDate(v?: string | null) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ""));
}

async function resolveOrgIdOrThrow(
  sb: ReturnType<typeof supabaseServiceClient>,
  authUserId: string,
  requestedOrgId?: string | null,
) {
  const orgId = String(requestedOrgId ?? "").trim();
  if (!orgId || !isUuid(orgId)) throw new Error("invalid_org_id");

  const { data, error } = await sb
    .from("debacu_eval_org_members")
    .select("org_id")
    .eq("org_id", orgId)
    .or(`user_id.eq.${authUserId},auth_user_id.eq.${authUserId}`)
    .eq("status", MEMBERSHIP_ACTIVE_VALUE)
    .maybeSingle();

  if (error) throw new Error(`membership_lookup_failed:${error.message}`);
  if (!data?.org_id) throw new Error("NO_ORG_MEMBERSHIP");

  return orgId;
}

async function validatePropertyBelongsToOrgOrThrow(
  sb: ReturnType<typeof supabaseServiceClient>,
  orgId: string,
  propertyId: string,
) {
  const { data, error } = await sb
    .from("debacu_eval_properties")
    .select("id, org_id, name")
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

    const requestedOrgId = body?.org_id ?? null;
    const propertyId = String(body?.property_id ?? "").trim();
    const from = String(body?.from ?? "").trim();
    const to = String(body?.to ?? "").trim();
    const mode = normalizeMode(body?.mode);
    const appId = String(body?.app_id ?? APP_ID).trim() || APP_ID;

    if (appId !== APP_ID) {
      throw new Error("invalid_app_id");
    }

    const orgId = await resolveOrgIdOrThrow(sb, user.id, requestedOrgId);

    if (!propertyId || !isUuid(propertyId)) {
      throw new Error("invalid_property_id");
    }

    if (!isIsoDate(from) || !isIsoDate(to)) {
      throw new Error("invalid_date_range");
    }

    if (from > to) {
      throw new Error("invalid_date_range");
    }

    const property = await validatePropertyBelongsToOrgOrThrow(sb, orgId, propertyId);

    const { data, error } = await sb
      .from("debacu_eval_revenue_daily")
      .select("channel, segment, rooms_sold, revenue_total")
      .eq("org_id", orgId)
      .eq("property_id", propertyId)
      .gte("stay_date", from)
      .lte("stay_date", to);

    if (error) {
      throw new Error(`revenue_daily_failed:${error.message}`);
    }

    const sourceRows = (data ?? []) as RevenueDailyRow[];

    if (!sourceRows.length) {
      return json(req, 200, {
        ok: true,
        data: {
          org_id: orgId,
          property: {
            id: property.id,
            name: property.name ?? null,
          },
          range: { from, to },
          mode,
          summary: {
            totalRevenue: 0,
            totalSales: 0,
            adr: 0,
            topLabel: null,
          },
          rows: [],
        },
      });
    }

    const grouped = new Map<
      string,
      {
        label: string;
        channel: string | null;
        segment: string | null;
        totalSales: number;
        totalRevenue: number;
      }
    >();

    for (const row of sourceRows) {
      const channel = String(row.channel ?? "").trim() || "SIN_CANAL";
      const segment = String(row.segment ?? "").trim() || "SIN_SEGMENTO";
      const totalSales = asNumber(row.rooms_sold);
      const totalRevenue = asNumber(row.revenue_total);

      let key = "";
      let label = "";

      if (mode === "channel") {
        key = channel;
        label = channel;
      } else if (mode === "segment") {
        key = segment;
        label = segment;
      } else {
        key = `${channel}__${segment}`;
        label = `${channel} · ${segment}`;
      }

      const existing = grouped.get(key);
      if (existing) {
        existing.totalSales += totalSales;
        existing.totalRevenue += totalRevenue;
      } else {
        grouped.set(key, {
          label,
          channel,
          segment,
          totalSales,
          totalRevenue,
        });
      }
    }

    const groupedRows = Array.from(grouped.values());

    const totalRevenueAll = groupedRows.reduce((acc, r) => acc + r.totalRevenue, 0);
    const totalSalesAll = groupedRows.reduce((acc, r) => acc + r.totalSales, 0);

    const rows = groupedRows
      .map((r) => ({
        label: r.label,
        channel: r.channel,
        segment: r.segment,
        totalSales: r.totalSales,
        totalRevenue: Number(r.totalRevenue.toFixed(2)),
        adr: r.totalSales > 0 ? Number((r.totalRevenue / r.totalSales).toFixed(2)) : 0,
        share: totalRevenueAll > 0 ? Number(((r.totalRevenue / totalRevenueAll) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    const summary = {
      totalRevenue: Number(totalRevenueAll.toFixed(2)),
      totalSales: totalSalesAll,
      adr: totalSalesAll > 0 ? Number((totalRevenueAll / totalSalesAll).toFixed(2)) : 0,
      topLabel: rows[0]?.label ?? null,
    };

    return json(req, 200, {
      ok: true,
      data: {
        org_id: orgId,
        property: {
          id: property.id,
          name: property.name ?? null,
        },
        range: { from, to },
        mode,
        summary,
        rows,
      },
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

    if (msg === "NO_ORG_MEMBERSHIP") {
      return json(req, 403, {
        ok: false,
        error: "request_failed",
        detail: "NO_ORG_MEMBERSHIP",
      });
    }

    if (msg === "PROPERTY_NOT_FOUND") {
      return json(req, 404, {
        ok: false,
        error: "request_failed",
        detail: "PROPERTY_NOT_FOUND",
      });
    }

    if (
      msg === "invalid_org_id" ||
      msg === "invalid_property_id" ||
      msg === "invalid_date_range" ||
      msg === "invalid_app_id"
    ) {
      return json(req, 400, {
        ok: false,
        error: "request_failed",
        detail: msg,
      });
    }

    console.error("revenue_channels_segments error:", msg);

    return json(req, 500, {
      ok: false,
      error: "request_failed",
      detail: "internal_error",
    });
  }
});