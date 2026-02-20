// supabase/functions/customer_audit_exports_list/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

type ReqBody = {
  org_id?: string | null;

  limit?: number; // default 25
  offset?: number; // default 0

  status?: "ALL" | "CREATED" | "PROCESSING" | "READY" | "FAILED" | "EXPIRED";
  export_type?: "ALL" | "PDF" | "CSV";

  from?: string; // yyyy-mm-dd
  to?: string; // yyyy-mm-dd
};

type OrgResolvedBy = "requested" | "first_active" | "first_any";

function assertDateMaybe(s: unknown, name: string) {
  if (s === null || s === undefined || s === "") return;
  const v = String(s);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`invalid_${name}`);
}

function clampInt(v: unknown, def: number, min: number, max: number) {
  const n = Number(v ?? def);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

/** MULTI-ORG (FIX STAFF: user_id OR auth_user_id) */
async function resolveOrgIdForUserOrThrow(
  admin: SupabaseClient,
  userId: string,
  requestedOrgId?: string | null,
): Promise<{ org_id: string; resolvedBy: OrgResolvedBy }> {
  const uid = String(userId);

  if (requestedOrgId) {
    const orgId = String(requestedOrgId).trim();

    // preferimos ACTIVE, pero toleramos membership existente
    try {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id")
        .eq("org_id", orgId)
        .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
        .eq("status", "ACTIVE")
        .maybeSingle();

      if (error) throw error;
      if (!data?.org_id) throw new Error("FORBIDDEN");
      return { org_id: String(data.org_id), resolvedBy: "requested" };
    } catch {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id")
        .eq("org_id", orgId)
        .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
        .maybeSingle();

      if (error || !data?.org_id) throw new Error("FORBIDDEN");
      return { org_id: String(data.org_id), resolvedBy: "requested" };
    }
  }

  // fallback determinista: primera ACTIVE; si no, primera por created_at
  try {
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, created_at")
      .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data?.org_id) throw new Error("FORBIDDEN");
    return { org_id: String(data.org_id), resolvedBy: "first_active" };
  } catch {
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, created_at")
      .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data?.org_id) throw new Error("FORBIDDEN");
    return { org_id: String(data.org_id), resolvedBy: "first_any" };
  }
}

type EntitlementsRow = {
  org_id: string;
  customer_id?: string | null;
  subscription_status: string | null; // ACTIVE | TRIAL_ACTIVE | ...
  plan_code: string | null;
};

async function loadEntitlementsOrThrow(admin: SupabaseClient, orgId: string) {
  const { data, error } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, subscription_status, plan_code")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error || !data?.org_id) throw new Error("FORBIDDEN");
  return data as EntitlementsRow;
}

function assertOrgEnabledOrThrow(ent: EntitlementsRow) {
  const st = String(ent.subscription_status ?? "").toUpperCase();
  if (st !== "ACTIVE" && st !== "TRIAL_ACTIVE") throw new Error("PLAN_NOT_ACTIVE");
}

/** ERROR MAP (STRICT) */
function mapError(e: unknown): { status: number; detail: string } {
  const msg = String((e as any)?.message ?? e ?? "request_failed");

  if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") return { status: 401, detail: "UNAUTHENTICATED" };
  if (msg === "PLAN_NOT_ACTIVE") return { status: 402, detail: "PLAN_NOT_ACTIVE" };
  if (msg === "FORBIDDEN") return { status: 403, detail: "FORBIDDEN" };
  if (msg.startsWith("invalid_")) return { status: 400, detail: msg };

  // internos genéricos (no filtramos mensajes DB)
  return { status: 500, detail: "request_failed" };
}

export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "method_not_allowed", detail: "method_not_allowed" });
  }

  const admin = supabaseServiceClient();

  try {
    const user = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as ReqBody;

    const limit = clampInt(body.limit, 25, 1, 100);
    const offset = clampInt(body.offset, 0, 0, 1_000_000);

    assertDateMaybe(body.from, "from");
    assertDateMaybe(body.to, "to");

    const { org_id, resolvedBy: org_id_resolved_by } = await resolveOrgIdForUserOrThrow(
      admin,
      user.id,
      body.org_id ? String(body.org_id) : null,
    );

    // plan gate (ACTIVE o TRIAL_ACTIVE)
    const ent = await loadEntitlementsOrThrow(admin, org_id);
    assertOrgEnabledOrThrow(ent);

    // ✅ VIEW con last_download + download_count
    const VIEW = "debacu_eval_audit_exports_with_last_download";

    const status = body.status ?? "ALL";
    const export_type = body.export_type ?? "ALL";

    let q = admin
      .from(VIEW)
      .select(
        [
          "id",
          "org_id",
          "created_at",
          "status",
          "format",
          "row_count",
          "storage_bucket",
          "storage_path",
          "file_sha256",
          "file_bytes",
          "meta",
          "filter_source",
          "filter_type",
          "filter_from",
          "filter_to",
          "delivered_to_name",
          "delivered_to_org",
          "delivered_to_reason",
          "delivered_to_reference",
          "last_download_at",
          "last_downloaded_by",
          "last_downloaded_by_email",
          "download_count",
        ].join(","),
        { count: "exact" },
      )
      .eq("org_id", org_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== "ALL") q = q.eq("status", status);
    if (export_type !== "ALL") q = q.eq("format", export_type);

    // filtros por rango (ojo: dependen de cómo guardas filter_from/filter_to)
    if (body.from) q = q.gte("filter_from", String(body.from));
    if (body.to) q = q.lte("filter_to", String(body.to));

    const { data: rows, error, count } = await q;
    if (error) throw new Error("request_failed");

    const exports = (rows ?? []).map((r: any) => ({
      id: r.id,
      org_id: r.org_id,
      created_at: r.created_at,
      status: r.status ?? null,

      export_type: r.format ?? null,
      export_scope: r.filter_source ?? null,
      period_from: r.filter_from ?? null,
      period_to: r.filter_to ?? null,

      row_count: r.row_count ?? 0,
      storage_bucket: r.storage_bucket ?? null,
      storage_path: r.storage_path ?? null,
      sha256: r.file_sha256 ?? null,
      file_size_bytes: r.file_bytes ?? null,
      meta: r.meta ?? null,

      delivered_to_name: r.delivered_to_name ?? null,
      delivered_to_org: r.delivered_to_org ?? null,
      delivered_to_reason: r.delivered_to_reason ?? null,
      delivered_to_reference: r.delivered_to_reference ?? null,

      last_download_at: r.last_download_at ?? null,
      last_downloaded_by: r.last_downloaded_by ?? null,
      last_downloaded_by_email: r.last_downloaded_by_email ?? null,
      download_count: r.download_count ?? 0,
    }));

    return json(req, 200, {
      ok: true,
      meta: {
        org_id,
        org_id_resolved_by,
        plan_code: ent.plan_code ?? null,
        subscription_status: ent.subscription_status ?? null,
      },
      exports,
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (e) {
    const mapped = mapError(e);
    return json(req, mapped.status, { ok: false, error: "request_failed", detail: mapped.detail });
  }
});