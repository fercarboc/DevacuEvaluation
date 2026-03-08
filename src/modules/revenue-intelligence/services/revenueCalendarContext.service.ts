import { supabase } from "@/services/supabaseClient";

export type RevenueCalendarContextRow = {
  org_id: string;
  property_id: string;
  calendar_date: string;
  source_type: "SEASON" | "EVENT";
  source_id: string;
  name: string;
  item_type: string;
  color: string;
  priority: number;
  impact_level: "LOW" | "MEDIUM" | "HIGH" | null;

  pricing_operation: "INCREASE" | "DECREASE" | "SET" | null;
  pricing_adjustment_type: "PERCENT" | "FIXED" | null;
  pricing_adjustment_value: number | null;
};

export async function getRevenueCalendarContext(params: {
  propertyId: string;
  from: string;
  to: string;
}): Promise<RevenueCalendarContextRow[]> {
  const { propertyId, from, to } = params;

  const { data, error } = await (supabase as any)
    .from("debacu_eval_property_calendar_context_v")
   .select(
  `
  org_id,
  property_id,
  calendar_date,
  source_type,
  source_id,
  name,
  item_type,
  color,
  priority,
  impact_level,
  pricing_operation,
  pricing_adjustment_type,
  pricing_adjustment_value
`
)
    .eq("property_id", propertyId)
    .gte("calendar_date", from)
    .lte("calendar_date", to)
    .order("calendar_date", { ascending: true });

  if (error) {
    throw new Error(error.message || "No se pudo cargar el contexto del calendario");
  }

  return (data ?? []) as RevenueCalendarContextRow[];
}