import { supabase } from "@/services/supabaseClient";

type Action = "LIST" | "APPROVE" | "REJECT" | "RESEND";


export async function adminAccessRequests(
  action: Action,
  body: Record<string, any> = {}
) {
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const token = data.session?.access_token;
  if (!token) throw new Error("No session token");

  const { data: res, error } = await supabase.functions.invoke(
    "debacu_eval_admin_access",
    {
      body: { action, ...body },
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (error) throw error;
  return res;
}
