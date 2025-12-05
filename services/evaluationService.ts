// src/services/evaluationService.ts

import { supabase } from '@/supabaseClient';
import type { Rating } from '../types';

// === Tipos internos para trabajar con la tabla ===
export interface EvaluationRecord {
  id: string;
  document: string;
  fullName: string;
  nationality: string | null;
  phone: string | null;
  email: string | null;
  rating: number;
  comment: string | null;
  creatorCustomerId: string | null;
  creatorCustomerName: string | null;
  platform: string | null;
  evaluationDate: string; // date (YYYY-MM-DD)
  created_at: string;
  updated_at: string;
}

export type ReputationCategory = 'NO_RECOMMENDED' | 'DUBIOUS' | 'OK';

export interface ClientSummary {
  document: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  totalRatings: number;
  avgRating: number;
  lastEvaluationDate: string | null;
  category: ReputationCategory;
  evaluations: EvaluationRecord[];
}

// Para crear una nueva valoración desde el formulario
export interface AddEvaluationInput {
  document: string;
  fullName: string;
  nationality?: string;
  phone?: string;
  email?: string;
  rating: number;
  comment?: string;
  platform?: string;
  evaluationDate?: string; // opcional, por defecto hoy
}

// === Helpers internos ===
function categorizeRating(avg: number): ReputationCategory {
  if (avg <= 2) return 'NO_RECOMMENDED';
  if (avg === 3) return 'DUBIOUS';
  return 'OK'; // 4 o 5
}

function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

// === 0. Helper: mapear EvaluationRecord -> Rating (para SearchRatings) ===
function mapEvaluationToRating(row: EvaluationRecord): Rating {
  return {
    id: row.id,
    value: row.rating,
    comment: row.comment || '',
    createdAt: row.evaluationDate || row.created_at,
    authorId: row.creatorCustomerId || 'HISTORICO',
    authorName: row.creatorCustomerName || row.platform || 'Histórico',
    platform: row.platform || undefined,
    clientData: {
      fullName: row.fullName,
      document: row.document || undefined,
      email: row.email || undefined,
      phone: row.phone || undefined,
      nationality: row.nationality || undefined,
    },
  };
}

// === 0bis. Helper para país efectivo (para resumen global) ===
function getEffectiveCountryForRow(row: EvaluationRecord): string {
  const nat = row.nationality?.trim();
  if (nat) return nat;

  const platform = (row.platform || '').toLowerCase();

  if (platform.includes('expedia')) return 'ESP';
  if (platform.includes('booking')) return 'USA';
  if (platform.includes('mirai')) return 'ESP';

  // Motor propio / otros → asumimos España
  return 'ESP';
}

// === 0ter. Tipo para el resumen global ===

// --- NUEVO TIPO PARA EL RESUMEN GLOBAL ---




export interface GlobalSummary {
  totalCount: number;
  platformCounts: Record<string, number>;
  countryCounts: Record<string, number>;
}

export async function getGlobalSummary(): Promise<GlobalSummary> {
  // 1) Resumen por plataforma desde la vista
  const { data: platRows, error: platError } = await supabase
    .from('debacu_eval_platform_summary')
    .select('platform, cnt')
    .order('cnt', { ascending: false });

  if (platError) {
    console.error('Error cargando resumen de plataformas:', platError);
    throw platError;
  }

  // 2) Resumen por país desde la vista
  const { data: countryRows, error: countryError } = await supabase
    .from('debacu_eval_country_summary')
    .select('country, cnt')
    .order('cnt', { ascending: false });

  if (countryError) {
    console.error('Error cargando resumen de países:', countryError);
    throw countryError;
  }

  // 3) Total global: suma de todas las plataformas
  const totalFromPlatforms = (platRows || []).reduce(
    (acc, r: any) => acc + (r.cnt ?? 0),
    0
  );
  // (por seguridad, también podríamos comparar con países)
  const totalFromCountries = (countryRows || []).reduce(
    (acc, r: any) => acc + (r.cnt ?? 0),
    0
  );

  const totalCount = Math.max(totalFromPlatforms, totalFromCountries);

  // 4) Pasar a mapas
  const platformCounts: Record<string, number> = {};
  (platRows || []).forEach((r: any) => {
    platformCounts[r.platform] = r.cnt;
  });

  const countryCounts: Record<string, number> = {};
  (countryRows || []).forEach((r: any) => {
    countryCounts[r.country] = r.cnt;
  });

  return {
    totalCount,
    platformCounts,
    countryCounts,
  };
}




