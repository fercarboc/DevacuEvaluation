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

function normalizeArray<T = any>(raw: any): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray((raw as any).data)) return (raw as any).data as T[];
  if (Array.isArray((raw as any).rows)) return (raw as any).rows as T[];
  if (Array.isArray((raw as any).items)) return (raw as any).items as T[];
  if ((raw as any).ok && Array.isArray((raw as any).data)) return (raw as any).data as T[];
  return [];
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
  const tz_offset_minutes = -new Date().getTimezoneOffset(); // Madrid: +60 o +120 (verano)
  return edgeCall<DashboardMetrics>("admin_dashboard_metrics", { tz_offset_minutes });
}



export type DashboardOverview = {
  metrics: DashboardMetrics;
  series: Array<{ ts: string; value: number }>;
  recent_alerts: Array<{
    id: string;
    detected_at: string;
    customer_id?: string | null;
    customer_name?: string | null;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    alert_type: string;
    status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
    reason?: string | null;
  }>;
  recent_activity: Array<{
    id: string;
    created_at: string;
    kind: "STRIPE" | "SUBSCRIPTION" | "CUSTOMER" | "EXPORT" | "SECURITY" | "SYSTEM" | "ADMIN";
    title: string;
    detail?: string | null;
    ref?: string | null;
  }>;
  health: {
    uptime_pct?: number | null;
    api_latency_ms?: number | null;
    api_error_pct?: number | null;
  };
};

