 // src/services/revenueService.ts
import { callEvalFn } from "@/services/callEvalFn";

export type PeriodField = "evaluation_date" | "created_at";
export type ChannelGroup = "OTA" | "DIRECTO" | "B2B" | "OTROS";

export type RevenueChannelRow = {
  channel_group: ChannelGroup;
  platform_key: string;

  total_records: number;

  risk_high: number;
  risk_medium: number;
  risk_low: number;

  pct_high: number;
  pct_medium: number;
  pct_low: number;

  gross_total: number;
  recovered_total: number;
  net_total: number;

  pct_net_share: number;
};

// ✅ Shape real (según tu response de Network)
export type RevenueChannelsRespV2 =
  | {
      ok: true;
      data: {
        meta: {
          app_id: string;
          org_id: string;
          customer_id: string;
          period_from: string;
          period_to: string;
          period_field: PeriodField;
          total_fetched: number;
        };
        rows: RevenueChannelRow[];
      };
    }
  | { ok: false; error: string; detail?: string };

// ✅ Shape legacy (por compat si lo cambiaste antes)
export type RevenueChannelsRespV1 =
  | {
      ok: true;
      period_from: string;
      period_to: string;
      period_field: PeriodField;
      total_fetched: number;
      rows: RevenueChannelRow[];
    }
  | { ok: false; error: string; detail?: string };

export type RevenueChannelsResp = RevenueChannelsRespV1 | RevenueChannelsRespV2;

export async function customerRevenueChannelsGet(params: {
  period_from: string; // YYYY-MM-DD
  period_to: string; // YYYY-MM-DD
  period_field: PeriodField;
}) {
  const resp = await callEvalFn<RevenueChannelsResp>("customer_revenue_channels_get", params);

  if (!resp?.ok) {
    throw new Error((resp as any)?.detail ?? (resp as any)?.error ?? "UNKNOWN");
  }

  // ✅ normaliza: rows siempre arriba
  const rows = (resp as any).rows ?? (resp as any).data?.rows ?? [];
  const meta = (resp as any).data?.meta ?? {
    period_from: (resp as any).period_from,
    period_to: (resp as any).period_to,
    period_field: (resp as any).period_field,
    total_fetched: (resp as any).total_fetched,
  };

  return { ok: true as const, rows, meta };
}

export async function customerDashboardKpisGet(params?: { months_back?: number }) {
  return await callEvalFn("debacu_eval_customer_dashboard_kpis_get", {
    months_back: params?.months_back ?? 6,
  });
}

export type RevenueMonthSummary = {
  month: string; // YYYY-MM
  impact: {
    incidents_count: number;
    gross_loss: number;
    recovered: number;
    net_loss: number;
  };
  by_platform: Array<{ platform: string; incidents: number; net_loss: number }>;
  trends: { last_6_months: Array<{ month: string; net_loss: number }> };
};

/**
 * getRevenueMonthSummary
 *
 * @param property_id  ID de propiedad para filtrar (opcional).
 *   Si se omite, devuelve el resumen agregado de toda la organización.
 *
 * ⚠️ PENDIENTE BACKEND: la Edge Function `debacu_eval_dashboard_revenue_month`
 *   debe aceptar y aplicar el parámetro `property_id` cuando se envíe.
 */
export async function getRevenueMonthSummary(
  property_id?: string | null
): Promise<RevenueMonthSummary> {
  const payload: Record<string, unknown> = {};
  if (property_id) payload.property_id = property_id;

  const res = await callEvalFn<any>("debacu_eval_dashboard_revenue_month", payload);
  if (!res?.ok) throw new Error(res?.detail || res?.error || "revenue_month_summary_failed");
  return res.data as RevenueMonthSummary;
}
