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

export async function list_audit_events() {
  const { data, error } = await supabase
    .from("subscription_events")
    .select("*")
    .eq("app_id", APP_CODE)
    .order("created_at", { ascending: false })
    .limit(50);

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