export async function fetch_dashboard_overview(range: "7d" | "30d" = "30d") {
  return edgeCall<DashboardOverview>("admin_dashboard_overview", {
    app_id: "DEBACU_EVAL",
    range,
  });
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
export type ExportDownloadRow = {
  id: string;
  export_id: string;
  created_at: string;
  downloaded_by: string | null;
  downloaded_by_email: string | null;
  ip: string | null;
  user_agent: string | null;
};

export type AdminAuditExportsListParams = {
  app_id: string;
  customer_id?: string | null;
  from?: string | null; // yyyy-mm-dd
  to?: string | null; // yyyy-mm-dd
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
  return edgeCall<{
    download_count: number;
    last_downloaded_at: string | null;
    last_downloaded_by_email: string | null;
  }>("admin_audit_exports_stats", { export_id: exportId });
}

export async function admin_audit_exports_downloads(exportId: string, limit = 200, offset = 0) {
  return edgeCall<any[]>("admin_audit_exports_downloads", { export_id: exportId, limit, offset });
}

type ExportEdgeResponse = { signed_url: string } | { export_id: string };

export async function export_audit_events(params: AuditExportParams): Promise<AuditExportResponse> {
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

  const signed = await edgeCall<{ signed_url: string }>("debacu_eval_audit_export_sign", {
    export_id: r.export_id,
  });

  if (!signed?.signed_url) throw new Error("Export sign failed: missing signed_url");
  return { signed_url: signed.signed_url };
}

export async function admin_list_export_downloads(exportId: string, limit = 200, offset = 0) {
  const raw = await edgeCall<any>("admin_list_export_downloads", { export_id: exportId, limit, offset });
  return normalizeArray<ExportDownloadRow>(raw);
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

export async function admin_list_system_exports(params: {
  app_id?: "SYSTEM" | "DEBACU_EVAL" | string | null; // ✅ AÑADIR
  q?: string | null;

  // OJO: este "source" NO debería ser "SYSTEM/PRODUCT" si en BD source es el nombre real
  source?: string | null;

  customer_id?: string | null;
  from?: string | null;
  to?: string | null;
  format?: "PDF" | "CSV" | "XML" | null;
  type?: string | null;
  provided_to_type?: string | null;
  limit?: number;
  offset?: number;
}) {
  const raw = await edgeCall<any>("admin_list_system_exports", {
    app_id: params.app_id ?? "SYSTEM",          // ✅ DEFAULT razonable para esta pantalla
    q: params.q ?? null,
    source: params.source ?? null,
    customer_id: params.customer_id ?? null,
    from: params.from ?? null,
    to: params.to ?? null,
    format: params.format ?? null,
    type: params.type ?? null,
    provided_to_type: params.provided_to_type ?? null,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  });

  return normalizeArray<any>(raw);
}


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
export async function admin_list_usage_alerts(params?: {
  status?: string | null;
  limit?: number;
  offset?: number;
}) {
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
export type SystemExportProvidedToType = "INSPECTOR" | "COURT" | "POLICE" | "INTERNAL" | "OTHER";

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
export type SignedUrlResponse = {
  ok: boolean;
  signed_url: string;
  expires_in: number;
};

export async function admin_get_signed_export_url(exportId: string, expiresIn = 600): Promise<SignedUrlResponse> {
  const { data, error } = await supabase.functions.invoke("admin_get_signed_audit_export_url_v2", {
    body: { export_id: exportId, expires_in: expiresIn },
  });

  if (error) throw new Error(error.message);

  const res = data as SignedUrlResponse;
  if (!res?.signed_url) throw new Error("Respuesta sin signed_url");

  return res;
}

// =======================
// Placeholders (si aún los usas)
// =======================
export async function list_abuse_alerts() {
  return [
    { id: "alert-1", customer_id: "CUST-101", reason: "Uso elevado", created_at: new Date().toISOString() },
    { id: "alert-2", customer_id: "CUST-404", reason: "Intentos fallidos", created_at: new Date().toISOString() },
  ];
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

// =======================
// Admin changes (Config changes) - via fetch direct
// =======================
const SB_URL = import.meta.env.VITE_SUPABASE_URL;

 

// src/services/adminService.ts
export type ConfigChangeRow = {
  audit_id: string;
  abuse_settings_id: string | null;
  created_at: string;              // ISO (changed_at)
  actor_name: string | null;       // uuid o null
  changes_count: number;
  changes_summary: string;
  changes?: string | null;         // JSON string o null
};


type AdminFnOk<T> = { ok: true; rows: T; error?: never };
type AdminFnErr = { ok: false; error: string; rows?: never };
type AdminFnRes<T> = AdminFnOk<T> | AdminFnErr;

export async function admin_list_config_changes(args: {
  from?: string | null;
  to?: string | null;
  limit?: number;
}): Promise<ConfigChangeRow[]> {
  const res = await callAdminFn<AdminFnRes<ConfigChangeRow[]>>("admin_list_config_changes", {
    from: args.from ?? null,
    to: args.to ?? null,
    limit: args.limit ?? 500,
  });

  if (res.ok !== true) throw new Error(res.error || "Error listando cambios");
  return Array.isArray(res.rows) ? res.rows : [];
}

export async function admin_rollback_abuse_settings(auditId: string): Promise<void> {
  const res = await callAdminFn<AdminFnRes<null>>("admin_rollback_abuse_settings", {
    audit_id: auditId,
  });

  if (res.ok !== true) throw new Error(res.error || "Error realizando rollback");
}
// =======================
// Dashboard (extended)
// =======================

// 1) Health
export async function fetch_dashboard_health(): Promise<{
  uptime_pct?: number | null;
  api_latency_ms?: number | null;
  api_error_pct?: number | null;
}> {
  // ✅ Edge: admin_dashboard_health
  // Debe devolver { ok:true, data:{...} } o directamente el objeto
  return edgeCall("admin_dashboard_health", {});
}

// 2) Series (consultas/queries)
export async function fetch_dashboard_query_series(
  range: "7d" | "30d"
): Promise<Array<{ ts: string; value: number }>> {
  // ✅ Edge: admin_dashboard_query_series
  // Body recomendado: { range: "7d"|"30d" }
  return edgeCall("admin_dashboard_query_series", { range });
}

// 3) Recent alerts
export async function fetch_dashboard_recent_alerts(
  limit = 8
): Promise<
  Array<{
    id: string;
    detected_at: string;
    customer_id?: string | null;
    customer_name?: string | null;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    alert_type: string;
    status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
    reason?: string | null;
  }>
> {
  // Si YA tienes admin_abuse_api, esto funciona sin crear Edge nueva:
  // - action: "list_alerts"
  // - payload: { status?: "OPEN"|..., limit, offset }
  // Peeero: te interesa "recientes" de cualquier estado.
  // Solución: pedir status null o "ALL" y que el Edge lo gestione.
  // Si tu Edge no soporta ALL aún, usa status:"OPEN" temporalmente.

  const rows = await edgeCall<any[]>("admin_abuse_api", {
    action: "list_alerts",
    payload: { status: null, limit, offset: 0 },
  });

  // Normalizamos al shape esperado por dashboard
  return (Array.isArray(rows) ? rows : []).map((r: any) => ({
    id: String(r.id),
    detected_at: String(r.detected_at ?? r.created_at ?? new Date().toISOString()),
    customer_id: r.customer_id ?? null,
    customer_name: r.customer_name ?? null,
    severity: (r.severity ?? "LOW") as any,
    alert_type: String(r.alert_type ?? "UNKNOWN"),
    status: (r.status ?? "OPEN") as any,
    reason: r.reason ?? null,
  }));
}

// 4) Activity feed
export async function fetch_dashboard_recent_activity(
  limit = 10
): Promise<
  Array<{
    id: string;
    created_at: string;
    kind: "STRIPE" | "SUBSCRIPTION" | "CUSTOMER" | "EXPORT" | "SECURITY" | "SYSTEM" | "ADMIN";
    title: string;
    detail?: string | null;
    ref?: string | null;
  }>
> {
  // ✅ Edge recomendada: admin_dashboard_recent_activity
  // Si aún no existe, créala; mientras tanto, podemos montar una versión provisional
  // leyendo admin_audit_all (si existe como view) desde Edge.
  return edgeCall("admin_dashboard_recent_activity", { limit });
}


//**************************************  PARA CONFIGURACION ***************************** */

// ============================
// Admin Settings (real)
// ============================

export type SystemSettings = {
  retention_days: number;
  abuse_threshold_percent: number;
  allow_new_access_requests: boolean;
  updated_at: string;
  updated_by: string | null;
};

type FnOk<T> = { ok: true; data: T };
type FnErr = { ok: false; error: string; detail?: string };

function isFnOk<T>(v: any): v is FnOk<T> {
  return v && v.ok === true && "data" in v;
}

function isFnErr(v: any): v is FnErr {
  return v && v.ok === false && typeof v.error === "string";
}

function asErrorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) return String((e as any).message);
  return "Unexpected error";
}

// IMPORTANTE:
// - Si ya tienes callAdminFn en tu adminService, usa el tuyo y borra este.
// - Este asume que ya tienes una función que resuelve el access token.
// - Ajusta getAccessToken() según tu auth (EvalAuthContext, supabase.auth.getSession, etc.)

 

 async function callAdminFn<T = any>(fnName: string, payload: unknown): Promise<T> {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
  const token = await getAccessToken();
  if (!token) throw new Error("No access token");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload ?? {}),
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // si no es JSON
  }

  if (!res.ok) {
    const detail = data?.detail || data?.error || text || `HTTP ${res.status}`;
    throw new Error(detail);
  }

  return data as T;
}


