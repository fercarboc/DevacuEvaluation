import { supabase } from "@/services/supabaseClient";

type Action = "LIST" | "APPROVE" | "REJECT" | "RESEND";

export async function adminAccessRequests(action: Action, body: Record<string, any> = {}) {
  const { data, error } = await supabase.functions.invoke("debacu_eval_admin_access", {
    body: { action, ...body },
  });

  if (error) throw error;
  return data;
}
