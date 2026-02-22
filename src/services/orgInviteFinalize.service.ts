// src/services/orgInviteFinalize.service.ts
import { callEvalFn, setEvalOrgId } from "@/services/callEvalFn";

type Resp = {
  ok: boolean;
  org_id?: string | null;
  app_id?: string | null;
  detail?: string;
  error?: string;
};

export async function orgInviteFinalize(orgId: string) {
  const id = String(orgId || "").trim();
  if (!id) throw new Error("missing_org_id");

  // deja org_id listo también para el injector de callEvalFn
  setEvalOrgId(id);

  // OJO: aquí el body incluye org_id explícito para que no dependa del injector
  const r = await callEvalFn<Resp>("debacu_eval_invite_finalize", { org_id: id });

  if (!r?.ok) {
    throw new Error(r?.detail || r?.error || "invite_finalize_failed");
  }

  return r;
}