/**
 * GET settings actuales (crea singleton si no existe)
 */
export async function get_system_settings(): Promise<SystemSettings> {
  const raw = await callAdminFn<FnOk<SystemSettings> | FnErr>("admin_get_system_settings", {});
  if (isFnOk<SystemSettings>(raw)) return raw.data;
  if (isFnErr(raw)) throw new Error(raw.detail ?? raw.error);
  throw new Error("Unexpected response shape from admin_get_system_settings");
}

export type UpdateSystemSettingsInput = {
  retention_days: number;
  abuse_threshold_percent: number;
  allow_new_access_requests: boolean;
};

export type UpdateSystemSettingsResult = {
  settings: SystemSettings;
  audit_id: string | null;
  unchanged: boolean;
};

/**
 * UPDATE settings + audit log
 */
export async function update_system_settings(
  input: UpdateSystemSettingsInput
): Promise<UpdateSystemSettingsResult> {
  const raw = await callAdminFn<FnOk<UpdateSystemSettingsResult> | FnErr>(
    "admin_update_system_settings",
    input
  );

  if (isFnOk<UpdateSystemSettingsResult>(raw)) return raw.data;
  if (isFnErr(raw)) throw new Error(raw.detail ?? raw.error);
  throw new Error("Unexpected response shape from admin_update_system_settings");
}


