// src/services/callEvalFn.ts
import { supabase } from "@/services/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const LS_ORG_ID = "debacu_eval_org_id";

/* ======================================================
 * Helpers org_id
 * ====================================================== */

export function setEvalOrgId(orgId: string | null | undefined) {
  const v = String(orgId ?? "").trim();
  if (!v) return;
  localStorage.setItem(LS_ORG_ID, v);
}

export function getEvalOrgId(): string {
  return localStorage.getItem(LS_ORG_ID) || "";
}

/* ======================================================
 * Internal utils
 * ====================================================== */

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

function injectOrgId(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return body ?? {};
  }

  const b = body as Record<string, any>;

  // si ya viene org_id, no tocar
  if (
    (typeof b.org_id === "string" && b.org_id.trim()) ||
    (typeof b.orgId === "string" && b.orgId.trim())
  ) {
    return b;
  }

  const orgId = getEvalOrgId();
  if (!orgId) {
    return b; // dejar que la Edge falle con missing_org_id
  }

  return { ...b, org_id: orgId };
}

/* ======================================================
 * callEvalFn — JWT-only
 * ====================================================== */

export async function callEvalFn<T = any>(
  fnName: string,
  body: unknown = {},
): Promise<T> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`Supabase getSession error: ${error.message}`);

  const jwt = data?.session?.access_token || "";
  if (!jwt) throw new Error("No hay sesión de Supabase (haz login).");

  const finalBody = injectOrgId(body);

  const res = await fetch(fnUrl(fnName), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: ANON_KEY,
      authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(finalBody ?? {}),
  });

  const text = await res.text();
  let json: any = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  // HTTP error
  if (!res.ok) {
    console.error("[callEvalFn] HTTP ERROR", {
      fnName,
      status: res.status,
      bodySent: finalBody ?? {},
      responseText: text,
      responseJson: json,
    });

    const msg = pickErrorMessage(json, text, res.status);
    throw new Error(msg);
  }

  // logical error
  if (json && typeof json === "object" && "ok" in json && json.ok === false) {
    const msg = pickErrorMessage(json, text, res.status);
    throw new Error(msg);
  }

  return (json ?? ({} as any)) as T;
}
