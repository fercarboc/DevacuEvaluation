// src/services/evaluationService.ts
import { supabase } from "@/services/supabaseClient";
import type { Rating } from "@/types/types";
import type { Database } from "@/types/database";

export type EvaluationRow = Database["public"]["Tables"]["debacu_evaluations"]["Row"];
export type EvaluationInsert = Database["public"]["Tables"]["debacu_evaluations"]["Insert"];

/** =========================================================
 *  RGPD/LOPDGDD (diseño “ajustado a derecho”)
 *  ---------------------------------------------------------
 *  1) GLOBAL (Comprobación):
 *     - NO debe devolver filas individuales.
 *     - NO debe devolver PII (full_name/email/phone/document) ni siquiera enmascarado.
 *     - Devuelve SOLO señales agregadas.
 *     - Recomendado: hacerlo vía RPC en BD para que NUNCA salgan datos a cliente.
 *
 *  2) MINE (Mis registros):
 *     - Puede devolver filas individuales SOLO de registros creados por el hotel actual
 *       (creator_customer_id == currentUser.id).
 *     - Puede mostrar PII enmascarado (UI) porque son “mis propios registros”.
 *
 *  IMPORTANTE:
 *  - Si NO creas la RPC, este fichero NO calculará medias/typologías en cliente
 *    (porque eso implicaría traer filas al navegador).
 * ========================================================= */

export type ReputationCategory = "NO_RECOMMENDED" | "DUBIOUS" | "OK";

export interface ClientSummary {
  // ⚠️ LEGACY (NO usar en flujo RGPD-safe GLOBAL)
  document: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  totalRatings: number;
  avgRating: number;
  lastEvaluationDate: string | null;
  category: ReputationCategory;
  evaluations: EvaluationRow[];
}

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

function categorizeRating(avg: number): ReputationCategory {
  if (avg <= 2) return "NO_RECOMMENDED";
  if (Math.round(avg) === 3) return "DUBIOUS";
  return "OK";
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
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
    value: row.rating,
    comment: row.comment || "",
    createdAt: row.evaluation_date || row.created_at,
    authorId: row.creator_customer_id || "HISTORICO",
    authorName: row.creator_customer_name || row.platform || "Histórico",
    platform: row.platform || undefined,
    clientData: {
      // ⚠️ solo para “Mis registros”
      fullName: row.full_name,
      document: maskDoc(row.document) ?? undefined,
      email: maskEmail(row.email) ?? undefined,
      phone: maskPhone(row.phone) ?? undefined,
      nationality: row.nationality || undefined,
    },
  };
}

/** =========================================================
 *  RESUMEN GLOBAL (paneles laterales)
 * ========================================================= */
export interface GlobalSummary {
  totalCount: number;
  platformCounts: Record<string, number>;
  countryCounts: Record<string, number>;
}

export async function getGlobalSummary(): Promise<GlobalSummary> {
  const { data: platRows, error: platError } = await (supabase as any)
    .from("debacu_eval_platform_summary")
    .select("platform, cnt")
    .order("cnt", { ascending: false });
  if (platError) throw platError;

  const { data: countryRows, error: countryError } = await (supabase as any)
    .from("debacu_eval_country_summary")
    .select("country, cnt")
    .order("cnt", { ascending: false });
  if (countryError) throw countryError;

  const totalFromPlatforms = (platRows || []).reduce((acc: number, r: any) => acc + (r.cnt ?? 0), 0);
  const totalFromCountries = (countryRows || []).reduce((acc: number, r: any) => acc + (r.cnt ?? 0), 0);
  const totalCount = Math.max(totalFromPlatforms, totalFromCountries);

  const platformCounts: Record<string, number> = {};
  (platRows || []).forEach((r: any) => {
    platformCounts[r.platform] = r.cnt;
  });

  const countryCounts: Record<string, number> = {};
  (countryRows || []).forEach((r: any) => {
    countryCounts[r.country] = r.cnt;
  });

  return { totalCount, platformCounts, countryCounts };
}

/** =========================================================
 *  NUEVO: GLOBAL RGPD-SAFE (solo señales agregadas)
 * ========================================================= */
export type MatchStrength = "STRONG" | "MEDIUM" | "WEAK";
export type CountBucket = "0" | "1-2" | "3-5" | "6-10" | "10+";
export type RiskLevel = "BAJO" | "MEDIO" | "ALTO" | "NO_CONCLUYENTE";


export type GlobalSignals = {
  matchStrength: MatchStrength;
  hasMatches: boolean;

  // ✅ nuevo: número exacto (agregado)
  countExact?: number;

  // lo conservas para privacidad/UX
  countBucket: CountBucket;

  avgStars?: number | null;
  risk?: RiskLevel;
  topTypologies?: string[];
  timeWindow?: string;
  message?: string;
};


function bucketizeCount(n: number): CountBucket {
  if (!n || n <= 0) return "0";
  if (n <= 2) return "1-2";
  if (n <= 5) return "3-5";
  if (n <= 10) return "6-10";
  return "10+";
}

// Heurísticos (solo para UX / control de flujo, no para seguridad real)
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

