// src/services/clientService.ts
import { supabase } from "@/services/supabaseClient";
import type { Rating } from "@/types/types";
import type { Database } from "@/types/database";
import { callEvalFn } from "./callEvalFn";

import { getSupabaseAccessToken } from "@/services/evalAuthToken";

/** =========================================================
 *  Tipos DB
 * ========================================================= */
export type EvaluationRow = Database["public"]["Tables"]["debacu_evaluations"]["Row"];
export type EvaluationInsert = Database["public"]["Tables"]["debacu_evaluations"]["Insert"];

/** =========================================================
 *  Helpers Edge (Supabase JWT)
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

/**
 * ⚠️ Toggle: si AÚN tienes edge legacy que exige "x-session-token"
 * - Recomendado: false (modo Supabase puro)
 * - Solo ponlo en true si tienes funciones que todavía lo revisan.
 */
const SEND_LEGACY_X_SESSION_TOKEN = false;

export async function getSessionTokenOrThrow(): Promise<string> {
  // ✅ nuevo: JWT de Supabase
  const jwt = await getSupabaseAccessToken();
  if (jwt) return jwt;

  // (opcional) fallback legacy si aún existe en algunos flujos
  const legacy = localStorage.getItem("debacu_eval_session_token");
  if (legacy) return legacy;

  throw new Error("missing_session_token");
}

/**
 * Call Edge Function:
 * - Authorization: Bearer <supabase jwt>
 * - apikey: ANON
 * - (opcional legacy) x-session-token: <token>
 *
 * Acepta respuestas:
 * - { ok: true, data: ... }
 * - { ok: true, rows: ... }
 * - o devuelve directo el objeto
 */
export async function callEdge<T>(name: string, body: any): Promise<T> {
  // ✅ aquí el token YA es el JWT (o legacy fallback)
  const token = await getSessionTokenOrThrow();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: ANON_KEY,
    Authorization: `Bearer ${token}`,
  };

  // ⚠️ Legacy (solo si lo necesitas realmente)
  if (SEND_LEGACY_X_SESSION_TOKEN) {
    const legacy = localStorage.getItem("debacu_eval_session_token");
    if (legacy) headers["x-session-token"] = legacy;
  }

  const res = await fetch(fnUrl(name), {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });

  const { json, text } = await readJsonSafe(res);

  if (!res.ok) {
    console.error(`${name} failed:`, res.status, text);
    throw new Error(`${name}_failed`);
  }

  // Respuesta estándar { ok: true/false, ... }
  if (json && typeof json === "object" && "ok" in json) {
    if ((json as any).ok === true) {
      // ✅ Si la función devuelve "rows" + "signals" (u otros metadatos), NO la desenvuelvas
      if ("signals" in json || "meta" in json || "summary" in json) {
        return json as T;
      }
      return ((json as any).data ?? (json as any).rows ?? json) as T;
    }

    // ok === false
    throw new Error(String((json as any).error ?? `${name}_error`));
  }

  // Respuesta no estándar: devuelve el JSON tal cual
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

