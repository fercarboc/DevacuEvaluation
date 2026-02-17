// supabase/functions/debacu_eval_audit_exports_get_signed_url/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

/** ======================================================
 * INPUT
 * ====================================================== */
type ReqBody = {
  org_id?: string | null; // ✅ multi-org recomendado
  export_id: string;
};

/** ======================================================
 * MULTI-ORG (membership)
 * ====================================================== */
async function resolveOrgIdForUserOrThrow(
  admin: ReturnType<typeof createClient>,
  userId: string,
  requestedOrgId?: string | null
): Promise<string> {
  // 1) org_id explícito (recomendado)
  if (requestedOrgId) {
    // intento con status=ACTIVE si existe
    try {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id")
        .eq("org_id", requestedOrgId)
        .eq("user_id", userId)
        .eq("status", "ACTIVE")
        .maybeSingle();

      if (error) throw error;
      if (!data?.org_id) throw new Error("FORBIDDEN_NOT_MEMBER");
      return String(data.org_id);
    } catch {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id")
        .eq("org_id", requestedOrgId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw new Error(`MEMBERSHIP_LOOKUP_FAILED:${error.message}`);
      if (!data?.org_id) throw new Error("FORBIDDEN_NOT_MEMBER");
      return String(data.org_id);
    }
  }

  // 2) fallback determinista: primera membership
  try {
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, created_at")
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data?.org_id) throw new Error("FORBIDDEN_NO_ORG");
    return String(data.org_id);
  } catch {
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`MEMBERSHIP_LOOKUP_FAILED:${error.message}`);
    if (!data?.org_id) throw new Error("FORBIDDEN_NO_ORG");
    return String(data.org_id);
  }
}

type EntitlementsRow = { org_id: string; subscription_status: string | null };

async function loadEntitlementsOrThrow(admin: ReturnType<typeof createClient>, orgId: string) {
  const { data, error } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, subscription_status")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`ENTITLEMENTS_FAILED:${error.message}`);
  if (!data?.org_id) throw new Error("FORBIDDEN_NO_ENTITLEMENTS");
  return data as EntitlementsRow;
}

function assertOrgActiveOrThrow(ent: EntitlementsRow) {
  if (ent.subscription_status !== "ACTIVE") throw new Error("PLAN_NOT_ACTIVE");
}

/** ======================================================
 * ERROR MAPPING
 * ====================================================== */
function mapError(e: unknown): { status: number; detail: string } {
  const msg = String((e as any)?.message ?? e ?? "request_failed");

  if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") return { status: 401, detail: "UNAUTHENTICATED" };
  if (msg === "PLAN_NOT_ACTIVE") return { status: 402, detail: "PLAN_NOT_ACTIVE" };

  if (
    msg.startsWith("FORBIDDEN") ||
    msg.startsWith("MEMBERSHIP_LOOKUP_FAILED") ||
    msg.startsWith("ENTITLEMENTS_FAILED")
  ) {
    return { status: 403, detail: msg.startsWith("FORBIDDEN") ? msg : "FORBIDDEN" };
  }

  if (msg.startsWith("missing_") || msg.startsWith("invalid_") || msg === "BAD_EXPORT_ID" || msg === "invalid_json") {
    return { status: 400, detail: msg };
  }

  if (msg === "NOT_FOUND") return { status: 404, detail: "NOT_FOUND" };

  // no filtrar detalles internos
  return { status: 500, detail: "INTERNAL" };
}

/** ======================================================
 * MAIN
 * ====================================================== */
export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "method_not_allowed", detail: "method_not_allowed" });
  }

  const admin = supabaseServiceClient(); // ✅ service role (consistencia)

  try {
    const user = await requireUser(req);

    const body = (await req.json().catch(() => null)) as ReqBody | null;
    if (!body) throw new Error("invalid_json");

    const export_id = String(body.export_id ?? "").trim();
    if (!export_id) throw new Error("BAD_EXPORT_ID");

    // ✅ multi-org (UI debería mandar org_id siempre)
    const org_id = await resolveOrgIdForUserOrThrow(admin, user.id, body.org_id ? String(body.org_id) : null);

    // ✅ plan gate
    const ent = await loadEntitlementsOrThrow(admin, org_id);
    assertOrgActiveOrThrow(ent);

    // ✅ tabla consistente con el build: debacu_eval_audit_exports
    const { data: row, error: rowErr } = await admin
      .from("debacu_eval_audit_exports")
      .select("id, status, storage_bucket, storage_path, meta")
      .eq("id", export_id)
      // Si tienes columna org_id en la tabla, filtra aquí:
      .eq("org_id", org_id)
      .maybeSingle();

    // ⚠️ Si tu tabla NO tiene org_id, entonces:
    // - Quita el .eq("org_id", org_id)
    // - Y valida contra row.meta.org_id (ver bloque abajo).
    if (rowErr) throw new Error(`EXPORT_LOOKUP_FAILED:${rowErr.message}`);
    if (!row?.id) throw new Error("NOT_FOUND");

    // Fallback de seguridad si no tienes columna org_id:
    // const metaOrg = (row as any)?.meta?.org_id;
    // if (metaOrg && String(metaOrg) !== org_id) throw new Error("FORBIDDEN_EXPORT_NOT_IN_ORG");

    if (String(row.status) !== "READY") throw new Error("EXPORT_NOT_READY");
    if (!row.storage_bucket || !row.storage_path) throw new Error("EXPORT_NO_FILE");

    const { data: signed, error: signErr } = await admin.storage
      .from(String(row.storage_bucket))
      .createSignedUrl(String(row.storage_path), 60); // 60s

    if (signErr || !signed?.signedUrl) throw new Error("SIGNED_URL_FAILED");

    return json(req, 200, {
      ok: true,
      export_id,
      download_url: signed.signedUrl,
      expires_in: 60,
    });
  } catch (e) {
    const mapped = mapError(e);
    return json(req, mapped.status, { ok: false, error: "request_failed", detail: mapped.detail });
  }
});
