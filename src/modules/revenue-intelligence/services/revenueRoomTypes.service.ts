import { supabase } from "@/services/supabaseClient";

const sb: any = supabase;

export type RevenueRoomTypeRow = {
  id: string;
  org_id: string;
  property_id: string;
  code: string;
  name: string;
  capacity: number | null;
  rooms_count: number | null;
  base_price: number | null;
  is_active: boolean;
};

export type RevenueRoomType = {
  id: string;
  orgId: string;
  propertyId: string;
  code: string;
  name: string;
  capacity: number | null;
  roomsCount: number | null;
  basePrice: number | null;
  isActive: boolean;
};

export type CreateRoomTypeInput = {
  property_id: string;
  code: string;
  name: string;
  capacity?: number | null;
  rooms_count?: number | null;
  base_price?: number | null;
  is_active?: boolean;
};

export type UpdateRoomTypeInput = {
  id: string;
  code: string;
  name: string;
  capacity?: number | null;
  rooms_count?: number | null;
  base_price?: number | null;
  is_active?: boolean;
};

export type ToggleRoomTypeInput = {
  id: string;
  is_active: boolean;
};

export type DeleteRoomTypeInput = {
  id: string;
};

export type RoomTypesManageResponse = {
  ok: boolean;
  data?: RevenueRoomType;
  error?: string;
  detail?: string;
  meta?: {
    orgId: string;
    propertyId: string;
  };
};

function mapRow(row: RevenueRoomTypeRow): RevenueRoomType {
  return {
    id: row.id,
    orgId: row.org_id,
    propertyId: row.property_id,
    code: row.code,
    name: row.name,
    capacity: row.capacity,
    roomsCount: row.rooms_count,
    basePrice: row.base_price,
    isActive: row.is_active,
  };
}

export async function getRoomTypes(propertyId: string): Promise<RevenueRoomType[]> {
  const response = await sb
    .from("debacu_eval_property_room_types")
    .select("id, org_id, property_id, code, name, capacity, rooms_count, base_price, is_active")
    .eq("property_id", propertyId)
    .order("name", { ascending: true });

  if (response.error) throw response.error;

  const rows = (response.data ?? []) as RevenueRoomTypeRow[];
  return rows.map(mapRow);
}

export async function createRoomType(input: CreateRoomTypeInput) {
  const { data, error } = await sb.functions.invoke(
    "debacu_eval_revenue_room_types_manage",
    {
      body: {
        action: "CREATE",
        ...input,
      },
    }
  );

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.detail || data?.error || "create_room_type_failed");
  return data as RoomTypesManageResponse;
}

export async function updateRoomType(input: UpdateRoomTypeInput) {
  const { data, error } = await sb.functions.invoke(
    "debacu_eval_revenue_room_types_manage",
    {
      body: {
        action: "UPDATE",
        ...input,
      },
    }
  );

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.detail || data?.error || "update_room_type_failed");
  return data as RoomTypesManageResponse;
}

export async function toggleRoomTypeActive(input: ToggleRoomTypeInput) {
  const { data, error } = await sb.functions.invoke(
    "debacu_eval_revenue_room_types_manage",
    {
      body: {
        action: "TOGGLE_ACTIVE",
        ...input,
      },
    }
  );

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.detail || data?.error || "toggle_room_type_failed");
  return data as RoomTypesManageResponse;
}

export async function deleteRoomType(input: DeleteRoomTypeInput) {
  const { data, error } = await sb.functions.invoke(
    "debacu_eval_revenue_room_types_manage",
    {
      body: {
        action: "DELETE",
        ...input,
      },
    }
  );

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.detail || data?.error || "delete_room_type_failed");
  return data as RoomTypesManageResponse;
}