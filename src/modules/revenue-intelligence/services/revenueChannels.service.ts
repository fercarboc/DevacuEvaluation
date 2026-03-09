import { callEvalFn } from "@/services/callEvalFn";

export type RevenueChannelRow = {
  channel: string;
  totalSales: number;
  totalRevenue: number;
  adr: number;
  share: number;
};

export type RevenueChannelsSummary = {
  summary: {
    totalRevenue: number;
    totalSales: number;
    adr: number;
    topChannel: string | null;
  };
  channels: RevenueChannelRow[];
};

type RevenueChannelsSummaryFnResponse = {
  ok: boolean;
  period_from: string;
  period_to: string;
  meta?: {
    app_id?: string;
    org_id?: string;
    org_id_resolved_by?: string;
    property_id?: string;
    customer_id?: string;
    plan_code?: string | null;
    subscription_status?: string | null;
    source_table?: string;
  };
  data?: {
    summary?: {
      totalRevenue?: number;
      totalSales?: number;
      adr?: number;
      topChannel?: string | null;
    };
    channels?: Array<{
      channel?: string;
      totalSales?: number;
      totalRevenue?: number;
      adr?: number;
      share?: number;
    }>;
  };
};

export async function getRevenueChannelsSummary(params: {
  orgId: string;
  propertyId: string;
  from: string;
  to: string;
}): Promise<RevenueChannelsSummary> {
  const response = (await callEvalFn("revenue_channels_summary", {
    orgId: params.orgId,
    propertyId: params.propertyId,
    from: params.from,
    to: params.to,
  })) as RevenueChannelsSummaryFnResponse;

  const summary = response?.data?.summary;
  const channels = response?.data?.channels;

  return {
    summary: {
      totalRevenue: Number(summary?.totalRevenue ?? 0),
      totalSales: Number(summary?.totalSales ?? 0),
      adr: Number(summary?.adr ?? 0),
      topChannel: summary?.topChannel ?? null,
    },
    channels: Array.isArray(channels)
      ? channels.map((row) => ({
          channel: String(row?.channel ?? "SIN_CANAL"),
          totalSales: Number(row?.totalSales ?? 0),
          totalRevenue: Number(row?.totalRevenue ?? 0),
          adr: Number(row?.adr ?? 0),
          share: Number(row?.share ?? 0),
        }))
      : [],
  };
}