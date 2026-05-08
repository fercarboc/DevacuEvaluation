// src/services/debacu_eval_pricing_catalog.service.ts
import { callEvalFn } from "@/services/callEvalFn";

/**
 * Este servicio asume que vas a crear estas Edge Functions:
 * - debacu_eval_incident_catalog_list
 * - debacu_eval_item_catalog_list
 * - debacu_eval_hotel_pricing_overrides_upsert
 *
 * No usa RPC. Todo pasa por Edge con tu token + debacu_eval_session_token.
 */

export type IncidentCatalogRow = {
  incident_type: string;
  title: string;
  description: string | null;
  severity: number | null;
  default_gross_min: number | null;
  default_gross_max: number | null;
  default_recovery_pct: number | null;
  suggested_actions: string | null;
  is_active: boolean;

  // Si tu Edge devuelve el override ya "joinado":
  override?: {
    unit_price_override: number | null;
    gross_min_override: number | null;
    gross_max_override: number | null;
    recovery_pct_override: number | null;
    notes: string | null;
    is_active: boolean;
  } | null;
};

export type ItemCatalogRow = {
  item_code: string;
  title: string;
  category: string;
  unit_price: number;
  currency: string;
  description: string | null;
  is_active: boolean;

  // Si tu Edge devuelve el override del hotel:
  unit_price_override?: number | null;
  effective_unit_price?: number; // unit_price_override ?? unit_price
};

export type ListIncidentCatalogResponse = {
  ok: boolean;
  incidents: IncidentCatalogRow[];
};

export type ListItemCatalogResponse = {
  ok: boolean;
  items: ItemCatalogRow[];
};

export type PricingOverrideUpsertRow = {
  incident_type: string | null; // null si es override de item
  item_code: string | null; // null si es override de incident
  unit_price_override: number | null;
  gross_min_override: number | null;
  gross_max_override: number | null;
  recovery_pct_override: number | null;
  notes: string | null;
  is_active: boolean;
};

export type UpsertHotelPricingOverridesRequest = {
  rows: PricingOverrideUpsertRow[];
};

export type UpsertHotelPricingOverridesResponse = {
  ok: boolean;
  upserted?: number;
};

/** =========================================================
 *  API
 * ========================================================= */

export async function listIncidentCatalog(): Promise<ListIncidentCatalogResponse> {
  // body vacío. La Edge resuelve customerId desde sesión/token.
  return callEvalFn<ListIncidentCatalogResponse>("debacu_eval_incident_catalog_list", {});
}

export async function listItemCatalog(): Promise<ListItemCatalogResponse> {
  return callEvalFn<ListItemCatalogResponse>("debacu_eval_item_catalog_list", {});
}

export async function upsertHotelPricingOverrides(
  body: UpsertHotelPricingOverridesRequest
): Promise<UpsertHotelPricingOverridesResponse> {
  // Reglas defensivas mínimas: no mandes basura
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (!rows.length) return { ok: true, upserted: 0 };

  // Normaliza booleans y nulls
  const normalized: PricingOverrideUpsertRow[] = rows.map((r) => ({
    incident_type: r.incident_type ?? null,
    item_code: r.item_code ?? null,
    unit_price_override: r.unit_price_override ?? null,
    gross_min_override: r.gross_min_override ?? null,
    gross_max_override: r.gross_max_override ?? null,
    recovery_pct_override: r.recovery_pct_override ?? null,
    notes: r.notes ?? null,
    is_active: Boolean(r.is_active),
  }));

  return callEvalFn<UpsertHotelPricingOverridesResponse>(
    "debacu_eval_hotel_pricing_overrides_upsert",
    { rows: normalized }
  );
}

 

export async function bootstrapCatalogs(customerId: string) {
  return callEvalFn("debacu_eval_catalog_bootstrap", { customerId });
}

 

export type UpsertHotelItemInput = {
  customerId: string;
  item_code: string;
  title: string;
  category: string;
  unit_price: number;
  currency: string;
  description?: string | null;
  is_active?: boolean;
};

export async function upsertHotelItem(input: UpsertHotelItemInput) {
  return callEvalFn("debacu_eval_item_catalog_upsert", input);
}


 

export async function listHotelMergedItems(_customerId: string) {
  return await callEvalFn<{ items: any[] }>("debacu_eval_item_catalog_list", {});
}

export async function upsertHotelItemCatalogForCustomer(
  customerId: string,
  item: {
    item_code: string;
    title: string;
    category: string;
    unit_price: number;
    currency: string;
    is_active: boolean;
  }
) {
  // Edge Function recomendada: debacu_eval_catalog_item_upsert
  // Inserta/actualiza en tabla "customer_item_catalog"
  return await callEvalFn<{ ok: boolean }>("debacu_eval_item_catalog_upsert", {
    item_code: item.item_code,
    title: item.title,
    category: item.category,
    unit_price: item.unit_price,
    currency: item.currency,
    is_active: item.is_active,
  });
}
