// src/services/callEvalFn.ts
import { supabase } from "@/services/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const LS_ORG_ID = "debacu_eval_org_id"; // <-- clave única y consistente

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

function getOrgIdFromStorage(): string {
  const v = (localStorage.getItem(LS_ORG_ID) ?? "").trim();
  return v;
}

function withOrgId(body: unknown): unknown {
  // si no es objeto plano, no tocamos
  if (!body || typeof body !== "object" || Array.isArray(body)) return body ?? {};

  const b = body as Record<string, any>;

  // si ya viene, respetar
  const hasOrg =
    (typeof b.org_id === "string" && b.org_id.trim()) ||
    (typeof b.orgId === "string" && b.orgId.trim());

  if (hasOrg) return b;

  const orgId = getOrgIdFromStorage();
  if (!orgId) return b; // dejaremos que Edge falle con missing_org_id

  return { ...b, org_id: orgId };
}

/**
 * callEvalFn — JWT-only (Supabase Auth)
 */
export async function callEvalFn<T = any>(fnName: string, body: unknown = {}): Promise<T> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`Supabase getSession error: ${error.message}`);

  const jwt = data?.session?.access_token || "";
  if (!jwt) throw new Error("No hay sesión de Supabase (haz login).");

  const bodyWithOrg = withOrgId(body);

  const res = await fetch(fnUrl(fnName), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: ANON_KEY,
      authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(bodyWithOrg ?? {}),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    console.error("[callEvalFn] HTTP ERROR", {
      fnName,
      status: res.status,
      bodySent: bodyWithOrg ?? {},
      responseText: text,
      responseJson: json,
    });
    const msg = pickErrorMessage(json, text, res.status);
    throw new Error(msg);
  }

  if (json && typeof json === "object" && "ok" in json && json.ok === false) {
    const msg = pickErrorMessage(json, text, res.status);
    throw new Error(msg);
  }

  return (json ?? ({} as any)) as T;
}

// helper opcional para setearlo desde postlogin/whoami:
export function setEvalOrgId(orgId: string | null | undefined) {
  const v = (orgId ?? "").trim();
  if (!v) return;
  localStorage.setItem(LS_ORG_ID, v);
}