/**
 * checkSignalsGlobal(query)
 * - RGPD SAFE: NO devuelve filas ni PII.
 * - Recomendado: RPC en Supabase (debacu_eval_check_signals) que haga:
 *     - matching interno (hash/salt) por doc/email/phone
 *     - agregación (count, avg_rating, tipologías) SIN exponer filas.
 */
export async function checkSignalsGlobal(query: string): Promise<GlobalSignals> {
  const q = (query || "").trim();
  if (!q) {
    return {
      matchStrength: "MEDIUM",
      hasMatches: false,
      countExact: 0,
      countBucket: "0",
      risk: "NO_CONCLUYENTE",
      timeWindow: "24M",
      message: "Introduce un criterio válido.",
    };
  }

  const strength = classifyQuery(q);

  if (strength === "WEAK") {
    return {
      matchStrength: "WEAK",
      hasMatches: false,
      countExact: 0,
      countBucket: "0",
      risk: "NO_CONCLUYENTE",
      timeWindow: "24M",
      message:
        "Resultado no concluyente: el dato aportado puede corresponder a varias personas. Para una comprobación técnica, añade email/teléfono/documento.",
    };
  }

  const session_token = localStorage.getItem("debacu_eval_session_token") || "";
  if (!session_token) {
    return {
      matchStrength: strength,
      hasMatches: false,
      countExact: 0,
      countBucket: "0",
      risk: "NO_CONCLUYENTE",
      timeWindow: "24M",
      message: "Sesión no válida. Vuelve a iniciar sesión.",
    };
  }

  const res = await fetch(fnUrl("debacu-eval-check-signals"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "x-session-token": session_token,
    },
    body: JSON.stringify({ q_input: q, months: 24, k: 3 }),
  });

  const { json, text } = await readJsonSafe(res);
  if (!res.ok) {
    console.error("debacu-eval-check-signals failed:", res.status, text);
    return {
      matchStrength: strength,
      hasMatches: false,
      countExact: 0,
      countBucket: "0",
      risk: "NO_CONCLUYENTE",
      timeWindow: "24M",
      message: "No se ha podido completar la comprobación.",
    };
  }

  const row = json || {};
  const countExact = typeof row.countExact === "number" ? row.countExact : Number(row.countExact ?? 0);

  return {
    matchStrength: (row.matchStrength ?? strength) as MatchStrength,
    hasMatches: Boolean(row.hasMatches ?? countExact > 0),
    countExact,
    countBucket: (row.countBucket ?? "0") as CountBucket,
    avgStars: row.avgStars ?? null,
    risk: (row.risk ?? "NO_CONCLUYENTE") as RiskLevel,
    topTypologies: Array.isArray(row.topTypologies) ? row.topTypologies : [],
    timeWindow: row.timeWindow ?? "24M",
    message: row.message ?? "",
  };
}


/** =========================================================
 *  NUEVO: “MIS REGISTROS” (detalle filtrado por authorId)
 * ========================================================= */
