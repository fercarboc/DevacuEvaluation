// supabase/functions/audit_export/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type AuditExportRequest = {
  file_name: string;
  mime_type: string; // "application/pdf" | "text/csv" | ...
  format: "PDF" | "CSV" | "XML" | string;

  // hash: aceptamos sha256 o client_sha256 (tu UI manda client_sha256)
  sha256?: string;
  client_sha256?: string;

  // contenido
  file_base64: string;

  // metadatos
  app_id?: string | null; // ej: "SYSTEM"
  customer_id?: string | null; // null si es sistema
  date_from?: string | null; // "yyyy-mm-dd" o null
  date_to?: string | null; // "yyyy-mm-dd" o null
  row_count?: number | null;

  source?: string | null; // ej: "abuse_settings_audit_grouped"
  type?: string | null; // ej: "CONFIG_CHANGES"
  filters_json?: any; // objeto libre

  // opcionales
  purpose?: string | null;
  legal_basis?: string | null;
  notes?: string | null;

  // “a quién se entrega” (ajustado a tus columnas reales)
  provided_to_type?: string | null; // idealmente enum audit_provided_to_type
  provided_to_name?: string | null;
  provided_to_ref?: string | null;
  provided_to_contact?: string | null;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isHexSha256(s: string) {
  return /^[a-f0-9]{64}$/i.test(s);
}

function safeFileName(name: string) {
  const cleaned = name.replaceAll("\\", "_").replaceAll("/", "_").trim();
  return cleaned.length ? cleaned : `export_${crypto.randomUUID()}`;
}

function decodeBase64ToUint8Array(b64: string) {
  const raw = b64.includes("base64,") ? b64.split("base64,")[1] : b64;
  const bin = atob(raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function yyyyMmDdParts(d = new Date()) {
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return { yyyy, mm, dd };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json(500, {
        error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY",
      });
    }

    // Service role para escribir (storage + db)
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const body = (await req.json()) as AuditExportRequest;

    // --- Validaciones mínimas ---
    const fileName = safeFileName(body.file_name);
    const mimeType = String(body.mime_type || "").trim();
    const format = String(body.format || "").trim();
    const fileBase64 = String(body.file_base64 || "").trim();

    const sha = (body.sha256 || body.client_sha256 || "").trim().toLowerCase();

    if (!fileName) return json(400, { error: "file_name is required" });
    if (!mimeType) return json(400, { error: "mime_type is required" });
    if (!format) return json(400, { error: "format is required" });
    if (!fileBase64) return json(400, { error: "file_base64 is required" });
    if (!sha) return json(400, { error: "client_sha256/sha256 is required" });
    if (!isHexSha256(sha)) return json(400, { error: "sha256 must be 64 hex chars" });

    // --- Intentar sacar usuario (para generated_by / generated_by_email) ---
    // OJO: aquí NO validamos permisos; solo leemos el user si viene Authorization.
    // El control de acceso lo debes hacer en el front (admin) + RLS/edge si lo deseas.
    let generatedBy: string | null = null;
    let generatedByEmail: string | null = null;
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (authHeader) {
      const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
        auth: { persistSession: false },
        global: { headers: { Authorization: authHeader } },
      });

      const { data: u } = await supabaseUser.auth.getUser();
      generatedBy = u?.user?.id ?? null;
      generatedByEmail = (u?.user?.email as string | undefined) ?? null;
    }

    // --- Decode bytes ---
    const bytes = decodeBase64ToUint8Array(fileBase64);

    // --- Storage: bucket system-exports ---
    const storageBucket = "system-exports";

    // path: SYSTEM/2026/01/27/<uuid>_<fileName>
    const { yyyy, mm, dd } = yyyyMmDdParts(new Date());
    const appId = (body.app_id ?? "SYSTEM") || "SYSTEM";
    const key = crypto.randomUUID();
    const storagePath = `${appId}/${yyyy}/${mm}/${dd}/${key}_${fileName}`;

    const { error: upErr } = await supabase.storage
      .from(storageBucket)
      .upload(storagePath, bytes, { contentType: mimeType, upsert: false });

    if (upErr) return json(500, { error: "storage upload failed", detail: upErr.message });

    // --- Insert DB (tabla audit_exports) ---
    // ✅ ALINEADO con tu tabla:
    // storage_bucket, storage_path, file_sha256, mime_type, file_name, etc.
   const insertRow: Record<string, unknown> = {
  created_at: new Date().toISOString(),

  generated_by: generatedBy,
  generated_by_email: generatedByEmail,

  app_id: appId,
  customer_id: body.customer_id ?? null,

  file_name: fileName,
  file_sha256: sha,
  mime_type: mimeType,
  format,

  row_count: body.row_count ?? null,
  date_from: body.date_from ?? null,
  date_to: body.date_to ?? null,

  source: body.source ?? null,
  type: body.type ?? null,
  filters_json: body.filters_json ?? null,

  purpose: body.purpose ?? null,
  legal_basis: body.legal_basis ?? null,
  notes: body.notes ?? null,

  storage_bucket: storageBucket,
  storage_path: storagePath,

  // 🔴 CLAVE: NO PUEDE SER NULL
  provided_to_type: body.provided_to_type ?? "SYSTEM",
  provided_to_name: body.provided_to_name ?? "System export",
  provided_to_ref: body.provided_to_ref ?? "SYSTEM",
  provided_to_contact: body.provided_to_contact ?? generatedByEmail,

  status: "READY",
};


    const { data: inserted, error: insErr } = await supabase
      .from("audit_exports")
      .insert(insertRow)
      .select("id")
      .maybeSingle();

    if (insErr) {
      return json(500, {
        error: "db insert failed (audit_exports)",
        detail: insErr.message,
        insertRowKeys: Object.keys(insertRow),
        hint:
          "Revisa nombres de columnas: esta función usa storage_bucket/storage_path/file_sha256. Si tu tabla usa otros nombres, dímelos y lo ajusto.",
      });
    }

    return json(200, {
      success: true,
      audit_export_id: inserted?.id ?? null,
      storage_bucket: storageBucket,
      storage_path: storagePath,
    });
  } catch (err) {
    console.error("audit_export fatal", err);
    return json(500, { error: "Internal server error" });
  }
});
