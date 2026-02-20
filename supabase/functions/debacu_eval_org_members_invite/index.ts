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
  siteUrl?: string | null; // ✅ para local/prod
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
function upper(v: any) {
  return String(v ?? "").trim().toUpperCase();
}

function err(detail: string, extra?: any) {
  return { ok: false, error: "request_failed", detail, ...(extra ? { extra } : {}) };
}

const DEFAULT_SITE_URL = Deno.env.get("SITE_URL") ?? "https://debacu.com";

async function requireOrgPrivileged(
  sb: ReturnType<typeof supabaseServiceClient>,
  authUserId: string,
  orgId: string,
) {
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

  if (!row || upper(row.status) !== "ACTIVE") throw new Error("FORBIDDEN");
  const role = upper(row.role);
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

    const siteUrl = safeStr(body.siteUrl) || DEFAULT_SITE_URL;
    const redirectTo = `${siteUrl}/auth/activate`;

    // ¿Ya existe membership para ese email?
    const { data: existing, error: exErr } = await sb
      .from("debacu_eval_org_members")
      .select("id,status,role,invited_email")
      .eq("org_id", orgId)
      .eq("invited_email", email)
      .maybeSingle();

    if (exErr) return json(req, 500, err("db_read_failed"));

    const existingStatus = upper(existing?.status);

    // Si existe ACTIVE o SUSPENDED => no invitamos
    if (existing?.id && (existingStatus === "ACTIVE" || existingStatus === "SUSPENDED")) {
      return json(req, 409, err("ALREADY_MEMBER"));
    }

    // ✅ Seats / plan: solo bloquea si vas a CREAR un INVITED nuevo.
    // Si ya existía INVITED, permitimos RESEND aunque seats_available = 0.
    if (!existing?.id) {
      const ent = await getEntitlements(sb, orgId);

      if (upper(ent.subscription_status) !== "ACTIVE") {
        return json(req, 402, err("PLAN_NOT_ACTIVE"));
      }
      if (ent.seats_available <= 0) return json(req, 409, err("SEATS_EXCEEDED"));
    }

    let memberId = existing?.id as string | undefined;

    // Si existe INVITED y cambias role, lo actualizamos.
    if (memberId && existingStatus === "INVITED" && upper(existing?.role) !== role) {
      const { error: upRoleErr } = await sb
        .from("debacu_eval_org_members")
        .update({ role, updated_at: new Date().toISOString() })
        .eq("id", memberId);
      if (upRoleErr) return json(req, 500, err("db_write_failed"));
    }

    // Si no existe, creamos INVITED
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
        .select("id")
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
        await sb.from("debacu_eval_org_members").delete().eq("id", memberId);
        return json(req, 500, err("db_write_failed"));
      }
    }

    // INVITE por Auth
    const { error: inviteErr } = await sb.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { app: "DEBACU_EVAL", org_id: orgId, member_id: memberId, invited_by: user.id, role },
    });

    if (inviteErr) {
      // ✅ Si falla por "user already exists", aquí lo sensato es RECOVERY (reset password).
      const msg = String(inviteErr.message ?? "");
      const looksLikeExists =
        msg.toLowerCase().includes("already") ||
        msg.toLowerCase().includes("exists") ||
        msg.toLowerCase().includes("registered");

      if (looksLikeExists) {
        // OJO: generateLink devuelve link, NO garantiza envío de email.
        const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo },
        });

        if (linkErr) return json(req, 400, err("invite_failed", { message: msg }));

        return json(req, 200, {
          ok: true,
          data: {
            member_id: memberId,
            org_id: orgId,
            email,
            role,
            mode: "RECOVERY_LINK_GENERATED",
            action_link: linkData?.properties?.action_link ?? null,
          },
        });
      }

      // rollback solo si lo acabamos de crear
      if (!existing?.id && memberId) {
        await sb.from("debacu_eval_org_member_profiles").delete().eq("member_id", memberId);
        await sb.from("debacu_eval_org_members").delete().eq("id", memberId);
      }

      return json(req, 400, err("invite_failed", { message: msg }));
    }

    return json(req, 200, { ok: true, data: { member_id: memberId, org_id: orgId, email, role, mode: "INVITE" } });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") return json(req, 401, err("UNAUTHENTICATED"));
    if (msg.startsWith("FORBIDDEN")) return json(req, 403, err(msg));
    if (msg === "db_read_failed") return json(req, 500, err("db_read_failed"));
    return json(req, 500, err("internal_error", { message: msg }));
  }
});