// src/services/callEvalFn.ts
import { supabase } from "@/services/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function fnUrl(name: string) {
  return `${SUPABASE_URL}/functions/v1/${name}`;
}

function pickErrorMessage(json: any, fallbackText: string, status: number) {
  return (
    json?.error_obj?.message ||
    json?.detail ||
    json?.error ||
    json?.message ||
    fallbackText ||
    `HTTP ${status}`
  );
}

export async function callEvalFn<T = any>(fnName: string, body: unknown = {}): Promise<T> {
  const debacuSessionToken = localStorage.getItem("debacu_eval_session_token") || "";

  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token || "";

  if (!jwt) throw new Error("No hay sesión de Supabase (haz login).");
  if (!debacuSessionToken) throw new Error("No hay session_token Debacu (evalLogin).");

  const res = await fetch(fnUrl(fnName), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: ANON_KEY,
      authorization: `Bearer ${jwt}`,
      "x-session-token": debacuSessionToken,
    },
    body: JSON.stringify(body ?? {}),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  // 1) Error HTTP (4xx/5xx)
  if (!res.ok) {
    const msg = pickErrorMessage(json, text, res.status);
    throw new Error(msg);
  }

  // 2) Error lógico (Edge devuelve 200 con {ok:false,...})
  if (json && typeof json === "object" && "ok" in json && json.ok === false) {
    const msg = pickErrorMessage(json, text, res.status);
    throw new Error(msg);
  }

  // 3) Respuesta OK
  return (json ?? ({} as any)) as T;
}
