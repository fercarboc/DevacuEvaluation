import { supabase } from "@/services/supabaseClient";

const sb: any = supabase;

export type PricingOperation = "INCREASE" | "DECREASE" | "SET";
export type PricingAdjustmentType = "PERCENT" | "FIXED";
export type ImpactLevel = "LOW" | "MEDIUM" | "HIGH";

export type RevenueEventRow = {
  id: string;
  org_id: string;
  property_id: string;
  name: string;
  event_type: string;
  start_date: string;
  end_date: string;
  color: string;
  priority: number;
  impact_level: ImpactLevel;
  note: string | null;
  is_active: boolean;
  pricing_operation: PricingOperation | null;
  pricing_adjustment_type: PricingAdjustmentType | null;
  pricing_adjustment_value: number | null;
};

export type RevenueEvent = {
  id: string;
  orgId: string;
  propertyId: string;
  name: string;
  eventType: string;
  startDate: string;
  endDate: string;
  color: string;
  priority: number;
  impactLevel: ImpactLevel;
  note: string | null;
  isActive: boolean;
  pricingOperation: PricingOperation | null;
  pricingAdjustmentType: PricingAdjustmentType | null;
  pricingAdjustmentValue: number | null;
};

export type CreateEventInput = {
  property_id: string;
  name: string;
  event_type: string;
  start_date: string;
  end_date: string;
  color?: string;
  priority?: number;
  impact_level?: ImpactLevel;
  note?: string | null;
  is_active?: boolean;
  pricing_operation?: PricingOperation | null;
  pricing_adjustment_type?: PricingAdjustmentType | null;
  pricing_adjustment_value?: number | null;
};

export type UpdateEventInput = {
  id: string;
  name?: string;
  event_type?: string;
  start_date?: string;
  end_date?: string;
  color?: string;
  priority?: number;
  impact_level?: ImpactLevel;
  note?: string | null;
  is_active?: boolean;
  pricing_operation?: PricingOperation | null;
  pricing_adjustment_type?: PricingAdjustmentType | null;
  pricing_adjustment_value?: number | null;
};

function mapRow(row: RevenueEventRow): RevenueEvent {
  return {
    id: row.id,
    orgId: row.org_id,
    propertyId: row.property_id,
    name: row.name,
    eventType: row.event_type,
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
  event_type,
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

export async function getEvents(propertyId: string): Promise<RevenueEvent[]> {
  const response = await sb
    .from("debacu_eval_revenue_events")
    .select(SELECT_FIELDS)
    .eq("property_id", propertyId)
    .eq("is_active", true)
    .order("start_date", { ascending: true });

  if (response.error) throw response.error;

  const rows = (response.data ?? []) as RevenueEventRow[];
  return rows.map(mapRow);
}

export async function createEvent(input: CreateEventInput): Promise<RevenueEvent> {
  const response = await sb
    .from("debacu_eval_revenue_events")
    .insert({
      property_id: input.property_id,
      name: input.name,
      event_type: input.event_type,
      start_date: input.start_date,
      end_date: input.end_date,
      color: input.color ?? "#10B981",
      priority: input.priority ?? 200,
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

  return mapRow(response.data as RevenueEventRow);
}

export async function updateEvent(input: UpdateEventInput): Promise<RevenueEvent> {
  const payload: Record<string, unknown> = {};

  if (input.name !== undefined) payload.name = input.name;
  if (input.event_type !== undefined) payload.event_type = input.event_type;
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
    .from("debacu_eval_revenue_events")
    .update(payload)
    .eq("id", input.id)
    .select(SELECT_FIELDS)
    .single();

  if (response.error) throw response.error;

  return mapRow(response.data as RevenueEventRow);
}

export async function deleteEvent(id: string): Promise<void> {
  const response = await sb
    .from("debacu_eval_revenue_events")
    .update({ is_active: false })
    .eq("id", id);

  if (response.error) throw response.error;
}