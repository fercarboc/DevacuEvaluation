// ============================================================
// DEBACU — Edge Function: debacu_eval_get_risk_alerts
// ============================================================
// Ruta: supabase/functions/debacu_eval_get_risk_alerts/index.ts
//
// GET  /functions/v1/debacu_eval_get_risk_alerts
//      ?property_id=UUID   (opcional — filtra por propiedad)
//      &limit=20           (opcional — máx 100)
//      &include_resolved=true (opcional)
//
// PATCH /functions/v1/debacu_eval_get_risk_alerts
//   Body: { alert_id, resolution_note? }
//   → Marca alerta como resuelta
//
// Auth: JWT del usuario autenticado
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface RiskAlert {
  id: string;
  org_id: string;
  property_id: string | null;
  stay_id: string;
  import_batch_id: string;
  identity_key: string;
  checkin_date: string;
  checkout_date: string | null;
  risk_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  risk_reason: string | null;
  incidents_count: number;
  total_net_loss: number;
  incident_types: string[];
  is_resolved: boolean;
  created_at: string;
}

serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "No autorizado" }, 401);

  // Verificar JWT
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "No autorizado" }, 401);

  const supabase = createClient(supabaseUrl, serviceKey);

  // Obtener org_id del usuario via debacu_eval_org_members
  const { data: membership } = await supabase
    .from("debacu_eval_org_members")
    .select("org_id")
    .eq("auth_user_id", user.id)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (!membership?.org_id) {
    return json({ error: "Sin organización activa" }, 403);
  }
  const orgId = membership.org_id;

  // --------------------------------------------------------
  // GET — Panel de alertas
  // --------------------------------------------------------
  if (req.method === "GET") {
    const url = new URL(req.url);
    const propertyId      = url.searchParams.get("property_id");
    const limit           = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);
    const includeResolved = url.searchParams.get("include_resolved") === "true";

    let query = supabase
      .from("debacu_eval_risk_alerts")
      .select(`
        id,
        org_id,
        property_id,
        stay_id,
        import_batch_id,
        identity_key,
        checkin_date,
        checkout_date,
        risk_score,
        risk_level,
        risk_reason,
        incidents_count,
        total_net_loss,
        incident_types,
        is_resolved,
        created_at
      `)
      .eq("org_id", orgId)
      .order("checkin_date", { ascending: true })
      .limit(limit);

    if (!includeResolved) query = query.eq("is_resolved", false);
    if (propertyId)       query = query.eq("property_id", propertyId);

    const { data: alerts, error } = await query;
    if (error) return json({ error: error.message }, 500);

    const list = (alerts ?? []) as RiskAlert[];

    const summary = {
      total:    list.length,
      by_level: {
        critical: list.filter((a) => a.risk_level === "critical").length,
        high:     list.filter((a) => a.risk_level === "high").length,
        medium:   list.filter((a) => a.risk_level === "medium").length,
      },
      next_checkin:     list[0]?.checkin_date ?? null,
      total_net_impact: list.reduce((acc, a) => acc + (a.total_net_loss ?? 0), 0),
    };

    return json({ alerts: list, summary });
  }

  // --------------------------------------------------------
  // PATCH — Resolver alerta
  // --------------------------------------------------------
  if (req.method === "PATCH") {
    let body: { alert_id: string; resolution_note?: string };
    try { body = await req.json(); }
    catch { return json({ error: "Body inválido" }, 400); }

    if (!body.alert_id) return json({ error: "alert_id requerido" }, 400);

    // Verificar que la alerta pertenece a esta org
    const { data: alert } = await supabase
      .from("debacu_eval_risk_alerts")
      .select("id")
      .eq("id", body.alert_id)
      .eq("org_id", orgId)
      .maybeSingle();

    if (!alert) return json({ error: "Alerta no encontrada" }, 404);

    const { error: updateError } = await supabase
      .from("debacu_eval_risk_alerts")
      .update({
        is_resolved:     true,
        resolved_at:     new Date().toISOString(),
        resolved_by:     user.id,
        resolution_note: body.resolution_note ?? null,
      })
      .eq("id", body.alert_id);

    if (updateError) return json({ error: updateError.message }, 500);
    return json({ success: true });
  }

  return json({ error: "Método no permitido" }, 405);
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}