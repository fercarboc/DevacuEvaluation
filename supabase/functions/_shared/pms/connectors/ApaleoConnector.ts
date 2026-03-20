// ============================================================
// ApaleoConnector.ts
// Bloque 3 — Integrador Universal PMS v1.0
//
// Responsabilidad:
//   Cliente HTTP para la API de Apaleo. Gestiona OAuth2,
//   refresco de token, paginación y rate limiting.
//   Devuelve datos RAW de Apaleo — sin transformar.
//   La transformación al modelo canónico Debacu es
//   responsabilidad de los Mappers (Bloque 4).
//
// Apaleo API docs: https://api.apaleo.com
// Auth: OAuth2 Client Credentials
// Rate limit: ~50 req/min por client (backoff en 429)
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseServiceClient } from "../../../_shared/auth.ts";

// ============================================================
// Tipos RAW de Apaleo (respuestas de la API sin transformar)
// ============================================================

export interface ApaleoTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export interface ApaleoProperty {
  id: string;
  code: string;
  name: Record<string, string>;
  description?: Record<string, string>;
  currencyCode?: string;
  timeZone?: string;
  created?: string;
}

export interface ApaleoRoomType {
  id: string;
  code: string;
  name: Record<string, string>;
  description?: Record<string, string>;
  maxPersons?: number;
  rank?: number;
  namePlural?: Record<string, string>;
}

export interface ApaleoRoom {
  id: string;
  name: string;
  description?: Record<string, string>;
  type?: { id: string; code: string; name: Record<string, string> };
  floor?: number;
  building?: string;
  status?: string;
  condition?: string;
  occupancy?: string;
}

export interface ApaleoGuestAddress {
  addressLine1?: string;
  postalCode?: string;
  city?: string;
  countryCode?: string;
}

export interface ApaleoGuest {
  id: string;
  firstName?: string;
  lastName?: string;
  middleInitial?: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  gender?: string;
  nationality?: string;
  address?: ApaleoGuestAddress;
  identificationDocument?: {
    type?: string;
    number?: string;
    expiryDate?: string;
    issuingCountryCode?: string;
  };
  company?: { name?: string };
  created?: string;
  updated?: string;
}

export interface ApaleoReservationGuest {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

export interface ApaleoReservation {
  id: string;
  bookingId?: string;
  groupId?: string;
  status?: string;
  checkInTime?: string;
  checkOutTime?: string;
  arrival?: string;
  departure?: string;
  adults?: number;
  childrenAges?: number[];
  totalGrossAmount?: { amount?: number; currency?: string };
  roomGrossAmount?: { amount?: number; currency?: string };
  balance?: { amount?: number; currency?: string };
  paymentAccount?: { payedAmount?: { amount?: number; currency?: string } };
  unit?: { id: string; name?: string };
  unitType?: { id: string; code: string; name?: Record<string, string> };
  ratePlan?: { id: string; code?: string; name?: Record<string, string> };
  channelCode?: string;
  source?: string;
  booker?: ApaleoReservationGuest;
  primaryGuest?: ApaleoReservationGuest;
  guests?: ApaleoReservationGuest[];
  cancellationTime?: string;
  noShowTime?: string;
  created?: string;
  updated?: string;
  property?: { id: string };
}

export interface ApaleoStay {
  id?: string;
  reservationId?: string;
  guestId?: string;
  unitId?: string;
  unitTypeId?: string;
  status?: string;
  arrival?: string;
  departure?: string;
  actualArrival?: string;
  actualDeparture?: string;
  adults?: number;
  children?: number;
  primaryGuest?: ApaleoReservationGuest;
  created?: string;
  updated?: string;
}

export interface ApaleoPagedResult<T> {
  items: T[];
  count: number;
  totalCount?: number;
}

// ============================================================
// Token cache en memoria (por instancia de Edge Function)
// ============================================================

interface CachedToken {
  accessToken: string;
  expiresAt: number; // timestamp ms
}

const tokenCache = new Map<string, CachedToken>();

// ============================================================
// ApaleoConnector
// ============================================================

export class ApaleoConnector {
  private readonly connectionId: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly environment: "sandbox" | "production";

  // Rate limiting: ventana deslizante de 60s, máx 50 requests
  private requestTimestamps: number[] = [];
  private readonly MAX_REQUESTS_PER_MINUTE = 50;
  private readonly RATE_WINDOW_MS = 60_000;

  // URLs base
  private readonly AUTH_URL = "https://identity.apaleo.com/connect/token";
  private readonly API_BASE = "https://api.apaleo.com";

