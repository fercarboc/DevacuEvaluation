import { supabase } from "@/services/supabaseClient";

type Action = "LIST" | "APPROVE" | "REJECT";

export async function adminAccessRequests(action: Action, body: Record<string, any> = {}) {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  if (!token) throw new Error("No session token");

  const { data, error } = await supabase.functions.invoke("debacu_eval_admin_access", {
    body: { action, ...body },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) throw error;
  return data;
}
