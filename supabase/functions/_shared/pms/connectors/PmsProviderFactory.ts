// ============================================================
// PmsProviderFactory.ts
// Bloque 3 — Integrador Universal PMS v1.0
//
// Factory que devuelve el conector correcto según provider_code.
// El Orchestrator siempre usa esta factory — nunca instancia
// un conector directamente.
// ============================================================

import { ApaleoConnector, createApaleoConnector } from "./ApaleoConnector.ts";

export type SupportedProvider = "APALEO" | "TESIPRO_ULYSES" | "MEWS" | "CLOUDBEDS" | "SIHOT";

export async function createConnector(
  connectionId: string,
  providerCode: string,
): Promise<ApaleoConnector> {
  switch (providerCode.toUpperCase()) {
    case "APALEO":
      return createApaleoConnector(connectionId);

    case "TESIPRO_ULYSES":
      // TODO Bloque 3b — implementar cuando tengamos sandbox Tesipro
      throw new Error(`PROVIDER_NOT_IMPLEMENTED: TESIPRO_ULYSES — pendiente de acceso al sandbox`);

    case "MEWS":
      // TODO Bloque 3c
      throw new Error(`PROVIDER_NOT_IMPLEMENTED: MEWS`);

    case "CLOUDBEDS":
      // TODO Bloque 3d
      throw new Error(`PROVIDER_NOT_IMPLEMENTED: CLOUDBEDS`);

    case "SIHOT":
      // TODO Bloque 3e
      throw new Error(`PROVIDER_NOT_IMPLEMENTED: SIHOT`);

    default:
      throw new Error(`PROVIDER_UNKNOWN: ${providerCode}`);
  }
}