  constructor(params: {
    connectionId: string;
    clientId: string;
    clientSecret: string;
    environment: "sandbox" | "production";
  }) {
    this.connectionId = params.connectionId;
    this.clientId = params.clientId;
    this.clientSecret = params.clientSecret;
    this.environment = params.environment;
  }

  // ============================================================
  // OAuth2 — Token management
  // ============================================================

  private getCacheKey(): string {
    return `${this.connectionId}:${this.clientId}`;
  }

  private isTokenValid(cached: CachedToken): boolean {
    // Refrescar si expira en menos de 5 minutos (300_000 ms)
    return Date.now() < cached.expiresAt - 300_000;
  }

  private async fetchNewToken(): Promise<CachedToken> {
    const formData = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: "reservations.read availability.read setup.read",
    });

    const res = await fetch(this.AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      const detail = (errorBody as any)?.error_description ?? res.statusText;
      throw new Error(`APALEO_AUTH_FAILED: ${detail}`);
    }

    const data = await res.json() as ApaleoTokenResponse;

    if (!data.access_token) {
      throw new Error("APALEO_AUTH_FAILED: No access_token in response");
    }

    const cached: CachedToken = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
    };

    tokenCache.set(this.getCacheKey(), cached);
    return cached;
  }

  async getAccessToken(): Promise<string> {
    const cached = tokenCache.get(this.getCacheKey());

    if (cached && this.isTokenValid(cached)) {
      return cached.accessToken;
    }

    // Token expirado o no existe — obtener nuevo
    const fresh = await this.fetchNewToken();
    return fresh.accessToken;
  }

  // ============================================================
  // Rate limiting — ventana deslizante
  // ============================================================

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();

    // Limpiar timestamps fuera de la ventana
    this.requestTimestamps = this.requestTimestamps.filter(
      (t) => now - t < this.RATE_WINDOW_MS,
    );

    if (this.requestTimestamps.length >= this.MAX_REQUESTS_PER_MINUTE) {
      // Calcular cuánto esperar hasta que el request más antiguo salga de la ventana
      const oldest = this.requestTimestamps[0];
      const waitMs = this.RATE_WINDOW_MS - (now - oldest) + 100;
      console.log(`[ApaleoConnector] Rate limit local — esperando ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
    }

    this.requestTimestamps.push(Date.now());
  }

  // ============================================================
  // HTTP base — con retry en 429 y 5xx
  // ============================================================

  private async request<T>(
    path: string,
    params?: Record<string, string | number>,
    attempt = 1,
  ): Promise<T> {
    await this.enforceRateLimit();

    const token = await this.getAccessToken();
    const url = new URL(`${this.API_BASE}${path}`);

    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") {
          url.searchParams.set(k, String(v));
        }
      });
    }

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });

    // Rate limited por Apaleo — backoff exponencial
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") ?? "5", 10);
      const waitMs = Math.max(retryAfter * 1000, Math.pow(2, attempt) * 1000);

      console.warn(
        `[ApaleoConnector] 429 en ${path} — intento ${attempt}, esperando ${waitMs}ms`,
      );

      if (attempt >= 4) {
        throw new Error(`APALEO_RATE_LIMITED: Máximo reintentos alcanzado en ${path}`);
      }

      await new Promise((r) => setTimeout(r, waitMs));
      return this.request<T>(path, params, attempt + 1);
    }

    // Error de servidor — retry con backoff
    if (res.status >= 500 && attempt <= 3) {
      const waitMs = Math.pow(2, attempt) * 1000;
      console.warn(
        `[ApaleoConnector] ${res.status} en ${path} — intento ${attempt}, esperando ${waitMs}ms`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
      return this.request<T>(path, params, attempt + 1);
    }

    if (res.status === 401) {
      // Token expirado inesperadamente — invalidar cache y reintentar una vez
      tokenCache.delete(this.getCacheKey());
      if (attempt === 1) {
        return this.request<T>(path, params, attempt + 1);
      }
      throw new Error(`APALEO_UNAUTHORIZED: ${path}`);
    }

    if (res.status === 404) {
      throw new Error(`APALEO_NOT_FOUND: ${path}`);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`APALEO_API_ERROR: ${res.status} en ${path} — ${body.substring(0, 200)}`);
    }

    // 204 No Content
    if (res.status === 204) {
      return {} as T;
    }

    return res.json() as Promise<T>;
  }

  // ============================================================
  // Paginación genérica
  // ============================================================

  private async fetchAllPages<T>(
    path: string,
    baseParams: Record<string, string | number>,
    pageSize = 100,
    modifiedSince?: string | null,
    maxPages = 200,
  ): Promise<T[]> {
    const allItems: T[] = [];
    let skip = 0;
    let page = 0;

    while (page < maxPages) {
      const params: Record<string, string | number> = {
        ...baseParams,
        pageSize,
        pageNumber: Math.floor(skip / pageSize),
      };

      if (modifiedSince) {
        params["dateFilter"] = "Modification";
        params["from"] = modifiedSince;
      }

      const result = await this.request<ApaleoPagedResult<T>>(path, params);
      const items = result.items ?? [];

      allItems.push(...items);

      // Si devuelve menos de pageSize, hemos llegado al final
      if (items.length < pageSize) break;

      skip += pageSize;
      page++;
    }

    if (page >= maxPages) {
      console.warn(`[ApaleoConnector] fetchAllPages alcanzó maxPages (${maxPages}) en ${path}`);
    }

    return allItems;
  }

  // ============================================================
  // fetchProperties — propiedades accesibles con estas credenciales
  // ============================================================

  async fetchProperties(): Promise<ApaleoProperty[]> {
    console.log("[ApaleoConnector] fetchProperties");

    const result = await this.request<ApaleoPagedResult<ApaleoProperty>>(
      "/setup/v1/properties",
      { pageSize: 100 },
    );

    return result.items ?? [];
  }

  // ============================================================
  // fetchRoomTypes
  // ============================================================

  async fetchRoomTypes(params: {
    propertyId: string;
    modifiedSince?: string | null;
  }): Promise<ApaleoRoomType[]> {
    console.log(`[ApaleoConnector] fetchRoomTypes — property: ${params.propertyId}`);

    return this.fetchAllPages<ApaleoRoomType>(
      "/setup/v1/unit-types",
      { propertyId: params.propertyId },
      100,
      params.modifiedSince,
    );
  }

  // ============================================================
  // fetchRooms (Units en Apaleo)
  // ============================================================

  async fetchRooms(params: {
    propertyId: string;
    modifiedSince?: string | null;
  }): Promise<ApaleoRoom[]> {
    console.log(`[ApaleoConnector] fetchRooms — property: ${params.propertyId}`);

    return this.fetchAllPages<ApaleoRoom>(
      "/setup/v1/units",
      { propertyId: params.propertyId },
      100,
      params.modifiedSince,
    );
  }

  // ============================================================
  // fetchGuests (Bookers en Apaleo)
  // ============================================================

  async fetchGuests(params: {
    propertyId: string;
    modifiedSince?: string | null;
    pageSize?: number;
  }): Promise<ApaleoGuest[]> {
    console.log(`[ApaleoConnector] fetchGuests — property: ${params.propertyId}`);

    // Apaleo no tiene endpoint /guests directo —
    // los perfiles se extraen de las reservas (booker + primaryGuest)
    // Este método trae los bookers únicos de reservas recientes
    const reservations = await this.fetchReservations({
      propertyId: params.propertyId,
      modifiedSince: params.modifiedSince,
      statuses: ["Confirmed", "InHouse", "CheckedOut", "Canceled", "NoShow"],
    });

    // Deduplicar bookers por email o nombre
    const guestMap = new Map<string, ApaleoGuest>();

    for (const res of reservations) {
      const booker = res.booker;
      if (!booker) continue;

      const key = booker.id ?? booker.email ?? `${booker.firstName}_${booker.lastName}`;
      if (!key || guestMap.has(key)) continue;

      guestMap.set(key, {
        id: booker.id ?? key,
        firstName: booker.firstName,
        lastName: booker.lastName,
        email: booker.email,
        phone: booker.phone,
        updated: res.updated,
      });
    }

    console.log(`[ApaleoConnector] fetchGuests — ${guestMap.size} perfiles únicos extraídos`);
    return Array.from(guestMap.values());
  }

  // ============================================================
  // fetchReservations
  // ============================================================

  async fetchReservations(params: {
    propertyId: string;
    modifiedSince?: string | null;
    statuses?: string[];
    pageSize?: number;
  }): Promise<ApaleoReservation[]> {
    console.log(
      `[ApaleoConnector] fetchReservations — property: ${params.propertyId}` +
      (params.modifiedSince ? ` desde: ${params.modifiedSince}` : " FULL"),
    );

    const baseParams: Record<string, string | number> = {
      propertyIds: params.propertyId,
      expand: "booker,primaryGuest,unit,unitType,ratePlan",
    };

    if (params.statuses && params.statuses.length > 0) {
      baseParams["statuses"] = params.statuses.join(",");
    }

    return this.fetchAllPages<ApaleoReservation>(
      "/booking/v1/reservations",
      baseParams,
      params.pageSize ?? 100,
      params.modifiedSince,
    );
  }

  // ============================================================
  // fetchStays — estancias IN_HOUSE actuales
  // Caso estrella del agente nocturno
  // ============================================================

  async fetchStays(params: {
    propertyId: string;
    modifiedSince?: string | null;
  }): Promise<ApaleoReservation[]> {
    console.log(`[ApaleoConnector] fetchStays (InHouse) — property: ${params.propertyId}`);

    // En Apaleo las estancias in-house son reservas con status InHouse
    return this.fetchReservations({
      propertyId: params.propertyId,
      modifiedSince: params.modifiedSince,
      statuses: ["InHouse"],
    });
  }

  // ============================================================
  // testConnection — verificación rápida de credenciales
  // Usado por pms-connection-test
  // ============================================================

  async testConnection(): Promise<{
    valid: boolean;
    propertiesCount: number;
    latencyMs: number;
    errorCode?: string;
    errorDetail?: string;
  }> {
    const t0 = Date.now();

    try {
      const properties = await this.fetchProperties();
      return {
        valid: true,
        propertiesCount: properties.length,
        latencyMs: Date.now() - t0,
      };
    } catch (e: any) {
      return {
        valid: false,
        propertiesCount: 0,
        latencyMs: Date.now() - t0,
        errorCode: e.message?.split(":")[0] ?? "UNKNOWN",
        errorDetail: e.message,
      };
    }
  }
}

// ============================================================
// Factory — crea un ApaleoConnector desde una connection_id
// Descifra las credenciales y construye el conector.
// ============================================================

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

async function decryptCredentials(
  encryptedData: string,
  ivBase64: string,
  authTagBase64: string,
  keyHex: string,
): Promise<Record<string, string>> {
  const keyBytes = hexToBytes(keyHex).buffer as ArrayBuffer;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  const iv = base64ToBytes(ivBase64).buffer as ArrayBuffer;
  const ciphertext = base64ToBytes(encryptedData);
  const authTag = base64ToBytes(authTagBase64);

  const ciphertextWithTag = new Uint8Array(
    new ArrayBuffer(ciphertext.length + authTag.length)
  );
  ciphertextWithTag.set(ciphertext);
  ciphertextWithTag.set(authTag, ciphertext.length);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    cryptoKey,
    ciphertextWithTag.buffer as ArrayBuffer,
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}
export async function createApaleoConnector(
  connectionId: string,
): Promise<ApaleoConnector> {
  const sb = supabaseServiceClient();

  // Cargar conexión
  const { data: connection, error: connErr } = await sb
    .from("pms_connections")
    .select("id, org_id, property_id, provider_code, environment, status")
    .eq("id", connectionId)
    .eq("provider_code", "APALEO")
    .single();

  if (connErr || !connection) {
    throw new Error(`CONNECTOR_FACTORY: Conexión Apaleo no encontrada: ${connectionId}`);
  }

  // Cargar credenciales cifradas
  const { data: cred, error: credErr } = await sb
    .from("pms_credentials")
    .select("encrypted_data, iv, auth_tag, key_version")
    .eq("connection_id", connectionId)
    .single();

  if (credErr || !cred) {
    throw new Error(`CONNECTOR_FACTORY: Credenciales no encontradas para: ${connectionId}`);
  }

  // Descifrar
  const encryptionKey = Deno.env.get("PMS_ENCRYPTION_KEY");
  if (!encryptionKey) {
    throw new Error("CONNECTOR_FACTORY: PMS_ENCRYPTION_KEY no configurada");
  }

  const credentials = await decryptCredentials(
    cred.encrypted_data,
    cred.iv,
    cred.auth_tag,
    encryptionKey,
  );

  const clientId = credentials["client_id"] ?? credentials["clientId"] ?? "";
  const clientSecret = credentials["client_secret"] ?? credentials["clientSecret"] ?? "";

  if (!clientId || !clientSecret) {
    throw new Error("CONNECTOR_FACTORY: client_id o client_secret ausentes en credenciales");
  }

  return new ApaleoConnector({
    connectionId,
    clientId,
    clientSecret,
    environment: (connection.environment as "sandbox" | "production") ?? "sandbox",
  });
}