export async function searchMyRatingsInSupabase(query: string, authorId: string): Promise<Rating[]> {
  const q = query.trim();
  if (!q) return [];
  if (!authorId) return [];

  // ✅ Filtrado en BD por creator_customer_id
  const { data, error } = await supabase
    .from("debacu_evaluations")
    .select(
      [
        "id",
        "document",
        "full_name",
        "nationality",
        "phone",
        "email",
        "rating",
        "comment",
        "creator_customer_id",
        "creator_customer_name",
        "platform",
        "evaluation_date",
        "created_at",
        "updated_at",
      ].join(",")
    )
    .eq("creator_customer_id", authorId)
    .or(
      [
        `document.ilike.%${q}%`,
        `phone.ilike.%${q}%`,
        `email.ilike.%${q}%`,
        `full_name.ilike.%${q}%`,
      ].join(",")
    )
    .order("evaluation_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return [];
  const rows = (data ?? []) as unknown as EvaluationRow[];
  return rows.map(mapEvaluationToRating);
}

/** =========================================================
 *  LEGACY (NO usar en GLOBAL)
 *  - Mantengo por compatibilidad si lo llama otra pantalla.
 *  - Riesgo: devuelve PII enmascarado + filas individuales.
 *  - Úsalo SOLO para “Mis registros” o para admin interno.
 * ========================================================= */
export async function searchRatingsInSupabase(query: string): Promise<Rating[]> {
  // ⚠️ Considera eliminarlo cuando migres todo a searchMyRatingsInSupabase
  const q = query.trim();
  if (!q) return [];

  const { data, error } = await supabase
    .from("debacu_evaluations")
    .select(
      [
        "id",
        "document",
        "full_name",
        "nationality",
        "phone",
        "email",
        "rating",
        "comment",
        "creator_customer_id",
        "creator_customer_name",
        "platform",
        "evaluation_date",
        "created_at",
        "updated_at",
      ].join(",")
    )
    .or(
      [
        `document.ilike.%${q}%`,
        `phone.ilike.%${q}%`,
        `email.ilike.%${q}%`,
        `full_name.ilike.%${q}%`,
      ].join(",")
    )
    .order("evaluation_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return [];
  const rows = (data ?? []) as unknown as EvaluationRow[];
  return rows.map(mapEvaluationToRating);
}

/** =========================================================
 *  LEGACY: Search aggregated (ClientSummary[]) - NO RGPD safe
 *  - Esto agrupa por doc/email/phone y devuelve evaluaciones (filas).
 *  - No usar en flujo GLOBAL RGPD-safe.
 * ========================================================= */
export async function searchEvaluations(query: string): Promise<ClientSummary[]> {
  const q = query.trim();
  if (!q) return [];

  const { data, error } = await supabase
    .from("debacu_evaluations")
    .select("*")
    .or(
      [
        `document.ilike.%${q}%`,
        `phone.ilike.%${q}%`,
        `email.ilike.%${q}%`,
        `full_name.ilike.%${q}%`,
      ].join(",")
    )
    .order("evaluation_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return [];

  const rows = (data ?? []) as unknown as EvaluationRow[];
  const map = new Map<string, EvaluationRow[]>();

  for (const row of rows) {
    const key = row.document || row.email || row.phone || `${row.full_name}_${row.evaluation_date}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }

  const summaries: ClientSummary[] = [];

  for (const [, evaluations] of map) {
    if (!evaluations.length) continue;

    const doc = evaluations[0].document || "";
    const fullName = evaluations[0].full_name || "";
    const phone = evaluations[0].phone;
    const email = evaluations[0].email;

    const totalRatings = evaluations.length;
    const avgRating = evaluations.reduce((sum, e) => sum + (e.rating || 0), 0) / Math.max(1, totalRatings);

    const lastEvaluationDate =
      evaluations
        .map((e) => e.evaluation_date)
        .filter(Boolean)
        .sort()
        .slice(-1)[0] || null;

    summaries.push({
      document: doc,
      fullName,
      phone,
      email,
      totalRatings,
      avgRating: Number(avgRating.toFixed(2)),
      lastEvaluationDate,
      category: categorizeRating(avgRating),
      evaluations,
    });
  }

  summaries.sort((a, b) => (b.lastEvaluationDate || "").localeCompare(a.lastEvaluationDate || ""));
  return summaries;
}

/** =========================================================
 *  History by document (LEGACY / admin)
 * ========================================================= */
export async function getClientHistoryByDocument(document: string): Promise<EvaluationRow[]> {
  const { data, error } = await supabase
    .from("debacu_evaluations")
    .select("*")
    .eq("document", document)
    .order("evaluation_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as unknown as EvaluationRow[];
}

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

/** =========================================================
 *  Insert (via Edge Function)
 * ========================================================= */
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

  const body = {
    app_code: "DEBACU_EVAL",
    accept_declaration: true,
    input: payload,
  };

  const res = await fetch(fnUrl("debacu-eval-add"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "x-session-token": session_token,
    },
    body: JSON.stringify(body),
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
 *  (Opcional) SQL sugerido para la RPC “debacu_eval_check_signals”
 *  ---------------------------------------------------------
 *  La idea es que el navegador SOLO reciba agregados.
 *
 *  -- EJEMPLO (ajusta a tu esquema real):
 *
 *  create or replace function public.debacu_eval_check_signals(q_input text)
 *  returns table (
 *    match_strength text,
 *    has_matches boolean,
 *    count integer,
 *    avg_stars numeric,
 *    risk text,
 *    top_typologies text[],
 *    time_window text,
 *    message text
 *  )
 *  language plpgsql
 *  security definer
 *  as $$
 *  declare
 *    c int := 0;
 *    avg numeric := null;
 *  begin
 *    -- Solo soporta identificadores fuertes
 *    -- (si quieres, detecta email/tel/doc dentro)
 *
 *    select count(*) into c
 *    from public.debacu_evaluations e
 *    where e.email ilike '%'||q_input||'%'
 *       or e.phone ilike '%'||q_input||'%'
 *       or e.document ilike '%'||q_input||'%';
 *
 *    if c = 0 then
 *      return query select
 *        'STRONG', false, 0, null, 'NO_CONCLUYENTE', array[]::text[], '24M',
 *        'Sin señales agregadas para este identificador.';
 *      return;
 *    end if;
 *
 *    select avg(e.rating)::numeric into avg
 *    from public.debacu_evaluations e
 *    where e.email ilike '%'||q_input||'%'
 *       or e.phone ilike '%'||q_input||'%'
 *       or e.document ilike '%'||q_input||'%';
 *
 *    -- risk simple (ajusta)
 *    return query select
 *      'STRONG',
 *      true,
 *      c,
 *      avg,
 *      case when avg >= 4 then 'BAJO' when avg >= 3 then 'MEDIO' else 'ALTO' end,
 *      array[]::text[], -- ideal: extraer tipologías desde comment estructurado con lógica server-side
 *      '24M',
 *      '';
 *  end;
 *  $$;
 *
 *  -- Y una política de permisos: que solo roles autorizados puedan ejecutar.
 * ========================================================= */
