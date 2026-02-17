const pdfBytes = await buildWeeklyPdf({ title, subtitle, points });

const exportId = crypto.randomUUID();
const storagePath = `debacu_eval/org/${orgId}/weekly/${exportId}.pdf`;

// 1) INSERT PENDING (tabla)
let auditExportId: string | null = null;
try {
  auditExportId = await insertExportPending(admin, {
    id: exportId, // si quieres que coincida con export_id. Si prefieres que la tabla genere id, quita esto.
    app_id: APP_ID,
    org_id: orgId,
    customer_id: customerId,

    export_type: "PDF",
    scope: "WEEKLY_REPORT",
    status: "PENDING",

    title,
    period_from: fixed.from,
    period_to: fixed.to,
    period_field: period_field,

    storage_bucket: EXPORT_BUCKET,
    storage_path: storagePath,
  });
} catch {
  // si falla insert, no paramos: pero yo prefiero PARAR porque sin log pierdes trazabilidad
  throw new Error("EXPORT_INSERT_FAILED");
}

try {
  // 2) UPLOAD
  const up = await admin.storage
    .from(EXPORT_BUCKET)
    .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });

  if (up.error) throw new Error("UPLOAD_FAILED");

  // 3) METADATA
  const fileSize = pdfBytes.byteLength;
  const hash = await sha256Hex(pdfBytes);

  // 4) SIGNED URL
  const signed = await admin.storage.from(EXPORT_BUCKET).createSignedUrl(storagePath, 60 * 10);
  if (signed.error || !signed.data?.signedUrl) throw new Error("SIGNED_URL_FAILED");

  // 5) UPDATE READY
  await markExportReady(admin, exportId, {
    status: "READY",
    file_size_bytes: fileSize,
    sha256: hash,
    storage_bucket: EXPORT_BUCKET,
    storage_path: storagePath,
    error_detail: null,
  });

  return json(req, 200, {
    ok: true,
    export_id: exportId,         // id export (y id tabla si lo igualas)
    audit_export_id: exportId,   // por claridad
    org_id: orgId,
    app_id: APP_ID,
    period_from: fixed.from,
    period_to: fixed.to,
    period_field,
    row_count: points.length,
    storage_bucket: EXPORT_BUCKET,
    storage_path: storagePath,
    download_url: signed.data.signedUrl,
    expires_in: 600,
    sha256: hash,
    file_size_bytes: fileSize,
  });
} catch (err: any) {
  const detail = String(err?.message ?? err ?? "FAILED");
  if (auditExportId) await markExportFailed(admin, exportId, detail);
  throw err;
}
