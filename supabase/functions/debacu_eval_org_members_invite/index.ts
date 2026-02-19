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

function err(detail: string, extra?: any) {
  return { ok: false, error: "request_failed", detail, ...(extra ? { extra } : {}) };
}

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://debacu.com";
const INVITE_REDIRECT_TO = `${SITE_URL}/auth/activate`;

async function requireOrgPrivileged(
  sb: ReturnType<typeof supabaseServiceClient>,
  authUserId: string,
  orgId: string,
) {
  // probamos con user_id y auth_user_id
  const { data: a, error: ea } = await sb
    .from("debacu_eval_org_members")
    .select("role,status")
    .eq("org_id", orgId)
    .eq("user_id", authUserId)
    .maybeSingle();

  if (ea) throw new Error("db_read_failed");
  let row = a;

  if (!row) {
    const { data: b, error: eb } = await sb
      .from("debacu_eval_org_members")
      .select("role,status")
      .eq("org_id", orgId)
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (eb) throw new Error("db_read_failed");
    row = b;
  }

  if (!row || String(row.status) !== "ACTIVE") throw new Error("FORBIDDEN");
  const role = String(row.role ?? "").toUpperCase();
  if (role !== "OWNER" && role !== "ADMIN") throw new Error("FORBIDDEN");
}

async function getEntitlements(
  sb: ReturnType<typeof supabaseServiceClient>,
  orgId: string,
): Promise<{ subscription_status: string | null; seats_available: number }> {
  const { data, error } = await sb
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

    const sb = supabaseServiceClient();

    const orgId = safeStr(body.org_id);
    if (!orgId) return json(req, 400, err("missing_org_id"));

    await requireOrgPrivileged(sb, user.id, orgId);

    const email = normalizeEmail(body.email);
    const role = normRole(body.role);

    const firstName = safeStr(body.firstName);
    const lastName = safeStr(body.lastName);
    const title = safeStr(body.title);
    const phone = safeStr(body.phone);

    if (!isValidEmail(email)) return json(req, 400, err("invalid_email"));
    if (role !== "STAFF" && role !== "ADMIN") return json(req, 400, err("invalid_role"));

    const ent = await getEntitlements(sb, orgId);
    if (String(ent.subscription_status ?? "").toUpperCase() !== "ACTIVE") {
      return json(req, 402, err("PLAN_NOT_ACTIVE"));
    }
    if (ent.seats_available <= 0) return json(req, 409, err("SEATS_EXCEEDED"));

    // ¿Ya existe membership para ese email?
    const { data: existing, error: exErr } = await sb
      .from("debacu_eval_org_members")
      .select("id,status,role,invited_email")
      .eq("org_id", orgId)
      .eq("invited_email", email)
      .maybeSingle();

    if (exErr) return json(req, 500, err("db_read_failed"));

    // Si existe ACTIVE o SUSPENDED => no invitamos
    if (existing?.id) {
      const st = String(existing.status ?? "").toUpperCase();
      if (st === "ACTIVE" || st === "SUSPENDED") {
        return json(req, 409, err("ALREADY_MEMBER"));
      }
      // Si existe INVITED => lo tratamos como RESEND
    }

    // Si no existe, creamos INVITED
    let memberId = existing?.id as string | undefined;

    if (!memberId) {
      const { data: member, error: insErr } = await sb
        .from("debacu_eval_org_members")
        .insert({
          org_id: orgId,
          role,
          status: "INVITED",
          invited_email: email,
          auth_user_id: null,
          user_id: null,
          created_by_user_id: user.id,
        })
        .select("id, created_at, org_id, role, status, invited_email")
        .single();

      if (insErr || !member?.id) return json(req, 500, err("db_write_failed"));
      memberId = String(member.id);

      const { error: profileErr } = await sb
        .from("debacu_eval_org_member_profiles")
        .insert({
          member_id: memberId,
          org_id: orgId,
          first_name: firstName || null,
          last_name: lastName || null,
          title: title || null,
          phone: phone || null,
        });

      if (profileErr) {
        // rollback
        await sb.from("debacu_eval_org_members").delete().eq("id", memberId);
        return json(req, 500, err("db_write_failed"));
      }
    }

    // INVITE por Auth (puede fallar si el email ya existe en auth)
    const { error: inviteErr } = await sb.auth.admin.inviteUserByEmail(email, {
      redirectTo: INVITE_REDIRECT_TO,
      data: { app: "DEBACU_EVAL", org_id: orgId, invited_by: user.id },
    });

    if (inviteErr) {
      // NO borro el membership si ya existía INVITED (porque es útil para reintentos)
      // Si lo acabamos de crear, sí podemos rollback para no dejar basura
      if (!existing?.id && memberId) {
        await sb.from("debacu_eval_org_member_profiles").delete().eq("member_id", memberId);
        await sb.from("debacu_eval_org_members").delete().eq("id", memberId);
      }

      return json(req, 400, err("invite_failed", { message: inviteErr.message }));
    }

    return json(req, 200, { ok: true, data: { member_id: memberId, org_id: orgId, email, role } });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") return json(req, 401, err("UNAUTHENTICATED"));
    if (msg.startsWith("FORBIDDEN")) return json(req, 403, err(msg));
    if (msg === "db_read_failed") return json(req, 500, err("db_read_failed"));
    return json(req, 500, err("internal_error", { message: msg }));
  }
});
