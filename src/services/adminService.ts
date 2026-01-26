import { supabase } from "@/services/supabaseClient";
import type { Database } from "@/types/database";

const APP_CODE = "DEBACU_EVAL";

export type DashboardMetrics = {
  clientes_activos: number;
  solicitudes_pendientes: number;
  consultas_hoy: number;
  alertas_activas: number;
};

export async function fetch_dashboard_metrics(): Promise<DashboardMetrics> {
  const [{ data: clientesData, count: clientesCount }, { data: solicitudesData }] =
    await Promise.all([
      supabase.from("customers").select("id", { count: "exact" }),
      supabase
        .from("debacu_eval_access_requests")
        .select("id")
        .eq("status", "PENDING"),
    ]);

  return {
    clientes_activos: clientesCount ?? clientesData?.length ?? 0,
    solicitudes_pendientes: solicitudesData?.length ?? 0,
    consultas_hoy: 42, // TODO: conectar con métricas reales
    alertas_activas: 3, // TODO: conectar con monitorizaciones reales
  };
}

export async function list_clients() {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, email, plan_id, billing_frequency, created_at")
    .limit(200);

  if (error) throw error;
  return data ?? [];
}

export async function list_plans() {
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("app_id", APP_CODE)
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function list_invoices() {
  const { data, error } = await supabase
    .from("debacu_eval_invoices")
    .select("*")
    .eq("app_id", APP_CODE)
    .order("invoice_created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return data ?? [];
}



export async function admin_list_customers(q: string) {
  const sb = supabase as any;
  const { data, error } = await sb.rpc("admin_list_customers", {
    p_q: q || null,
    p_limit: 20,
  });
  if (error) throw error;
  return data ?? [];
}

export async function admin_list_audit_events(params?: {
  source?: "ALL" | "PRODUCT" | "SYSTEM";
  customer?: string | null; // id o email
  type?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
  offset?: number;
}) {
  const sb = supabase as any;
  const { data, error } = await sb.rpc("admin_list_audit_events", {
    p_source: params?.source ?? "ALL",
    p_customer: params?.customer ?? null,
    p_type: params?.type ?? null,
    p_from: params?.from ?? null,
    p_to: params?.to ?? null,
    p_limit: params?.limit ?? 200,
    p_offset: params?.offset ?? 0,
  });
  if (error) throw error;
  return data ?? [];
}




 
export async function list_audit_types(source: "ALL"|"PRODUCT"|"SYSTEM") {
  const sb = supabase as any;
  const { data, error } = await sb.rpc("admin_list_audit_types", { p_source: source });
  if (error) throw error;
  return (data ?? []).map((x: any) => x.type as string);
}

 

export async function list_audit_events(params?: {
  source?: "ALL" | "PRODUCT" | "SYSTEM";
  customer?: string | null;
  type?: string | null;
  from?: string | null; // ISO
  to?: string | null;   // ISO
  limit?: number;
  offset?: number;
}) {
  const sb = supabase as any; // ✅ evita el "never" de TS

  const { data, error } = await sb.rpc("admin_list_audit_events", {
    p_source: params?.source ?? "ALL",
    p_customer: params?.customer ?? null,
    p_type: params?.type ?? null,
    p_from: params?.from ?? null,
    p_to: params?.to ?? null,
    p_limit: params?.limit ?? 200,
    p_offset: params?.offset ?? 0,
  });

  if (error) throw error;
  return data ?? [];
}



export async function list_abuse_alerts() {
  return [
    { id: "alert-1", customer_id: "CUST-101", reason: "Uso elevado", created_at: new Date().toISOString() },
    { id: "alert-2", customer_id: "CUST-404", reason: "Intentos fallidos", created_at: new Date().toISOString() },
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

export type AuditExportFormat = "CSV" | "PDF" | "XML";

export async function export_audit_events(payload: {
  format: AuditExportFormat;
  source: "ALL" | "PRODUCT" | "SYSTEM";
  customer: string | null;
  type: string | null;
  from: string | null; // ISO
  to: string | null;   // ISO

  delivered_to_name: string;
  delivered_to_org?: string | null;
  delivered_to_reason: string;
  delivered_to_reference?: string | null;
}) {
  const { data, error } = await supabase.functions.invoke(
    "debacu_eval_audit_export",
    { body: payload }
  );
  if (error) throw error;
  return data;
}



export async function list_audit_exports(params?: {
  q?: string | null;
  customer?: string | null;
  from?: string | null;   // yyyy-mm-dd
  to?: string | null;     // yyyy-mm-dd
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

// ✅ V2: listado con contador de descargas
export async function list_audit_exports_v2(params?: {
  q?: string | null;
  customer?: string | null;
  from?: string | null;   // yyyy-mm-dd
  to?: string | null;     // yyyy-mm-dd
  format?: "CSV" | "PDF" | "XML" | null;
  limit?: number;
  offset?: number;
}) {
  const sb = supabase as any;

  const { data, error } = await sb.rpc("admin_list_audit_exports_v2", {
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

// ✅ Detalle: descargas de un export (para el drawer)
export async function list_audit_export_downloads(
  exportId: string,
  limit = 200,
  offset = 0
) {
  const sb = supabase as any;

  const { data, error } = await sb.rpc("admin_list_audit_export_downloads", {
    p_export_id: exportId,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) throw error;
  return data ?? [];
}
