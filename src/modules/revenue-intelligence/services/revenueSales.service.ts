import { supabase } from "@/services/supabaseClient";

const sb: any = supabase;

export type RevenueSale = {
  id: string
  org_id: string
  property_id: string
  room_type_id: string
  stay_date: string
  reservation_id?: string
  price_sold: number
  channel?: string
}

export async function getRevenueSales(
  orgId: string,
  from: string,
  to: string
) {
  const { data, error } = await sb
    .from("debacu_eval_revenue_sales")
    .select("*")
    .eq("org_id", orgId)
    .gte("stay_date", from)
    .lte("stay_date", to)

  if (error) throw error
  return data
}