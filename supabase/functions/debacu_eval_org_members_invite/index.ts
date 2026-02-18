// supabase/functions/debacu_eval_org_members_invite/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

type Body = {
  org_id?: string | null;
  email?: string | null;
  role?: string | null; // STAFF | ADMIN
  firstName?: string | null;
  lastName?: string | null;
  title?: string | null;
  phone?: string | null;
};

function err(detail: string) {
  return { ok: false, error: "request_failed", detail };
}

function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}
function normalizeEmail(v: any) {
  return safeStr(v).toLowerCase();
}
function isValidEmail(v: string) {
  return !!v && v.includes("@") && v.length <= 254;
}
function normRole(v: any) {
  const r = safeStr(v).toUpperCase();
  return r || "STAFF";
}

async function requireOrgIdForUser(
  supabase: ReturnType<typeof supabaseServiceClient>,
  authUserId: string,
  orgIdFromBody: string | null | undefined,
): Promise<string> {
  const orgId = safeStr(orgIdFromBody);

  // Si viene org_id: NO fallback. O pertenece (ACTIVE) o 403.
  if (orgId) {
    const { data, error } = await supabase
      .from("debacu_eval_org_members")
      .select("org_id")
      .eq("org_id", orgId)
      .eq("auth_user_id", authUserId) // <-- AJUSTA si tu columna es user_id
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (error) throw new Error("db_read_failed");
    if (!data?.org_id) throw new Error("FORBIDDEN");
    return String(data.org_id);
  }

  // Fallback determinista: primera ACTIVE (solo si no mandan org_id)
  const { data, error } = await supabase
    .from("debacu_eval_org_members")
    .select("org_id, created_at")
    .eq("auth_user_id", authUserId) // <-- AJUSTA si tu columna es user_id
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw new Error("db_read_failed");
  if (!data?.[0]?.org_id) throw new Error("FORBIDDEN_NO_ACTIVE_MEMBERSHIP");
  return String(data[0].org_id);
}

async function requireOrgPrivileged(
  supabase: ReturnType<typeof supabaseServiceClient>,
  authUserId: string,
  orgId: string,
) {
  const { data, error } = await supabase
    .from("debacu_eval_org_members")
    .select("role,status")
    .eq("org_id", orgId)
    .eq("auth_user_id", authUserId) // <-- AJUSTA si tu columna es user_id
    .maybeSingle();

  if (error) throw new Error("db_read_failed");
  if (!data || String(data.status) !== "ACTIVE") throw new Error("FORBIDDEN");

  const role = String(data.role ?? "").toUpperCase();
  if (role !== "OWNER" && role !== "ADMIN") throw new Error("FORBIDDEN");
}

async function getEntitlements(
  supabase: ReturnType<typeof supabaseServiceClient>,
  orgId: string,
): Promise<{ subscription_status: string | null; seats_available: number }> {
  const { data, error } = await supabase
    .from("debacu_eval_org_entitlements_v")
    .select("subscription_status,seats_available")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error("db_read_failed");
  return {
    subscription_status: data?.subscription_status ?? null,
    seats_available: Number(data?.seats_available ?? 0) || 0,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, err("method_not_allowed"));

  try {
    const user = await requireUser(req);

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return json(req, 400, err("invalid_json"));

    const supabase = supabaseServiceClient();

    const orgId = await requireOrgIdForUser(supabase, user.id, body.org_id);
    await requireOrgPrivileged(supabase, user.id, orgId);

    const email = normalizeEmail(body.email);
    const role = normRole(body.role);

    const firstName = safeStr(body.firstName);
    const lastName = safeStr(body.lastName);
    const title = safeStr(body.title);
    const phone = safeStr(body.phone);

    if (!isValidEmail(email)) return json(req, 400, err("invalid_email"));
    if (role !== "STAFF" && role !== "ADMIN") return json(req, 400, err("invalid_role"));

    const ent = await getEntitlements(supabase, orgId);
    if (ent.subscription_status !== "ACTIVE") return json(req, 402, err("PLAN_NOT_ACTIVE"));
    if (ent.seats_available <= 0) return json(req, 409, err("SEATS_EXCEEDED"));

    // Anti-duplicate: invited_email por org
    const { data: existing, error: exErr } = await supabase
      .from("debacu_eval_org_members")
      .select("id,status")
      .eq("org_id", orgId)
      .eq("invited_email", email)
      .maybeSingle();

    if (exErr) return json(req, 500, err("db_read_failed"));
    if (existing?.id) return json(req, 409, err("ALREADY_MEMBER"));

    // 1) Crear membership INVITED primero (más consistente)
    const { data: member, error: insErr } = await supabase
      .from("debacu_eval_org_members")
      .insert({
        org_id: orgId,
        role,
        status: "INVITED",
        invited_email: email,
        auth_user_id: null, // <-- AJUSTA si tu columna es user_id
        created_by_user_id: user.id,
      })
      .select("id, created_at, org_id, role, status, invited_email")
      .single();

    if (insErr || !member?.id) return json(req, 500, err("db_write_failed"));

    // 2) Invitar por Supabase Auth (service role)
    const { error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { app: "DEBACU_EVAL", org_id: orgId, invited_by: user.id },
    });

    if (inviteErr) {
      // rollback membership
      await supabase.from("debacu_eval_org_members").delete().eq("id", member.id);
      return json(req, 400, err("invite_failed"));
    }

    // 3) Perfil (rollback si falla)
    const { error: profileErr } = await supabase
      .from("debacu_eval_org_member_profiles")
      .insert({
        member_id: member.id,
        org_id: orgId,
        first_name: firstName || null,
        last_name: lastName || null,
        title: title || null,
        phone: phone || null,
      });

    if (profileErr) {
      await supabase.from("debacu_eval_org_members").delete().eq("id", member.id);
      return json(req, 500, err("db_write_failed"));
    }

    return json(req, 200, { ok: true, data: { member } });
  } catch (e: any) {
    const msg = String(e?.message ?? "");

    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return json(req, 401, err("UNAUTHENTICATED"));
    }
    if (msg === "FORBIDDEN" || msg === "FORBIDDEN_NO_ACTIVE_MEMBERSHIP") {
      return json(req, 403, err(msg));
    }
    if (msg === "db_read_failed") return json(req, 500, err("db_read_failed"));

    return json(req, 500, err("internal_error"));
  }
});
