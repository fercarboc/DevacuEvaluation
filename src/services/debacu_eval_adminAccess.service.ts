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

function pickErrorMessage(err: any, fallback = "Error invocando Edge Function") {
  return (
    err?.context?.error_description ||
    err?.context?.message ||
    err?.message ||
    err?.details ||
    fallback
  );
}

export async function adminAccessRequests<T = any>(action: Action, body: Record<string, any> = {}): Promise<T> {
  const { data: sess, error: sessErr } = await supabase.auth.getSession();
  if (sessErr) throw new Error(`No se pudo obtener sesión: ${sessErr.message}`);

  const jwt = sess?.session?.access_token;
  if (!jwt) throw new Error("No hay sesión Supabase. Login requerido.");

  let result: InvokeResult<T>;
  try {
    result = (await supabase.functions.invoke(FN_NAME, {
      body: { action, ...body },
      headers: { Authorization: `Bearer ${jwt}` },
    })) as InvokeResult<T>;
  } catch (e: any) {
    throw new Error(pickErrorMessage(e, "Error de red invocando la Edge Function"));
  }

  const { data, error } = result;

  if (error) throw new Error(pickErrorMessage(error));

  const anyData = data as any;

  if (anyData?.ok === false) {
    throw new Error(anyData?.detail || anyData?.error || "Request failed");
  }

  if (anyData?.error && typeof anyData?.error === "string") {
    throw new Error(anyData?.detail || anyData?.error);
  }

  return data as T;
}