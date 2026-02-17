import { supabase } from "@/services/supabaseClient";

type Action = "LIST" | "APPROVE" | "REJECT" | "RESEND";

// ✅ Pon aquí el nombre EXACTO de tu Edge Function desplegada.
// Si has desplegado la nueva: "debacu-eval-admin-access-requests"
const FN_NAME = "debacu-eval-admin-access-requests"; 
// Si quieres mantener tu naming anterior, cámbialo a "debacu_eval_admin_access" 
// pero entonces también renombra/duplica la Edge.

function pickErrorMessage(err: any) {
  return (
    err?.context?.error_description ||
    err?.context?.message ||
    err?.message ||
    "Error invocando Edge Function"
  );
}

export async function adminAccessRequests(action: Action, body: Record<string, any> = {}) {
  // ✅ JWT-only explícito
  const { data: sess } = await supabase.auth.getSession();
  const jwt = sess?.session?.access_token;
  if (!jwt) throw new Error("No hay sesión Supabase. Login requerido.");

  const { data, error } = await supabase.functions.invoke(FN_NAME, {
    body: { action, ...body },
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
  });

  if (error) {
    // Edge errors a veces vienen “envueltos”
    throw new Error(pickErrorMessage(error));
  }

  // si tu Edge devuelve {error, detail} en JSON con 200/400, lo detectas aquí:
  if ((data as any)?.error) {
    throw new Error((data as any)?.detail || (data as any)?.error);
  }

  return data;
}
