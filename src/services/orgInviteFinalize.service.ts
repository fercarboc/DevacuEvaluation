// src/services/orgInviteFinalize.service.ts
import { callEvalFn, getEvalOrgId } from "@/services/callEvalFn";

export async function orgInviteFinalize() {
  const org_id = getEvalOrgId();
  if (!org_id) throw new Error("Falta org_id (debacu_eval_org_id). No se puede finalizar invitación.");
  return await callEvalFn("debacu_eval_invite_finalize", { action: "FINALIZE", org_id });
}