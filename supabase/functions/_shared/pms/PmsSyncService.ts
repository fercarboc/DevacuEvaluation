// ============================================================
// PmsSyncService.ts
// Bloque 5 — Integrador Universal PMS v1.0
//
// Responsabilidad:
//   Orquesta el sync completo de una entidad PMS:
//   1. Crea el pms_sync_job
//   2. Llama al conector para obtener datos RAW
//   3. Pasa por el mapper correspondiente
//   4. Persiste en las tablas canónicas (upsert)
//   5. Actualiza el job con resultado
//
// Este servicio NO sabe qué PMS es — usa el Factory.
// NO hace fetch directo — delega en el Conector.
// NO transforma — delega en los Mappers.
// ============================================================

 

import { supabaseServiceClient } from "../auth.ts";

import { createConnector } from "./connectors/PmsProviderFactory.ts";
import { mapApaleoRoomTypes, mapApaleoRooms } from "./mappers/ApaleoRoomMapper.ts";
import { mapApaleoGuests } from "./mappers/ApaleoGuestMapper.ts";
import { mapApaleoReservations } from "./mappers/ApaleoReservationMapper.ts";
import { mapApaleoStays } from "./mappers/ApaleoStayMapper.ts";

// ============================================================
// Tipos
// ============================================================

export type SyncEntityType =
  | "ROOM_TYPE"
  | "ROOM"
  | "GUEST"
  | "RESERVATION"
  | "STAY";

export type SyncMode = "FULL" | "INCREMENTAL";

export interface SyncJobInput {
  connection_id: string;
  org_id: string;
  property_id: string;
  entity_type: SyncEntityType;
  sync_mode: SyncMode;
  modified_since?: string | null;
  triggered_by?: "cron" | "manual" | "webhook" | "onboarding";
}

export interface SyncJobResult {
  job_id: string;
  entity_type: SyncEntityType;
  status: "SUCCESS" | "FAILED" | "WARNING";
  records_read: number;
  records_created: number;
  records_updated: number;
  records_error: number;
  duration_ms: number;
  error_message?: string;
}

// Tamaño de chunk para upserts — evita timeouts en lotes grandes
const UPSERT_CHUNK_SIZE = 100;

// ============================================================
// Helpers
// ============================================================

function clean(v?: string | null): string {
  return String(v ?? "").trim();
}

async function chunkUpsert<T extends Record<string, unknown>>(
  sb: ReturnType<typeof supabaseServiceClient>,
  table: string,
  records: T[],
  onConflict: string,
): Promise<{ created: number; updated: number; errors: number }> {
  let created = 0;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < records.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = records.slice(i, i + UPSERT_CHUNK_SIZE);

    const { error } = await sb
      .from(table)
      .upsert(chunk, {
        onConflict,
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(`[PmsSyncService] upsert error en ${table}:`, error.message);
      errors += chunk.length;
    } else {
      // Supabase no distingue created vs updated en upsert
      // Estimamos conservadoramente
      updated += chunk.length;
    }
  }

  return { created, updated, errors };
}

// ============================================================
// PmsSyncService
// ============================================================

export class PmsSyncService {
  private sb = supabaseServiceClient();

  // ----------------------------------------------------------
  // runSync — punto de entrada principal
  // ----------------------------------------------------------

  async runSync(input: SyncJobInput): Promise<SyncJobResult> {
    const t0 = Date.now();
    let jobId: string | null = null;

    try {
      // 1. Crear el sync job
      jobId = await this.createJob(input);

      // 2. Marcar como RUNNING
      await this.updateJob(jobId, { status: "RUNNING", started_at: new Date().toISOString() });

      // 3. Cargar la conexión para saber el provider
      const { data: connection, error: connErr } = await this.sb
        .from("pms_connections")
        .select("id, org_id, property_id, provider_code, environment, status")
        .eq("id", input.connection_id)
        .single();

      if (connErr || !connection) {
        throw new Error(`CONNECTION_NOT_FOUND: ${input.connection_id}`);
      }

      if (connection.status !== "ACTIVE") {
        throw new Error(`CONNECTION_NOT_ACTIVE: status=${connection.status}`);
      }

      // 4. Crear el conector via factory
      const connector = await createConnector(
        input.connection_id,
        connection.provider_code,
      );

      // 5. Ejecutar sync según entidad
      const result = await this.syncEntity(connector, input, connection.provider_code);

      const durationMs = Date.now() - t0;

      // 6. Actualizar job como SUCCESS
      await this.updateJob(jobId, {
        status: result.records_error > 0 ? "WARNING" : "SUCCESS",
        records_read: result.records_read,
        records_created: result.records_created,
        records_updated: result.records_updated,
        records_skipped: 0,
        records_error: result.records_error,
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
      });

      // 7. Actualizar last_sync_at en pms_connections
      await this.sb
        .from("pms_connections")
        .update({
          last_sync_at: new Date().toISOString(),
          last_success_sync_at: new Date().toISOString(),
          last_error_message: null,
          last_error_at: null,
        })
        .eq("id", input.connection_id);

      return {
        job_id: jobId,
        entity_type: input.entity_type,
        status: result.records_error > 0 ? "WARNING" : "SUCCESS",
        records_read: result.records_read,
        records_created: result.records_created,
        records_updated: result.records_updated,
        records_error: result.records_error,
        duration_ms: durationMs,
      };
    } catch (e: any) {
      const durationMs = Date.now() - t0;
      const errorMsg = String(e?.message ?? e);

      console.error(`[PmsSyncService] sync FAILED — ${input.entity_type}:`, errorMsg);

      // Actualizar job como FAILED
      if (jobId) {
        await this.updateJob(jobId, {
          status: "FAILED",
          error_message: errorMsg,
          finished_at: new Date().toISOString(),
          duration_ms: durationMs,
        });
      }

      // Actualizar error en pms_connections
      await this.sb
        .from("pms_connections")
        .update({
          last_error_at: new Date().toISOString(),
          last_error_message: errorMsg.substring(0, 500),
        })
        .eq("id", input.connection_id);

      return {
        job_id: jobId ?? "unknown",
        entity_type: input.entity_type,
        status: "FAILED",
        records_read: 0,
        records_created: 0,
        records_updated: 0,
        records_error: 0,
        duration_ms: durationMs,
        error_message: errorMsg,
      };
    }
  }

