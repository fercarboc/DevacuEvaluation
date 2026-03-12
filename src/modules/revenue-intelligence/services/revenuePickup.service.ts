import { supabase } from "@/services/supabaseClient";

export type RevenuePickupRequest = {
  orgId: string;
  propertyId: string;
  windowDays: 7 | 15 | 30;
};

export type RevenuePickupByArrivalRow = {
  date: string;
  rn: number;
  revenue: number;
  netRevenue: number;
  adr: number;
  leadTime: number;
  paceRevenue: number;
  paceRN: number;
};

export type RevenuePickupComparisonRow = {
  date: string;
  currentRevenue: number;
  currentRN: number;
  compareRevenue: number;
  compareRN: number;
  deltaRevenue: number;
  deltaRevenuePct: number;
  deltaRN: number;
  deltaRNPct: number;
};

export type RevenuePickupResponse = {
  property: {
    id: string;
    code?: string;
    name: string;
    roomsCount: number;
  };
  range: {
    booking_from: string;
    booking_to: string;
    compare_from: string;
    compare_to: string;
  };
  summary: {
    totalPickupRN: number;
    totalPickupRevenue: number;
    totalPickupNetRevenue: number;
    avgLeadTime: number;
    pickupADR: number;
  };
  pickupByArrival: RevenuePickupByArrivalRow[];
  pickupComparison: RevenuePickupComparisonRow[];
};

export async function getRevenuePickupSummary(
  params: RevenuePickupRequest,
): Promise<RevenuePickupResponse> {
  const { data, error } = await supabase.functions.invoke("revenue_pickup_summary", {
    body: {
      org_id: params.orgId,
      property_id: params.propertyId,
      window_days: params.windowDays,
    },
  });

  if (error) {
    throw new Error(error.message || "No se pudo cargar el pickup");
  }

  if (!data?.ok || !data?.data) {
    throw new Error(data?.error || "Respuesta inválida de pickup");
  }

  return data.data as RevenuePickupResponse;
}