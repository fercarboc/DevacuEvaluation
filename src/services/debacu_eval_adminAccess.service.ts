// src/services/debacu_eval_adminAccess.service.ts
import { supabase } from "@/services/supabaseClient";

export type Action = "LIST" | "APPROVE" | "REJECT" | "RESEND";

/**
 * Nombre EXACTO de la Edge Function desplegada en Supabase.
 * Debe coincidir 1:1 con el nombre en Dashboard > Edge Functions.
 */
const FN_NAME = "debacu-eval-admin-access-requests";

type InvokeResult<T = any> = {
  data: T | null;
  error: any | null;
};

/** Intenta extraer un mensaje humano de distintos formatos de error */
function pickErrorMessage(err: any, fallback = "Error invocando Edge Function") {
  return (
    err?.context?.error_description ||
    err?.context?.message ||
    err?.message ||
    err?.details ||
    fallback
  );
}

/**
 * Admin Access Requests (JWT-only)
 *
 * body recomendado:
 * - LIST:    { status?: "PENDING"|"APPROVED"|"REJECTED", limit?: number, offset?: number }
 * - APPROVE: { requestId, reviewedBy?, decisionNotes?, siteUrl, activateUrl?, sendEmail?: boolean }
 * - RESEND:  { requestId, reviewedBy?, siteUrl, activateUrl?, sendEmail?: boolean }
 * - REJECT:  { requestId, reviewedBy?, decisionNotes? }
 *
 * NOTA: activateUrl debería ser algo como:
 *   `${siteUrl}/auth/activate?org_id=${orgId}`
 * para evitar el problema de org_id residual en localStorage.
 */
export async function adminAccessRequests<T = any>(action: Action, body: Record<string, any> = {}): Promise<T> {
  // ✅ JWT-only explícito
  const { data: sess, error: sessErr } = await supabase.auth.getSession();
  if (sessErr) throw new Error(`No se pudo obtener sesión: ${sessErr.message}`);

  const jwt = sess?.session?.access_token;
  if (!jwt) throw new Error("No hay sesión Supabase. Login requerido.");

  const payload = { action, ...body };

  let result: InvokeResult<T>;
  try {
    result = (await supabase.functions.invoke(FN_NAME, {
      body: payload,
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    })) as InvokeResult<T>;
  } catch (e: any) {
    // Errores de red / CORS / etc.
    throw new Error(pickErrorMessage(e, "Error de red invocando la Edge Function"));
  }

  const { data, error } = result;

  // Error “nativo” de invoke
  if (error) {
    // A veces viene con info adicional
    const msg = pickErrorMessage(error);
    throw new Error(msg);
  }

  // Si tu Edge responde JSON estilo { ok:false, error, detail, ... } con status 4xx,
  // supabase.functions.invoke suele ponerlo en data igualmente. Lo detectamos:
  const anyData = data as any;

  if (anyData?.ok === false) {
    throw new Error(anyData?.detail || anyData?.error || "Request failed");
  }

  // Si tu Edge usa {error, detail} sin ok:
  if (anyData?.error && typeof anyData?.error === "string") {
    throw new Error(anyData?.detail || anyData?.error);
  }

  return data as T;
}