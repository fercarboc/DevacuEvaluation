// ============================================================
// DEBACU — Edge Function: debacu_eval_risk_agent_nightly
// ============================================================
// Ruta: supabase/functions/debacu_eval_risk_agent_nightly/index.ts
//
// Invocación:
//   POST /functions/v1/debacu_eval_risk_agent_nightly
//   Header: Authorization: Bearer SERVICE_ROLE_KEY
//
// Cron recomendado: 02:00 UTC diario
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ------------------------------------------------------------
// TIPOS
// ------------------------------------------------------------

interface GuestStay {
  id: string;
  org_id: string;
  property_id: string | null;
  identity_key: string;
  checkin_date: string;
  checkout_date: string | null;
  import_batch_id: string;
}

interface GuestEvidence {
  incident_type: string | null;
  severity: string | null;
  economic_net_loss: number | null;
  rating: number | null;
}

interface RiskScore {
  score: number;
  level: "low" | "medium" | "high" | "critical";
  incidents_count: number;
  total_net_loss: number;
  incident_types: string[];
}

interface AgentResult {
  org_id: string;
  stays_evaluated: number;
  alerts_created: number;
  alerts_skipped: number;
  alerts_already_exist: number;
  errors: string[];
}

// ------------------------------------------------------------
// CONFIGURACIÓN
// ------------------------------------------------------------

const ALERT_THRESHOLD: RiskScore["level"] = "medium";
const LOOKAHEAD_DAYS: number | null = 30;

const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 50,
  high: 30,
  medium: 15,
  low: 5,
};

const INCIDENT_TYPE_WEIGHTS: Record<string, number> = {
  AGGRESSIVE_BEHAVIOR: 35,
  DAMAGE_MAJOR: 40,
  SMOKING: 20,
  DAMAGE_MINOR: 15,
  NO_SHOW: 15,
  MISSING_ITEMS: 10,
  NOISE: 8,
};

// ------------------------------------------------------------
// SCORING
// ------------------------------------------------------------

function calculateRiskScore(evidence: GuestEvidence[]): RiskScore {
  const incidents = evidence.filter((e) => e.incident_type !== null);
  let score = 0;

  for (const ev of incidents) {
    if (ev.severity) {
      score += SEVERITY_WEIGHTS[ev.severity.toLowerCase()] ?? 5;
    } else if (ev.incident_type) {
      score += INCIDENT_TYPE_WEIGHTS[ev.incident_type] ?? 8;
    }
  }

  // Penalización por reincidencia
  if (incidents.length > 1) score += (incidents.length - 1) * 10;

  // Impacto económico acumulado
  const totalNet = evidence.reduce((acc, e) => acc + (e.economic_net_loss ?? 0), 0);
  if (totalNet > 500) score += 20;
  else if (totalNet > 250) score += 12;
  else if (totalNet > 100) score += 6;

  // Rating bajo = conflictividad
  const ratings = evidence
    .map((e) => e.rating)
    .filter((r): r is number => r !== null);
  if (ratings.length > 0) {
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    if (avg <= 2) score += 15;
    else if (avg <= 3) score += 8;
  }

  score = Math.min(score, 100);

  const level: RiskScore["level"] =
    score >= 75 ? "critical" :
    score >= 50 ? "high" :
    score >= 25 ? "medium" :
    "low";

  const incident_types = [
    ...new Set(incidents.map((e) => e.incident_type).filter(Boolean) as string[]),
  ];

  return { score, level, incidents_count: incidents.length, total_net_loss: totalNet, incident_types };
}

function shouldAlert(level: RiskScore["level"]): boolean {
  const levels = ["low", "medium", "high", "critical"];
  return levels.indexOf(level) >= levels.indexOf(ALERT_THRESHOLD);
}

// ------------------------------------------------------------
// RAZÓN EN LENGUAJE NATURAL (Claude API — opcional)
// ------------------------------------------------------------

