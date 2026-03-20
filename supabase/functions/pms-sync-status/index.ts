// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

// ============================================================
// pms-sync-status
// Historial de sincronizaciones para una propiedad/conexión
// Lee de pms_sync_jobs + pms_connections
// Usado por: pantalla "Historial de Sincronización" del menú
// ============================================================

type ReqBody = {
  property_id: string;
  limit?: number;       // máximo jobs a devolver, default 50
  entity_type?: string; // filtrar por entidad
  status?: string;      // filtrar por status
};

function clean(v?: string | null): string {
  return String(v ?? "").trim();
}

function timeSince(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `hace ${days}d`;
  if (hours > 0) return `hace ${hours}h`;
  if (minutes > 0) return `hace ${minutes}min`;
  return "hace un momento";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "method_not_allowed" });
  }

  const sb = supabaseServiceClient();

  try {
    const user = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as ReqBody;

    const propertyId = clean(body.property_id);
    if (!propertyId) throw new Error("PROPERTY_ID_REQUIRED");

    const limit = Math.min(body.limit ?? 50, 200);
    const filterEntity = clean(body.entity_type) || null;
    const filterStatus = clean(body.status) || null;

    // Verificar acceso
    const { data: property, error: propErr } = await sb
      .from("debacu_eval_properties")
      .select("id, org_id, name")
      .eq("id", propertyId)
      .single();

    if (propErr || !property) throw new Error("PROPERTY_NOT_FOUND");

    const { data: membership } = await sb
      .from("debacu_eval_org_members")
      .select("id")
      .eq("org_id", property.org_id)
      .eq("user_id", user.id)
      .eq("status", "ACTIVE")
      .single();

    if (!membership) throw new Error("NO_ORG_MEMBERSHIP");

    // Cargar conexiones activas para esta propiedad
    const { data: connections } = await sb
      .from("pms_connections")
      .select("id, provider_code, status, environment, last_sync_at, last_success_sync_at, last_error_at, last_error_message")
      .eq("property_id", propertyId)
      .eq("org_id", property.org_id)
      .order("created_at", { ascending: false });

    const connectionsList = connections ?? [];
    const connectionIds = connectionsList.map((c) => c.id);

    if (connectionIds.length === 0) {
      return json(req, 200, {
        ok: true,
        data: {
          propertyId,
          propertyName: property.name,
          connections: [],
          lastSyncByEntity: {},
          recentJobs: [],
          summary: {
            totalJobs: 0,
            successJobs: 0,
            failedJobs: 0,
            warningJobs: 0,
          },
        },
      });
    }

    // Cargar jobs de sync
    let jobsQuery = sb
      .from("pms_sync_jobs")
      .select(`
        id,
        connection_id,
        entity_type,
        sync_mode,
        status,
        records_read,
        records_created,
        records_updated,
        records_error,
        duration_ms,
        error_code,
        error_message,
        triggered_by,
        started_at,
        finished_at,
        created_at
      `)
      .eq("org_id", property.org_id)
      .in("connection_id", connectionIds)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (filterEntity) {
      jobsQuery = jobsQuery.eq("entity_type", filterEntity);
    }
    if (filterStatus) {
      jobsQuery = jobsQuery.eq("status", filterStatus);
    }

    const { data: jobs, error: jobsErr } = await jobsQuery;

    if (jobsErr) throw new Error(`JOBS_QUERY_FAILED: ${jobsErr.message}`);

    const jobsList = jobs ?? [];

    // Último sync exitoso por entidad
    const entityTypes = ["ROOM_TYPE", "ROOM", "GUEST", "RESERVATION", "STAY"];
    const lastSyncByEntity: Record<string, {
      lastSuccessAt: string | null;
      lastStatus: string | null;
      lastRecordsRead: number | null;
      timeSince: string | null;
    }> = {};

    for (const entityType of entityTypes) {
      const entityJobs = jobsList.filter((j) => j.entity_type === entityType);
      const lastSuccess = entityJobs.find((j) => j.status === "SUCCESS");
      const lastJob = entityJobs[0] ?? null;

      lastSyncByEntity[entityType] = {
        lastSuccessAt: lastSuccess?.finished_at ?? null,
        lastStatus: lastJob?.status ?? null,
        lastRecordsRead: lastJob?.records_read ?? null,
        timeSince: timeSince(lastSuccess?.finished_at ?? null),
      };
    }

    // Summary
    const summary = {
      totalJobs: jobsList.length,
      successJobs: jobsList.filter((j) => j.status === "SUCCESS").length,
      failedJobs: jobsList.filter((j) => j.status === "FAILED").length,
      warningJobs: jobsList.filter((j) => j.status === "WARNING").length,
      runningJobs: jobsList.filter((j) => j.status === "RUNNING").length,
    };

    // Enriquecer jobs con info de conexión
    const connectionMap = new Map(connectionsList.map((c) => [c.id, c]));
    const enrichedJobs = jobsList.map((job) => {
      const conn = connectionMap.get(job.connection_id);
      return {
        ...job,
        providerCode: conn?.provider_code ?? null,
        environment: conn?.environment ?? null,
        durationSeconds: job.duration_ms ? Math.round(job.duration_ms / 100) / 10 : null,
        timeSinceCreated: timeSince(job.created_at),
      };
    });

    // Connections enriquecidas con tiempo
    const enrichedConnections = connectionsList.map((c) => ({
      ...c,
      lastSyncTimeSince: timeSince(c.last_sync_at),
      lastSuccessTimeSince: timeSince(c.last_success_sync_at),
    }));

    return json(req, 200, {
      ok: true,
      data: {
        propertyId,
        propertyName: property.name,
        connections: enrichedConnections,
        lastSyncByEntity,
        recentJobs: enrichedJobs,
        summary,
        queriedAt: new Date().toISOString(),
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg === "UNAUTHENTICATED") return json(req, 401, { ok: false, error: "UNAUTHENTICATED" });
    if (msg === "NO_ORG_MEMBERSHIP") return json(req, 403, { ok: false, error: "NO_ORG_MEMBERSHIP" });
    if (msg === "PROPERTY_NOT_FOUND") return json(req, 404, { ok: false, error: "PROPERTY_NOT_FOUND" });
    if (msg === "PROPERTY_ID_REQUIRED") return json(req, 400, { ok: false, error: "PROPERTY_ID_REQUIRED" });

    console.error("pms-sync-status error:", msg);
    return json(req, 500, { ok: false, error: "internal_error", detail: msg });
  }
});