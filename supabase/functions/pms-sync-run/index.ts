import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";
import { PmsSyncService } from "../_shared/pms/PmsSyncService.ts";
import type { SyncEntityType, SyncMode } from "../_shared/pms/PmsSyncService.ts";

// ============================================================
// pms-sync-run
// Bloque 5 — Integrador Universal PMS v1.0
//
// Edge Function de entrada para ejecutar un sync de una
// entidad concreta de un PMS.
//
// Llamada por:
//   - pms-sync-orchestrator (cron automático)
//   - Panel admin (sync manual)
//   - Wizard paso 4 (sync inicial de onboarding)
//
// POST body:
//   connection_id  — UUID de pms_connections
//   entity_type    — ROOM_TYPE | ROOM | GUEST | RESERVATION | STAY
//   sync_mode      — FULL | INCREMENTAL
//   modified_since — ISO datetime (solo para INCREMENTAL)
//   triggered_by   — cron | manual | onboarding
// ============================================================

type ReqBody = {
  connection_id: string;
  entity_type: SyncEntityType;
  sync_mode?: SyncMode;
  modified_since?: string | null;
  triggered_by?: "cron" | "manual" | "webhook" | "onboarding";
};

const VALID_ENTITY_TYPES: SyncEntityType[] = [
  "ROOM_TYPE", "ROOM", "GUEST", "RESERVATION", "STAY",
];

const VALID_SYNC_MODES: SyncMode[] = ["FULL", "INCREMENTAL"];

function clean(v?: string | null): string {
  return String(v ?? "").trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);

  if (req.method !== "POST") {
    return json(req, 405, {
      ok: false,
      error: "request_failed",
      detail: "method_not_allowed",
    });
  }

  const sb = supabaseServiceClient();

  try {
    const user = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as ReqBody;

    const connectionId = clean(body.connection_id);
    const entityType = clean(body.entity_type).toUpperCase() as SyncEntityType;
    const syncMode = (clean(body.sync_mode).toUpperCase() || "INCREMENTAL") as SyncMode;
    const modifiedSince = body.modified_since ?? null;
    const triggeredBy = body.triggered_by ?? "manual";

    // --- Validaciones ---
    if (!connectionId) throw new Error("CONNECTION_ID_REQUIRED");
    if (!VALID_ENTITY_TYPES.includes(entityType)) throw new Error("INVALID_ENTITY_TYPE");
    if (!VALID_SYNC_MODES.includes(syncMode)) throw new Error("INVALID_SYNC_MODE");

    // --- Cargar la conexión para verificar org ---
    const { data: connection, error: connErr } = await sb
      .from("pms_connections")
      .select("id, org_id, property_id, provider_code, status")
      .eq("id", connectionId)
      .single();

    if (connErr || !connection) throw new Error("CONNECTION_NOT_FOUND");

    // --- Verificar membresía activa del usuario en la org ---
    const { data: membership, error: memberErr } = await sb
      .from("debacu_eval_org_members")
      .select("id, role")
      .eq("org_id", connection.org_id)
      .eq("user_id", user.id)
      .eq("status", "ACTIVE")
      .single();

    if (memberErr || !membership) throw new Error("NO_ORG_MEMBERSHIP");

    if (!connection.property_id) throw new Error("CONNECTION_HAS_NO_PROPERTY");
    if (connection.status !== "ACTIVE") {
      throw new Error(`CONNECTION_NOT_ACTIVE: status=${connection.status}`);
    }

    // --- Ejecutar sync ---
    const syncService = new PmsSyncService();

    const result = await syncService.runSync({
      connection_id: connectionId,
      org_id: connection.org_id,
      property_id: connection.property_id,
      entity_type: entityType,
      sync_mode: syncMode,
      modified_since: modifiedSince,
      triggered_by: triggeredBy,
    });

    return json(req, 200, {
      ok: true,
      data: result,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg === "UNAUTHENTICATED") {
      return json(req, 401, { ok: false, error: "request_failed", detail: "UNAUTHENTICATED" });
    }

    if (msg === "NO_ORG_MEMBERSHIP") {
      return json(req, 403, { ok: false, error: "request_failed", detail: "NO_ORG_MEMBERSHIP" });
    }

    const notFound = ["CONNECTION_NOT_FOUND"];
    if (notFound.includes(msg)) {
      return json(req, 404, { ok: false, error: "request_failed", detail: msg });
    }

    const badRequest = [
      "CONNECTION_ID_REQUIRED",
      "INVALID_ENTITY_TYPE",
      "INVALID_SYNC_MODE",
      "CONNECTION_HAS_NO_PROPERTY",
      "CONNECTION_NOT_ACTIVE",
    ];
    if (badRequest.some((e) => msg.startsWith(e))) {
      return json(req, 400, { ok: false, error: "request_failed", detail: msg });
    }

    console.error("pms-sync-run error:", msg);
    return json(req, 500, { ok: false, error: "request_failed", detail: "internal_error" });
  }
});