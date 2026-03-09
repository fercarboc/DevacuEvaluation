import { callEvalFn } from "@/services/callEvalFn";

export type RevenueDayBreakdownTotals = {
  roomsSold: number;
  revenue: number;
  adr: number;
};

export type RevenueDayBreakdownRow = {
  channel: string;
  segment: string;
  roomsSold: number;
  revenue: number;
  adr: number;
};

export type RevenueDayBreakdown = {
  totals: RevenueDayBreakdownTotals;
  rows: RevenueDayBreakdownRow[];
};

type RevenueDayBreakdownFnResponse = {
  ok: boolean;
  date?: string;
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
    totals?: {
      roomsSold?: number;
      revenue?: number;
      adr?: number;
    };
    rows?: Array<{
      channel?: string;
      segment?: string;
      roomsSold?: number;
      revenue?: number;
      adr?: number;
    }>;
  };
};

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const EMPTY_DATA: RevenueDayBreakdown = {
  totals: {
    roomsSold: 0,
    revenue: 0,
    adr: 0,
  },
  rows: [],
};

export async function getRevenueDayBreakdown(params: {
  orgId: string;
  propertyId: string;
  date: string;
}): Promise<RevenueDayBreakdown> {
  const response = (await callEvalFn("revenue_day_breakdown", {
    orgId: params.orgId,
    propertyId: params.propertyId,
    date: params.date,
  })) as RevenueDayBreakdownFnResponse;

  const totals = response?.data?.totals;
  const rows = response?.data?.rows;

  return {
    totals: {
      roomsSold: toNumber(totals?.roomsSold),
      revenue: toNumber(totals?.revenue),
      adr: toNumber(totals?.adr),
    },
    rows: Array.isArray(rows)
      ? rows.map((row) => ({
          channel: String(row?.channel ?? "SIN_CANAL"),
          segment: String(row?.segment ?? "SIN_SEGMENTO"),
          roomsSold: toNumber(row?.roomsSold),
          revenue: toNumber(row?.revenue),
          adr: toNumber(row?.adr),
        }))
      : EMPTY_DATA.rows,
  };
}