  // ----------------------------------------------------------
  // syncEntity — despacha al método correcto según entidad
  // ----------------------------------------------------------

  private async syncEntity(
    connector: any,
    input: SyncJobInput,
    providerCode: string,
  ): Promise<{
    records_read: number;
    records_created: number;
    records_updated: number;
    records_error: number;
  }> {
    const context = {
      org_id: input.org_id,
      property_id: input.property_id,
      connection_id: input.connection_id,
    };

    const fetchParams = {
      propertyId: input.property_id,
      modifiedSince: input.sync_mode === "INCREMENTAL" ? input.modified_since : null,
    };

    switch (input.entity_type) {
      case "ROOM_TYPE":
        return this.syncRoomTypes(connector, context, fetchParams, providerCode);
      case "ROOM":
        return this.syncRooms(connector, context, fetchParams, providerCode);
      case "GUEST":
        return this.syncGuests(connector, context, fetchParams, providerCode);
      case "RESERVATION":
        return this.syncReservations(connector, context, fetchParams, providerCode);
      case "STAY":
        return this.syncStays(connector, context, fetchParams, providerCode);
      default:
        throw new Error(`UNKNOWN_ENTITY_TYPE: ${input.entity_type}`);
    }
  }

  // ----------------------------------------------------------
  // syncRoomTypes
  // ----------------------------------------------------------

  private async syncRoomTypes(
    connector: any,
    context: { org_id: string; property_id: string; connection_id: string },
    fetchParams: { propertyId: string; modifiedSince?: string | null },
    providerCode: string,
  ) {
    console.log(`[PmsSyncService] syncRoomTypes — property: ${fetchParams.propertyId}`);

    const rawList = await connector.fetchRoomTypes(fetchParams);
    console.log(`[PmsSyncService] fetchRoomTypes → ${rawList.length} items`);

    let mapped: any[] = [];

    if (providerCode === "APALEO") {
      mapped = mapApaleoRoomTypes(rawList, context);
    } else {
      throw new Error(`MAPPER_NOT_IMPLEMENTED: ${providerCode} ROOM_TYPE`);
    }

    // Añadir synced_at a cada registro
    const now = new Date().toISOString();
    const records = mapped.map((r) => ({ ...r, synced_at: now }));

    const { created, updated, errors } = await chunkUpsert(
      this.sb,
      "pms_room_types",
      records,
      "connection_id,external_room_type_id",
    );

    return { records_read: rawList.length, records_created: created, records_updated: updated, records_error: errors };
  }

  // ----------------------------------------------------------
  // syncRooms
  // ----------------------------------------------------------

  private async syncRooms(
    connector: any,
    context: { org_id: string; property_id: string; connection_id: string },
    fetchParams: { propertyId: string; modifiedSince?: string | null },
    providerCode: string,
  ) {
    console.log(`[PmsSyncService] syncRooms — property: ${fetchParams.propertyId}`);

    const rawList = await connector.fetchRooms(fetchParams);
    console.log(`[PmsSyncService] fetchRooms → ${rawList.length} items`);

    let mapped: any[] = [];

    if (providerCode === "APALEO") {
      mapped = mapApaleoRooms(rawList, context);
    } else {
      throw new Error(`MAPPER_NOT_IMPLEMENTED: ${providerCode} ROOM`);
    }

    const now = new Date().toISOString();
    const records = mapped.map((r) => ({ ...r, synced_at: now }));

    const { created, updated, errors } = await chunkUpsert(
      this.sb,
      "pms_rooms",
      records,
      "connection_id,external_room_id",
    );

    return { records_read: rawList.length, records_created: created, records_updated: updated, records_error: errors };
  }

