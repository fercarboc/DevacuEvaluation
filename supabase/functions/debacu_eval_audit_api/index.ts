// supabase/functions/debacu_eval_audit_api/index.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ======================
// CORS
// ======================
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

function corsHeaders(req: Request, extraMethods = "GET,POST,OPTIONS") {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": extraMethods,
    "Access-Control-Max-Age": "86400",
  };
}

function preflight(req: Request, extraMethods = "GET,POST,OPTIONS") {
  return new Response(null, { status: 204, headers: corsHeaders(req, extraMethods) });
}

function jsonResp(req: Request, status: number, body: unknown, extraMethods = "GET,POST,OPTIONS") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(req, extraMethods) },
  });
}

// ======================
// Types
// ======================
type Ok<T> = { ok: true; data: T };
type Fail = { ok: false; error: string; detail?: string; code?: string };

function fail(req: Request, error: string, detail?: string, code?: string, status = 400) {
  return jsonResp(req, status, { ok: false, error, detail, code } satisfies Fail, "POST,OPTIONS");
}

type AuditSource = "ALL" | "PRODUCT" | "SYSTEM";

type ListEventsPayload = {
  source?: AuditSource;
  customer?: string | null; // customer_id
  type?: string | null;     // event_type
  from?: string | null;     // ISO
  to?: string | null;       // ISO
  limit?: number;
  offset?: number;
};

type ListTypesPayload = { source?: AuditSource };

// ======================
// Clients
// ======================
function userClientFromReq(req: Request) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  return createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
}

/**
 * Cliente admin (Service Role) para consultar tablas/vistas protegidas.
 * OJO: NO uses este cliente para “autenticar” al usuario.
 */
function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, service);
}

// ======================
// Auth / Admin checks
// ======================
async function requireAuth(sbUser: any) {
  const { data, error } = await sbUser.auth.getUser();
  if (error || !data?.user) throw new Error("Unauthorized");
  return data.user;
}

/**
 * Implementación práctica:
 * - tabla debacu_eval_admin_users (user_id uuid, active bool)
 * - si existe fila active=true => admin
 */
async function requireAdmin(sbService: any, userId: string) {
  const { data, error } = await sbService
    .from("debacu_eval_admin_users")
    .select("user_id, active")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Forbidden");
  return true;
}

// ======================
// Handler
// ======================
serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req, "POST,OPTIONS");
  if (req.method !== "POST") return fail(req, "Method not allowed", undefined, "METHOD_NOT_ALLOWED", 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail(req, "Invalid JSON", undefined, "BAD_JSON", 400);
  }

  const action = body?.action;
  const payload = (body?.payload ?? {}) as any;
  if (!action) return fail(req, "Missing action", undefined, "MISSING_ACTION", 400);

  const sbUser = userClientFromReq(req);
  const sbSvc = serviceClient();

  try {
    const user = await requireAuth(sbUser);
    await requireAdmin(sbSvc, user.id);

    switch (action) {
      case "list_events": {
        const data = await listEvents(sbSvc, payload as ListEventsPayload);
        return jsonResp(req, 200, { ok: true, data } satisfies Ok<any>, "POST,OPTIONS");
      }
      case "list_types": {
        const data = await listTypes(sbSvc, payload as ListTypesPayload);
        return jsonResp(req, 200, { ok: true, data } satisfies Ok<any>, "POST,OPTIONS");
      }
      default:
        return fail(req, "Unknown action", `Action '${action}' not supported`, "UNKNOWN_ACTION", 400);
    }
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return fail(req, "Edge failed", msg, "EDGE_ERROR", status);
  }
});

// ======================
// Queries (SERVICE ROLE)
// ======================
async function listEvents(sbSvc: any, p: ListEventsPayload) {
  const source: AuditSource = (p?.source ?? "ALL") as AuditSource;
  const limit = Math.min(Math.max(Number(p?.limit ?? 200), 1), 500);
  const offset = Math.max(Number(p?.offset ?? 0), 0);

  let q = sbSvc
    .from("debacu_eval_audit_log")
    .select(
      "id, created_at, customer_id, app_id, event_type, action, entity, evaluation_id, meta, search_kind, search_value_masked, search_value_hash, result_count"
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // Ajusta a tu modelo real de entity/source (esto es solo ejemplo)
  if (source === "SYSTEM") q = q.eq("entity", "stripe");
  if (source === "PRODUCT") q = q.neq("entity", "stripe");

  if (p?.customer) q = q.eq("customer_id", p.customer);
  if (p?.type) q = q.eq("event_type", p.type);

  if (p?.from) q = q.gte("created_at", p.from);
  if (p?.to) q = q.lte("created_at", p.to);

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    id: r.id,
    created_at: r.created_at,
    customer_id: r.customer_id,
    app_id: r.app_id,
    source: r.entity === "stripe" ? "SYSTEM" : "PRODUCT",
    type: r.event_type ?? r.action ?? "—",
    stripe_subscription_id: r.meta?.stripe_subscription_id ?? null,
    payload: r.meta ?? null,
  }));
}

async function listTypes(sbSvc: any, p: ListTypesPayload) {
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
