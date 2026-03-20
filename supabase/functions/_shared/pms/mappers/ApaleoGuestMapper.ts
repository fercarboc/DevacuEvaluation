// ============================================================
// ApaleoGuestMapper.ts
// Bloque 4 — Integrador Universal PMS v1.0
//
// Transforma un guest RAW de Apaleo al modelo canónico
// CanonicalGuest de Debacu.
//
// GDPR — PII NUNCA en claro:
//   name, email, phone, document → HMAC con DEBACU_GLOBAL_PEPPER
//   Solo se almacenan los _key hasheados + datos no-PII
// ============================================================

import {
  buildIdentityKey,
  normalizeDoc,
  normalizeEmail,
  normalizePhoneDigits,
  looksLikeDoc,
  looksLikeEmail,
} from "../../../_shared/identity.ts";

import type { ApaleoGuest, ApaleoReservationGuest } from "../connectors/ApaleoConnector.ts";

// ============================================================
// Tipos canónicos de salida
// ============================================================

export interface CanonicalGuest {
  // Contexto multi-tenant
  org_id: string;
  property_id: string | null;
  connection_id: string;

  // IDs externos
  external_guest_id: string;
  external_profile_id: string | null;

  // PII hasheada — NUNCA en claro
  name_key: string | null;       // HMAC(nombre_normalizado)
  email_key: string | null;      // HMAC(email_normalizado)
  phone_key: string | null;      // HMAC(teléfono_normalizado)
  document_key: string | null;   // HMAC(documento_normalizado)

  // identity_key principal (el más fiable disponible)
  identity_key: string | null;

  // Datos no-PII (seguros para almacenar en claro)
  document_type: string | null;
  country_code: string | null;
  nationality_code: string | null;
  birth_year: number | null;
  gender: string | null;
  is_company: boolean;
  is_active: boolean;

  // Metadatos de sync
  raw_status: string | null;
  source_updated_at: string | null;
}

// ============================================================
// Helpers internos
// ============================================================

function clean(v?: string | null): string {
  return String(v ?? "").trim();
}

function extractBirthYear(birthDate?: string | null): number | null {
  if (!birthDate) return null;
  const year = parseInt(birthDate.substring(0, 4), 10);
  return isNaN(year) || year < 1900 || year > new Date().getFullYear() ? null : year;
}

function normalizeGender(g?: string | null): string | null {
  const v = clean(g).toUpperCase().charAt(0);
  if (v === "M") return "M";
  if (v === "F") return "F";
  if (v === "X") return "X";
  return "U"; // Unknown
}

function normalizeCountryCode(c?: string | null): string | null {
  const v = clean(c).toUpperCase();
  return v.length === 2 ? v : null;
}

// Construye un HMAC del nombre completo normalizado
async function buildNameKey(
  firstName?: string | null,
  lastName?: string | null,
): Promise<string | null> {
  const first = clean(firstName).toLowerCase();
  const last = clean(lastName).toLowerCase();
  const fullName = `${first} ${last}`.trim();
  if (!fullName) return null;

  try {
    // Usamos buildIdentityKey con un campo ficticio para aprovechar el mismo PEPPER
    // El formato es consistente con el resto del sistema
    const result = await buildIdentityKey({ email: `NAME:${fullName}` });
    return result.identity_key;
  } catch {
    return null;
  }
}

async function buildEmailKey(email?: string | null): Promise<string | null> {
  const v = clean(email);
  if (!v || !looksLikeEmail(v)) return null;
  try {
    const result = await buildIdentityKey({ email: normalizeEmail(v) });
    return result.identity_key;
  } catch {
    return null;
  }
}

async function buildPhoneKey(phone?: string | null): Promise<string | null> {
  const v = normalizePhoneDigits(clean(phone));
  if (v.length < 7) return null;
  try {
    const result = await buildIdentityKey({ phone: v });
    return result.identity_key;
  } catch {
    return null;
  }
}

