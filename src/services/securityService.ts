// src/services/securityService.ts
import { callEvalFn } from "@/services/callEvalFn";

export type OrgRole = "OWNER" | "STAFF";
export type MemberStatus = "ACTIVE" | "INVITED" | "SUSPENDED";

export type OrgMemberRow = {
  id: string;
  created_at: string;

  org_id: string;
  user_id: string | null;

  role: OrgRole;
  status: MemberStatus;

  invited_email: string | null;

  created_by_user_id: string | null;
  updated_at: string | null;
};

export type OrgEntitlements = {
  org_id: string;
  customer_id: string;

  plan_code: string | null;
  subscription_status: string | null;

  max_users: number;
  extra_seats: number;
  seats_total: number;

  seats_used: number;
  seats_available: number;
};

function assertOk<T>(res: any, fallbackMsg: string): T {
  if (!res?.ok) throw new Error(res?.error ?? fallbackMsg);
  return res.data as T;
}

/**
 * Lista miembros de la organización del usuario actual.
 * Requiere que el usuario sea OWNER (en backend).
 */
export async function org_members_list(): Promise<OrgMemberRow[]> {
  const res = await callEvalFn<any>("debacu_eval_org_members_list", {});
  return assertOk<OrgMemberRow[]>(res, "Failed to list org members");
}

/**
 * Invita un usuario (email) a la organización.
 * Enforza:
 * - subscription_status === ACTIVE
 * - seats_available > 0
 * - role válido ('STAFF' por defecto)
 */
export async function org_members_invite(input: {
  email: string;
  role?: OrgRole; // por política, normalmente STAFF
}): Promise<{ member: OrgMemberRow; invited_user_id: string | null }> {
  const payload = {
    email: (input.email ?? "").trim().toLowerCase(),
    role: (input.role ?? "STAFF").toUpperCase(),
  };

  const res = await callEvalFn<any>("debacu_eval_org_members_invite", payload);
  const data = assertOk<any>(res, "Failed to invite org member");

  return {
    member: data.member as OrgMemberRow,
    invited_user_id: data.invite?.invited_user_id ?? null,
  };
}

export type OrgMemberUpdateAction = "SUSPEND" | "REACTIVATE" | "REMOVE" | "RESEND_INVITE";

/**
 * Actualiza un miembro:
 * - SUSPEND: status -> SUSPENDED
 * - REACTIVATE: status -> ACTIVE (con enforcement de seats)
 * - REMOVE: delete membership
 * - RESEND_INVITE: reenvía email de invitación (solo INVITED)
 */
export async function org_members_update(input: {
  action: OrgMemberUpdateAction;
  member_id: string;
}): Promise<void> {
  const res = await callEvalFn<any>("debacu_eval_org_members_update", {
    action: input.action,
    member_id: input.member_id,
  });
  assertOk<true>(res, "Failed to update org member");
}

/**
 * (Opcional) Si quieres mostrar límites en UI Seguridad sin recalcular,
 * puedes leer directamente la VIEW desde una Edge Function específica.
 * Ahora mismo NO la hemos creado; si la quieres, montamos:
 * - debacu_eval_org_entitlements_get
 */
export async function org_entitlements_get(): Promise<OrgEntitlements> {
  const res = await callEvalFn<any>("debacu_eval_org_entitlements_get", {});
  return assertOk<OrgEntitlements>(res, "Failed to get entitlements");
}