//-------------------   para configuracion de servidor -----------------------/

export type ConfigChangeSaasRow = {
  id: string;
  created_at: string;
  actor_user_id: string;
  actor_email: string | null;
  action: string;
  diff: Record<string, { before: any; after: any }>;
  ip: string | null;
  user_agent: string | null;

  // específicos SaaS (opcional, pero útiles)
  settings_before?: any;
  settings_after?: any;
};


export type ListConfigChangesInput = {
  q?: string | null;
  from?: string | null; // yyyy-mm-dd
  to?: string | null;   // yyyy-mm-dd
  limit?: number | null;
  offset?: number | null;
};

 

export type ListConfigChangesSaasResult = {
  rows: ConfigChangeSaasRow[];
  total: number;
  limit: number;
  offset: number;
};

export async function admin_list_config_changes_saas(
  input: ListConfigChangesInput
): Promise<ListConfigChangesSaasResult> {
  const res = await callAdminFn<FnOk<ListConfigChangesSaasResult> | FnErr>(
    "admin_list_config_changes_saas",
    {
      q: input.q ?? "",
      from: input.from ?? "",
      to: input.to ?? "",
      limit: input.limit ?? 25,
      offset: input.offset ?? 0,
    }
  );

  if (!res?.ok) {
    throw new Error((res as any)?.detail ?? (res as any)?.error ?? "Error listando cambios SaaS");
  }

  return (res as FnOk<ListConfigChangesSaasResult>).data;
}

// =======================
// Admin Stats (Edge)
// =======================
export type AdminStatsOverview = {
  customers_activos: number;
  activos_por_plan: Array<{ plan_name: string; plan_code: string | null; total: number }>;
  nuevos_clientes_30d: number;
  alertas_por_severidad_30d: Array<{ severity: string; total: number }>;
  solicitudes_por_estado_30d: Array<{ status: string; total: number }>;
  solicitudes_ultimas_24h: number;
  tokens_activos: number;
  tokens_30d: number;
  consultas_diarias_30d: Array<{ day: string; total: number }>;
  tendencia_consultas: { last_30: number | null; prev_30: number | null; pct_change: number | null };
};

export async function admin_stats_overview(): Promise<AdminStatsOverview> {
  const raw = await callAdminFn<{ ok: true; data: AdminStatsOverview } | { ok: false; error: string }>(
    "admin_stats_overview",
    {}
  );
  if ((raw as any)?.ok !== true) throw new Error((raw as any)?.error ?? "Error cargando estadísticas");
  return (raw as any).data as AdminStatsOverview;
}


export async function fetch_admin_stats_overview(range: "7d" | "30d" = "30d") {
  // usa tu callAdminFn (ya authed + bearer) porque es admin-only
  const raw = await callAdminFn<FnOk<AdminStatsOverview> | FnErr>("admin_stats_overview", { range });

  if (isFnOk<AdminStatsOverview>(raw)) return raw.data;
  if (isFnErr(raw)) throw new Error(raw.detail ?? raw.error);
  throw new Error("Unexpected response shape from admin_stats_overview");
}
