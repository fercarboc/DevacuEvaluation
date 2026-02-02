// src/services/clientService.ts
import { supabase } from "@/services/supabaseClient";
import type { Rating } from "@/types/types";
import type { Database } from "@/types/database";

/** =========================================================
 *  Tipos DB
 * ========================================================= */
export type EvaluationRow = Database["public"]["Tables"]["debacu_evaluations"]["Row"];
export type EvaluationInsert = Database["public"]["Tables"]["debacu_evaluations"]["Insert"];

/** =========================================================
 *  Helpers Edge
 * ========================================================= */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function fnUrl(name: string) {
  return `${SUPABASE_URL}/functions/v1/${name}`;
}

async function readJsonSafe(res: Response) {
  const text = await res.text();
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null as any, text };
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function getSessionTokenOrThrow() {
  const t = localStorage.getItem("debacu_eval_session_token") || "";
  if (!t) throw new Error("missing_session_token");
  return t;
}

/**
 * Call Edge Function usando tu esquema:
 * - Authorization: Bearer ANON
 * - apikey: ANON
 * - x-session-token: tu token de sesión propio
 *
 * Acepta respuestas:
 * - { ok: true, data: ... }
 * - o devuelve directo el objeto
 */
async function callEdge<T>(name: string, body: any): Promise<T> {
  const session_token = getSessionTokenOrThrow();

  const res = await fetch(fnUrl(name), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "x-session-token": session_token,
    },
    body: JSON.stringify(body ?? {}),
  });

  const { json, text } = await readJsonSafe(res);
  if (!res.ok) {
    console.error(`${name} failed:`, res.status, text);
    throw new Error(`${name}_failed`);
  }

  // convención flexible
  if (json && typeof json === "object" && "ok" in json) {
    if (json.ok === true) return (json.data ?? null) as T;
    throw new Error(String((json as any).error ?? `${name}_error`));
  }

  return (json ?? null) as T;
}

/** =========================================================
 *  Enmascarado (solo UI / solo “Mis registros”)
 * ========================================================= */
function maskEmail(email?: string | null): string | null {
  const e = (email || "").trim();
  if (!e || !e.includes("@")) return null;
  const [u, d] = e.split("@");
  const uMask = u.length <= 1 ? "*" : `${u[0]}***`;
  const dParts = d.split(".");
  const dMask =
    dParts.length && dParts[0]
      ? `${dParts[0][0]}***.${dParts.slice(1).join(".") || "com"}`
      : "***";
  return `${uMask}@${dMask}`;
}

function maskPhone(phone?: string | null): string | null {
  const p = (phone || "").replace(/\D/g, "");
  if (!p) return null;
  const last = p.slice(-3);
  return `•••${last}`;
}

function maskDoc(doc?: string | null): string | null {
  const d = (doc || "").trim();
  if (!d) return null;
  if (d.length <= 4) return "••••";
  return `${d.slice(0, 2)}••••${d.slice(-2)}`;
}

function mapEvaluationToRating(row: EvaluationRow): Rating {
  return {
    id: row.id,
    value: (row as any).rating ?? 0,
    comment: (row as any).comment || "",
    createdAt: (row as any).evaluation_date || (row as any).created_at,
    authorId: (row as any).creator_customer_id || "HISTORICO",
    authorName: (row as any).creator_customer_name || (row as any).platform || "Histórico",
    platform: (row as any).platform || undefined,
    clientData: {
      fullName: (row as any).full_name || "",
      document: maskDoc((row as any).document) ?? undefined,
      email: maskEmail((row as any).email) ?? undefined,
      phone: maskPhone((row as any).phone) ?? undefined,
      nationality: (row as any).nationality || undefined,
    },
  };
}

/** =========================================================
 *  RESUMEN GLOBAL (paneles laterales) -> Edge Function
 *  - NO devolver total visible en UI si no quieres (UI decide)
 * ========================================================= */
export interface GlobalSummary {
  totalCount: number; // lo puedes ignorar en UI
  platformCounts: Record<string, number>;
  countryCounts: Record<string, number>;
}

export async function getGlobalSummary(): Promise<GlobalSummary> {
  // Edge: debacu-eval-global-summary
  return await callEdge<GlobalSummary>("debacu-eval-global-summary", {});
}

