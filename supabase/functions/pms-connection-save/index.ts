import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

// ============================================================
// pms-connection-save
// Bloque 2 — Integrador Universal PMS v1.0
//
// Responsabilidad:
//   Recibe las credenciales del Wizard PMS (Client ID + Secret,
//   API Key, etc.), las cifra con AES-256-GCM y las persiste
//   en pms_credentials. También crea o actualiza el registro
//   en pms_connections.
//
// Seguridad:
//   - Solo accesible por usuarios autenticados con membresía
//     ACTIVE en la organización
//   - Las credenciales NUNCA se loguean ni se devuelven
//   - La clave de cifrado vive en PMS_ENCRYPTION_KEY (env var)
//   - El IV se genera aleatoriamente en cada guardado
// ============================================================

type ReqBody = {
  // Conexión
  org_id: string;
  property_id?: string | null;
  provider_code: string;
  environment: "sandbox" | "production";
  auth_mode: string;

  // Credenciales en claro (solo viajan en este request, nunca se guardan en claro)
  credentials: Record<string, string>;

  // Opcional: actualizar conexión existente
  connection_id?: string | null;
};

// AES-256-GCM encrypt usando Web Crypto API (disponible en Deno)
async function encryptCredentials(
  plaintext: string,
  keyHex: string,
): Promise<{ encryptedData: string; iv: string; authTag: string }> {
  // Convertir clave hex a CryptoKey
  const keyBytes = hexToBytes(keyHex);
  if (keyBytes.length !== 32) {
    throw new Error("INVALID_ENCRYPTION_KEY_LENGTH");
  }

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  // IV aleatorio de 12 bytes (96 bits — recomendado para AES-GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Cifrar
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);

  const ciphertextWithTag = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    cryptoKey,
    plaintextBytes,
  );

  // AES-GCM en Web Crypto devuelve ciphertext + auth tag concatenados
  // Los últimos 16 bytes (128 bits) son el auth tag
  const ciphertextWithTagBytes = new Uint8Array(ciphertextWithTag);
  const ciphertext = ciphertextWithTagBytes.slice(0, -16);
  const authTag = ciphertextWithTagBytes.slice(-16);

  return {
    encryptedData: bytesToBase64(ciphertext),
    iv: bytesToBase64(iv),
    authTag: bytesToBase64(authTag),
  };
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function clean(v?: string | null): string {
  return String(v ?? "").trim();
}

const VALID_PROVIDERS = [
  "APALEO",
  "TESIPRO_ULYSES",
  "MEWS",
  "CLOUDBEDS",
  "SIHOT",
  "OPERA",
];

