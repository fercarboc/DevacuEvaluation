// supabase/functions/debacu_eval_audit_api/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireAdmin, supabaseServiceClient } from "../_shared/auth.ts";

/* ======================================================
 * Types
 * ====================================================== */
type AuditSource = "ALL" | "PRODUCT" | "SYSTEM";

type ListEventsPayload = {
  source?: AuditSource;
  customer?: string | null; // customer_id (admin console)
  type?: string | null; // event_type
  from?: string | null; // ISO
  to?: string | null; // ISO
  limit?: number;
  offset?: number;
};

type ListTypesPayload = { source?: AuditSource };

type Body =
  | { action: "list_events"; payload?: ListEventsPayload }
  | { action: "list_types"; payload?: ListTypesPayload };

/* ======================================================
 * Utils
 * ====================================================== */
async function readJsonSafe<T>(req: Request): Promise<T | null> {
  try {
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function isIsoLike(v: any) {
  if (typeof v !== "string") return false;
  // aceptamos ISO parcial razonable (no validación “perfecta”)
  return v.includes("T") || /^\d{4}-\d{2}-\d{2}/.test(v);
}

/* ======================================================
 * Handler
 * ====================================================== */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "request_failed", detail: "METHOD_NOT_ALLOWED" });
  }

  // ✅ JWT-only + admin
  try {
    await requireAdmin(req);
  } catch {
    // requireAdmin debe cubrir UNAUTHENTICATED vs FORBIDDEN,
    // pero aquí devolvemos FORBIDDEN de forma conservadora.
    return json(req, 403, { ok: false, error: "request_failed", detail: "FORBIDDEN" });
  }

  const body = await readJsonSafe<Body>(req);
  if (!body?.action) {
    return json(req, 400, { ok: false, error: "request_failed", detail: "missing_action" });
  }

  const admin = supabaseServiceClient();

  try {
    switch (body.action) {
      case "list_events": {
        const data = await listEvents(admin, body.payload ?? {});
        return json(req, 200, { ok: true, data });
      }

      case "list_types": {
        const data = await listTypes(admin, body.payload ?? {});
        return json(req, 200, { ok: true, data });
      }

      default:
        return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_action" });
    }
  } catch (e) {
    // No filtramos stacktrace ni mensajes PostgREST
    return json(req, 500, { ok: false, error: "request_failed", detail: "INTERNAL_ERROR" });
  }
});

/* ======================================================
 * Queries (SERVICE ROLE)
 * ====================================================== */
async function listEvents(sbSvc: ReturnType<typeof supabaseServiceClient>, p: ListEventsPayload) {
  const source: AuditSource = (p?.source ?? "ALL") as AuditSource;

  const limit = Math.min(Math.max(Number(p?.limit ?? 200), 1), 500);
  const offset = Math.max(Number(p?.offset ?? 0), 0);

  let q = sbSvc
    .from("debacu_eval_audit_log")
    .select(
      "id, created_at, customer_id, app_id, event_type, action, entity, evaluation_id, meta, search_kind, search_value_masked, search_value_hash, result_count",
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // Heurística source
  if (source === "SYSTEM") q = q.eq("entity", "stripe");
  if (source === "PRODUCT") q = q.neq("entity", "stripe");

  if (p?.customer) q = q.eq("customer_id", safeStr(p.customer));
  if (p?.type) q = q.eq("event_type", safeStr(p.type));

  // Filtros fecha (solo si parecen ISO)
  if (p?.from && isIsoLike(p.from)) q = q.gte("created_at", p.from);
  if (p?.to && isIsoLike(p.to)) q = q.lte("created_at", p.to);

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    id: r.id,
    created_at: r.created_at,
    customer_id: r.customer_id,
    app_id: r.app_id,
    source: r.entity === "stripe" ? "SYSTEM" : "PRODUCT",
    type: r.event_type ?? r.action ?? "—",
    stripe_subscription_id: r?.meta?.stripe_subscription_id ?? null,
    payload: r.meta ?? null,
  }));
}

async function listTypes(sbSvc: ReturnType<typeof supabaseServiceClient>, p: ListTypesPayload) {
  const source: AuditSource = (p?.source ?? "ALL") as AuditSource;

  let q = sbSvc.from("debacu_eval_audit_log").select("event_type, entity").limit(5000);

  if (source === "SYSTEM") q = q.eq("entity", "stripe");
  if (source === "PRODUCT") q = q.neq("entity", "stripe");

  const { data, error } = await q;
  if (error) throw error;

  const set = new Set<string>();
  for (const r of data ?? []) if (r?.event_type) set.add(String(r.event_type));

  return Array.from(set).sort();
}
