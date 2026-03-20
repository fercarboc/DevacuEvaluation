import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { supabaseServiceClient } from "../_shared/auth.ts";
import { PmsSyncService } from "../_shared/pms/PmsSyncService.ts";
import type { SyncEntityType } from "../_shared/pms/PmsSyncService.ts";

// ============================================================
// pms-sync-orchestrator
// Bloque 5 — Integrador Universal PMS v1.0
//
// Orquestador maestro — llamado por el cron de Supabase.
// Lee todas las conexiones ACTIVE y lanza sync por entidad
// según la frecuencia configurada:
//
//   STAY + RESERVATION  → cada 15 min
//   GUEST               → cada 30 min
//   ROOM + ROOM_TYPE    → cada 60 min
//
// También puede forzarse manualmente via POST para testing.
//
// IMPORTANTE: Este endpoint no requiere auth de usuario —
// es llamado por el cron interno de Supabase con service_role.
// Protegido por CRON_SECRET en headers.
// ============================================================

// Frecuencias en minutos por entidad
const SYNC_FREQUENCIES: Record<SyncEntityType, number> = {
  STAY: 15,
  RESERVATION: 15,
  GUEST: 30,
  ROOM: 60,
  ROOM_TYPE: 60,
};

// Orden de sync dentro de cada ciclo (dependencias primero)
const SYNC_ORDER: SyncEntityType[] = [
  "ROOM_TYPE",  // primero — rooms dependen de room_types
  "ROOM",       // segundo
  "GUEST",      // tercero
  "RESERVATION",// cuarto
  "STAY",       // último — depende de reservation + guest
];

function clean(v?: string | null): string {
  return String(v ?? "").trim();
}

function shouldSyncNow(
  entityType: SyncEntityType,
  lastSyncAt?: string | null,
): boolean {
  if (!lastSyncAt) return true; // Nunca sincronizado → siempre sí

  const frequencyMs = SYNC_FREQUENCIES[entityType] * 60 * 1000;
  const lastSync = new Date(lastSyncAt).getTime();
  const now = Date.now();

  return now - lastSync >= frequencyMs;
}

function getModifiedSince(
  entityType: SyncEntityType,
  lastSyncAt?: string | null,
): string | null {
  if (!lastSyncAt) return null; // FULL sync si no hay historial
  // Para incremental, usar el último sync con margen de 5 minutos
  const lastSyncMs = new Date(lastSyncAt).getTime() - 5 * 60 * 1000;
  return new Date(lastSyncMs).toISOString();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);

  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "request_failed", detail: "method_not_allowed" });
  }

  // Verificar CRON_SECRET para proteger el endpoint
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const providedSecret = authHeader.replace("Bearer ", "").trim();
    if (providedSecret !== cronSecret) {
      return json(req, 401, { ok: false, error: "request_failed", detail: "UNAUTHORIZED" });
    }
  }

  const sb = supabaseServiceClient();
  const syncService = new PmsSyncService();

  try {
    const body = await req.json().catch(() => ({})) as {
      force_full?: boolean;
      connection_id?: string; // Opcional: solo sincronizar una conexión concreta
    };

    const forceFull = body.force_full === true;
    const filterConnectionId = clean(body.connection_id) || null;

    // --- Cargar todas las conexiones ACTIVE ---
    let connectionsQuery = sb
      .from("pms_connections")
      .select("id, org_id, property_id, provider_code, last_sync_at, last_success_sync_at")
      .eq("status", "ACTIVE")
      .not("property_id", "is", null); // Solo conexiones con propiedad asignada

    if (filterConnectionId) {
      connectionsQuery = connectionsQuery.eq("id", filterConnectionId);
    }

    const { data: connections, error: connErr } = await connectionsQuery;

    if (connErr) {
      throw new Error(`CONNECTIONS_LOAD_FAILED: ${connErr.message}`);
    }

    if (!connections || connections.length === 0) {
      return json(req, 200, {
        ok: true,
        data: {
          message: "No hay conexiones activas para sincronizar",
          connections_processed: 0,
          jobs_launched: 0,
        },
      });
    }

    console.log(`[Orchestrator] ${connections.length} conexiones activas`);

    const results: Array<{
      connection_id: string;
      provider_code: string;
      entity_type: SyncEntityType;
      status: string;
      records_read: number;
      duration_ms: number;
    }> = [];

    let jobsLaunched = 0;

    // --- Procesar cada conexión ---
    for (const connection of connections) {
      console.log(`[Orchestrator] Procesando: ${connection.id} (${connection.provider_code})`);

      for (const entityType of SYNC_ORDER) {
        // Obtener el último sync de esta entidad para esta conexión
        const { data: lastJob } = await sb
          .from("pms_sync_jobs")
          .select("finished_at, status")
          .eq("connection_id", connection.id)
          .eq("entity_type", entityType)
          .eq("status", "SUCCESS")
          .order("finished_at", { ascending: false })
          .limit(1)
          .single();

        const lastSyncAt = lastJob?.finished_at ?? connection.last_success_sync_at ?? null;

        // Verificar si toca sincronizar esta entidad ahora
        if (!forceFull && !shouldSyncNow(entityType, lastSyncAt)) {
          console.log(
            `[Orchestrator] ${entityType} — skip (último sync hace menos de ${SYNC_FREQUENCIES[entityType]}min)`,
          );
          continue;
        }

        const syncMode = (forceFull || !lastSyncAt) ? "FULL" : "INCREMENTAL";
        const modifiedSince = syncMode === "INCREMENTAL"
          ? getModifiedSince(entityType, lastSyncAt)
          : null;

        console.log(
          `[Orchestrator] Lanzando: ${entityType} — ${syncMode}` +
          (modifiedSince ? ` desde ${modifiedSince}` : ""),
        );

        try {
          const result = await syncService.runSync({
            connection_id: connection.id,
            org_id: connection.org_id,
            property_id: connection.property_id!,
            entity_type: entityType,
            sync_mode: syncMode,
            modified_since: modifiedSince,
            triggered_by: "cron",
          });

          results.push({
            connection_id: connection.id,
            provider_code: connection.provider_code,
            entity_type: entityType,
            status: result.status,
            records_read: result.records_read,
            duration_ms: result.duration_ms,
          });

          jobsLaunched++;

          // Si falla una entidad crítica, detener las siguientes de esta conexión
          if (result.status === "FAILED" && (entityType === "ROOM_TYPE" || entityType === "ROOM")) {
            console.warn(
              `[Orchestrator] ${entityType} FAILED — deteniendo sync de ${connection.id}`,
            );
            break;
          }
        } catch (syncErr: any) {
          console.error(
            `[Orchestrator] Error en ${entityType} para ${connection.id}:`,
            syncErr?.message,
          );
          results.push({
            connection_id: connection.id,
            provider_code: connection.provider_code,
            entity_type: entityType,
            status: "FAILED",
            records_read: 0,
            duration_ms: 0,
          });
        }
      }
    }

    const successCount = results.filter((r) => r.status === "SUCCESS").length;
    const failedCount = results.filter((r) => r.status === "FAILED").length;

    console.log(
      `[Orchestrator] Completado — ${jobsLaunched} jobs: ${successCount} OK, ${failedCount} FAILED`,
    );

    return json(req, 200, {
      ok: true,
      data: {
        connections_processed: connections.length,
        jobs_launched: jobsLaunched,
        jobs_success: successCount,
        jobs_failed: failedCount,
        results,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    console.error("[Orchestrator] Error fatal:", msg);
    return json(req, 500, { ok: false, error: "request_failed", detail: "internal_error" });
  }
});