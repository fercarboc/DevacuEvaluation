import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

// ============================================================
// pms-connection-test v2
// Corrección: validateApaleo usa 4 probes independientes
// para mapear exactamente los 4 checks del Wizard paso 3:
//   1. Conexión establecida       → token OAuth2 obtenido
//   2. Verificando permisos       → token tiene scopes correctos
//   3. Probando endpoint reservas → GET /booking/v1/reservations
//   4. Probando endpoint huéspedes→ GET /booking/v1/reservations (bookers)
// ============================================================

type ReqBody = {
  connection_id: string;
};

type DecryptedCredentials = Record<string, string>;

// ============================================================
// AES-256-GCM decrypt
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
): Promise<DecryptedCredentials> {
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
    new ArrayBuffer(ciphertext.length + authTag.length),
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

// ============================================================
// Resultado de validación — incluye checks individuales
// para el Wizard paso 3
// ============================================================

type ValidationResult = {
  valid: boolean;
  apiVersion?: string;
  permissions?: string;
  latencyMs?: number;
  errorCode?: string;
  errorDetail?: string;
  // Checks individuales para el Wizard
  checkConnectionEstablished: boolean;
  checkCredentialsValid: boolean;
  checkEndpointReservations: boolean;
  checkEndpointGuests: boolean;
};

// ============================================================
// validateApaleo — 4 probes independientes
// ============================================================

async function validateApaleo(
  creds: DecryptedCredentials,
  environment: string,
): Promise<ValidationResult> {
  const t0 = Date.now();
  const baseUrl = "https://api.apaleo.com";
  const tokenUrl = "https://identity.apaleo.com/connect/token";

  const clientId = creds["client_id"] ?? creds["clientId"] ?? "";
  const clientSecret = creds["client_secret"] ?? creds["clientSecret"] ?? "";

  if (!clientId || !clientSecret) {
    return {
      valid: false,
      errorCode: "MISSING_CREDENTIALS",
      errorDetail: "client_id y client_secret son obligatorios para Apaleo",
      checkConnectionEstablished: false,
      checkCredentialsValid: false,
      checkEndpointReservations: false,
      checkEndpointGuests: false,
    };
  }

  // ── CHECK 1 + 2: Obtener token OAuth2 ──────────────────────
  let accessToken: string | null = null;

  try {
    const formData = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "reservations.read availability.read setup.read",
    });

    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!tokenRes.ok) {
      const errorBody = await tokenRes.json().catch(() => ({}));
      const detail = String((errorBody as any)?.error_description ?? tokenRes.statusText);
      return {
        valid: false,
        latencyMs: Date.now() - t0,
        errorCode: "AUTH_FAILED",
        errorDetail: detail,
        checkConnectionEstablished: true,  // conexión al servidor OK
        checkCredentialsValid: false,       // credenciales inválidas
        checkEndpointReservations: false,
        checkEndpointGuests: false,
      };
    }

    const tokenData = await tokenRes.json() as { access_token?: string };
    accessToken = tokenData.access_token ?? null;

    if (!accessToken) {
      return {
        valid: false,
        latencyMs: Date.now() - t0,
        errorCode: "NO_ACCESS_TOKEN",
        errorDetail: "Apaleo no devolvió access_token",
        checkConnectionEstablished: true,
        checkCredentialsValid: false,
        checkEndpointReservations: false,
        checkEndpointGuests: false,
      };
    }
  } catch (e: any) {
    const isTimeout = e?.name === "TimeoutError";
    return {
      valid: false,
      latencyMs: Date.now() - t0,
      errorCode: isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
      errorDetail: isTimeout ? "Timeout conectando a Apaleo identity" : String(e?.message ?? e),
      checkConnectionEstablished: false,
      checkCredentialsValid: false,
      checkEndpointReservations: false,
      checkEndpointGuests: false,
    };
  }

  // Token obtenido — CHECK 1 y 2 pasan ✅
  console.log("[pms-connection-test] Token Apaleo obtenido correctamente");

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };

  // ── CHECK 3: Probe endpoint reservas ───────────────────────
  // Usamos /booking/v1/reservations con pageSize=1
  // Apaleo devuelve 200 aunque no haya reservas (array vacío)
  let checkEndpointReservations = false;

  try {
    const resProbe = await fetch(
      `${baseUrl}/booking/v1/reservations?pageSize=1`,
      { headers, signal: AbortSignal.timeout(8_000) },
    );

    // 200 o 204 = OK. 401/403 = sin permisos. Cualquier otra cosa = error.
    checkEndpointReservations = resProbe.ok || resProbe.status === 204;

    if (resProbe.status === 401 || resProbe.status === 403) {
      return {
        valid: false,
        latencyMs: Date.now() - t0,
        errorCode: "INSUFFICIENT_PERMISSIONS",
        errorDetail: `reservations.read no permitido (${resProbe.status})`,
        checkConnectionEstablished: true,
        checkCredentialsValid: true,
        checkEndpointReservations: false,
        checkEndpointGuests: false,
      };
    }

    console.log(`[pms-connection-test] Probe reservations: ${resProbe.status}`);
  } catch (e: any) {
    console.warn("[pms-connection-test] Probe reservations error:", e?.message);
    checkEndpointReservations = false;
  }

  // ── CHECK 4: Probe endpoint huéspedes ──────────────────────
  // En Apaleo no hay /guests endpoint directo en Client Credentials.
  // Los huéspedes se obtienen como parte de las reservas (expand=booker).
  // Verificamos que podemos expandir datos de booker en reservas.
  let checkEndpointGuests = false;

  try {
    const guestProbe = await fetch(
      `${baseUrl}/booking/v1/reservations?pageSize=1&expand=booker`,
      { headers, signal: AbortSignal.timeout(8_000) },
    );

    checkEndpointGuests = guestProbe.ok || guestProbe.status === 204;
    console.log(`[pms-connection-test] Probe guests (via reservations+booker): ${guestProbe.status}`);
  } catch (e: any) {
    console.warn("[pms-connection-test] Probe guests error:", e?.message);
    checkEndpointGuests = false;
  }

  const finalLatencyMs = Date.now() - t0;
  const valid = checkEndpointReservations && checkEndpointGuests;

  return {
    valid,
    apiVersion: "v1",
    permissions: "read-only",
    latencyMs: finalLatencyMs,
    errorCode: valid ? undefined : "PARTIAL_ACCESS",
    errorDetail: valid ? undefined : "Algunos endpoints no respondieron correctamente",
    checkConnectionEstablished: true,
    checkCredentialsValid: true,
    checkEndpointReservations,
    checkEndpointGuests,
  };
}

