import { supabase } from "@/services/supabaseClient";

const sb: any = supabase;

export type RevenueSale = {
  id: string;
  org_id: string;
  property_id: string;
  room_type_id: string;
  stay_date: string;
  reservation_id?: string | null;
  price_sold: number;
  channel?: string | null;
};

export type RevenueChannelSummary = {
  channel: string;
  totalSales: number;
  totalRevenue: number;
  adr: number;
};

export async function getRevenueSales(
  orgId: string,
  from: string,
  to: string,
  propertyId?: string
): Promise<RevenueSale[]> {

  let query = sb
    .from("debacu_eval_revenue_sales")
    .select("*")
    .eq("org_id", orgId)
    .gte("stay_date", from)
    .lte("stay_date", to);

  if (propertyId) {
    query = query.eq("property_id", propertyId);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data ?? []) as RevenueSale[];
}

export async function getRevenueChannelSummary(
  orgId: string,
  from: string,
  to: string,
  propertyId?: string
): Promise<RevenueChannelSummary[]> {

  const sales = await getRevenueSales(orgId, from, to, propertyId);

  const grouped = new Map<string, { totalSales: number; totalRevenue: number }>();

  for (const row of sales) {

    const channel = row.channel?.trim() || "DIRECT";

    const current = grouped.get(channel) ?? {
      totalSales: 0,
      totalRevenue: 0
    };

    current.totalSales += 1;
    current.totalRevenue += Number(row.price_sold ?? 0);

    grouped.set(channel, current);
  }

  const result: RevenueChannelSummary[] = Array.from(grouped.entries())
    .map(([channel, value]) => ({
      channel,
      totalSales: value.totalSales,
      totalRevenue: value.totalRevenue,
      adr: value.totalSales > 0
        ? Number((value.totalRevenue / value.totalSales).toFixed(2))
        : 0
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  return result;
}