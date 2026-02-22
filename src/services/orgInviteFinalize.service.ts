// src/services/orgInviteFinalize.service.ts
import { supabase } from "@/services/supabase";

export async function orgInviteFinalize(orgId: string) {
  const { data, error } = await supabase.functions.invoke("debacu_eval_invite_finalize", {
    body: { org_id: orgId },
  });

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.detail || data?.error || "invite_finalize_failed");
  return data;
}