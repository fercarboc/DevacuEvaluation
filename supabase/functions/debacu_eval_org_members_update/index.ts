// supabase/functions/debacu_eval_org_members_update/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://debacu.com";
const INVITE_REDIRECT_TO = `${SITE_URL}/auth/activate`;

type Role = "OWNER" | "ADMIN" | "STAFF";
type Status = "ACTIVE" | "INVITED" | "SUSPENDED";

function err(req: Request, status: number, detail: string, extra?: any) {
  return json(req, status, { ok: false, error: "request_failed", detail, ...(extra ? { extra } : {}) });
}

function canManageTarget(actorRole: Role, targetRole: Role): boolean {
  if (targetRole === "OWNER") return false;
  if (actorRole === "ADMIN") return targetRole === "STAFF";
  if (actorRole === "OWNER") return targetRole === "ADMIN" || targetRole === "STAFF";
  return false;
}

async function requirePrivilegedMembership(
  sb: ReturnType<typeof supabaseServiceClient>,
  authUserId: string,
  orgId: string,
) {
  // probamos con user_id y auth_user_id
  const { data: a, error: ea } = await sb
    .from("debacu_eval_org_members")
    .select("org_id, role, status")
    .eq("org_id", orgId)
    .eq("user_id", authUserId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (ea) throw new Error("db_read_failed");
  let row = a;

  if (!row) {
    const { data: b, error: eb } = await sb
      .from("debacu_eval_org_members")
      .select("org_id, role, status")
      .eq("org_id", orgId)
      .eq("auth_user_id", authUserId)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (eb) throw new Error("db_read_failed");
    row = b;
  }

  if (!row) return null;
  const role = String(row.role ?? "").toUpperCase();
  if (role !== "OWNER" && role !== "ADMIN") return null;

  return { org_id: String(row.org_id), role: role as Role, status: String(row.status) as Status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return err(req, 405, "METHOD_NOT_ALLOWED");

  const user = await requireUser(req).catch(() => null);
  if (!user?.id) return err(req, 401, "UNAUTHENTICATED");

  const body = await req.json().catch(() => ({} as any));

  const org_id = String(body?.org_id ?? "");
  const member_id = String(body?.member_id ?? "");
  const action = String(body?.action ?? "").toUpperCase();

  if (!org_id) return err(req, 400, "missing_org_id");
  if (!member_id) return err(req, 400, "missing_member_id");

  const allowed = new Set(["SUSPEND", "REACTIVATE", "REMOVE", "RESEND_INVITE"]);
  if (!allowed.has(action)) return err(req, 400, "invalid_action");

  const sb = supabaseServiceClient();

  const actor = await requirePrivilegedMembership(sb, user.id, org_id);
  if (!actor) return err(req, 403, "FORBIDDEN");

  const { data: target, error: tgtErr } = await sb
    .from("debacu_eval_org_members")
    .select("id, org_id, user_id, auth_user_id, role, status, invited_email")
    .eq("id", member_id)
    .maybeSingle();

  if (tgtErr) return err(req, 500, "request_failed", { message: tgtErr.message });
  if (!target) return err(req, 404, "member_not_found");
  if (String(target.org_id) !== org_id) return err(req, 403, "FORBIDDEN");

  const targetRole = String(target.role ?? "").toUpperCase() as Role;
  const targetStatus = String(target.status ?? "").toUpperCase() as Status;

  if (targetRole === "OWNER") return err(req, 400, "owner_immutable");
  if (!canManageTarget(actor.role, targetRole)) return err(req, 403, "FORBIDDEN");

  if (action === "REMOVE") {
    // OJO: profiles usa member_id
    await sb.from("debacu_eval_org_member_profiles").delete().eq("member_id", member_id);

    const { error: delErr } = await sb.from("debacu_eval_org_members").delete().eq("id", member_id);
    if (delErr) return err(req, 500, "request_failed", { message: delErr.message });
    return json(req, 200, { ok: true });
  }

  if (action === "SUSPEND") {
    if (targetStatus !== "ACTIVE") return err(req, 400, "only_active_can_suspend");

    const { error: upErr } = await sb
      .from("debacu_eval_org_members")
      .update({ status: "SUSPENDED", updated_at: new Date().toISOString() })
      .eq("id", member_id);

    if (upErr) return err(req, 500, "request_failed", { message: upErr.message });
    return json(req, 200, { ok: true });
  }

  if (action === "REACTIVATE") {
    if (targetStatus !== "SUSPENDED") return err(req, 400, "only_suspended_can_reactivate");

    const { data: ent, error: entErr } = await sb
      .from("debacu_eval_org_entitlements_v")
      .select("subscription_status, seats_available")
      .eq("org_id", org_id)
      .maybeSingle();

    if (entErr) return err(req, 500, "request_failed", { message: entErr.message });

    const subStatus = String(ent?.subscription_status ?? "").toUpperCase();
    if (subStatus !== "ACTIVE") return err(req, 402, "plan_not_active");

    const seatsAvail = Number(ent?.seats_available ?? 0);
    if (seatsAvail <= 0) return err(req, 409, "seats_exceeded");

    const { error: upErr } = await sb
      .from("debacu_eval_org_members")
      .update({ status: "ACTIVE", updated_at: new Date().toISOString() })
      .eq("id", member_id);

    if (upErr) return err(req, 500, "request_failed", { message: upErr.message });
    return json(req, 200, { ok: true });
  }

  if (action === "RESEND_INVITE") {
    if (targetStatus !== "INVITED" || !target.invited_email) {
      return err(req, 400, "only_invited_can_resend");
    }

    const { data: ent, error: entErr } = await sb
      .from("debacu_eval_org_entitlements_v")
      .select("subscription_status")
      .eq("org_id", org_id)
      .maybeSingle();

    if (entErr) return err(req, 500, "request_failed", { message: entErr.message });

    const subStatus = String(ent?.subscription_status ?? "").toUpperCase();
    if (subStatus !== "ACTIVE") return err(req, 402, "plan_not_active");

    const { error: inviteErr } = await sb.auth.admin.inviteUserByEmail(String(target.invited_email), {
      redirectTo: INVITE_REDIRECT_TO,
      data: { app: "DEBACU_EVAL", org_id },
    });

    if (inviteErr) {
      // aquí antes devolvías request_failed genérico => ahora te doy el motivo real
      return err(req, 400, "invite_failed", { message: inviteErr.message });
    }

    return json(req, 200, { ok: true });
  }

  return err(req, 500, "request_failed");
});
