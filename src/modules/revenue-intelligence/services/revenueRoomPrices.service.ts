import { supabase } from "@/services/supabaseClient";

const sb: any = supabase;

export type RevenueRoomPriceRow = {
  id: string;
  org_id: string;
  property_id: string;
  room_type_id: string;
  date: string;
  price: number | null;
  min_stay: number | null;
  closed: boolean;
  created_at: string;
  updated_at: string;
};

export type RevenueRoomPrice = {
  id: string;
  orgId: string;
  propertyId: string;
  roomTypeId: string;
  date: string;
  price: number | null;
  minStay: number | null;
  closed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UpsertRoomPriceInput = {
  org_id: string;
  property_id: string;
  room_type_id: string;
  date: string;
  price?: number | null;
  min_stay?: number | null;
  closed?: boolean;
};

function mapRow(row: RevenueRoomPriceRow): RevenueRoomPrice {
  return {
    id: row.id,
    orgId: row.org_id,
    propertyId: row.property_id,
    roomTypeId: row.room_type_id,
    date: row.date,
    price: row.price,
    minStay: row.min_stay,
    closed: row.closed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getRoomPrices(
  propertyId: string,
  dateFrom: string,
  dateTo: string
): Promise<RevenueRoomPrice[]> {
  const response = await sb
    .from("debacu_eval_room_prices")
    .select(
      "id, org_id, property_id, room_type_id, date, price, min_stay, closed, created_at, updated_at"
    )
    .eq("property_id", propertyId)
    .gte("date", dateFrom)
    .lte("date", dateTo)
    .order("date", { ascending: true });

  if (response.error) throw response.error;

  const rows = (response.data ?? []) as RevenueRoomPriceRow[];
  return rows.map(mapRow);
}

export async function upsertRoomPrice(
  input: UpsertRoomPriceInput
): Promise<RevenueRoomPrice> {
  const payload = {
    org_id: input.org_id,
    property_id: input.property_id,
    room_type_id: input.room_type_id,
    date: input.date,
    price: input.price ?? 0,
    min_stay: input.min_stay ?? 1,
    closed: input.closed ?? false,
  };

  const response = await sb
    .from("debacu_eval_room_prices")
    .upsert(payload, {
      onConflict: "property_id,room_type_id,date",
    })
    .select(
      "id, org_id, property_id, room_type_id, date, price, min_stay, closed, created_at, updated_at"
    )
    .single();

  if (response.error) throw response.error;

  return mapRow(response.data as RevenueRoomPriceRow);
}