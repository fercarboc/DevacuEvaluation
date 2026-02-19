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

/**
 * ======================================================
 * HELPERS
 * ======================================================
 */

async function promoteInviteIfExists(
  supabase: ReturnType<typeof supabaseServiceClient>,
  email: string,
  authUserId: string,
) {
  const { data, error } = await supabase
    .from("debacu_eval_org_members")
    .update({
      status: "ACTIVE",
      auth_user_id: authUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("status", "INVITED")
    .ilike("invited_email", email)
    .select("org_id, role, status")
    .maybeSingle();

  if (error) return { ok: false as const, code: "db_write_failed" };
  if (!data?.org_id) return { ok: false as const, code: "not_found" };

  return { ok: true as const, row: data };
}

async function findActiveMembership(
  supabase: ReturnType<typeof supabaseServiceClient>,
  authUserId: string,
) {
  const { data, error } = await supabase
    .from("debacu_eval_org_members")
    .select("org_id, role, status")
    .eq("auth_user_id", authUserId)
    .eq("status", "ACTIVE")
    .limit(1)
    .maybeSingle();

  if (error) return { row: null, code: "db_read_failed" as const };
  return { row: data ?? null, code: null as const };
}

async function ensureOwnerFromApprovedRequest(params: {
  supabase: ReturnType<typeof supabaseServiceClient>;
  email: string;
  authUserId: string;
}) {
  const { supabase, email, authUserId } = params;

  const { data: reqRow, error } = await supabase
    .from("debacu_eval_access_requests")
    .select("id, status, customer_id, org_id, reviewed_at")
    .eq("email", email)
    .eq("status", "APPROVED")
    .order("reviewed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false as const, code: "db_read_failed" };
  if (!reqRow?.customer_id) return { ok: false as const, code: "not_found" };

  let orgId = reqRow.org_id;

  if (!orgId) {
    const { data: org } = await supabase
      .from("debacu_eval_organizations")
      .select("id")
      .eq("customer_id", reqRow.customer_id)
      .limit(1)
      .maybeSingle();

    if (!org?.id) return { ok: false as const, code: "org_not_found" };
    orgId = org.id;
  }

  // Insert o update OWNER
  const { data: existing } = await supabase
    .from("debacu_eval_org_members")
    .select("id")
    .eq("org_id", orgId)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (!existing) {
    const { error: insErr } = await supabase.from("debacu_eval_org_members").insert({
      org_id: orgId,
      auth_user_id: authUserId,
      role: "OWNER",
      status: "ACTIVE",
    });

    if (insErr) return { ok: false as const, code: "db_write_failed" };
  }

  return { ok: true as const, orgId, customerId: reqRow.customer_id };
}

/**
 * ======================================================
 * MAIN
 * ======================================================
 */

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

    /**
     * 1️⃣ ¿Ya tiene membership ACTIVE?
     */
    const active = await findActiveMembership(supabase, user.id);
    if (active.code) return json(req, 500, err(active.code));

    if (active.row?.org_id) {
      return json(req, 200, {
        ok: true,
        app_id: appId,
        org_id: active.row.org_id,
      });
    }

    /**
     * 2️⃣ ¿Está invitado como STAFF?
     */
    const promoted = await promoteInviteIfExists(supabase, email, user.id);
    if (promoted.ok) {
      return json(req, 200, {
        ok: true,
        app_id: appId,
        org_id: promoted.row.org_id,
      });
    }

    /**
     * 3️⃣ ¿Es OWNER vía access_request APPROVED?
     */
    const owner = await ensureOwnerFromApprovedRequest({
      supabase,
      email,
      authUserId: user.id,
    });

    if (owner.ok) {
      return json(req, 200, {
        ok: true,
        app_id: appId,
        org_id: owner.orgId,
        customer_id: owner.customerId,
      });
    }

    /**
     * 4️⃣ Nada encontrado → no tiene tenant
     */
    return json(req, 404, err("NO_ORG_MEMBERSHIP"));
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "");
    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return json(req, 401, err("UNAUTHENTICATED"));
    }
    return json(req, 500, err("internal_error"));
  }
});
