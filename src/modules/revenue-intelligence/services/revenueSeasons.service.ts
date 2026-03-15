import { supabase } from "@/services/supabaseClient";

const sb: any = supabase;

async function invokeSeasonsManage(body: Record<string, unknown>) {
  const { data, error } = await sb.functions.invoke("debacu_eval_revenue_seasons_manage", { body });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "seasons_manage_failed");
  return data;
}

export type PricingOperation = "INCREASE" | "DECREASE" | "SET";
export type PricingAdjustmentType = "PERCENT" | "FIXED";
export type ImpactLevel = "LOW" | "MEDIUM" | "HIGH";

export type RevenueSeasonRow = {
  id: string;
  org_id: string;
  property_id: string;
  name: string;
  season_type: string | null;
  start_date: string;
  end_date: string;
  color: string;
  priority: number;
  impact_level: ImpactLevel | null;
  note: string | null;
  is_active: boolean;
  pricing_operation: PricingOperation | null;
  pricing_adjustment_type: PricingAdjustmentType | null;
  pricing_adjustment_value: number | null;
};

export type RevenueSeason = {
  id: string;
  orgId: string;
  propertyId: string;
  name: string;
  seasonType: string | null;
  startDate: string;
  endDate: string;
  color: string;
  priority: number;
  impactLevel: ImpactLevel | null;
  note: string | null;
  isActive: boolean;
  pricingOperation: PricingOperation | null;
  pricingAdjustmentType: PricingAdjustmentType | null;
  pricingAdjustmentValue: number | null;
};

export type CreateSeasonInput = {
  org_id: string;
  property_id: string;
  name: string;
  season_type?: string | null;
  start_date: string;
  end_date: string;
  color?: string;
  priority?: number;
  impact_level?: ImpactLevel | null;
  note?: string | null;
  is_active?: boolean;
  pricing_operation?: PricingOperation | null;
  pricing_adjustment_type?: PricingAdjustmentType | null;
  pricing_adjustment_value?: number | null;
};

export type UpdateSeasonInput = {
  id: string;
  org_id?: string;
  property_id?: string;
  name?: string;
  season_type?: string | null;
  start_date?: string;
  end_date?: string;
  color?: string;
  priority?: number;
  impact_level?: ImpactLevel | null;
  note?: string | null;
  is_active?: boolean;
  pricing_operation?: PricingOperation | null;
  pricing_adjustment_type?: PricingAdjustmentType | null;
  pricing_adjustment_value?: number | null;
};

function mapRow(row: RevenueSeasonRow): RevenueSeason {
  return {
    id: row.id,
    orgId: row.org_id,
    propertyId: row.property_id,
    name: row.name,
    seasonType: row.season_type,
    startDate: row.start_date,
    endDate: row.end_date,
    color: row.color,
    priority: row.priority,
    impactLevel: row.impact_level,
    note: row.note,
    isActive: row.is_active,
    pricingOperation: row.pricing_operation,
    pricingAdjustmentType: row.pricing_adjustment_type,
    pricingAdjustmentValue: row.pricing_adjustment_value,
  };
}

const SELECT_FIELDS = `
  id,
  org_id,
  property_id,
  name,
  season_type,
  start_date,
  end_date,
  color,
  priority,
  impact_level,
  note,
  is_active,
  pricing_operation,
  pricing_adjustment_type,
  pricing_adjustment_value
`;

export async function getSeasons(propertyId: string): Promise<RevenueSeason[]> {
  const response = await sb
    .from("debacu_eval_property_seasons")
    .select(SELECT_FIELDS)
    .eq("property_id", propertyId)
    .eq("is_active", true)
    .order("start_date", { ascending: true });

  if (response.error) throw response.error;

  const rows = (response.data ?? []) as RevenueSeasonRow[];
  return rows.map(mapRow);
}

export async function createSeason(input: CreateSeasonInput): Promise<RevenueSeason> {
  const result = await invokeSeasonsManage({ action: "CREATE", ...input });
  return mapRow(result.data as RevenueSeasonRow);
}

export async function updateSeason(input: UpdateSeasonInput): Promise<RevenueSeason> {
  const result = await invokeSeasonsManage({ action: "UPDATE", ...input });
  return mapRow(result.data as RevenueSeasonRow);
}

export async function deleteSeason(id: string): Promise<void> {
  await invokeSeasonsManage({ action: "DELETE", id });
}