async function generateRiskReason(riskScore: RiskScore): Promise<string | null> {
  try {
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return null;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        messages: [{
          role: "user",
          content: `Eres un sistema de análisis de riesgo hotelero.
Genera una explicación concisa (máximo 2 frases, en español) del riesgo detectado.
Nivel: ${riskScore.level.toUpperCase()} (score: ${riskScore.score}/100)
Incidencias previas: ${riskScore.incidents_count}
Tipos: ${riskScore.incident_types.join(", ") || "sin tipo específico"}
Impacto neto acumulado: ${riskScore.total_net_loss.toFixed(2)}€
Responde SOLO con la explicación, sin preámbulos.`,
        }],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.content?.[0]?.text?.trim() ?? null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------
// PROCESAMIENTO POR ORG
// ------------------------------------------------------------

async function processOrg(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  runId: string
): Promise<AgentResult> {
  const result: AgentResult = {
    org_id: orgId,
    stays_evaluated: 0,
    alerts_created: 0,
    alerts_skipped: 0,
    alerts_already_exist: 0,
    errors: [],
  };

  const today = new Date().toISOString().split("T")[0];

  let staysQuery = supabase
    .from("debacu_eval_guest_stays")
    .select("id, org_id, property_id, identity_key, checkin_date, checkout_date, import_batch_id")
    .eq("org_id", orgId)
    .eq("stay_status", "PLANNED")
    .gte("checkin_date", today);

  if (LOOKAHEAD_DAYS !== null) {
    const lookahead = new Date();
    lookahead.setDate(lookahead.getDate() + LOOKAHEAD_DAYS);
    staysQuery = staysQuery.lte("checkin_date", lookahead.toISOString().split("T")[0]);
  }

  const { data: stays, error: staysError } = await staysQuery;

  if (staysError) {
    result.errors.push(`Error stays: ${staysError.message}`);
    return result;
  }
  if (!stays || stays.length === 0) return result;

  // Deduplicar por identity_key — un huésped puede tener varias reservas
  const uniqueKeys = new Map<string, GuestStay>();
  for (const stay of stays as GuestStay[]) {
    if (!uniqueKeys.has(stay.identity_key)) uniqueKeys.set(stay.identity_key, stay);
  }

  for (const [identityKey, stay] of uniqueKeys.entries()) {
    result.stays_evaluated++;

    try {
      // Historial de incidencias del huésped en esta org
      const { data: evidence, error: evidenceError } = await supabase
        .from("debacu_eval_org_guest_evidence")
        .select("incident_type, severity, economic_net_loss, rating")
        .eq("org_id", orgId)
        .eq("identity_key", identityKey);

      if (evidenceError) {
        result.errors.push(`Evidence [${identityKey.slice(0, 8)}]: ${evidenceError.message}`);
        continue;
      }

      if (!evidence || evidence.length === 0) {
        result.alerts_skipped++;
        continue;
      }

      const riskScore = calculateRiskScore(evidence as GuestEvidence[]);

      if (!shouldAlert(riskScore.level)) {
        result.alerts_skipped++;
        continue;
      }

      // Comprobar si ya existe alerta activa para esta estancia
      const { data: existing } = await supabase
        .from("debacu_eval_risk_alerts")
        .select("id")
        .eq("org_id", orgId)
        .eq("stay_id", stay.id)
        .eq("is_resolved", false)
        .maybeSingle();

      if (existing) {
        result.alerts_already_exist++;
        continue;
      }

      const riskReason = await generateRiskReason(riskScore);

      const { error: insertError } = await supabase
        .from("debacu_eval_risk_alerts")
        .insert({
          org_id: orgId,
          property_id: stay.property_id,
          stay_id: stay.id,
          import_batch_id: stay.import_batch_id,
          identity_key: identityKey,
          checkin_date: stay.checkin_date,
          checkout_date: stay.checkout_date,
          risk_score: riskScore.score,
          risk_level: riskScore.level,
          risk_reason: riskReason,
          incidents_count: riskScore.incidents_count,
          total_net_loss: riskScore.total_net_loss,
          incident_types: riskScore.incident_types,
          agent_run_id: runId,
          is_resolved: false,
        });

      if (insertError) {
        if (insertError.code === "23505") {
          result.alerts_already_exist++;
        } else {
          result.errors.push(`Insert [${identityKey.slice(0, 8)}]: ${insertError.message}`);
        }
        continue;
      }

      result.alerts_created++;

    } catch (err) {
      result.errors.push(`Unexpected [${identityKey.slice(0, 8)}]: ${String(err)}`);
    }
  }

  return result;
}

// ------------------------------------------------------------
// HANDLER PRINCIPAL
// ------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const startedAt = Date.now();

  // Registrar inicio en debacu_eval_agent_runs (o ai_agent_runs según tu proyecto)
  const { data: run } = await supabase
    .from("debacu_eval_agent_runs")
    .insert({
      agent_name: "debacu_eval_risk_agent_nightly",
      status: "running",
      input_summary: {
        triggered_at: new Date().toISOString(),
        lookahead_days: LOOKAHEAD_DAYS,
      },
    })
    .select()
    .single();

  const runId = run?.id ?? "";

  try {
    const today = new Date().toISOString().split("T")[0];

    const { data: orgsData, error: orgsError } = await supabase
      .from("debacu_eval_guest_stays")
      .select("org_id")
      .eq("stay_status", "PLANNED")
      .gte("checkin_date", today);

    if (orgsError) throw new Error(`Error orgs: ${orgsError.message}`);

    const orgIds = [
      ...new Set((orgsData ?? []).map((r: { org_id: string }) => r.org_id)),
    ];

    if (orgIds.length === 0) {
      if (runId) {
        await supabase.from("debacu_eval_agent_runs").update({
          status: "completed",
          output_summary: { message: "Sin reservas futuras pendientes", orgs: 0 },
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
        }).eq("id", runId);
      }
      return resp({ success: true, message: "Sin reservas futuras pendientes" });
    }

    const results: AgentResult[] = [];
    for (const orgId of orgIds) {
      results.push(await processOrg(supabase, orgId, runId));
    }

    const summary = {
      orgs_processed: orgIds.length,
      total_stays_evaluated:    results.reduce((a, r) => a + r.stays_evaluated, 0),
      total_alerts_created:     results.reduce((a, r) => a + r.alerts_created, 0),
      total_alerts_skipped:     results.reduce((a, r) => a + r.alerts_skipped, 0),
      total_alerts_already_exist: results.reduce((a, r) => a + r.alerts_already_exist, 0),
      total_errors:             results.reduce((a, r) => a + r.errors.length, 0),
      duration_ms:              Date.now() - startedAt,
    };

    if (runId) {
      await supabase.from("debacu_eval_agent_runs").update({
        status: summary.total_errors > 0 ? "completed_with_errors" : "completed",
        output_summary: summary,
        completed_at: new Date().toISOString(),
        duration_ms: summary.duration_ms,
      }).eq("id", runId);
    }

    return resp({ success: true, ...summary });

  } catch (err) {
    const msg = String(err);
    if (runId) {
      await supabase.from("debacu_eval_agent_runs").update({
        status: "failed",
        error_message: msg,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
      }).eq("id", runId);
    }
    return resp({ success: false, error: msg }, 500);
  }
});

function resp(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}