export function mapEvaluationToRating(row: EvaluationRow): Rating {
  // Rating es tipo UI legacy (camelCase). Aquí lo mantenemos para no romper el resto.
  return {
    id: row.id,
    value: (row as any).rating ?? 0,
    comment: (row as any).comment || "",
    createdAt: (row as any).evaluation_date || (row as any).created_at,

    authorId: ((row as any).creator_customer_uuid ?? (row as any).customer_id ?? "") as string,
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
 *  ✅ snake_case
 * ========================================================= */
export type GlobalSummary = {
  total_count: number;
  platform_counts: Record<string, number>;
  country_counts: Record<string, number>;
};

export async function getGlobalSummary(): Promise<GlobalSummary> {
  const raw = await callEdge<any>("debacu-eval-global-summary", {});
  // Normaliza por si el edge devolviera legacy
  return {
    total_count: Number(raw?.total_count ?? raw?.totalCount ?? 0),
    platform_counts: (raw?.platform_counts ?? raw?.platformCounts ?? {}) as Record<string, number>,
    country_counts: (raw?.country_counts ?? raw?.countryCounts ?? {}) as Record<string, number>,
  };
}

/** =========================================================
 *  GLOBAL RGPD-SAFE (Edge Function)
 *  ✅ snake_case en output
 * ========================================================= */
export type MatchStrength = "STRONG" | "MEDIUM" | "WEAK";
export type CountBucket = "0" | "1-2" | "3-5" | "6-10" | "10+";
export type RiskLevel = "BAJO" | "MEDIO" | "ALTO" | "NO_CONCLUYENTE";

export type MoneyRange = { min: number; max: number };

export type StructuredSummary = {
  has_evidence?: boolean;
  dominant_signal?: string;
  pattern?: "LOW" | "MODERATE" | "HIGH" | string;
  time_window?: string;
  last_seen_label?: string;

  economic_impact_range?: MoneyRange | string | null;
  net_loss_range?: MoneyRange | string | null;
};

export type GlobalSignals = {
  match_strength: MatchStrength;
  has_matches: boolean;
  count_exact?: number;
  count_bucket: CountBucket;
  avg_stars?: number | null;
  risk_level?: RiskLevel;
  top_typologies?: string[];
  time_window?: string;
  message?: string;

  economic_time_window?: string | null;
  economic_gross_bucket?: string | null;
  economic_gross_label?: string | null;
  economic_net_bucket?: string | null;
  economic_net_label?: string | null;

  sources_label?: string | null;
  last_seen_bucket?: string | null;
  documents_bucket?: string | null;
  hotel_category?: number | null;
  stars_multiplier?: number | null;

  structured_summary?: StructuredSummary | null;
};

function looksLikeEmail(q: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.trim());
}
function looksLikePhone(q: string) {
  const p = q.replace(/\D/g, "");
  return p.length >= 8 && p.length <= 15;
}


 function looksLikeDoc(q: string) {
  const t = q.trim().toUpperCase().replace(/[\s-]/g, ""); // quita espacios y guiones

  // DNI: 8 dígitos + letra
  if (/^\d{8}[A-Z]$/.test(t)) return true;

  // NIE: X/Y/Z + 7 dígitos + letra
  if (/^[XYZ]\d{7}[A-Z]$/.test(t)) return true;

  // Pasaporte / doc genérico: letras+digits, longitud razonable.
  // Importante: EXIGE al menos una letra para NO tragarse teléfonos.
  if (/[A-Z]/.test(t) && /\d/.test(t) && t.length >= 7 && t.length <= 20) return true;

  return false;
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

function normalizeEmail(q: string) {
  return q.trim().toLowerCase();
}
function onlyDigits(q: string) {
  return q.replace(/\D/g, "");
}


function normalizeDoc(q: string) {
  return q.trim().toUpperCase().replace(/[\s-]/g, "");
}


function normalizePhone(q: string) {
  const digits = onlyDigits(q);
  const last9 = digits.length >= 9 ? digits.slice(-9) : digits;
  const e164 = digits.length === 9 ? `34${digits}` : digits;
  return { digits, last9, e164 };
}

function buildGlobalQueryPayload(raw: string) {
  const q = (raw || "").trim();

  const is_email = looksLikeEmail(q);
  const is_phone = looksLikePhone(q);
  const is_doc = looksLikeDoc(q);

  const strength = classifyQuery(q);

  let q_input = q;
  let email_norm: string | null = null;
  let doc_norm: string | null = null;
  let phone_digits: string | null = null;
  let phone_last9: string | null = null;
  let phone_e164: string | null = null;

  if (is_email) {
    email_norm = normalizeEmail(q);
    q_input = email_norm;
  } else if (is_doc) {
    doc_norm = normalizeDoc(q);
    q_input = doc_norm;
  } else if (is_phone) {
    const p = normalizePhone(q);
    phone_digits = p.digits;
    phone_last9 = p.last9;
    phone_e164 = p.e164;
    q_input = phone_digits;
  }

  return {
    q_raw: q,
    q_input,
    strength,
    allow_weak: strength === "WEAK",
    email_norm,
    doc_norm,
    phone_digits,
    phone_last9,
    phone_e164,
  };
}

export async function checkSignalsGlobal(query: string, months = 24): Promise<GlobalSignals> {
  const raw = (query || "").trim();
  const payload = buildGlobalQueryPayload(raw);

  if (!raw) {
    return {
      match_strength: "MEDIUM",
      has_matches: false,
      count_exact: 0,
      count_bucket: "0",
      risk_level: "NO_CONCLUYENTE",
      time_window: `${months}M`,
      message: "Introduce un criterio válido.",
      structured_summary: null,

      economic_time_window: null,
      economic_gross_bucket: null,
      economic_gross_label: null,
      economic_net_bucket: null,
      economic_net_label: null,
      sources_label: null,
      last_seen_bucket: null,
      documents_bucket: null,
      hotel_category: null,
      stars_multiplier: null,
    };
  }

  try {
    const row = await callEdge<any>("debacu-eval-check-signals", {
      q_input: payload.q_input,
      q_raw: payload.q_raw,
      months,
      k: 3,
      allow_weak: payload.allow_weak,
      match_strength_hint: payload.strength,
      email_norm: payload.email_norm,
      doc_norm: payload.doc_norm,
      phone_digits: payload.phone_digits,
      phone_last9: payload.phone_last9,
      phone_e164: payload.phone_e164,
    });

    const count_exact =
      typeof row?.count_exact === "number"
        ? row.count_exact
        : typeof row?.countExact === "number"
        ? row.countExact
        : Number(row?.count_exact ?? row?.countExact ?? 0);

    const has_matches = Boolean(row?.has_matches ?? row?.hasMatches ?? count_exact > 0);

    const match_strength = (row?.match_strength ?? row?.matchStrength ?? payload.strength) as MatchStrength;

    const risk_level: RiskLevel = payload.allow_weak
      ? "NO_CONCLUYENTE"
      : ((row?.risk_level ?? row?.risk ?? row?.riskLevel ?? "NO_CONCLUYENTE") as RiskLevel);

    const message = payload.allow_weak
      ? has_matches
        ? "Hay señales asociadas, pero el criterio es no concluyente (nombre). Para comprobación técnica usa email/teléfono/documento."
        : "Resultado no concluyente: el dato aportado puede corresponder a varias personas. Para una comprobación técnica, añade email/teléfono/documento."
      : String(row?.message ?? "");

    const avg_stars =
      typeof row?.avg_stars === "number"
        ? row.avg_stars
        : typeof row?.avgStars === "number"
        ? row.avgStars
        : row?.avg_stars ?? row?.avgStars ?? null;

    const top_typologies = Array.isArray(row?.top_typologies)
      ? row.top_typologies
      : Array.isArray(row?.topTypologies)
      ? row.topTypologies
      : [];

    const structured_summary = (row?.structured_summary ?? null) as StructuredSummary | null;

    return {
      match_strength,
      has_matches,
      count_exact,
      count_bucket: (row?.count_bucket ?? row?.countBucket ?? "0") as CountBucket,
      avg_stars,
      risk_level,
      top_typologies,
      time_window: String(row?.time_window ?? row?.timeWindow ?? `${months}M`),
      message,

      economic_time_window: row?.economic_time_window ?? row?.economicTimeWindow ?? null,
      economic_gross_bucket: row?.economic_gross_bucket ?? row?.economicGrossBucket ?? null,
      economic_gross_label: row?.economic_gross_label ?? row?.economicGrossLabel ?? null,
      economic_net_bucket: row?.economic_net_bucket ?? row?.economicNetBucket ?? null,
      economic_net_label: row?.economic_net_label ?? row?.economicNetLabel ?? null,

      sources_label: row?.sources_label ?? row?.sourcesLabel ?? null,
      last_seen_bucket: row?.last_seen_bucket ?? row?.lastSeenBucket ?? null,
      documents_bucket: row?.documents_bucket ?? row?.documentsBucket ?? null,
      hotel_category:
        typeof row?.hotel_category === "number"
          ? row.hotel_category
          : typeof row?.hotelCategory === "number"
          ? row.hotelCategory
          : row?.hotel_category ?? row?.hotelCategory ?? null,
      stars_multiplier:
        typeof row?.stars_multiplier === "number"
          ? row.stars_multiplier
          : typeof row?.starsMultiplier === "number"
          ? row.starsMultiplier
          : row?.stars_multiplier ?? row?.starsMultiplier ?? null,

      structured_summary,
    };
  } catch (e) {
    console.error("checkSignalsGlobal failed:", e);
    return {
      match_strength: payload.strength,
      has_matches: false,
      count_exact: 0,
      count_bucket: "0",
      risk_level: "NO_CONCLUYENTE",
      time_window: `${months}M`,
      message: "No se ha podido completar la comprobación.",
      structured_summary: null,

      economic_time_window: null,
      economic_gross_bucket: null,
      economic_gross_label: null,
      economic_net_bucket: null,
      economic_net_label: null,
      sources_label: null,
      last_seen_bucket: null,
      documents_bucket: null,
      hotel_category: null,
      stars_multiplier: null,
    };
  }
}

/** =========================================================
 *  “MIS REGISTROS” -> Edge Function (rows + signals)
 *  ✅ snake_case en output
 * ========================================================= */
export type MyRatingsSignals = {
  has_matches: boolean;
  count_exact: number;
  count_bucket: CountBucket;
  avg_stars: number | null;
  risk_level: RiskLevel;
  time_window: "MINE";
  top_typologies: string[];
  economic_gross_label: string | null;
  economic_net_label: string | null;
  economic_time_window: "MINE";
  last_seen_label: string | null;
};

export type MyRatingsSearchResponse = {
  rows: any[];
  signals: MyRatingsSignals | null;
};

export async function searchMyRatingsInSupabase(q: string, limit = 50): Promise<MyRatingsSearchResponse> {
  const res = await callEdge<any>("debacu-eval-my-ratings-search", { q, limit });

  // Si por cualquier motivo volviera array, fallback
  if (Array.isArray(res)) return { rows: res, signals: null };

  const rows = Array.isArray(res?.rows) ? res.rows : [];

  // Normaliza signals snake_case por si el edge devolviese legacy
  const s = res?.signals ?? null;
  const signals: MyRatingsSignals | null = s
    ? {
        has_matches: Boolean(s?.has_matches ?? s?.hasMatches ?? false),
        count_exact: Number(s?.count_exact ?? s?.countExact ?? 0),
        count_bucket: (s?.count_bucket ?? s?.countBucket ?? "0") as CountBucket,
        avg_stars: s?.avg_stars ?? s?.avgStars ?? null,
        risk_level: (s?.risk_level ?? s?.risk ?? s?.riskLevel ?? "NO_CONCLUYENTE") as RiskLevel,
        time_window: "MINE",
        top_typologies: Array.isArray(s?.top_typologies)
          ? s.top_typologies
          : Array.isArray(s?.topTypologies)
          ? s.topTypologies
          : [],
        economic_gross_label: s?.economic_gross_label ?? s?.economicGrossLabel ?? null,
        economic_net_label: s?.economic_net_label ?? s?.economicNetLabel ?? null,
        economic_time_window: "MINE",
        last_seen_label: s?.last_seen_label ?? s?.lastSeenLabel ?? null,
      }
    : null;

  return { rows, signals };
}

/** =========================================================
 *  Insert (via Edge Function) - usando callEdge (JWT real)
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
  evaluation_date?: string | null;
  creator_customer_id?: string | null;
  creator_customer_name?: string | null;
}

export async function addEvaluation(
  input: AddEvaluationInput,
  currentCustomerId: string,
  currentCustomerName: string
): Promise<EvaluationRow | null> {
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

  const out = await callEdge<any>("debacu-eval-add", {
    app_code: "DEBACU_EVAL",
    accept_declaration: true,
    input: payload,
    currentCustomerId,
    currentCustomerName,
  });

  const row = out?.row ?? out;
  if (!row) return null;
  return row as EvaluationRow;
}

/** =========================================================
 *  GLOBAL RISK SNAPSHOT -> Edge Function
 *  ✅ snake_case en output
 * ========================================================= */
export type GlobalRiskSnapshot = {
  pct_5: number;
  pct_4: number;
  pct_3: number;
  pct_2: number;
  pct_1: number;
  pct_bajo: number;
  pct_medio: number;
  pct_alto: number;
};

export async function getGlobalRiskSnapshot(): Promise<GlobalRiskSnapshot> {
  const data = await callEdge<any>("debacu-eval-global-risk-snapshot", {});
  return {
    pct_5: Number(data?.pct_5 ?? data?.pct5 ?? 0),
    pct_4: Number(data?.pct_4 ?? data?.pct4 ?? 0),
    pct_3: Number(data?.pct_3 ?? data?.pct3 ?? 0),
    pct_2: Number(data?.pct_2 ?? data?.pct2 ?? 0),
    pct_1: Number(data?.pct_1 ?? data?.pct1 ?? 0),
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

/** =========================================================
 *  client_dashboard (Edge Function)
 *  ✅ snake_case en output (normaliza legacy)
 * ========================================================= */
export type ClientDashboardData = {
  customer_id: string;
  month_start: string;
  plan_card: {
    name: string;
    status: string;
    billing_frequency: string | null;
    next_billing: string | null;
    limit: number | null;
  } | null;
  query_count: number;
  created_this_month: number;
  activity: Array<{
    id: string;
    date: string;
    type: string;
    label: string;
    contact: string;
    rating: number | null;
  }>;
};

export async function getClientDashboard(): Promise<ClientDashboardData> {
  const raw = await callEdge<any>("client_dashboard", {});
  // Normaliza por si viniera legacy
  return {
    customer_id: String(raw?.customer_id ?? raw?.customerId ?? ""),
    month_start: String(raw?.month_start ?? raw?.monthStart ?? ""),
    plan_card: raw?.plan_card ?? raw?.planCard ?? null,
    query_count: Number(raw?.query_count ?? raw?.queryCount ?? 0),
    created_this_month: Number(raw?.created_this_month ?? raw?.createdThisMonth ?? 0),
    activity: Array.isArray(raw?.activity) ? raw.activity : [],
  };
}

/** =========================================================
 *  AUDITORÍA - Histórico de consultas (Edge Functions)
 *  ✅ snake_case extremo (request/response)
 * ========================================================= */
export type AuditHistoryItem = {
  audit_id: string;
  created_at: string;

  // técnico
  event_type: string | null;

  // ✅ UI-friendly
  type: string | null;
  label: string | null;
  type_label: string | null;

  risk_level: string | null;
  avg_stars: number | null;
  match_strength: string | null;
  count_bucket: string | null;
  count_exact: number | null;
  time_window: string | null;

  input_kind: string | null;
  search_value_masked: string | null;

  result_count: number | null;

  actor_user_id: string | null;
  actor_role: string | null;
  actor_email: string | null;

  meta: any;
};

export type ListAuditHistoryResp = {
  items: AuditHistoryItem[];
  total: number;
  page: number;
  page_size: number;
};

function normalize_audit_item(row: any): AuditHistoryItem {
  const meta = (row?.meta ?? {}) as any;

  const audit_id = String(row?.audit_id ?? row?.id ?? "");
  const created_at = String(row?.created_at ?? "");

  const event_type = (row?.event_type ?? meta?.event_type ?? null) as string | null;

  const type = (row?.type ?? meta?.type ?? null) as string | null;
  const label = (row?.label ?? meta?.label ?? null) as string | null;

  const type_label =
    label ??
    type ??
    (event_type ? (String(event_type).toUpperCase() === "CHECK_SIGNALS" ? "Consulta" : event_type) : null);

  const risk_level =
    (row?.risk_level ?? row?.risk ?? meta?.risk_level ?? meta?.risk ?? null) as string | null;

  const avg_stars =
    typeof row?.avg_stars === "number"
      ? row.avg_stars
      : typeof row?.rating === "number"
      ? row.rating
      : typeof meta?.avg_stars === "number"
      ? meta.avg_stars
      : typeof meta?.rating === "number"
      ? meta.rating
      : row?.avg_stars ?? row?.rating ?? meta?.avg_stars ?? meta?.rating ?? null;

  const match_strength =
    (row?.match_strength ?? row?.matchStrength ?? meta?.match_strength ?? meta?.matchStrength ?? null) as
      | string
      | null;

  const count_bucket =
    (row?.count_bucket ?? row?.countBucket ?? meta?.count_bucket ?? meta?.countBucket ?? null) as string | null;

  const count_exact =
    typeof row?.count_exact === "number"
      ? row.count_exact
      : typeof row?.countExact === "number"
      ? row.countExact
      : typeof meta?.count_exact === "number"
      ? meta.count_exact
      : typeof meta?.countExact === "number"
      ? meta.countExact
      : row?.count_exact ?? row?.countExact ?? meta?.count_exact ?? meta?.countExact ?? null;

  const time_window =
    (row?.time_window ?? row?.timeWindow ?? meta?.time_window ?? meta?.timeWindow ?? meta?.months_received ?? null) as
      | string
      | null;

  const input_kind =
    (row?.input_kind ?? row?.search_kind ?? meta?.input_kind ?? meta?.search_kind ?? null) as string | null;

  const search_value_masked =
    (row?.search_value_masked ?? row?.contact ?? meta?.search_value_masked ?? meta?.contact ?? null) as
      | string
      | null;

  const result_count =
    typeof row?.result_count === "number"
      ? row.result_count
      : typeof row?.resultCount === "number"
      ? row.resultCount
      : typeof meta?.result_count === "number"
      ? meta.result_count
      : typeof meta?.resultCount === "number"
      ? meta.resultCount
      : row?.result_count ?? row?.resultCount ?? meta?.result_count ?? meta?.resultCount ?? null;

  const actor_user_id = (row?.actor_user_id ?? meta?.actor_user_id ?? null) as string | null;
  const actor_role = (row?.actor_role ?? row?.userRole ?? meta?.actor_role ?? meta?.userRole ?? null) as string | null;
  const actor_email =
    (row?.actor_email ?? row?.requested_by_email ?? meta?.actor_email ?? meta?.requested_by_email ?? null) as
      | string
      | null;

  return {
    audit_id,
    created_at,
    event_type,
    type,
    label,
    type_label,
    risk_level,
    avg_stars,
    match_strength,
    count_bucket,
    count_exact,
    time_window,
    input_kind,
    search_value_masked,
    result_count,
    actor_user_id,
    actor_role,
    actor_email,
    meta,
  };
}

function normalize_list_audit_history(raw: any, fallback: { page: number; page_size: number }): ListAuditHistoryResp {
  const page = Number(raw?.page ?? fallback.page ?? 1);
  const page_size = Number(raw?.page_size ?? raw?.pageSize ?? fallback.page_size ?? 10);
  const total = Number(raw?.total ?? raw?.count ?? raw?.total_count ?? 0);
  const items_raw = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw?.rows) ? raw.rows : [];
  const items = items_raw.map(normalize_audit_item);
  return { items, total, page, page_size };
}

export async function list_audit_history(params: {
  page: number;
  page_size: number;
  q?: string | null;
  event_type?: string | null;

  // ✅ preparado para siguiente paso (filtro fechas)
  date_from?: string | null; // yyyy-mm-dd
  date_to?: string | null; // yyyy-mm-dd
}): Promise<ListAuditHistoryResp> {
  const payload = {
    page: params.page,
    page_size: params.page_size,
    q: params.q ?? null,
    event_type: params.event_type ?? "CHECK_SIGNALS",
    date_from: params.date_from ?? null,
    date_to: params.date_to ?? null,
  };

  const raw = await callEvalFn<any>("client_audit_history_list", payload);
  return normalize_list_audit_history(raw, { page: params.page, page_size: params.page_size });
}

export async function get_audit_history_detail(audit_id: string): Promise<AuditHistoryItem> {
  const raw = await callEvalFn<any>("client_audit_history_detail", { audit_id });
  const item = raw?.item ?? raw?.data?.item ?? raw?.row ?? raw;
  return normalize_audit_item(item);
}

export type IssueAuditPdfResp = {
  pdf_event_id: string;
  pdf_event_created_at: string | null;
  download_url: string | null;
  storage_path: string | null;
};

export async function issue_audit_pdf(params: { source_audit_id: string; template_version?: string }) {
  const raw = await callEvalFn<any>("client_audit_pdf_issue", {
    source_audit_id: params.source_audit_id,
    template_version: params.template_version ?? "v1",
  });

  // ⚠️ Tu edge actual SOLO registra trazabilidad y NO genera PDF -> no hay download_url.
  return {
    pdf_event_id: String(raw?.pdf_event_id ?? raw?.id ?? ""),
    pdf_event_created_at: raw?.pdf_event_created_at ?? raw?.pdf_event_created_at ?? null,
    download_url: raw?.download_url ?? null,
    storage_path: raw?.storage_path ?? null,
  } as IssueAuditPdfResp;
}

export async function audit_export_generate(payload: {
  export_type: "PDF" | "CSV";
  export_scope: string;
  period_from: string; // YYYY-MM-DD
  period_to: string; // YYYY-MM-DD
  filters?: Record<string, unknown>;
  source_audit_id?: string | null;
}) {
  return callEvalFn("client_audit_export_generate", payload);
}

export async function audit_export_download(export_id: string) {
  return callEvalFn("client_audit_export_download", { export_id });
}

export async function audit_history_view(payload: { source_audit_id: string }) {
  return callEvalFn("client_audit_history_view", payload);
}

export type PeriodField = "evaluation_date" | "created_at";

export type WeeklySeriesRow = {
  day: string;
  incidents: number;
  risk_high: number;
  risk_medium: number;
  risk_low: number;
  gross: number;
  recovered: number;
  net: number;
};

export async function getWeeklySeries7d(args: {
  period_from: string;
  period_to: string;
  period_field: PeriodField;
}): Promise<WeeklySeriesRow[]> {
  const resp: any = await callEvalFn("customer_operational_weekly_series_get", {
    period_from: args.period_from,
    period_to: args.period_to,
    period_field: args.period_field,
  });

  if (!resp?.ok) throw new Error(resp?.error || resp?.detail || "fetch_failed");
  return (resp.series ?? []) as WeeklySeriesRow[];
}