  // ----------------------------------------------------------
  // syncGuests
  // ----------------------------------------------------------

  private async syncGuests(
    connector: any,
    context: { org_id: string; property_id: string; connection_id: string },
    fetchParams: { propertyId: string; modifiedSince?: string | null },
    providerCode: string,
  ) {
    console.log(`[PmsSyncService] syncGuests — property: ${fetchParams.propertyId}`);

    const rawList = await connector.fetchGuests(fetchParams);
    console.log(`[PmsSyncService] fetchGuests → ${rawList.length} items`);

    let mapped: any[] = [];

    if (providerCode === "APALEO") {
      // Guests usa async mapper (HMAC) — await obligatorio
      mapped = await mapApaleoGuests(rawList, context);
    } else {
      throw new Error(`MAPPER_NOT_IMPLEMENTED: ${providerCode} GUEST`);
    }

    const now = new Date().toISOString();
    const records = mapped.map((r) => ({ ...r, synced_at: now }));

    const { created, updated, errors } = await chunkUpsert(
      this.sb,
      "pms_guests",
      records,
      "connection_id,external_guest_id",
    );

    return { records_read: rawList.length, records_created: created, records_updated: updated, records_error: errors };
  }

  // ----------------------------------------------------------
  // syncReservations
  // ----------------------------------------------------------

  private async syncReservations(
    connector: any,
    context: { org_id: string; property_id: string; connection_id: string },
    fetchParams: { propertyId: string; modifiedSince?: string | null },
    providerCode: string,
  ) {
    console.log(`[PmsSyncService] syncReservations — property: ${fetchParams.propertyId}`);

    const rawList = await connector.fetchReservations({
      ...fetchParams,
      statuses: ["Confirmed", "InHouse", "CheckedIn", "CheckedOut", "Canceled", "NoShow"],
    });
    console.log(`[PmsSyncService] fetchReservations → ${rawList.length} items`);

    let mapped: any[] = [];

    if (providerCode === "APALEO") {
      mapped = mapApaleoReservations(rawList, context);
    } else {
      throw new Error(`MAPPER_NOT_IMPLEMENTED: ${providerCode} RESERVATION`);
    }

    const now = new Date().toISOString();
    const records = mapped.map((r) => ({ ...r, synced_at: now }));

    const { created, updated, errors } = await chunkUpsert(
      this.sb,
      "pms_reservations",
      records,
      "connection_id,external_reservation_id",
    );

    return { records_read: rawList.length, records_created: created, records_updated: updated, records_error: errors };
  }

  // ----------------------------------------------------------
  // syncStays — caso estrella del agente nocturno
  // ----------------------------------------------------------

  private async syncStays(
    connector: any,
    context: { org_id: string; property_id: string; connection_id: string },
    fetchParams: { propertyId: string; modifiedSince?: string | null },
    providerCode: string,
  ) {
    console.log(`[PmsSyncService] syncStays (InHouse) — property: ${fetchParams.propertyId}`);

    const rawList = await connector.fetchStays(fetchParams);
    console.log(`[PmsSyncService] fetchStays → ${rawList.length} in-house`);

    let mapped: any[] = [];

    if (providerCode === "APALEO") {
      mapped = mapApaleoStays(rawList, context);
    } else {
      throw new Error(`MAPPER_NOT_IMPLEMENTED: ${providerCode} STAY`);
    }

    const now = new Date().toISOString();
    const records = mapped.map((r) => ({ ...r, synced_at: now }));

    const { created, updated, errors } = await chunkUpsert(
      this.sb,
      "pms_stays",
      records,
      "connection_id,external_stay_id",
    );

    return { records_read: rawList.length, records_created: created, records_updated: updated, records_error: errors };
  }

  // ----------------------------------------------------------
  // Job management helpers
  // ----------------------------------------------------------

  private async createJob(input: SyncJobInput): Promise<string> {
    const { data, error } = await this.sb
      .from("pms_sync_jobs")
      .insert({
        connection_id: input.connection_id,
        org_id: input.org_id,
        property_id: input.property_id,
        entity_type: input.entity_type,
        sync_mode: input.sync_mode,
        status: "QUEUED",
        modified_since: input.modified_since ?? null,
        triggered_by: input.triggered_by ?? "cron",
        attempt_count: 1,
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(`JOB_CREATE_FAILED: ${error?.message}`);
    }

    return data.id;
  }

  private async updateJob(
    jobId: string,
    updates: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.sb
      .from("pms_sync_jobs")
      .update(updates)
      .eq("id", jobId);

    if (error) {
      // No lanzamos error — el job update no debe romper el sync
      console.error(`[PmsSyncService] updateJob warning:`, error.message);
    }
  }
}