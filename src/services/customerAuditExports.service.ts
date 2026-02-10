// src/services/customerAuditExports.service.ts
import { callEvalFn } from "@/services/callEvalFn";

export type CustomerAuditExportStatus = "PENDING" | "COMPLETED" | "FAILED";

export type CustomerAuditExportRow = {
  id: string;

  org_id: string;
  app_id: string;

  requested_by_user_id: string;
  requested_by_role: string | null;
  requested_by_email: string | null;

  export_type: "PDF" | "CSV";
  export_scope: string;

  period_from: string; // yyyy-mm-dd
  period_to: string; // yyyy-mm-dd
  filters: any | null;

  row_count: number | null;
  sha256: string | null;
  file_size_bytes: number | null;

  storage_bucket: string;
  storage_path: string;

  status: CustomerAuditExportStatus;
  error_code: string | null;
  error_message: string | null;

  created_at: string; // timestamptz ISO
};

export type ListExportsRequest = {
  customer_id: string;            // ✅ obligatorio (account_bundle style)
  app_id?: string;                // default DEBACU_EVAL
  page?: number;                  // 1-based
  pageSize?: number;              // default 25
};

type EdgeListResponse = {
  ok: boolean;
  customer_id: string;
  org_id: string;
  app_id: string;
  exports: CustomerAuditExportRow[];
};

export type ListExportsResponse = {
  page: number;
  pageSize: number;
  rows: CustomerAuditExportRow[];
  // total: por ahora NO lo tenemos porque la edge no lo devuelve
  total: number | null;
  org_id: string;
  app_id: string;
};

/**
 * Lista simple (limit/offset) compatible con la Edge actual.
 * Luego añadimos filtros y total si lo necesitas.
 */
export async function customer_audit_exports_list(
  req: ListExportsRequest,
): Promise<ListExportsResponse> {
  const page = Math.max(Number(req.page ?? 1) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.pageSize ?? 25) || 25, 1), 100);

  const offset = (page - 1) * pageSize;
  const limit = pageSize;

  const payload = {
    customer_id: req.customer_id,
    app_id: req.app_id ?? "DEBACU_EVAL",
    limit,
    offset,
  };

  const r = await callEvalFn<EdgeListResponse>("customer_audit_exports_list", payload);

  return {
    page,
    pageSize,
    rows: r.exports ?? [],
    total: null,
    org_id: r.org_id,
    app_id: r.app_id,
  };
}

/* =========================================================
 * CREATE (generate)
 * ========================================================= */
export type CreateExportRequest = {
  customer_id: string;            // ✅ obligatorio
  app_id?: string;
  export_type: "PDF" | "CSV";
  export_scope: string;
  period_from: string;
  period_to: string;
  filters?: any;
  storage_bucket?: string;
};

export type CreateExportResponse = {
  ok: boolean;
  export_id: string;
  status: CustomerAuditExportStatus;
};

export async function customer_audit_exports_create(req: CreateExportRequest) {
  const payload = {
    customer_id: req.customer_id,
    app_id: req.app_id ?? "DEBACU_EVAL",
    export_type: req.export_type,
    export_scope: req.export_scope,
    period_from: req.period_from,
    period_to: req.period_to,
    filters: req.filters ?? null,
    storage_bucket: req.storage_bucket, // opcional
  };

  // ✅ ojo: el nombre debe coincidir con tu Edge real
  return await callEvalFn<CreateExportResponse>("customer_audit_export_generate", payload);
}

/* =========================================================
 * DOWNLOAD URL
 * ========================================================= */
export type DownloadUrlRequest = {
  customer_id: string;            // ✅ obligatorio
  app_id?: string;
  export_id: string;
};

export type DownloadUrlResponse = {
  ok: boolean;
  download_url: string;
  expires_in: number;
};

export async function customer_audit_exports_download_url(req: DownloadUrlRequest) {
  const payload = {
    customer_id: req.customer_id,
    app_id: req.app_id ?? "DEBACU_EVAL",
    export_id: req.export_id,
  };

  // ✅ nombre edge real
  return await callEvalFn<DownloadUrlResponse>("customer_audit_export_download_url", payload);
}
