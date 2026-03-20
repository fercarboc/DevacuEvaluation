// ============================================================
// PMSBaseConnector.ts
// Bloque 3 — Integrador Universal PMS v1.0
//
// Contrato base que todos los conectores PMS deben cumplir.
// Permite al Orchestrator trabajar con cualquier PMS
// sin conocer los detalles de implementación.
// ============================================================

export interface ConnectorFetchParams {
  propertyId: string;
  modifiedSince?: string | null;
  pageSize?: number;
}

export interface ConnectorTestResult {
  valid: boolean;
  propertiesCount: number;
  latencyMs: number;
  errorCode?: string;
  errorDetail?: string;
}

export abstract class PMSBaseConnector {
  abstract testConnection(): Promise<ConnectorTestResult>;
  abstract fetchProperties(): Promise<unknown[]>;
  abstract fetchRoomTypes(params: ConnectorFetchParams): Promise<unknown[]>;
  abstract fetchRooms(params: ConnectorFetchParams): Promise<unknown[]>;
  abstract fetchGuests(params: ConnectorFetchParams): Promise<unknown[]>;
  abstract fetchReservations(params: ConnectorFetchParams & {
    statuses?: string[];
  }): Promise<unknown[]>;
  abstract fetchStays(params: ConnectorFetchParams): Promise<unknown[]>;
}

