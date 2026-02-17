// src/services/orgInviteFinalize.service.ts
import { callEvalFn } from "@/services/callEvalFn";

export async function orgInviteFinalize() {
  return await callEvalFn("debacu_eval_invite_finalize", { action: "FINALIZE" });
}