// === 1. BÚSQUEDA PARA LA PANTALLA "CONSULTAR HISTORIAL" (modo Rating[]) ===
export async function searchRatingsInSupabase(query: string): Promise<Rating[]> {
  const q = query.trim();
  if (!q) return [];

  const { data, error } = await supabase
    .from('debacu_evaluations')
    .select('*')
    .or(
      [
        `document.ilike.%${q}%`,
        `phone.ilike.%${q}%`,
        `email.ilike.%${q}%`,
        `"fullName".ilike.%${q}%`,
      ].join(',')
    )
    .order('evaluationDate', { ascending: false });

  if (error) {
    console.error('Error buscando valoraciones:', error);
    return [];
  }

  const rows = (data || []) as EvaluationRecord[];
  return rows.map(mapEvaluationToRating);
}

// === 2. Búsqueda agregada por cliente (ClientSummary) ===
export async function searchEvaluations(
  query: string
): Promise<ClientSummary[]> {
  const q = query.trim();
  if (!q) return [];

  const { data, error } = await supabase
    .from('debacu_evaluations')
    .select('*')
    .or(
      [
        `document.ilike.%${q}%`,
        `phone.ilike.%${q}%`,
        `email.ilike.%${q}%`,
        `"fullName".ilike.%${q}%`,
      ].join(',')
    )
    .order('evaluationDate', { ascending: false });

  if (error) {
    console.error('Error buscando valoraciones:', error);
    return [];
  }

  const rows = (data || []) as EvaluationRecord[];

  // Agrupamos por document (si no hay document, usamos email o phone)
  const map = new Map<string, EvaluationRecord[]>();

  for (const row of rows) {
    const key =
      row.document ||
      row.email ||
      row.phone ||
      `${row.fullName}_${row.evaluationDate}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }

  const summaries: ClientSummary[] = [];

  for (const [, evaluations] of map) {
    if (evaluations.length === 0) continue;

    const doc = evaluations[0].document || '';
    const fullName = evaluations[0].fullName || '';
    const phone = evaluations[0].phone;
    const email = evaluations[0].email;

    const totalRatings = evaluations.length;
    const avgRating =
      evaluations.reduce((sum, e) => sum + (e.rating || 0), 0) /
      Math.max(1, totalRatings);

    const lastEvaluationDate =
      evaluations
        .map((e) => e.evaluationDate)
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
      evaluations: evaluations,
    });
  }

  summaries.sort(
    (a, b) =>
      (b.lastEvaluationDate || '').localeCompare(a.lastEvaluationDate || '')
  );

  return summaries;
}

// === 3. Obtener el historial completo de un cliente concreto ===
export async function getClientHistoryByDocument(
  document: string
): Promise<EvaluationRecord[]> {
  const { data, error } = await supabase
    .from('debacu_evaluations')
    .select('*')
    .eq('document', document)
    .order('evaluationDate', { ascending: false });

  if (error) {
    console.error('Error obteniendo historial por documento:', error);
    return [];
  }
  return (data || []) as EvaluationRecord[];
}

// === 4. Insertar una nueva valoración ===

export async function addEvaluation(
  input: AddEvaluationInput,
  currentCustomerId: string,
  currentCustomerName: string
): Promise<EvaluationRecord | null> {
  const payload = {
    document: input.document.trim(),
    fullName: input.fullName.trim(),
    nationality: input.nationality?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    rating: input.rating,
    comment: input.comment?.trim() || null,
    platform: input.platform?.trim() || 'DEBACU_EVAL',
    evaluationDate: input.evaluationDate || todayISO(),
    creatorCustomerId: currentCustomerId,
    creatorCustomerName: currentCustomerName,
  };

  const { data, error } = await supabase
    .from('debacu_evaluations')
    .insert([payload])        // 👈 aseguramos array
    .select()
    .maybeSingle();

  if (error) {
  console.error("📌 ERROR INSERTANDO VALORACIÓN");
  console.error("➡️ error.message:", (error as any).message);
  console.error("➡️ error.details:", (error as any).details);
  console.error("➡️ error.hint:", (error as any).hint);
  console.error("➡️ error.code:", (error as any).code);
  console.error("➡️ error.raw:", error); // 👈 MOSTRAMOS EL OBJETO ENTERO
  return null;
}


  return data as EvaluationRecord;
}
