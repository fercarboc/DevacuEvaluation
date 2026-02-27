// src/services/debacu_eval_accessRequests.service.ts
import { supabase } from "@/services/supabaseClient";

export type PropertyType = "HOTEL" | "RURAL" | "APARTMENTS" | "HOSTEL" | "OTHER";

/**
 * Draft input:
 * - Recomendación: NO exigir accepted_professional_use aquí.
 * - Se envía en finalize (flujo limpio).
 *
 * Nota: si tu Edge Function "create_draft" aún lo requiere, lo mandamos
 * como false si no viene para mantener compatibilidad.
 */
export type DebacuEvalAccessRequestDraftInput = {
  company_name: string;
  legal_name?: string;
  cif: string;
  address?: string;
  city?: string;
  country?: string;

  property_type: PropertyType;
  rooms_count?: number;

  website?: string;

  contact_name: string;
  contact_role?: string;
  email: string;
  phone?: string;

  accepted_professional_use?: boolean; // ✅ ahora opcional
  notes?: string;
};

/**
 * (Info) Mantén esto si lo usas en el front. La Edge Function de PDF ya fija versión server-side.
 */
export const TERMS_VERSION = "2026-01-24 - V1.0";

/**
 * Ojo: ahora tu Edge Function de PDF devuelve:
 * { proof: { request_id, bucket, path, sha256, accepted_at, terms_version } }
 * (sin signed_url)
 */
export type AcceptanceProof = {
  request_id?: string;

  bucket?: string;
  path?: string;
  pdf_path?: string; // por compat si algún día devolvías pdf_path

  signed_url?: string | null; // por compat (ya no se usa)

  sha256?: string;
  accepted_at?: string;
  terms_version?: string;

  ip?: string | null;
  user_agent?: string | null;

  already_accepted?: boolean;
};

function assertOk<T>(data: any, fallbackMsg: string): T {
  if (!data) throw new Error(fallbackMsg);
  return data as T;
}

function normalizeEmail(e: string) {
  return String(e ?? "").trim().toLowerCase();
}

/**
 * Crea solicitud (legacy name "draft") pero realmente crea PENDING en BD
 */
export async function createDebacuEvalAccessRequestDraft(
  input: DebacuEvalAccessRequestDraftInput
): Promise<{ id: string; duplicate?: boolean }> {
  // ✅ compat: si backend aún exige accepted_professional_use, mandamos false por defecto
  const body = {
    ...input,
    email: normalizeEmail(input.email),
    accepted_professional_use: !!input.accepted_professional_use,
  };

  const { data, error } = await supabase.functions.invoke(
    "debacu_eval_access_request_create_draft",
    { body }
  );

  if (error) throw error;

  const out = assertOk<{ id: string; duplicate?: boolean }>(
    data,
    "Respuesta inválida del servidor (sin data)"
  );

  if (!out.id) throw new Error("Respuesta inválida del servidor (sin id)");
  return out;
}

/**
 * Genera PDF justificante (lee de BD, sube a Storage privado y actualiza la fila)
 *
 * ✅ Importante: pasa email para que el server valide que quien acepta
 * coincide con el email de la solicitud (evita modo PENDING<24h).
 */
export async function generateTermsAcceptancePdf(input: {
  request_id: string;
  email?: string;
}): Promise<{ proof: AcceptanceProof }> {
  const body = {
    request_id: input.request_id,
    email: input.email ? normalizeEmail(input.email) : undefined,
  };

  const { data, error } = await supabase.functions.invoke(
    "debacu_eval_generate_terms_acceptance",
    { body }
  );

  if (error) throw error;

  const out = assertOk<{ proof: AcceptanceProof }>(
    data,
    "Respuesta inválida del servidor (sin proof)"
  );

  if (!out.proof?.request_id) {
    throw new Error("Respuesta inválida del servidor (proof incompleto)");
  }

  return out;
}

/**
 * Finaliza (legacy): en el modelo nuevo SOLO valida que:
 * - existe request_id
 * - accepted_terms = true
 * - accepted_terms_pdf_path existe
 * y actualiza accepted_professional_use
 *
 * ✅ Tu Edge Function finalize espera:
 * { request_id: string; accepted_professional_use: boolean }
 */
export async function finalizeDebacuEvalAccessRequest(input: {
  request_id: string;
  accepted_professional_use: boolean;
}): Promise<{ ok: true }> {
  const body = {
    request_id: input.request_id,
    accepted_professional_use: !!input.accepted_professional_use,
  };

  const { data, error } = await supabase.functions.invoke(
    "debacu_eval_access_request_finalize",
    { body }
  );

  if (error) throw error;

  const out = assertOk<{ ok: true }>(
    data,
    "Respuesta inválida del servidor (sin ok)"
  );

  if (!out.ok) throw new Error("No se pudo finalizar la solicitud");
  return out;
}