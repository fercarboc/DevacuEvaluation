import { callEvalFn } from "@/services/callEvalFn";

export type RevenueMonthlyProperty = {
  id: string;
  name: string;
  roomsCount: number;
};

export type RevenueMonthlyTotals = {
  occ: number;
  rn: number;
  adr: number;
  revenue: number;
  revpar: number;
  days: number;
  months: number;
};

export type RevenueMonthlyRow = {
  month: string;
  monthKey?: string;
  label?: string;
  occ: number;
  rn: number;
  adr: number;
  revenue: number;
  revpar: number;
  days: number;
};

export type RevenueMonthlyComparisonRow = {
  monthKey: string;
  label: string;
  current: RevenueMonthlyRow;
  compare: RevenueMonthlyRow;
  delta: {
    revenueAbs: number;
    revenuePct: number;
    adrAbs: number;
    adrPct: number;
    revparAbs: number;
    revparPct: number;
    occAbs: number;
    occPct: number;
    rnAbs: number;
    rnPct: number;
  };
};

export type RevenueMonthlySummary = {
  property: RevenueMonthlyProperty | null;
  totals: RevenueMonthlyTotals;
  months: RevenueMonthlyRow[];
  compareTotals: RevenueMonthlyTotals | null;
  compareMonths: RevenueMonthlyRow[];
  comparisonRows: RevenueMonthlyComparisonRow[];
};

type RevenueMonthlyFnResponse = {
  ok: boolean;
  data?: {
    property?: {
      id?: string;
      name?: string;
      roomsCount?: number;
    } | null;
    totals?: {
      occ?: number;
      rn?: number;
      adr?: number;
      revenue?: number;
      revpar?: number;
      days?: number;
      months?: number;
    };
    months?: Array<{
      month?: string;
      monthKey?: string;
      label?: string;
      occ?: number;
      rn?: number;
      adr?: number;
      revenue?: number;
      revpar?: number;
      days?: number;
    }>;
    compareTotals?: {
      occ?: number;
      rn?: number;
      adr?: number;
      revenue?: number;
      revpar?: number;
      days?: number;
      months?: number;
    } | null;
    compareMonths?: Array<{
      month?: string;
      monthKey?: string;
      label?: string;
      occ?: number;
      rn?: number;
      adr?: number;
      revenue?: number;
      revpar?: number;
      days?: number;
    }>;
    comparisonRows?: Array<{
      monthKey?: string;
      label?: string;
      current?: {
        month?: string;
        monthKey?: string;
        label?: string;
        occ?: number;
        rn?: number;
        adr?: number;
        revenue?: number;
        revpar?: number;
        days?: number;
      };
      compare?: {
        month?: string;
        monthKey?: string;
        label?: string;
        occ?: number;
        rn?: number;
        adr?: number;
        revenue?: number;
        revpar?: number;
        days?: number;
      };
      delta?: {
        revenueAbs?: number;
        revenuePct?: number;
        adrAbs?: number;
        adrPct?: number;
        revparAbs?: number;
        revparPct?: number;
        occAbs?: number;
        occPct?: number;
        rnAbs?: number;
        rnPct?: number;
      };
    }>;
  };
};

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const EMPTY_TOTALS: RevenueMonthlyTotals = {
  occ: 0,
  rn: 0,
  adr: 0,
  revenue: 0,
  revpar: 0,
  days: 0,
  months: 0,
};

const EMPTY_DATA: RevenueMonthlySummary = {
  property: null,
  totals: EMPTY_TOTALS,
  months: [],
  compareTotals: null,
  compareMonths: [],
  comparisonRows: [],
};

function mapRow(row: any): RevenueMonthlyRow {
  return {
    month: String(row?.month ?? ""),
    monthKey: row?.monthKey ? String(row.monthKey) : undefined,
    label: row?.label ? String(row.label) : undefined,
    occ: toNumber(row?.occ),
    rn: toNumber(row?.rn),
    adr: toNumber(row?.adr),
    revenue: toNumber(row?.revenue),
    revpar: toNumber(row?.revpar),
    days: toNumber(row?.days),
  };
}

function mapTotals(totals: any): RevenueMonthlyTotals {
  return {
    occ: toNumber(totals?.occ),
    rn: toNumber(totals?.rn),
    adr: toNumber(totals?.adr),
    revenue: toNumber(totals?.revenue),
    revpar: toNumber(totals?.revpar),
    days: toNumber(totals?.days),
    months: toNumber(totals?.months),
  };
}

export async function getRevenueMonthlySummary(params: {
  orgId: string;
  propertyId: string;
  from: string;
  to: string;
  compareFrom?: string;
  compareTo?: string;
}): Promise<RevenueMonthlySummary> {
  const response = (await callEvalFn("revenue_monthly_summary", {
    orgId: params.orgId,
    propertyId: params.propertyId,
    from: params.from,
    to: params.to,
    compare_from: params.compareFrom,
    compare_to: params.compareTo,
  })) as RevenueMonthlyFnResponse;

  const property = response?.data?.property;
  const totals = response?.data?.totals;
  const months = response?.data?.months;
  const compareTotals = response?.data?.compareTotals;
  const compareMonths = response?.data?.compareMonths;
  const comparisonRows = response?.data?.comparisonRows;

  return {
    property: property?.id
      ? {
          id: String(property.id),
          name: String(property.name ?? "Sin nombre"),
          roomsCount: toNumber(property.roomsCount),
        }
      : null,

    totals: mapTotals(totals),

    months: Array.isArray(months) ? months.map(mapRow) : [],

    compareTotals: compareTotals ? mapTotals(compareTotals) : null,

    compareMonths: Array.isArray(compareMonths) ? compareMonths.map(mapRow) : [],

    comparisonRows: Array.isArray(comparisonRows)
      ? comparisonRows.map((row) => ({
          monthKey: String(row?.monthKey ?? ""),
          label: String(row?.label ?? ""),
          current: mapRow(row?.current),
          compare: mapRow(row?.compare),
          delta: {
            revenueAbs: toNumber(row?.delta?.revenueAbs),
            revenuePct: toNumber(row?.delta?.revenuePct),
            adrAbs: toNumber(row?.delta?.adrAbs),
            adrPct: toNumber(row?.delta?.adrPct),
            revparAbs: toNumber(row?.delta?.revparAbs),
            revparPct: toNumber(row?.delta?.revparPct),
            occAbs: toNumber(row?.delta?.occAbs),
            occPct: toNumber(row?.delta?.occPct),
            rnAbs: toNumber(row?.delta?.rnAbs),
            rnPct: toNumber(row?.delta?.rnPct),
          },
        }))
      : [],
  };
}