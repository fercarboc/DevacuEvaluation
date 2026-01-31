// src/utils/auditExport.ts
import { supabase } from "@/services/supabaseClient";

/* ------------------ helpers ------------------ */

export function safeFileName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_");
}

export async function sha256HexFromBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ------------------ storage ------------------ */

export async function uploadToAuditExportsBucket(args: {
  blob: Blob;
  fileName: string;
  customerId?: string | null;
  appId?: string | null;
}) {
  const { blob, fileName, customerId, appId } = args;

  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  const bucket = "system-exports";
  const path = [
    safeFileName(appId ?? "SYSTEM"),
    safeFileName(customerId ?? "GLOBAL"),
    `${yyyy}-${mm}-${dd}`,
    safeFileName(fileName),
  ].join("/");

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, {
      upsert: true,
      contentType: blob.type,
    });

  if (error) throw error;

  return { bucket, path };
}

/* ------------------ DB register ------------------ */

export async function insertAuditExportRow(args: {
  fileName: string;
  sha256: string;
  mimeType: string;
  bucket: string;
  path: string;
  rowCount: number;

  appId?: string | null;
  customerId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;

  source?: string;
  type?: string;
  purpose?: string | null;
  legalBasis?: string | null;
  notes?: string | null;
  filtersJson?: any;
}) {
  const {
    fileName,
    sha256,
    mimeType,
    bucket,
    path,
    rowCount,
    appId,
    customerId,
    dateFrom,
    dateTo,
    source = "abuse_settings_audit_grouped",
    type = "CONFIG_CHANGES",
    purpose = "Inspección / auditoría interna",
    legalBasis = "Interés legítimo (seguridad y trazabilidad)",
    notes = null,
    filtersJson = null,
  } = args;

  // ✅ antes: supabase.from("audit_exports")
const { data, error } = await (supabase as any)
  .from("audit_exports")
  .insert({
    format: mimeType.includes("pdf") ? "PDF" : "CSV",
    row_count: rowCount,
    filters_json: filtersJson,
    customer_id: customerId,
    date_from: dateFrom,
    date_to: dateTo,
    source,
    type,
    app_id: appId ?? "SYSTEM",
    storage_bucket: bucket,
    storage_path: path,
    file_name: fileName,
    file_sha256: sha256,
    mime_type: mimeType,
    status: "READY",
    purpose,
    legal_basis: legalBasis,
    notes,
  })
  .select("id")
  .maybeSingle();


  if (error) throw error;
  return data; // { id }
}