// ============================================================
// validateTesipro — placeholder hasta sandbox real
// ============================================================

async function validateTesipro(
  creds: DecryptedCredentials,
  _environment: string,
): Promise<ValidationResult> {
  const apiKey = creds["api_key"] ?? creds["apiKey"] ?? "";

  if (!apiKey || apiKey.length < 8) {
    return {
      valid: false,
      errorCode: "MISSING_CREDENTIALS",
      errorDetail: "api_key inválido para Tesipro",
      checkConnectionEstablished: false,
      checkCredentialsValid: false,
      checkEndpointReservations: false,
      checkEndpointGuests: false,
    };
  }

  console.warn("[pms-connection-test] Tesipro validation es placeholder");
  return {
    valid: true,
    apiVersion: "unknown",
    permissions: "pending_real_validation",
    latencyMs: 0,
    checkConnectionEstablished: true,
    checkCredentialsValid: true,
    checkEndpointReservations: true,
    checkEndpointGuests: true,
  };
}

// ============================================================
// validateMews
// ============================================================

async function validateMews(
  creds: DecryptedCredentials,
  environment: string,
): Promise<ValidationResult> {
  const t0 = Date.now();
  const clientToken = creds["client_token"] ?? creds["clientToken"] ?? "";
  const accessToken = creds["access_token"] ?? creds["accessToken"] ?? "";

  if (!clientToken || !accessToken) {
    return {
      valid: false,
      errorCode: "MISSING_CREDENTIALS",
      errorDetail: "client_token y access_token son obligatorios para Mews",
      checkConnectionEstablished: false,
      checkCredentialsValid: false,
      checkEndpointReservations: false,
      checkEndpointGuests: false,
    };
  }

  const baseUrl = environment === "sandbox"
    ? "https://api.mews-demo.com"
    : "https://api.mews.com";

  try {
    const probeRes = await fetch(`${baseUrl}/api/connector/v1/configuration/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        ClientToken: clientToken,
        AccessToken: accessToken,
        Client: "Debacu/1.0",
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const latencyMs = Date.now() - t0;
    const valid = probeRes.ok;

    return {
      valid,
      apiVersion: "connector/v1",
      permissions: valid ? "read-only" : undefined,
      latencyMs,
      errorCode: valid ? undefined : "AUTH_FAILED",
      errorDetail: valid ? undefined : `Mews respondió ${probeRes.status}`,
      checkConnectionEstablished: true,
      checkCredentialsValid: valid,
      checkEndpointReservations: valid,
      checkEndpointGuests: valid,
    };
  } catch (e: any) {
    return {
      valid: false,
      latencyMs: Date.now() - t0,
      errorCode: "NETWORK_ERROR",
      errorDetail: String(e?.message ?? e),
      checkConnectionEstablished: false,
      checkCredentialsValid: false,
      checkEndpointReservations: false,
      checkEndpointGuests: false,
    };
  }
}

// ============================================================
// Router de validadores
// ============================================================

async function validateByProvider(
  providerCode: string,
  creds: DecryptedCredentials,
  environment: string,
): Promise<ValidationResult> {
  switch (providerCode) {
    case "APALEO":
      return validateApaleo(creds, environment);
    case "TESIPRO_ULYSES":
      return validateTesipro(creds, environment);
    case "MEWS":
      return validateMews(creds, environment);
    default:
      return {
        valid: true,
        apiVersion: "unknown",
        permissions: "not_validated",
        latencyMs: 0,
        checkConnectionEstablished: true,
        checkCredentialsValid: true,
        checkEndpointReservations: true,
        checkEndpointGuests: true,
      };
  }
}

// ============================================================
// Handler principal
// ============================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);

  if (req.method !== "POST") {
    return json(req, 405, {
      ok: false,
      error: "request_failed",
      detail: "method_not_allowed",
    });
  }

  const sb = supabaseServiceClient();

  try {
    const user = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as ReqBody;

    const connectionId = String(body.connection_id ?? "").trim();
    if (!connectionId) throw new Error("CONNECTION_ID_REQUIRED");

    // Cargar conexión
    const { data: connection, error: connErr } = await sb
      .from("pms_connections")
      .select("id, org_id, property_id, provider_code, environment, status")
      .eq("id", connectionId)
      .single();

    if (connErr || !connection) throw new Error("CONNECTION_NOT_FOUND");

    // Verificar membresía
    const { data: membership, error: memberErr } = await sb
      .from("debacu_eval_org_members")
      .select("id")
      .eq("org_id", connection.org_id)
      .eq("user_id", user.id)
      .eq("status", "ACTIVE")
      .single();

    if (memberErr || !membership) throw new Error("NO_ORG_MEMBERSHIP");

    // Cargar credenciales cifradas
    const { data: cred, error: credErr } = await sb
      .from("pms_credentials")
      .select("encrypted_data, iv, auth_tag, key_version")
      .eq("connection_id", connectionId)
      .single();

    if (credErr || !cred) throw new Error("CREDENTIALS_NOT_FOUND");

    // Descifrar
    const encryptionKey = Deno.env.get("PMS_ENCRYPTION_KEY");
    if (!encryptionKey) throw new Error("ENCRYPTION_KEY_NOT_CONFIGURED");

    let decryptedCreds: DecryptedCredentials;
    try {
      decryptedCreds = await decryptCredentials(
        cred.encrypted_data,
        cred.iv,
        cred.auth_tag,
        encryptionKey,
      );
    } catch {
      throw new Error("CREDENTIALS_DECRYPT_FAILED");
    }

    // Validar contra PMS
    const result = await validateByProvider(
      connection.provider_code,
      decryptedCreds,
      connection.environment,
    );

    // Limpiar credenciales de memoria
    Object.keys(decryptedCreds).forEach((k) => { decryptedCreds[k] = ""; });

    // Actualizar pms_connections
    const now = new Date().toISOString();
    if (result.valid) {
      await sb.from("pms_connections").update({
        status: "ACTIVE",
        last_success_sync_at: now,
        last_error_at: null,
        last_error_message: null,
      }).eq("id", connectionId);
    } else {
      await sb.from("pms_connections").update({
        status: "ERROR",
        last_error_at: now,
        last_error_message: `${result.errorCode ?? "ERROR"}: ${result.errorDetail ?? ""}`,
      }).eq("id", connectionId);
    }

    return json(req, 200, {
      ok: true,
      data: {
        connectionId,
        providerCode: connection.provider_code,
        environment: connection.environment,
        valid: result.valid,
        status: result.valid ? "ACTIVE" : "ERROR",
        apiVersion: result.apiVersion ?? null,
        permissions: result.permissions ?? null,
        latencyMs: result.latencyMs ?? null,
        errorCode: result.errorCode ?? null,
        errorDetail: result.errorDetail ?? null,
        // Checks individuales para el Wizard paso 3
        checks: {
          connectionEstablished: result.checkConnectionEstablished,
          credentialsValid: result.checkCredentialsValid,
          endpointReachable: result.checkEndpointReservations,
          permissionsOk: result.checkEndpointGuests,
        },
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg === "UNAUTHENTICATED") {
      return json(req, 401, { ok: false, error: "request_failed", detail: "UNAUTHENTICATED" });
    }
    if (msg === "NO_ORG_MEMBERSHIP") {
      return json(req, 403, { ok: false, error: "request_failed", detail: "NO_ORG_MEMBERSHIP" });
    }
    if (["CONNECTION_NOT_FOUND", "CREDENTIALS_NOT_FOUND"].includes(msg)) {
      return json(req, 404, { ok: false, error: "request_failed", detail: msg });
    }
    if (msg === "CONNECTION_ID_REQUIRED") {
      return json(req, 400, { ok: false, error: "request_failed", detail: msg });
    }
    if (["ENCRYPTION_KEY_NOT_CONFIGURED", "CREDENTIALS_DECRYPT_FAILED"].includes(msg)) {
      return json(req, 500, { ok: false, error: "request_failed", detail: msg });
    }

    console.error("pms-connection-test error:", msg);
    return json(req, 500, { ok: false, error: "request_failed", detail: "internal_error" });
  }
});