/** =========================================================
 *  GLOBAL RGPD-SAFE (Edge Function)
 * ========================================================= */
export type MatchStrength = "STRONG" | "MEDIUM" | "WEAK";
export type CountBucket = "0" | "1-2" | "3-5" | "6-10" | "10+";
export type RiskLevel = "BAJO" | "MEDIO" | "ALTO" | "NO_CONCLUYENTE";

export type GlobalSignals = {
  matchStrength: MatchStrength;
  hasMatches: boolean;
  countExact?: number;
  countBucket: CountBucket;
  avgStars?: number | null;
  risk?: RiskLevel;
  topTypologies?: string[];
  timeWindow?: string;
  message?: string;
};

function looksLikeEmail(q: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.trim());
}
function looksLikePhone(q: string) {
  const p = q.replace(/\D/g, "");
  return p.length >= 8 && p.length <= 15;
}
function looksLikeDoc(q: string) {
  const t = q.trim().toUpperCase().replace(/\s+/g, "");
  return /^[XYZ]?\d{5,10}[A-Z]?$/.test(t);
}
function looksLikeNameOnly(q: string) {
  const t = q.trim();
  if (t.length < 5) return false;
  if (looksLikeEmail(t) || looksLikePhone(t) || looksLikeDoc(t)) return false;
  const parts = t.split(/\s+/).filter(Boolean);
  const hasLetters = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(t);
  return hasLetters && parts.length >= 2;
}
function classifyQuery(q: string): MatchStrength {
  if (looksLikeEmail(q) || looksLikePhone(q) || looksLikeDoc(q)) return "STRONG";
  if (looksLikeNameOnly(q)) return "WEAK";
  return "MEDIUM";
}

export async function checkSignalsGlobal(query: string, months = 24): Promise<GlobalSignals> {
  const q = (query || "").trim();
  if (!q) {
    return {
      matchStrength: "MEDIUM",
      hasMatches: false,
      countExact: 0,
      countBucket: "0",
      risk: "NO_CONCLUYENTE",
      timeWindow: `${months}M`,
      message: "Introduce un criterio válido.",
    };
  }

  const strength = classifyQuery(q);

  // Nombre/apellidos suelto => no concluyente
  if (strength === "WEAK") {
    return {
      matchStrength: "WEAK",
      hasMatches: false,
      countExact: 0,
      countBucket: "0",
      risk: "NO_CONCLUYENTE",
      timeWindow: `${months}M`,
      message:
        "Resultado no concluyente: el dato aportado puede corresponder a varias personas. Para una comprobación técnica, añade email/teléfono/documento.",
    };
  }

  // Edge: debacu-eval-check-signals
  try {
    const row = await callEdge<any>("debacu-eval-check-signals", {
      q_input: q,
      months,
      k: 3,
      // si tu edge soporta estos flags, ok; si no, los ignorará
    });

    const countExact = typeof row?.countExact === "number" ? row.countExact : Number(row?.countExact ?? 0);

    return {
      matchStrength: (row?.matchStrength ?? strength) as MatchStrength,
      hasMatches: Boolean(row?.hasMatches ?? countExact > 0),
      countExact,
      countBucket: (row?.countBucket ?? "0") as CountBucket,
      avgStars: typeof row?.avgStars === "number" ? row.avgStars : row?.avgStars ?? null,
      risk: (row?.risk ?? "NO_CONCLUYENTE") as RiskLevel,
      topTypologies: Array.isArray(row?.topTypologies) ? row.topTypologies : [],
      timeWindow: row?.timeWindow ?? `${months}M`,
      message: row?.message ?? "",
    };
  } catch (e) {
    console.error("checkSignalsGlobal failed:", e);
    return {
      matchStrength: strength,
      hasMatches: false,
      countExact: 0,
      countBucket: "0",
      risk: "NO_CONCLUYENTE",
      timeWindow: `${months}M`,
      message: "No se ha podido completar la comprobación.",
    };
  }
}

/** =========================================================
 *  “MIS REGISTROS” -> Edge Function (evita 403 por RLS)
 * ========================================================= */
