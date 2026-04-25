// src/services/debacu_eval_hotel_profile.service.ts
import { callEvalFn } from "@/services/callEvalFn";

export type HotelProfile = {
  customer_id: string;
  hotel_category: number;
  adr_real: number | null;
  adr_reference: number;
  adr_effective: number;
  monthly_stays_estimated: number | null;
  season_mult_high: number;
  season_mult_low: number;
  updated_at: string;

  // Wizard / completeness
  missing?: string[];
  is_complete?: boolean;

  // Campos extendidos
  hotel_name?: string | null;
  property_type?: string | null;
  country?: string | null;
  province?: string | null;
  city?: string | null;
  currency?: string | null;
};

export type HotelProfileGetResponse = {
  ok: boolean;
  customer: { id: string; name: string; email: string; phone: string | null; isAdmin: boolean };
  profile: HotelProfile | null;
};

export type HotelProfileUpsertInput = {
  hotel_name?: string | null;
  property_type?: string | null;
  hotel_category: number;
  country?: string | null;
  province?: string | null;
  city?: string | null;
  monthly_stays_estimated: number | null;
  adr_real: number | null;
  season_mult_high: number;
  season_mult_low: number;
  currency?: string | null;
};

export type HotelProfileUpsertResponse = {
  ok: boolean;
  data?: HotelProfile | null;     // formato nuevo
  profile?: HotelProfile | null;  // formato antiguo
};

function unwrapPayload<T>(res: any): T {
  if (res && typeof res === "object" && "data" in res) return res.data as T;
  return res as T;
}

export async function getHotelProfile(): Promise<HotelProfileGetResponse> {
  const resRaw = await callEvalFn<any>("debacu_eval_hotel_profile_get", {});
  const res = unwrapPayload<any>(resRaw);

  // Edge function returns { meta: { customer_id, org_id }, profile }
  // Wizard expects { customer: { id }, profile: { customer_id } }
  const metaCustomerId: string | undefined = res?.meta?.customer_id;
  if (metaCustomerId) {
    if (!res.customer) {
      res.customer = { id: metaCustomerId, name: "", email: "", phone: null, isAdmin: false };
    }
    if (res.profile && !res.profile.customer_id) {
      res.profile.customer_id = metaCustomerId;
    }
  }

  return res as HotelProfileGetResponse;
}

export async function upsertHotelProfile(
  input: HotelProfileUpsertInput
): Promise<HotelProfile | null> {
  // ✅ NO mandes session_token en body. callEvalFn ya lo mete en header x-session-token.
  const resRaw = await callEvalFn<any>("debacu_eval_hotel_profile_upsert", input);
  const res = unwrapPayload<HotelProfileUpsertResponse>(resRaw);

  return (res?.data ?? res?.profile) ?? null;
}
