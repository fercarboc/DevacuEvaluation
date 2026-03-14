import { supabase } from "@/services/supabaseClient";

const sb: any = supabase;

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
  const response = await sb
    .from("debacu_eval_property_seasons")
    .insert({
      org_id: input.org_id,
      property_id: input.property_id,
      name: input.name,
      season_type: input.season_type ?? null,
      start_date: input.start_date,
      end_date: input.end_date,
      color: input.color ?? "#3B82F6",
      priority: input.priority ?? 100,
      impact_level: input.impact_level ?? "MEDIUM",
      note: input.note ?? null,
      is_active: input.is_active ?? true,
      pricing_operation: input.pricing_operation ?? null,
      pricing_adjustment_type: input.pricing_adjustment_type ?? null,
      pricing_adjustment_value: input.pricing_adjustment_value ?? null,
    })
    .select(SELECT_FIELDS)
    .single();

  if (response.error) throw response.error;

  return mapRow(response.data as RevenueSeasonRow);
}

export async function updateSeason(input: UpdateSeasonInput): Promise<RevenueSeason> {
  const payload: Record<string, unknown> = {};

  if (input.org_id !== undefined) payload.org_id = input.org_id;
  if (input.property_id !== undefined) payload.property_id = input.property_id;
  if (input.name !== undefined) payload.name = input.name;
  if (input.season_type !== undefined) payload.season_type = input.season_type;
  if (input.start_date !== undefined) payload.start_date = input.start_date;
  if (input.end_date !== undefined) payload.end_date = input.end_date;
  if (input.color !== undefined) payload.color = input.color;
  if (input.priority !== undefined) payload.priority = input.priority;
  if (input.impact_level !== undefined) payload.impact_level = input.impact_level;
  if (input.note !== undefined) payload.note = input.note;
  if (input.is_active !== undefined) payload.is_active = input.is_active;
  if (input.pricing_operation !== undefined) payload.pricing_operation = input.pricing_operation;
  if (input.pricing_adjustment_type !== undefined) {
    payload.pricing_adjustment_type = input.pricing_adjustment_type;
  }
  if (input.pricing_adjustment_value !== undefined) {
    payload.pricing_adjustment_value = input.pricing_adjustment_value;
  }

  const response = await sb
    .from("debacu_eval_property_seasons")
    .update(payload)
    .eq("id", input.id)
    .select(SELECT_FIELDS)
    .single();

  if (response.error) throw response.error;

  return mapRow(response.data as RevenueSeasonRow);
}

export async function deleteSeason(id: string): Promise<void> {
  const response = await sb
    .from("debacu_eval_property_seasons")
    .update({ is_active: false })
    .eq("id", id);

  if (response.error) throw response.error;
}
