import { callEvalFn } from "@/services/callEvalFn";

export type RevenueDayEvent = {
  id: string;
  name: string;
  type: string;
  color?: string;
  priority?: number;
};

export type RevenueDayByDayProperty = {
  id: string;
  name: string;
  roomsCount: number;
};

export type RevenueDayByDayTotals = {
  occ: number;
  adr: number;
  revenue: number;
  revpar: number;
  roomsSold: number;
  days: number;
};

export type RevenueDayByDayRow = {
  date: string;
  occ: number;
  roomsSold: number;
  adr: number;
  revenue: number;
  revpar: number;
  pvp: number;
  event: RevenueDayEvent | null;
};

export type RevenueDayByDaySummary = {
  property: RevenueDayByDayProperty | null;
  totals: RevenueDayByDayTotals;
  daily: RevenueDayByDayRow[];
};

type RevenueDayByDayFnResponse = {
  ok: boolean;
  period_from?: string;
  period_to?: string;
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
    property?: {
      id?: string;
      name?: string;
      roomsCount?: number;
    } | null;
    totals?: {
      occ?: number;
      adr?: number;
      revenue?: number;
      revpar?: number;
      roomsSold?: number;
      days?: number;
    };
    daily?: Array<{
      date?: string;
      occ?: number;
      roomsSold?: number;
      adr?: number;
      revenue?: number;
      revpar?: number;
      pvp?: number;
      event?: {
        id?: string;
        name?: string;
        type?: string;
        color?: string;
        priority?: number;
      } | null;
    }>;
  };
};

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const EMPTY_DATA: RevenueDayByDaySummary = {
  property: null,
  totals: {
    occ: 0,
    adr: 0,
    revenue: 0,
    revpar: 0,
    roomsSold: 0,
    days: 0,
  },
  daily: [],
};

export async function getRevenueDayByDaySummary(params: {
  orgId: string;
  propertyId: string;
  from: string;
  to: string;
}): Promise<RevenueDayByDaySummary> {
  const response = (await callEvalFn("revenue_day_by_day_summary", {
    orgId: params.orgId,
    propertyId: params.propertyId,
    from: params.from,
    to: params.to,
  })) as RevenueDayByDayFnResponse;

  const property = response?.data?.property;
  const totals = response?.data?.totals;
  const daily = response?.data?.daily;

  return {
    property: property?.id
      ? {
          id: String(property.id),
          name: String(property.name ?? "Sin nombre"),
          roomsCount: toNumber(property.roomsCount),
        }
      : null,

    totals: {
      occ: toNumber(totals?.occ),
      adr: toNumber(totals?.adr),
      revenue: toNumber(totals?.revenue),
      revpar: toNumber(totals?.revpar),
      roomsSold: toNumber(totals?.roomsSold),
      days: toNumber(totals?.days),
    },

    daily: Array.isArray(daily)
      ? daily.map((row) => ({
          date: String(row?.date ?? ""),
          occ: toNumber(row?.occ),
          roomsSold: toNumber(row?.roomsSold),
          adr: toNumber(row?.adr),
          revenue: toNumber(row?.revenue),
          revpar: toNumber(row?.revpar),
          pvp: toNumber(row?.pvp),
          event: row?.event?.id
            ? {
                id: String(row.event.id),
                name: String(row.event.name ?? ""),
                type: String(row.event.type ?? "EVENTO"),
                color: row.event.color ? String(row.event.color) : undefined,
                priority: row.event.priority != null ? toNumber(row.event.priority) : undefined,
              }
            : null,
        }))
      : EMPTY_DATA.daily,
  };
}