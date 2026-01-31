// src/services/adminService.ts
import { supabase } from "@/services/supabaseClient";
import type { Database } from "@/types/database";
import { edgeCall } from "@/services/edge";

const APP_CODE = "DEBACU_EVAL";

// =======================
// Auth helpers
// =======================
async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("No session token");
  return token;
}

/**
 * Invoca una Edge Function con Authorization Bearer <token>.
 * - Por defecto POST
 * - Si tu función devuelve { ok, data, error }, lo interpreta.
 */
async function invokeAuthed<T = unknown>(
  fn: string,
  body?: unknown,
  method: "POST" | "GET" = "POST"
): Promise<T> {
  const token = await getAccessToken();

  const { data, error } = await supabase.functions.invoke(fn, {
    body: body ?? null,
    method,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) throw error;

  // Convención opcional: { ok, data, error }
  if (data && typeof data === "object" && "ok" in (data as any)) {
    const d = data as any;
    if (!d.ok) throw new Error(d.error ?? "Function failed");
    return d.data as T;
  }

  return data as T;
}

// =======================
// Dashboard
// =======================
export type DashboardMetrics = {
  clientes_activos: number;
  solicitudes_pendientes: number;
  consultas_hoy: number;
  alertas_activas: number;
};

 

export async function fetch_dashboard_metrics() {
  return edgeCall<{
    clientes_activos: number;
    solicitudes_pendientes: number;
    consultas_hoy: number;
    alertas_activas: number;
  }>("admin_dashboard_metrics", {});
}

// =======================
// Customers / Plans / Invoices
// =======================

/**
 * Edge: admin_list_customers (para tabla customers sin exponer .from(...) desde front)
 * Nota: si tu Edge lee querystring, cámbiala para leer body.
 */
export async function list_clients(q = "", limit = 200, offset = 0) {
  return invokeAuthed<any[]>("admin_list_customers", { q, limit, offset });
}

/**
 * RPC: admin_list_customers (si lo tienes ya)
 * OJO: esta firma es distinta a list_clients.
 */
export async function admin_list_customers(q: string) {
  const sb = supabase as any;
  const { data, error } = await sb.rpc("admin_list_customers", {
    p_q: q || null,
    p_limit: 20,
  });
  if (error) throw error;
  return data ?? [];
}

// src/services/adminService.ts


export async function list_plans(q = "", limit = 200, offset = 0) {
  const res = await edgeCall<{ rows: any[]; count: number; limit: number; offset: number }>(
    "admin_list_plans",
    { app_id: "DEBACU_EVAL", q, limit, offset }
  );
  return res.rows;
}


 

export async function list_invoices(limit = 50, offset = 0) {
  const res = await edgeCall<{ rows: any[]; count: number; limit: number; offset: number }>(
    "admin_list_invoices",
    { app_id: "DEBACU_EVAL", limit, offset }
  );
  return res.rows;
}


// =======================
// Audit events (RPC)
// =======================
export type AdminAuditEventsParams = {
  source?: "ALL" | "PRODUCT" | "SYSTEM";
  customer?: string | null; // id o email
  type?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
  offset?: number;
};



export type AuditExportFormat = "PDF" | "CSV" | "XML";

export type AuditExportParams = {
  format: AuditExportFormat;
  source: "ALL" | "PRODUCT" | "SYSTEM";
  customer: string | null;
  type: string | null;
  from: string | null;
  to: string | null;

  delivered_to_name: string;
  delivered_to_org: string | null;
  delivered_to_reason: string;
  delivered_to_reference: string | null;
};

export type AuditExportResponse = { signed_url: string };
 
export type AuditSource = "ALL" | "PRODUCT" | "SYSTEM";

export async function list_audit_events(params: {
  source: AuditSource;
  customer: string | null;
  type: string | null;
  from: string | null;
  to: string | null;
  limit?: number;
  offset?: number;
}) {
  return edgeCall<any[]>("debacu_eval_audit_api", { action: "list_events", payload: params });
}

export async function list_audit_types(source: AuditSource) {
  return edgeCall<string[]>("debacu_eval_audit_api", { action: "list_types", payload: { source } });
}


export async function admin_get_signed_audit_export_url(exportId: string) {
  return edgeCall<{ signed_url: string }>("debacu_eval_audit_export_sign", { export_id: exportId });
}

 
 

 

// =======================
// Audit exports
// =======================
 




export type AdminAuditExportsListParams = {
  app_id: string;
  customer_id?: string | null;
  from?: string | null; // yyyy-mm-dd
  to?: string | null;   // yyyy-mm-dd
  format?: string | null;
  type?: string | null;
  provided_to_type?: string | null;
  q?: string | null;
  limit?: number | null;
  offset?: number | null;
};

export async function admin_audit_exports_list(params: AdminAuditExportsListParams) {
  return edgeCall<any[]>("admin_audit_exports_list", params);
}

export async function admin_audit_exports_stats(exportId: string) {
  return edgeCall<{ download_count: number; last_downloaded_at: string | null; last_downloaded_by_email: string | null }>(
    "admin_audit_exports_stats",
    { export_id: exportId }
  );
}

export async function admin_audit_exports_downloads(exportId: string, limit = 200, offset = 0) {
  return edgeCall<any[]>("admin_audit_exports_downloads", { export_id: exportId, limit, offset });
}





























 

type ExportEdgeResponse =
  | { signed_url: string }
  | { export_id: string };

export async function export_audit_events(
  params: AuditExportParams
): Promise<AuditExportResponse> {
  // 1) genera y guarda
  const r = await edgeCall<ExportEdgeResponse>("debacu_eval_audit_export", params);

  // si ya devuelve signed_url, perfecto
  if ("signed_url" in r && typeof r.signed_url === "string" && r.signed_url) {
    return { signed_url: r.signed_url };
  }

  // 2) si solo devuelve export_id, firmamos
  if (!("export_id" in r) || !r.export_id) {
    throw new Error("Export failed: missing export_id/signed_url");
  }

  const signed = await edgeCall<{ signed_url: string }>(
    "debacu_eval_audit_export_sign",
    { export_id: r.export_id }
  );

  if (!signed?.signed_url) throw new Error("Export sign failed: missing signed_url");
  return { signed_url: signed.signed_url };
}





export async function list_audit_exports(params?: {
  q?: string | null;
  customer?: string | null;
  from?: string | null; // yyyy-mm-dd
  to?: string | null; // yyyy-mm-dd
  format?: "CSV" | "PDF" | "XML" | null;
  limit?: number;
  offset?: number;
}) {
  const sb = supabase as any;
  const { data, error } = await sb.rpc("admin_list_audit_exports", {
    p_q: params?.q ?? null,
    p_customer: params?.customer ?? null,
    p_from: params?.from ?? null,
    p_to: params?.to ?? null,
    p_format: params?.format ?? null,
    p_limit: params?.limit ?? 200,
    p_offset: params?.offset ?? 0,
  });
  if (error) throw error;
  return data ?? [];
}

export async function sign_audit_export_url(exportId: string, expiresSeconds = 600) {
  const { data, error } = await supabase.functions.invoke("debacu_eval_audit_export_sign", {
    body: { export_id: exportId, expires_seconds: expiresSeconds },
  });
  if (error) throw error;
  return data as { signed_url: string; expires_seconds: number };
}

 
// ✅ Compat EXACTA con ExportsHistoryDialog.tsx
// (mantiene el nombre admin_list_audit_exports_v2 pero por Edge)
export async function admin_list_audit_exports_v2(params: {
  app_id: string;
  customer_id: string | null;
  from: string | null;
  to: string | null;
  format: string | null;
  type: string | null;
  provided_to_type: string | null;
  q: string | null;
  limit: number;
  offset: number;
}) {
  return edgeCall<any[]>("admin_audit_exports_list", {
    app_id: params.app_id,
    customer_id: params.customer_id,
    from: params.from,
    to: params.to,
    format: params.format,
    type: params.type,
    provided_to_type: params.provided_to_type,
    q: params.q,
    limit: params.limit,
    offset: params.offset,
  });
}
 // ✅ Alias de compatibilidad (por si alguna página importa list_audit_exports_v2)
export const list_audit_exports_v2 = admin_list_audit_exports_v2;








// Si tienes un componente que usaba "admin_list_audit_exports_v2_full",
// lo dejamos como wrapper explícito (pero no lo uses si tu RPC no soporta esos params).
export async function admin_list_audit_exports_v2_full(params: {
  app_id: string;
  customer_id: string | null;
  from: string | null;
  to: string | null;
  format: string | null;
  type: string | null;
  provided_to_type: string | null;
  q: string | null;
  limit: number;
  offset: number;
}) {
  // ⚠️ Solo válido si tu RPC realmente acepta p_app_id, p_customer_id, p_type, p_provided_to_type.
  // Si NO lo acepta, elimina esta función o ajusta el RPC.
  const { data, error } = await (supabase as any).rpc("admin_list_audit_exports_v2", {
    p_app_id: params.app_id,
    p_customer_id: params.customer_id,
    p_from: params.from,
    p_to: params.to,
    p_format: params.format,
    p_type: params.type,
    p_provided_to_type: params.provided_to_type,
    p_q: params.q,
    p_limit: params.limit,
    p_offset: params.offset,
  });

  if (error) throw error;
  return data ?? [];
}

// =======================
// Usage / Abuse (RPC)
// =======================





export async function admin_list_usage_alerts(params?: { status?: string | null; limit?: number; offset?: number }) {
  return edgeCall<any[]>("admin_abuse_api", {
    action: "list_alerts",
    payload: { status: params?.status ?? "OPEN", limit: params?.limit ?? 200, offset: params?.offset ?? 0 },
  });
}

export async function admin_get_usage_alert(id: string) {
  return edgeCall<any>("admin_abuse_api", { action: "get_alert", payload: { id } });
}

export async function admin_list_usage_alert_actions(id: string, limit = 200, offset = 0) {
  return edgeCall<any[]>("admin_abuse_api", { action: "list_actions", payload: { id, limit, offset } });
}

export async function admin_ack_usage_alert(id: string, note?: string | null) {
  return edgeCall<boolean>("admin_abuse_api", { action: "ack", payload: { id, note: note ?? null } });
}

export async function admin_resolve_usage_alert(id: string, note?: string | null) {
  return edgeCall<boolean>("admin_abuse_api", { action: "resolve", payload: { id, note: note ?? null } });
}

export async function admin_reopen_usage_alert(id: string, note?: string | null) {
  return edgeCall<boolean>("admin_abuse_api", { action: "reopen", payload: { id, note: note ?? null } });
}

export async function admin_add_usage_alert_note(id: string, note: string) {
  return edgeCall<boolean>("admin_abuse_api", { action: "add_note", payload: { id, note } });
}

export async function admin_usage_alert_metrics(fromISO: string, toISO: string) {
  return edgeCall<any>("admin_abuse_api", { action: "metrics", payload: { from: fromISO, to: toISO } });
}

export async function admin_get_abuse_settings() {
  return edgeCall<any>("admin_abuse_api", { action: "get_settings", payload: {} });
}

export async function admin_update_abuse_settings(input: {
  ack_warning_minutes: number;
  ack_critical_minutes: number;
  resolve_warning_minutes: number;
  resolve_critical_minutes: number;
}) {
  return edgeCall<any>("admin_abuse_api", { action: "update_settings", payload: input });
}







// =======================
// Abuse settings (RPC)
// =======================
export type AbuseSettings = {
  id: string;
  ack_warning_minutes: number;
  ack_critical_minutes: number;
  resolve_warning_minutes: number;
  resolve_critical_minutes: number;
  updated_at: string;
  updated_by: string | null;
};


export async function listAbuseSettingsAudit(abuseSettingsId: string) {
  const { data, error } = await supabase
    .from("abuse_settings_audit")
    .select("id, before, after, actor, created_at")
    .eq("abuse_settings_id", abuseSettingsId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// =======================
// System export (Edge)
// =======================
export type SystemExportProvidedToType =
  | "INSPECTOR"
  | "COURT"
  | "POLICE"
  | "INTERNAL"
  | "OTHER";

export async function export_system_file(payload: {
  file_name: string;
  mime_type: string;
  file_base64: string;

  client_sha256?: string | null;
  sha256?: string;

  app_id: "SYSTEM";
  customer_id: string | null;

  type: string;
  source: string;
  format: "PDF" | "CSV";
  row_count?: number | null;

  date_from?: string | null;
  date_to?: string | null;
  filters_json?: any;

  purpose?: string | null;
  legal_basis?: string | null;
  notes?: string | null;

  provided_to_type?: SystemExportProvidedToType | string | null;
  provided_to_name?: string | null;
  provided_to_ref?: string | null;
  provided_to_contact?: string | null;
}) {
  const { data, error } = await supabase.functions.invoke("audit_export", {
    body: payload,
  });
  if (error) throw error;
  return data;
}

// =======================
// Admin WhoAmI (Edge)
// =======================
export type AdminWhoAmI = {
  is_admin: boolean;
  user_id: string;
  email: string | null;
};

export async function admin_whoami(): Promise<AdminWhoAmI> {
  // ✅ siempre authed (token)
  return invokeAuthed<AdminWhoAmI>("admin_whoami", {});
}

// =======================
// Signed export URL (Edge)
// =======================
export async function admin_get_signed_audit_export_url_v2(exportId: string) {
  const data = await invokeAuthed<{ signed_url: string; expires_in: number }>(
    "admin_get_signed_audit_export_url_v2",
    { export_id: exportId, expires_in: 300 }
  );

  if (!data?.signed_url) throw new Error("No signed_url returned");
  return data.signed_url as string;
}


export async function admin_get_signed_export_url(exportId: string, expiresIn = 300) {
  const data = await invokeAuthed<{ signed_url: string; expires_in: number }>(
    "admin_get_signed_audit_export_url_v2",
    { export_id: exportId, expires_in: expiresIn }
  );

  const signedUrl = data?.signed_url;
  if (!signedUrl) throw new Error("No se recibió signed_url");
  return signedUrl;
}

// =======================
// Placeholders (si aún los usas)
// =======================
export async function list_abuse_alerts() {
  return [
    {
      id: "alert-1",
      customer_id: "CUST-101",
      reason: "Uso elevado",
      created_at: new Date().toISOString(),
    },
    {
      id: "alert-2",
      customer_id: "CUST-404",
      reason: "Intentos fallidos",
      created_at: new Date().toISOString(),
    },
  ];
}

export async function get_system_settings() {
  return {
    retention_days: 90,
    abuse_threshold_percent: 75,
    allow_new_access_requests: true,
  };
}

export async function update_system_settings(payload: {
  retention_days: number;
  abuse_threshold_percent: number;
  allow_new_access_requests: boolean;
}) {
  console.debug("TODO: persistir settings en backend", payload);
  return payload;
}

// =======================================================
// ✅ COMPAT: ExportsHistoryDialog.tsx (todo por Edge)
// =======================================================

 
// Este nombre lo importa ExportsHistoryDialog.tsx
export async function list_audit_export_downloads(exportId: string, limit = 200, offset = 0) {
  return admin_audit_exports_downloads(exportId, limit, offset);
}

// Este nombre lo usa ExportsHistoryDialog.tsx para stats
export async function admin_audit_export_download_stats(exportId: string) {
  return admin_audit_exports_stats(exportId);
}
