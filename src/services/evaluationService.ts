// src/services/evaluationService.ts
import { supabase } from "@/services/supabaseClient";
import type { Rating } from "@/types/types";
import type { Database } from "@/types/database";

export type EvaluationRow = Database["public"]["Tables"]["debacu_evaluations"]["Row"];
export type EvaluationInsert = Database["public"]["Tables"]["debacu_evaluations"]["Insert"];

export type ReputationCategory = "NO_RECOMMENDED" | "DUBIOUS" | "OK";

export interface ClientSummary {
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

// ====== Enmascarado (UI) ======
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
      fullName: row.full_name,
      document: maskDoc(row.document) ?? undefined,
      email: maskEmail(row.email) ?? undefined,
      phone: maskPhone(row.phone) ?? undefined,
      nationality: row.nationality || undefined,
    },
  };
}

// ===== Resumen global =====
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

  const totalFromPlatforms = (platRows || []).reduce(
    (acc: number, r: any) => acc + (r.cnt ?? 0),
    0
  );
  const totalFromCountries = (countryRows || []).reduce(
    (acc: number, r: any) => acc + (r.cnt ?? 0),
    0
  );

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

// ===== 1) Search (Rating[]) =====
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

// ===== 2) Search aggregated (ClientSummary[]) =====
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
    const key =
      row.document || row.email || row.phone || `${row.full_name}_${row.evaluation_date}`;
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
    const avgRating =
      evaluations.reduce((sum, e) => sum + (e.rating || 0), 0) /
      Math.max(1, totalRatings);

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

  summaries.sort((a, b) =>
    (b.lastEvaluationDate || "").localeCompare(a.lastEvaluationDate || "")
  );

  return summaries;
}

// ===== 3) History by document =====
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

/** Helpers Edge */
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

// ===== 4) Insert (via Edge Function) =====
export async function addEvaluation(
  input: AddEvaluationInput,
  currentCustomerId: string,
  currentCustomerName: string
): Promise<EvaluationRow | null> {
  // ✅ Este es el token de TU tabla debacu_eval_sessions (NO el access_token de supabase auth)
  const session_token = localStorage.getItem("debacu_eval_session_token") || "";
  if (!session_token) {
    console.error("Falta debacu_eval_session_token. Haz login otra vez.");
    return null;
  }

  // payload 100% snake_case y con defaults
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

  // Body que espera tu Edge:
  // { app_code, accept_declaration, input }
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
      "x-session-token": session_token, // ✅ CLAVE
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
