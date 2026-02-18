// supabase/functions/debacu_eval_org_members_update/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { json, preflight } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

// Si ya lo tienes en env en otras funciones, mejor estandarizarlo:
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://debacu.com";
const INVITE_REDIRECT_TO = `${SITE_URL}/auth/activate`;

type Role = "OWNER" | "ADMIN" | "STAFF";
type Status = "ACTIVE" | "INVITED" | "SUSPENDED";

function supabaseService() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function err(
  req: Request,
  status: number,
  detail:
    | "UNAUTHENTICATED"
    | "FORBIDDEN"
    | "missing_org_id"
    | "invalid_org_id"
    | "missing_member_id"
    | "invalid_action"
    | "member_not_found"
    | "owner_immutable"
    | "only_active_can_suspend"
    | "only_suspended_can_reactivate"
    | "only_invited_can_resend"
    | "plan_not_active"
    | "seats_exceeded"
    | "request_failed",
) {
  return json(req, status, { ok: false, error: "request_failed", detail });
}

async function requirePrivilegedMembership(
  sb: ReturnType<typeof supabaseService>,
  userId: string,
  orgId: string,
) {
  const { data, error } = await sb
    .from("debacu_eval_org_members")
    .select("org_id, role, status")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (error || !data) return null;
  if (data.role !== "OWNER" && data.role !== "ADMIN") return null;
  return data as { org_id: string; role: Role; status: Status };
}

function canManageTarget(actorRole: Role, targetRole: Role): boolean {
  // Reglas recomendadas:
  // - STAFF no llega aquí (ya filtrado)
  // - ADMIN puede gestionar STAFF, pero NO ADMIN ni OWNER
  // - OWNER puede gestionar ADMIN y STAFF, pero NO OWNER (owner_immutable)
  if (targetRole === "OWNER") return false;
  if (actorRole === "ADMIN") return targetRole === "STAFF";
  if (actorRole === "OWNER") return targetRole === "ADMIN" || targetRole === "STAFF";
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "request_failed", detail: "METHOD_NOT_ALLOWED" });
  }

  // JWT-only
  const user = await requireUser(req).catch(() => null);
  if (!user?.id) return err(req, 401, "UNAUTHENTICATED");

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const org_id = (body?.org_id ?? null) as string | null;
  const member_id = (body?.member_id ?? null) as string | null;
  const action = String(body?.action ?? "").toUpperCase();

  if (!org_id) return err(req, 400, "missing_org_id");
  if (!member_id) return err(req, 400, "missing_member_id");

  const allowed = new Set(["SUSPEND", "REACTIVATE", "REMOVE", "RESEND_INVITE"]);
  if (!allowed.has(action)) return err(req, 400, "invalid_action");

  const sb = supabaseService();

  // Validar actor (multi-org)
  const actor = await requirePrivilegedMembership(sb, user.id, org_id);
  if (!actor) return err(req, 403, "FORBIDDEN");

  // Cargar target y asegurar misma org
  const { data: target, error: tgtErr } = await sb
    .from("debacu_eval_org_members")
    .select("id, org_id, user_id, role, status, invited_email")
    .eq("id", member_id)
    .maybeSingle();

  if (tgtErr) return err(req, 500, "request_failed");
  if (!target) return err(req, 404, "member_not_found");
  if (target.org_id !== org_id) return err(req, 403, "FORBIDDEN");

  const targetRole = target.role as Role;
  const targetStatus = target.status as Status;

  if (targetRole === "OWNER") return err(req, 400, "owner_immutable");
  if (!canManageTarget(actor.role, targetRole)) return err(req, 403, "FORBIDDEN");

  // Acciones
  if (action === "REMOVE") {
    // Best-effort: borrar perfil para evitar FK si no tienes cascade
    await sb.from("debacu_eval_org_member_profiles").delete().eq("org_member_id", member_id);

    const { error: delErr } = await sb.from("debacu_eval_org_members").delete().eq("id", member_id);
    if (delErr) return err(req, 500, "request_failed");

    return json(req, 200, { ok: true });
  }

  if (action === "SUSPEND") {
    if (targetStatus !== "ACTIVE") return err(req, 400, "only_active_can_suspend");

    const { error: upErr } = await sb
      .from("debacu_eval_org_members")
      .update({ status: "SUSPENDED", updated_at: new Date().toISOString() })
      .eq("id", member_id);

    if (upErr) return err(req, 500, "request_failed");
    return json(req, 200, { ok: true });
  }

  if (action === "REACTIVATE") {
    if (targetStatus !== "SUSPENDED") return err(req, 400, "only_suspended_can_reactivate");

    // Validar plan + seats
    const { data: ent, error: entErr } = await sb
      .from("debacu_eval_org_entitlements_v")
      .select("subscription_status, seats_available")
      .eq("org_id", org_id)
      .maybeSingle();

    if (entErr) return err(req, 500, "request_failed");

    const subStatus = String(ent?.subscription_status ?? "").toUpperCase();
    if (subStatus !== "ACTIVE") return err(req, 402, "plan_not_active");

    const seatsAvail = Number(ent?.seats_available ?? 0);
    if (seatsAvail <= 0) return err(req, 409, "seats_exceeded");

    const { error: upErr } = await sb
      .from("debacu_eval_org_members")
      .update({ status: "ACTIVE", updated_at: new Date().toISOString() })
      .eq("id", member_id);

    if (upErr) return err(req, 500, "request_failed");
    return json(req, 200, { ok: true });
  }

  if (action === "RESEND_INVITE") {
    if (targetStatus !== "INVITED" || !target.invited_email) return err(req, 400, "only_invited_can_resend");

    // (Opcional pero recomendado) Comprobar plan activo antes de reenviar invitaciones.
    // Si no quieres bloquear invites por plan, puedes quitar este bloque.
    const { data: ent, error: entErr } = await sb
      .from("debacu_eval_org_entitlements_v")
      .select("subscription_status")
      .eq("org_id", org_id)
      .maybeSingle();

    if (entErr) return err(req, 500, "request_failed");
    const subStatus = String(ent?.subscription_status ?? "").toUpperCase();
    if (subStatus !== "ACTIVE") return err(req, 402, "plan_not_active");

    // Importante: fijar redirect para tu flujo (/auth/activate)
    const { error: inviteErr } = await sb.auth.admin.inviteUserByEmail(target.invited_email, {
      redirectTo: INVITE_REDIRECT_TO,
    });

    if (inviteErr) return err(req, 400, "request_failed");

    return json(req, 200, { ok: true });
  }

  return err(req, 500, "request_failed");
});
