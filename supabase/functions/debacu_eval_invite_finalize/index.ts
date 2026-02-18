// supabase/functions/debacu_eval_auth_postlogin/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

type Body = {
  org_id?: string | null;
  app_id?: string | null;
  appId?: string | null;
};

const APP_ID = "DEBACU_EVAL";

function err(code: string, detail?: string) {
  return { ok: false, error: "request_failed", detail: detail ? `${code}:${detail}` : code };
}
function safeLowerEmail(v: any) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}
function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

async function getApprovedRequestByEmail(
  supabase: ReturnType<typeof supabaseServiceClient>,
  email: string,
) {
  const { data, error } = await supabase
    .from("debacu_eval_access_requests")
    .select("id, status, customer_id, org_id, reviewed_at")
    .eq("email", email)
    .eq("status", "APPROVED")
    .order("reviewed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { row: null, code: "db_read_failed" as const };
  return { row: data ?? null, code: null as const };
}

async function resolveOrgIdForCustomer(
  supabase: ReturnType<typeof supabaseServiceClient>,
  customerId: string,
) {
  const { data, error } = await supabase
    .from("debacu_eval_organizations")
    .select("id, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data?.id ? String(data.id) : null;
}

async function ensureOwnerMembershipActive(params: {
  supabase: ReturnType<typeof supabaseServiceClient>;
  orgId: string;
  authUserId: string;
}) {
  const { supabase, orgId, authUserId } = params;

  // ⚠️ Si tu columna real es user_id, cambia auth_user_id -> user_id en SELECT/INSERT/UPDATE
  const { data: existing, error } = await supabase
    .from("debacu_eval_org_members")
    .select("id, role, status")
    .eq("org_id", orgId)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) return { ok: false as const, code: "db_read_failed" as const };

  if (!existing?.id) {
    const { error: insErr } = await supabase.from("debacu_eval_org_members").insert({
      org_id: orgId,
      auth_user_id: authUserId,
      role: "OWNER",
      status: "ACTIVE",
    } as any);

    if (insErr) return { ok: false as const, code: "db_write_failed" as const };
    return { ok: true as const };
  }

  // si existe, forzamos OWNER + ACTIVE (postlogin debe dejarlo limpio)
  const needRole = String(existing.role ?? "").toUpperCase() !== "OWNER";
  const needStatus = String(existing.status ?? "").toUpperCase() !== "ACTIVE";

  if (needRole || needStatus) {
    const patch: any = {};
    if (needRole) patch.role = "OWNER";
    if (needStatus) patch.status = "ACTIVE";

    const { error: updErr } = await supabase
      .from("debacu_eval_org_members")
      .update(patch)
      .eq("id", existing.id);

    if (updErr) return { ok: false as const, code: "db_write_failed" as const };
  }

  return { ok: true as const };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, err("method_not_allowed"));

  try {
    const user = await requireUser(req);

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return json(req, 400, err("invalid_json"));

    const appId = safeStr(body.app_id ?? body.appId) || APP_ID;

    const supabase = supabaseServiceClient();

    const email = safeLowerEmail(user.email);
    if (!email) return json(req, 400, err("invalid_user", "USER_NO_EMAIL"));

    // 1) org_id preferido desde UI
    let orgId = safeStr(body.org_id) || null;
    let customerId: string | null = null;

    // 2) buscar access_request APPROVED
    const { row: reqRow, code: reqCode } = await getApprovedRequestByEmail(supabase, email);
    if (reqCode) return json(req, 500, err(reqCode));

    if (!reqRow?.customer_id) {
      // sin solicitud aprobada -> no hay tenant
      return json(req, 404, err("APPROVED_REQUEST_NOT_FOUND"));
    }

    customerId = String(reqRow.customer_id);

    // 3) si no vino orgId, usar el del request o fallback a organizations
    if (!orgId) orgId = reqRow.org_id ? String(reqRow.org_id) : null;

    if (!orgId) {
      const fallbackOrgId = await resolveOrgIdForCustomer(supabase, customerId);
      if (!fallbackOrgId) return json(req, 404, err("ORG_NOT_FOUND_FOR_CUSTOMER"));
      orgId = fallbackOrgId;

      // best-effort backfill en access_requests
      await supabase.from("debacu_eval_access_requests").update({ org_id: orgId }).eq("id", reqRow.id);
    }

    // 4) asegurar membership OWNER+ACTIVE para este usuario
    const ensured = await ensureOwnerMembershipActive({
      supabase,
      orgId,
      authUserId: user.id,
    });

    if (!ensured.ok) return json(req, 500, err(ensured.code));

    return json(req, 200, {
      ok: true,
      app_id: appId,
      org_id: orgId,
      customer_id: customerId,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "");
    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return json(req, 401, err("UNAUTHENTICATED"));
    }
    return json(req, 500, err("internal_error"));
  }
});