const VALID_AUTH_MODES = ["oauth2", "api_key", "basic"];
const VALID_ENVIRONMENTS = ["sandbox", "production"];

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

    // --- Validaciones básicas ---
    const orgId = clean(body.org_id);
    const propertyId = body.property_id ? clean(body.property_id) : null;
    const providerCode = clean(body.provider_code).toUpperCase();
    const environment = clean(body.environment).toLowerCase() as "sandbox" | "production";
    const authMode = clean(body.auth_mode).toLowerCase();
    const credentials = body.credentials;
    const connectionId = body.connection_id ? clean(body.connection_id) : null;

    if (!orgId) throw new Error("ORG_ID_REQUIRED");
    if (!providerCode) throw new Error("PROVIDER_CODE_REQUIRED");
    if (!VALID_PROVIDERS.includes(providerCode)) throw new Error("INVALID_PROVIDER_CODE");
    if (!VALID_ENVIRONMENTS.includes(environment)) throw new Error("INVALID_ENVIRONMENT");
    if (!VALID_AUTH_MODES.includes(authMode)) throw new Error("INVALID_AUTH_MODE");
    if (!credentials || typeof credentials !== "object" || Object.keys(credentials).length === 0) {
      throw new Error("CREDENTIALS_REQUIRED");
    }

    // --- Verificar membresía activa del usuario en la org ---
    const { data: membership, error: memberErr } = await sb
      .from("debacu_eval_org_members")
      .select("id, role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .eq("status", "ACTIVE")
      .single();

    if (memberErr || !membership) {
      throw new Error("NO_ORG_MEMBERSHIP");
    }

    // --- Verificar que la property pertenece a la org (si se indica) ---
    if (propertyId) {
      const { data: prop, error: propErr } = await sb
        .from("debacu_eval_properties")
        .select("id")
        .eq("id", propertyId)
        .eq("org_id", orgId)
        .single();

      if (propErr || !prop) {
        throw new Error("PROPERTY_NOT_FOUND");
      }
    }

    // --- Leer clave de cifrado desde variable de entorno ---
    const encryptionKey = Deno.env.get("PMS_ENCRYPTION_KEY");
    if (!encryptionKey) {
      console.error("PMS_ENCRYPTION_KEY not set in environment");
      throw new Error("ENCRYPTION_KEY_NOT_CONFIGURED");
    }

    // --- Cifrar las credenciales ---
    const credentialsJson = JSON.stringify(credentials);
    const { encryptedData, iv, authTag } = await encryptCredentials(
      credentialsJson,
      encryptionKey,
    );

    // --- Upsert pms_connections ---
    let finalConnectionId: string;

    if (connectionId) {
      // Actualizar conexión existente — verificar que pertenece a esta org
      const { data: existingConn, error: connErr } = await sb
        .from("pms_connections")
        .select("id")
        .eq("id", connectionId)
        .eq("org_id", orgId)
        .single();

      if (connErr || !existingConn) {
        throw new Error("CONNECTION_NOT_FOUND");
      }

      const { error: updateErr } = await sb
        .from("pms_connections")
        .update({
          provider_code: providerCode,
          environment,
          auth_mode: authMode,
          property_id: propertyId,
          status: "PENDING",           // Vuelve a PENDING hasta que pms-connection-test valide
          last_error_message: null,
          last_error_at: null,
        })
        .eq("id", connectionId);

      if (updateErr) {
        console.error("pms_connections update error:", updateErr.message);
        throw new Error("CONNECTION_UPDATE_FAILED");
      }

      finalConnectionId = connectionId;
    } else {
      // Crear nueva conexión
      const { data: newConn, error: insertConnErr } = await sb
        .from("pms_connections")
        .insert({
          org_id: orgId,
          property_id: propertyId,
          provider_code: providerCode,
          environment,
          auth_mode: authMode,
          status: "PENDING",
          created_by: user.id,
        })
        .select("id")
        .single();

      if (insertConnErr || !newConn) {
        console.error("pms_connections insert error:", insertConnErr?.message);
        throw new Error("CONNECTION_CREATE_FAILED");
      }

      finalConnectionId = newConn.id;
    }

    // --- Upsert pms_credentials (1 por conexión) ---
    const { error: credErr } = await sb
      .from("pms_credentials")
      .upsert(
        {
          connection_id: finalConnectionId,
          org_id: orgId,
          encrypted_data: encryptedData,
          iv,
          auth_tag: authTag,
          key_version: 1,
        },
        { onConflict: "connection_id" },
      );

    if (credErr) {
      console.error("pms_credentials upsert error:", credErr.message);
      // Si falla el guardado de credenciales, eliminar la conexión recién creada
      if (!connectionId) {
        await sb.from("pms_connections").delete().eq("id", finalConnectionId);
      }
      throw new Error("CREDENTIALS_SAVE_FAILED");
    }

    // NUNCA devolvemos las credenciales ni ningún dato cifrado en la respuesta
    return json(req, 200, {
      ok: true,
      data: {
        connectionId: finalConnectionId,
        orgId,
        propertyId,
        providerCode,
        environment,
        authMode,
        status: "PENDING",
        message: "Credenciales guardadas. Llama a pms-connection-test para validar.",
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg === "UNAUTHENTICATED") {
      return json(req, 401, {
        ok: false,
        error: "request_failed",
        detail: "UNAUTHENTICATED",
      });
    }

    if (msg === "NO_ORG_MEMBERSHIP") {
      return json(req, 403, {
        ok: false,
        error: "request_failed",
        detail: "NO_ORG_MEMBERSHIP",
      });
    }

    const validationErrors = [
      "ORG_ID_REQUIRED",
      "PROVIDER_CODE_REQUIRED",
      "INVALID_PROVIDER_CODE",
      "INVALID_ENVIRONMENT",
      "INVALID_AUTH_MODE",
      "CREDENTIALS_REQUIRED",
      "PROPERTY_NOT_FOUND",
      "CONNECTION_NOT_FOUND",
    ];

    if (validationErrors.includes(msg)) {
      return json(req, 400, {
        ok: false,
        error: "request_failed",
        detail: msg,
      });
    }

    if (msg === "ENCRYPTION_KEY_NOT_CONFIGURED") {
      return json(req, 500, {
        ok: false,
        error: "request_failed",
        detail: "ENCRYPTION_NOT_CONFIGURED",
      });
    }

    console.error("pms-connection-save error:", msg);

    return json(req, 500, {
      ok: false,
      error: "request_failed",
      detail: "internal_error",
    });
  }
});