// supabase/functions/debacu_eval_notifications_get/index.ts
// Devuelve el conteo de alertas de riesgo no leídas para la org del usuario.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

function safeStr(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  let authUser: any;
  try {
    authUser = await requireUser(req);
  } catch {
    return json(req, 401, { ok: false, error: "unauthenticated" });
  }

  const authUserId = safeStr(authUser?.id);
  if (!authUserId) return json(req, 401, { ok: false, error: "unauthenticated" });

  const sb = supabaseServiceClient();

  // Resolver org_id del usuario
  const { data: mem } = await sb
    .from("debacu_eval_org_members")
    .select("org_id")
    .eq("auth_user_id", authUserId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!mem?.org_id) return json(req, 200, { ok: true, count: 0 });

  const orgId = String(mem.org_id);
  const today = new Date().toISOString().split("T")[0];

  // Contar alertas no leídas: futuras, no resueltas, riesgo medio/alto/crítico
  const { count, error } = await sb
    .from("debacu_eval_risk_alerts")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("is_resolved", false)
    .eq("is_read", false)
    .in("risk_level", ["medium", "high", "critical"])
    .gte("checkin_date", today);

  if (error) {
    console.error("notifications_get error:", error.message);
    return json(req, 500, { ok: false, error: "db_error" });
  }

  return json(req, 200, { ok: true, count: count ?? 0 });
});