async function buildDocumentKey(
  docNumber?: string | null,
  _docType?: string | null,
): Promise<string | null> {
  const v = clean(docNumber);
  if (!v) return null;
  const normalized = normalizeDoc(v);
  if (!looksLikeDoc(normalized)) return null;
  try {
    const result = await buildIdentityKey({ document: normalized });
    return result.identity_key;
  } catch {
    return null;
  }
}

// ============================================================
// Mapper principal — ApaleoGuest → CanonicalGuest
// ============================================================

export async function mapApaleoGuest(
  raw: ApaleoGuest,
  context: {
    org_id: string;
    property_id: string | null;
    connection_id: string;
  },
): Promise<CanonicalGuest> {
  // Calcular todos los keys en paralelo
  const [nameKey, emailKey, phoneKey, documentKey] = await Promise.all([
    buildNameKey(raw.firstName, raw.lastName),
    buildEmailKey(raw.email),
    buildPhoneKey(raw.phone),
    buildDocumentKey(
      raw.identificationDocument?.number,
      raw.identificationDocument?.type,
    ),
  ]);

  // identity_key principal: documento > email > teléfono > nombre
  const identityKey = documentKey ?? emailKey ?? phoneKey ?? nameKey ?? null;

  return {
    org_id: context.org_id,
    property_id: context.property_id,
    connection_id: context.connection_id,

    external_guest_id: raw.id,
    external_profile_id: null, // Apaleo no tiene perfil separado del guest

    // PII hasheada
    name_key: nameKey,
    email_key: emailKey,
    phone_key: phoneKey,
    document_key: documentKey,
    identity_key: identityKey,

    // Datos no-PII
    document_type: clean(raw.identificationDocument?.type) || null,
    country_code: normalizeCountryCode(raw.address?.countryCode),
    nationality_code: normalizeCountryCode(raw.nationality),
    birth_year: extractBirthYear(raw.birthDate),
    gender: normalizeGender(raw.gender),
    is_company: !!raw.company?.name,
    is_active: true,

    raw_status: null, // Apaleo no tiene estado de guest
    source_updated_at: raw.updated ?? null,
  };
}

// ============================================================
// Mapper desde booker de reserva (ApaleoReservationGuest)
// Usado cuando no tenemos perfil completo, solo datos de reserva
// ============================================================

export async function mapApaleoReservationGuest(
  raw: ApaleoReservationGuest,
  context: {
    org_id: string;
    property_id: string | null;
    connection_id: string;
  },
  sourceUpdatedAt?: string | null,
): Promise<CanonicalGuest> {
  const [nameKey, emailKey, phoneKey] = await Promise.all([
    buildNameKey(raw.firstName, raw.lastName),
    buildEmailKey(raw.email),
    buildPhoneKey(raw.phone),
  ]);

  const identityKey = emailKey ?? phoneKey ?? nameKey ?? null;
  const externalId = raw.id ?? `${clean(raw.email) || clean(raw.firstName)}_${clean(raw.lastName)}`;

  return {
    org_id: context.org_id,
    property_id: context.property_id,
    connection_id: context.connection_id,

    external_guest_id: externalId,
    external_profile_id: null,

    name_key: nameKey,
    email_key: emailKey,
    phone_key: phoneKey,
    document_key: null, // No disponible en booker de reserva
    identity_key: identityKey,

    document_type: null,
    country_code: null,
    nationality_code: null,
    birth_year: null,
    gender: "U",
    is_company: false,
    is_active: true,

    raw_status: null,
    source_updated_at: sourceUpdatedAt ?? null,
  };
}

// ============================================================
// Batch mapper
// ============================================================

export async function mapApaleoGuests(
  rawList: ApaleoGuest[],
  context: {
    org_id: string;
    property_id: string | null;
    connection_id: string;
  },
): Promise<CanonicalGuest[]> {
  // Procesar en chunks de 20 para no saturar crypto.subtle
  const CHUNK_SIZE = 20;
  const results: CanonicalGuest[] = [];

  for (let i = 0; i < rawList.length; i += CHUNK_SIZE) {
    const chunk = rawList.slice(i, i + CHUNK_SIZE);
    const mapped = await Promise.all(chunk.map((r) => mapApaleoGuest(r, context)));
    results.push(...mapped);
  }

  return results;
}