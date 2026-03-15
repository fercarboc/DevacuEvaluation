import { supabase } from "@/services/supabaseClient";

const sb: any = supabase;

async function invokeEventsManage(body: Record<string, unknown>) {
  const { data, error } = await sb.functions.invoke("debacu_eval_revenue_events_manage", { body });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "events_manage_failed");
  return data;
}

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
  org_id: string;
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
  org_id?: string;
  property_id?: string;
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
  const result = await invokeEventsManage({ action: "CREATE", ...input });
  return mapRow(result.data as RevenueEventRow);
}

export async function updateEvent(input: UpdateEventInput): Promise<RevenueEvent> {
  const result = await invokeEventsManage({ action: "UPDATE", ...input });
  return mapRow(result.data as RevenueEventRow);
}

export async function deleteEvent(id: string): Promise<void> {
  await invokeEventsManage({ action: "DELETE", id });
}