export async function searchMyRatingsInSupabase(query: string, authorId: string): Promise<Rating[]> {
  const q = (query || "").trim();
  if (!q) return [];
  if (!authorId) return [];

  // Edge: debacu-eval-my-ratings-search
  const rows = await callEdge<EvaluationRow[]>("debacu-eval-my-ratings-search", {
    q,
    authorId,
    limit: 50,
  });

  return (rows || []).map(mapEvaluationToRating);
}

/** =========================================================
 *  Insert (via Edge Function)
 * ========================================================= */
export interface AddEvaluationInput {
  document: string;
  full_name: string;
  nationality?: string | null;
  phone?: string | null;
  email?: string | null;
  rating: number;
  comment?: string | null;
  platform?: string | null;
  evaluation_date?: string | null; // yyyy-mm-dd
  creator_customer_id?: string | null;
  creator_customer_name?: string | null;
}

export async function addEvaluation(
  input: AddEvaluationInput,
  currentCustomerId: string,
  currentCustomerName: string
): Promise<EvaluationRow | null> {
  const session_token = localStorage.getItem("debacu_eval_session_token") || "";
  if (!session_token) {
    console.error("Falta debacu_eval_session_token. Haz login otra vez.");
    return null;
  }

  const payload: EvaluationInsert = {
    document: (input.document || "").trim(),
    full_name: (input.full_name || "").trim(),
    nationality: input.nationality ? String(input.nationality).trim() : null,
    phone: input.phone ? String(input.phone).trim() : null,
    email: input.email ? String(input.email).trim().toLowerCase() : null,
    rating: Number(input.rating || 0),
    comment: input.comment ? String(input.comment).trim() : null,
    platform: input.platform ? String(input.platform).trim() : "DEBACU_EVAL",
    evaluation_date: input.evaluation_date || todayISO(),
    creator_customer_id: input.creator_customer_id ?? currentCustomerId ?? null,
    creator_customer_name: input.creator_customer_name ?? currentCustomerName ?? null,
  };

  const res = await fetch(fnUrl("debacu-eval-add"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "x-session-token": session_token,
    },
    body: JSON.stringify({
      app_code: "DEBACU_EVAL",
      accept_declaration: true,
      input: payload,
    }),
  });

  const { json, text } = await readJsonSafe(res);
  if (!res.ok) {
    console.error("debacu-eval-add failed:", res.status, text);
    return null;
  }

  const row = json?.row;
  if (!row) {
    console.error("debacu-eval-add: missing row in response", json);
    return null;
  }

  return row as EvaluationRow;
}

/** =========================================================
 *  GLOBAL RISK SNAPSHOT -> Edge Function (3/6/12 meses)
 * ========================================================= */
export type GlobalRiskSnapshot = {
  pct5: number;
  pct4: number;
  pct3: number;
  pct2: number;
  pct1: number;
  pct_bajo: number;
  pct_medio: number;
  pct_alto: number;
};

export async function getGlobalRiskSnapshot(args?: { months?: 3 | 6 | 12 }): Promise<GlobalRiskSnapshot> {
  const months = args?.months ?? 6;
  const data = await callEdge<any>("debacu-eval-global-risk-snapshot", { months });

  return {
    pct5: Number(data?.pct5 ?? 0),
    pct4: Number(data?.pct4 ?? 0),
    pct3: Number(data?.pct3 ?? 0),
    pct2: Number(data?.pct2 ?? 0),
    pct1: Number(data?.pct1 ?? 0),
    pct_bajo: Number(data?.pct_bajo ?? 0),
    pct_medio: Number(data?.pct_medio ?? 0),
    pct_alto: Number(data?.pct_alto ?? 0),
  };
}

/** =========================================================
 *  whoami (Edge Function)
 * ========================================================= */
export type ClientWhoami = {
  user_id: string;
  email: string | null;
  org_id: string;
  role: "OWNER" | "STAFF";
  plan: { id: string; name: string; code: string | null; included_seats: number } | null;
  subscription: { id: string; status: string | null; billing_frequency: string | null } | null;
  seats: { used: number; included: number; extra: number; allowed: number };
  trial: { active: boolean; ends_at: string | null; expired: boolean };
};

export async function client_whoami(): Promise<ClientWhoami> {
  const { data, error } = await supabase.functions.invoke("client_whoami", { body: {} });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "client_whoami_failed");
  return data.data as ClientWhoami;
}
