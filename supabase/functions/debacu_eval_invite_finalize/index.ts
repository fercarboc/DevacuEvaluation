// supabase/functions/debacu_eval_invite_finalize/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

type Body = {
  action?: string | null; // "FINALIZE"
  org_id?: string | null;
  orgId?: string | null;
  app_id?: string | null;
  appId?: string | null;
};

const APP_ID = "DEBACU_EVAL";

function err(code: string, detail?: string) {
  return { ok: false, error: "request_failed", detail: detail ? `${code}:${detail}` : code };
}
function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}
function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
function upper(v: any) {
  return String(v ?? "").toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, err("method_not_allowed"));

  try {
    const user = await requireUser(req); // JWT-only
    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return json(req, 400, err("invalid_json"));

    const action = safeStr(body.action).toUpperCase();
    if (action && action !== "FINALIZE") return json(req, 400, err("invalid_action"));

    const orgId = safeStr(body.org_id ?? body.orgId);
    if (!orgId || !isUuid(orgId)) return json(req, 400, err("invalid_org_id"));

    const appId = safeStr(body.app_id ?? body.appId) || APP_ID;

    const email = safeStr((user as any)?.email).toLowerCase();
    if (!email || !email.includes("@")) return json(req, 409, err("user_missing_email"));

    const supabase = supabaseServiceClient();

    // 1) Cargar org y customer_id
    const { data: org, error: orgErr } = await supabase
      .from("debacu_eval_organizations")
      .select("id, customer_id")
      .eq("id", orgId)
      .maybeSingle();

    if (orgErr) return json(req, 500, err("db_read_failed", "ORG_READ"));
    if (!org?.id) return json(req, 404, err("org_not_found"));
    if (!org.customer_id) return json(req, 409, err("org_missing_customer_id"));

    // 2) Buscar membership existente SOLO en esta org:
    //    - por user_id/auth_user_id
    //    - o por invited_email == user.email (flujo STAFF invitado o OWNER invitado)
    const { data: member, error: memErr } = await supabase
      .from("debacu_eval_org_members")
      .select("id, role, status, user_id, auth_user_id, invited_email")
      .eq("org_id", orgId)
      .or(`user_id.eq.${user.id},auth_user_id.eq.${user.id},invited_email.eq.${email}`)
      .maybeSingle();

    if (memErr) return json(req, 500, err("db_read_failed", "MEM_READ"));

    if (member?.id) {
      const st = upper(member.status);

      // Idempotente: si ya está ACTIVE, ok.
      // Si INVITED -> ACTIVE y linkea user_id/auth_user_id.
      const patch: Record<string, any> = {
        user_id: user.id,
        auth_user_id: user.id, // legacy si la mantienes
        updated_at: new Date().toISOString(),
      };

      if (st === "INVITED") patch.status = "ACTIVE";

      const { error: upErr } = await supabase
        .from("debacu_eval_org_members")
        .update(patch)
        .eq("id", member.id);

      if (upErr) return json(req, 500, err("db_write_failed", "MEM_UPDATE"));

      return json(req, 200, {
        ok: true,
        app_id: appId,
        org_id: orgId,
        customer_id: org.customer_id,
        role: member.role ?? null,
        status: st === "INVITED" ? "ACTIVE" : st || "ACTIVE",
        via: st === "INVITED" ? "invite_accepted" : "already_active",
      });
    }

    // 3) Si NO existe membership, NO creamos nada aquí.
    //    Esto debe existir ya si vienes de:
    //    - Access Request APPROVE (OWNER creado)
    //    - Seguridad invite (STAFF/ADMIN con invited_email)
    //    Si falta, es inconsistencia y se devuelve error.
    const { data: ar, error: arErr } = await supabase
      .from("debacu_eval_access_requests")
      .select("id, status, email, org_id, customer_id")
      .eq("org_id", orgId)
      .eq("email", email)
      .maybeSingle();

    if (arErr) return json(req, 500, err("db_read_failed", "ACCESS_REQ_READ"));

    if (ar?.id && upper(ar.status) === "APPROVED") {
      // Caso Owner aprobado pero falta org_member: esto NO debería pasar.
      return json(req, 409, {
        ok: false,
        error: "membership_missing_after_approve",
        detail: "APPROVED_ACCESS_REQUEST_BUT_NO_ORG_MEMBER",
        access_request_id: ar.id,
        org_id: orgId,
        email,
      });
    }

    return json(req, 404, {
      ok: false,
      error: "invite_not_found",
      detail: "NO_ORG_MEMBER_FOR_USER_OR_EMAIL_IN_THIS_ORG",
      org_id: orgId,
      email,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "");
    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return json(req, 401, err("UNAUTHENTICATED"));
    }
    return json(req, 500, err("internal_error", msg.slice(0, 160)));
  }
});