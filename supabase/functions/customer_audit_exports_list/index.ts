// supabase/functions/customer_audit_exports_list/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

const APP_ID = "DEBACU_EVAL";

type ReqBody = {
  org_id?: string | null;

  limit?: number; // default 25
  offset?: number; // default 0

  status?: "ALL" | "PENDING" | "READY" | "FAILED" | "EXPIRED";
  export_type?: "ALL" | "PDF" | "CSV";

  from?: string; // yyyy-mm-dd  (date_from >= from)
  to?: string; // yyyy-mm-dd    (date_to <= to)
};

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

/** ======================================================
 * MULTI-ORG membership (service role)
 * - Valida org_id si viene
 * - Si no viene, usa primera membership ACTIVE de forma determinista
 * ====================================================== */
async function resolveOrgIdForUserOrThrow(
  admin: ReturnType<typeof createClient>,
  userId: string,
  requestedOrgId?: string | null,
): Promise<string> {
  if (requestedOrgId) {
    // prefer ACTIVE si existe status
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id")
      .eq("org_id", requestedOrgId)
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (error) throw new Error("MEMBERSHIP_LOOKUP_FAILED");
    if (!data?.org_id) throw new Error("FORBIDDEN_NOT_MEMBER");
    return String(data.org_id);
  }

  // fallback determinista: primera ACTIVE por created_at
  const { data, error } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, created_at")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("MEMBERSHIP_LOOKUP_FAILED");
  if (!data?.org_id) throw new Error("FORBIDDEN_NO_ORG");
  return String(data.org_id);
}

/** ======================================================
 * ENTITLEMENTS
 * - Si quieres bloquear si plan no está ACTIVE, lo mantenemos
 * ====================================================== */
type EntitlementsRow = {
  org_id: string;
  subscription_status: string | null;
  plan_code: string | null;
};

async function loadEntitlementsOrThrow(
  admin: ReturnType<typeof createClient>,
  orgId: string,
): Promise<EntitlementsRow> {
  const { data, error } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, subscription_status, plan_code")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error("ENTITLEMENTS_FAILED");
  if (!data?.org_id) throw new Error("FORBIDDEN_NO_ENTITLEMENTS");
  return data as EntitlementsRow;
}

function assertOrgActiveOrThrow(ent: EntitlementsRow) {
  if (ent.subscription_status !== "ACTIVE") throw new Error("PLAN_NOT_ACTIVE");
}

/** ======================================================
 * ERROR MAP (STRICT)
 * ====================================================== */
function mapError(e: unknown): { status: number; detail: string } {
  const msg = String((e as any)?.message ?? e ?? "request_failed");

  if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") return { status: 401, detail: "UNAUTHENTICATED" };
  if (msg === "PLAN_NOT_ACTIVE") return { status: 402, detail: "PLAN_NOT_ACTIVE" };

  if (
    msg.startsWith("FORBIDDEN") ||
    msg === "MEMBERSHIP_LOOKUP_FAILED" ||
    msg === "ENTITLEMENTS_FAILED" ||
    msg === "FORBIDDEN_NO_ENTITLEMENTS"
  ) {
    return { status: 403, detail: "FORBIDDEN" };
  }

  if (msg.startsWith("invalid_")) return { status: 400, detail: msg };

  return { status: 500, detail: "INTERNAL" };
}

/** ======================================================
 * MAIN
 * ====================================================== */
Deno.serve(async (req: Request) => {
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

    // org_id obligatorio recomendado; si no viene, fallback determinista
    const org_id = await resolveOrgIdForUserOrThrow(
      admin,
      user.id,
      body.org_id ? String(body.org_id) : null,
    );

    // Si quieres permitir ver histórico incluso sin plan ACTIVE: comenta estas 2 líneas.
    const ent = await loadEntitlementsOrThrow(admin, org_id);
    assertOrgActiveOrThrow(ent);

    const status = body.status ?? "ALL";
    const export_type = body.export_type ?? "ALL";

    // ✅ Tabla correcta para listados (tiene status, file_name, mime_type, etc.)
    const TABLE = "audit_exports";

    let q = admin
      .from(TABLE)
      .select(
        [
          "id",
          "created_at",
          "status",
          "format",
          "row_count",
          "storage_bucket",
          "storage_path",
          "file_sha256",
          "mime_type",
          "file_name",
          "customer_id",
          "app_id",
          "date_from",
          "date_to",
          "source",
          "type",
          "filters_json",
        ].join(","),
        { count: "exact" },
      )
      // org_id (uuid) se guarda como text en audit_exports.customer_id
      .eq("customer_id", org_id)
      .eq("app_id", APP_ID)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== "ALL") q = q.eq("status", status);
    if (export_type !== "ALL") q = q.eq("format", export_type);

    if (body.from) q = q.gte("date_from", String(body.from));
    if (body.to) q = q.lte("date_to", String(body.to));

    const { data: rows, error, count } = await q;

    if (error) {
      // IMPORTANT: no filtramos stack al cliente; pero sí log interno para debug
      console.error("[customer_audit_exports_list] LIST ERROR", error);
      throw new Error("LIST_FAILED");
    }

    const exports = (rows ?? []).map((r: any) => ({
      id: r.id,
      created_at: r.created_at,
      status: r.status ?? null,
      export_type: r.format ?? null,
      export_scope: r.source ?? null,
      period_from: r.date_from ?? null,
      period_to: r.date_to ?? null,
      row_count: r.row_count ?? 0,
      storage_bucket: r.storage_bucket ?? null,
      storage_path: r.storage_path ?? null,
      sha256: r.file_sha256 ?? null,
      file_name: r.file_name ?? null,
      mime_type: r.mime_type ?? null,
      filters: r.filters_json ?? null,
    }));

    return json(req, 200, {
      ok: true,
      org_id,
      app_id: APP_ID,
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
