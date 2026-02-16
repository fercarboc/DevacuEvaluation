// src/services/evaluationService.ts
import { supabase } from "@/services/supabaseClient";
import type { Rating } from "@/types/types";
import type { Database } from "@/types/database";
import { callEvalFn } from "@/services/callEvalFn";

export type EvaluationRow = Database["public"]["Tables"]["debacu_evaluations"]["Row"];
export type EvaluationInsert = Database["public"]["Tables"]["debacu_evaluations"]["Insert"];

/** =========================================================
 *  RGPD/LOPDGDD (diseño “ajustado a derecho”)
 *  ---------------------------------------------------------
 *  1) GLOBAL (Comprobación):
 *     - NO debe devolver filas individuales.
 *     - NO debe devolver PII (full_name/email/phone/document) ni siquiera enmascarado.
 *     - Devuelve SOLO señales agregadas.
 *
 *  2) MINE (Mis registros):
 *     - Puede devolver filas individuales SOLO de registros creados por el hotel actual
 *       (creator_customer_id == currentUser.id).
 *     - Puede mostrar PII enmascarado (UI) porque son “mis propios registros”.
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

  // ✅ NUEVO MODELO (incidencias + economía + contexto)
  hotel_category?: number | null;         // smallint
  incident_type?: string | null;          // text
  impact_items?: any | null;              // jsonb [{code, qty, unit_price}, ...]
  season_applied?: string | null;         // text
  adr_reference?: number | null;          // numeric
  adr_real_snapshot?: number | null;      // numeric
  economic_impact_gross?: number | null;  // numeric
  economic_recovered?: number | null;     // numeric
  economic_net_loss?: number | null;      // numeric
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
 *  RESUMEN GLOBAL (paneles laterales) - LEGACY
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
  countExact?: number;
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
 * checkSignalsGlobal(query) - JWT-only
 * - RGPD SAFE: NO devuelve filas ni PII.
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

  // ✅ JWT-only + contrato A: { ok:true, data:{...} }
  const res = await callEvalFn<any>("debacu-eval-check-signals", {
    q_input: q,
    months: 24,
    k: 3,
  });

  if (!res?.ok) {
    console.error("debacu-eval-check-signals failed:", res?.error, res?.detail);
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

  const row = res?.data ?? {};
  const countExact =
    typeof row.countExact === "number" ? row.countExact : Number(row.countExact ?? 0);

  return {
    matchStrength: (row.matchStrength ?? strength) as MatchStrength,
    hasMatches: Boolean(row.hasMatches ?? countExact > 0),
    countExact,
    countBucket: (row.countBucket ?? bucketizeCount(countExact)) as CountBucket,
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
      ].join(","),
    )
    .eq("creator_customer_id", authorId)
    .or(
      [
        `document.ilike.%${q}%`,
        `phone.ilike.%${q}%`,
        `email.ilike.%${q}%`,
        `full_name.ilike.%${q}%`,
      ].join(","),
    )
    .order("evaluation_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return [];
  const rows = (data ?? []) as unknown as EvaluationRow[];
  return rows.map(mapEvaluationToRating);
}

/** =========================================================
 *  LEGACY (NO usar en GLOBAL)
 * ========================================================= */
export async function searchRatingsInSupabase(query: string): Promise<Rating[]> {
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
      ].join(","),
    )
    .or(
      [
        `document.ilike.%${q}%`,
        `phone.ilike.%${q}%`,
        `email.ilike.%${q}%`,
        `full_name.ilike.%${q}%`,
      ].join(","),
    )
    .order("evaluation_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return [];
  const rows = (data ?? []) as unknown as EvaluationRow[];
  return rows.map(mapEvaluationToRating);
}

/** =========================================================
 *  LEGACY: Search aggregated (ClientSummary[]) - NO RGPD safe
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
      ].join(","),
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
 *  Types auxiliares para insert (solo TS)
 * ========================================================= */
type EvaluationInsertExtended =
  EvaluationInsert & {
    incident_type?: string | null;
    impact_items?: any | null;
    season_applied?: string | null;
    economic_recovered?: number | null;
    economic_impact_gross?: number | null;
    economic_net_loss?: number | null;
    hotel_category?: number | null;
    adr_reference?: number | null;
    adr_real_snapshot?: number | null;
  };

/** =========================================================
 *  Insert (via Edge Function) - JWT-only
 * ========================================================= */
export async function addEvaluation(
  input: AddEvaluationInput,
  _currentCustomerId: string,
  _currentCustomerName: string,
): Promise<EvaluationRow | null> {
  // ✅ JWT-only: NO session token, NO customerId desde UI.
  // La Edge Function resuelve customer_id por org membership.

  const payload: EvaluationInsertExtended = {
    document: (input.document || "").trim(),
    full_name: (input.full_name || "").trim(),
    nationality: input.nationality ? String(input.nationality).trim() : null,
    phone: input.phone ? String(input.phone).trim() : null,
    email: input.email ? String(input.email).trim().toLowerCase() : null,
    rating: Number(input.rating || 0),
    comment: input.comment ? String(input.comment).trim() : null,
    platform: input.platform ? String(input.platform).trim() : "DEBACU_EVAL",
    evaluation_date: input.evaluation_date || todayISO(),

    // NUEVO MODELO
    incident_type: input.incident_type ?? null,
    impact_items: input.impact_items ?? null,
    season_applied: input.season_applied ?? null,
    economic_recovered: input.economic_recovered ?? null,
    economic_impact_gross: input.economic_impact_gross ?? null,
    economic_net_loss: input.economic_net_loss ?? null,
    hotel_category: input.hotel_category ?? null,
    adr_reference: input.adr_reference ?? null,
    adr_real_snapshot: input.adr_real_snapshot ?? null,
  };

  const body = {
    accept_declaration: true,
    input: payload,
  };

  const res = await callEvalFn<any>("debacu-eval-add", body);

  if (!res?.ok) {
    console.error("debacu-eval-add failed:", res?.error, res?.detail);
    return null;
  }

  const row = res?.row;
  if (!row) {
    console.error("debacu-eval-add: missing row in response", res);
    return null;
  }

  return row as EvaluationRow;
}

//***********************************************************/
//    conexion clientes - whoami
//************************************************ */

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

// src/services/evaluationService.ts
export * from "@/services/clientService";
