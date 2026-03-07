import { supabase } from "@/services/supabaseClient";

export type RevenuePropertyRow = {
  id: string;
  org_id: string;
  code: string;
  name: string;
  category: number | null;
  address: string | null;
  city: string | null;
  country: string | null;
  timezone: string | null;
  is_active: boolean;
};

export type RevenueProperty = {
  id: string;
  orgId: string;
  code: string;
  name: string;
  category: number | null;
  address: string | null;
  city: string | null;
  country: string | null;
  timezone: string | null;
  isActive: boolean;
};

export type CreatePropertyInput = {
  org_id?: string | null; // opcional, tu UI puede no mandarlo
  code: string;
  name: string;
  category?: number | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  timezone?: string | null;
};

export type UpdatePropertyInput = {
  org_id?: string | null;
  id: string;
  code: string;
  name: string;
  category?: number | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  timezone?: string | null;
};

export type TogglePropertyInput = {
  org_id?: string | null;
  id: string;
  is_active: boolean;
};

export type DeletePropertyInput = {
  org_id?: string | null;
  id: string;
};

export type PropertiesManageResponse = {
  ok: boolean;
  data?: RevenueProperty;
  error?: string;
  detail?: string;
  meta?: {
    orgId: string;
    planCode: string | null;
    maxProperties: number | null;
    usedProperties: number;
  };
};

function mapRow(row: RevenuePropertyRow): RevenueProperty {
  return {
    id: row.id,
    orgId: row.org_id,
    code: row.code,
    name: row.name,
    category: row.category,
    address: row.address,
    city: row.city,
    country: row.country,
    timezone: row.timezone,
    isActive: row.is_active,
  };
}

export async function getProperties(orgId?: string | null): Promise<RevenueProperty[]> {
  let query = supabase
    .from("debacu_eval_properties")
    .select("id, org_id, code, name, category, address, city, country, timezone, is_active")
    .order("name", { ascending: true });

  if (orgId) {
    query = query.eq("org_id", orgId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function createProperty(input: CreatePropertyInput) {
  const { data, error } = await supabase.functions.invoke<PropertiesManageResponse>(
    "debacu_eval_revenue_properties_manage",
    {
      body: {
        action: "CREATE",
        ...input,
      },
    },
  );

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.detail || data?.error || "create_property_failed");
  return data;
}

export async function updateProperty(input: UpdatePropertyInput) {
  const { data, error } = await supabase.functions.invoke<PropertiesManageResponse>(
    "debacu_eval_revenue_properties_manage",
    {
      body: {
        action: "UPDATE",
        ...input,
      },
    },
  );

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.detail || data?.error || "update_property_failed");
  return data;
}

export async function togglePropertyActive(input: TogglePropertyInput) {
  const { data, error } = await supabase.functions.invoke<PropertiesManageResponse>(
    "debacu_eval_revenue_properties_manage",
    {
      body: {
        action: "TOGGLE_ACTIVE",
        ...input,
      },
    },
  );

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.detail || data?.error || "toggle_property_failed");
  return data;
}

export async function deleteProperty(input: DeletePropertyInput) {
  const { data, error } = await supabase.functions.invoke<PropertiesManageResponse>(
    "debacu_eval_revenue_properties_manage",
    {
      body: {
        action: "DELETE",
        ...input,
      },
    },
  );

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.detail || data?.error || "delete_property_failed");
  return data;
}