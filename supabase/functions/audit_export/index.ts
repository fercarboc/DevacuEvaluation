// supabase/functions/audit_export/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";

type AuditExportRequest = {
  file_name: string;
  mime_type: string;
  format: "PDF" | "CSV" | "XML" | string;

  sha256?: string;
  client_sha256?: string;

  file_base64: string;

  app_id?: string | null; // "SYSTEM"
  customer_id?: string | null;
  date_from?: string | null; // yyyy-mm-dd
  date_to?: string | null;   // yyyy-mm-dd
  row_count?: number | null;

  source?: string | null;
  type?: string | null;
  filters_json?: any;

  purpose?: string | null;
  legal_basis?: string | null;
  notes?: string | null;

  provided_to_type?: string | null;
  provided_to_name?: string | null;
  provided_to_ref?: string | null;
  provided_to_contact?: string | null;
};

function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function isHexSha256(s: string) {
  return /^[a-f0-9]{64}$/i.test(s);
}

function safeFileName(name: string) {
  const cleaned = String(name ?? "")
    .replaceAll("\\", "_")
    .replaceAll("/", "_")
    .trim();
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

function clampInt(v: any, def: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const i = Math.trunc(n);
  return Math.max(min, Math.min(max, i));
}

function isYmd(s: any) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function supabaseServiceClient() {
  const SUPABASE_URL = requireEnv("SUPABASE_URL");
  const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

const STORAGE_BUCKET = "system-exports";
const DEFAULT_APP_ID = "SYSTEM";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  try {
    // ✅ Seguridad: esto crea exports “SYSTEM” → admin only
    const actor = await requireAdmin(req);

    const actor_user_id = actor.user_id;
    const actor_email = actor.email ?? null;

    const body = (await req.json().catch(() => ({}))) as Partial<AuditExportRequest>;

    // --- Validaciones mínimas ---
    const fileName = safeFileName(String(body.file_name ?? ""));
    const mimeType = String(body.mime_type ?? "").trim();
    const format = String(body.format ?? "").trim();
    const fileBase64 = String(body.file_base64 ?? "").trim();

    const sha = String((body.sha256 || body.client_sha256 || "") ?? "").trim().toLowerCase();

    if (!mimeType) return json(req, 400, { ok: false, error: "mime_type_required" });
    if (!format) return json(req, 400, { ok: false, error: "format_required" });
    if (!fileBase64) return json(req, 400, { ok: false, error: "file_base64_required" });
    if (!sha) return json(req, 400, { ok: false, error: "sha256_required" });
    if (!isHexSha256(sha)) return json(req, 400, { ok: false, error: "sha256_invalid" });

    // fechas opcionales
    const date_from = body.date_from ?? null;
    const date_to = body.date_to ?? null;
    if (date_from && !isYmd(date_from)) return json(req, 400, { ok: false, error: "date_from_invalid" });
    if (date_to && !isYmd(date_to)) return json(req, 400, { ok: false, error: "date_to_invalid" });

    const row_count =
      body.row_count === null || body.row_count === undefined
        ? null
        : clampInt(body.row_count, 0, 0, 10_000_000);

    // --- Decode bytes ---
    let bytes: Uint8Array;
    try {
      bytes = decodeBase64ToUint8Array(fileBase64);
    } catch {
      return json(req, 400, { ok: false, error: "file_base64_invalid" });
    }

    // --- Storage path ---
    const { yyyy, mm, dd } = yyyyMmDdParts(new Date());
    const appId = (body.app_id ?? DEFAULT_APP_ID) || DEFAULT_APP_ID; // siempre cae a SYSTEM
    const key = crypto.randomUUID();
    const storagePath = `${appId}/${yyyy}/${mm}/${dd}/${key}_${fileName}`;

    const sb = supabaseServiceClient();

    // 1) Upload storage
    const { error: upErr } = await sb.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, bytes, { contentType: mimeType, upsert: false });

    if (upErr) return json(req, 500, { ok: false, error: "storage_upload_failed", detail: upErr.message });

    // 2) Insert DB audit_exports
    const insertRow: Record<string, unknown> = {
      // si tu tabla tiene default now(), puedes quitar created_at
      created_at: new Date().toISOString(),

      generated_by: actor_user_id,
      generated_by_email: actor_email,

      app_id: appId,
      customer_id: body.customer_id ?? null,

      file_name: fileName,
      file_sha256: sha,
      mime_type: mimeType,
      format,

      row_count,
      date_from,
      date_to,

      source: body.source ?? null,
      type: body.type ?? null,
      filters_json: body.filters_json ?? null,

      purpose: body.purpose ?? null,
      legal_basis: body.legal_basis ?? null,
      notes: body.notes ?? null,

      storage_bucket: STORAGE_BUCKET,
      storage_path: storagePath,

      // ⚠️ tus columnas “provided_to_*” parecen NOT NULL → ponemos defaults sensatos
      provided_to_type: body.provided_to_type ?? "SYSTEM",
      provided_to_name: body.provided_to_name ?? "System export",
      provided_to_ref: body.provided_to_ref ?? "SYSTEM",
      provided_to_contact: body.provided_to_contact ?? actor_email,

      status: "READY",
    };

    const { data: inserted, error: insErr } = await sb
      .from("audit_exports")
      .insert(insertRow)
      .select("id")
      .maybeSingle();

    if (insErr) {
      // si falla DB, NO borramos el archivo automáticamente (podrías hacerlo, pero ojo con auditoría)
      return json(req, 500, {
        ok: false,
        error: "db_insert_failed",
        detail: insErr.message,
        insertRowKeys: Object.keys(insertRow),
      });
    }

    return json(req, 200, {
      ok: true,
      data: {
        audit_export_id: inserted?.id ?? null,
        storage_bucket: STORAGE_BUCKET,
        storage_path: storagePath,
      },
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);

    if (msg === "UNAUTHORIZED" || msg === "missing_bearer" || msg === "invalid_token") {
      return json(req, 401, { ok: false, error: "unauthorized" });
    }
    if (msg === "FORBIDDEN" || msg === "forbidden_admin_only") {
      return json(req, 403, { ok: false, error: "forbidden" });
    }

    return json(req, 500, { ok: false, error: "unexpected", detail: msg });
  }
});
