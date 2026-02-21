// src/services/orgInviteFinalize.service.ts
import { callEvalFn } from "@/services/callEvalFn";

/**
 * Finaliza invitación: linkea membership con el user actual y (si estaba INVITED) lo pasa a ACTIVE.
 * Requiere org_id correcto (del link /auth/activate?org_id=...).
 */
export async function orgInviteFinalize(org_id: string) {
  const v = String(org_id ?? "").trim();
  if (!v) throw new Error("Falta org_id. No se puede finalizar la invitación.");

  return await callEvalFn("debacu_eval_invite_finalize", {
    action: "FINALIZE",
    org_id: v,
  });
}