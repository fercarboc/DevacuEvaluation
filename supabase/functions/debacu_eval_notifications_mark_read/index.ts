// supabase/functions/debacu_eval_notifications_mark_read/index.ts
// Marca como leídas todas las alertas no leídas de la org del usuario.
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

  const { data: mem } = await sb
    .from("debacu_eval_org_members")
    .select("org_id")
    .eq("auth_user_id", authUserId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!mem?.org_id) return json(req, 200, { ok: true, updated: 0 });

  const orgId = String(mem.org_id);

  const { error, count } = await sb
    .from("debacu_eval_risk_alerts")
    .update({ is_read: true })
    .eq("org_id", orgId)
    .eq("is_read", false);

  if (error) {
    console.error("notifications_mark_read error:", error.message);
    return json(req, 500, { ok: false, error: "db_error" });
  }

  return json(req, 200, { ok: true, updated: count ?? 0 });
});
