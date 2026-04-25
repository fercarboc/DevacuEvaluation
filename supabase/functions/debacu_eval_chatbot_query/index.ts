// supabase/functions/debacu_eval_chatbot_query/index.ts
// Asistente conversacional RAG para Debacu Evaluation 360.
// Contexto: docs de conocimiento global + alertas activas de la org.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

type MsgRole = "user" | "assistant";
interface ApiMsg { role: MsgRole; content: string; }

async function callClaude(messages: ApiMsg[], system: string): Promise<string> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.content?.[0]?.text as string) ?? "";
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST")    return json(req, 405, { ok: false, error: "method_not_allowed" });

  let authUser: any;
  try {
    authUser = await requireUser(req);
  } catch {
    return json(req, 401, { ok: false, error: "unauthenticated" });
  }

  const authUserId = safeStr(authUser?.id);
  if (!authUserId) return json(req, 401, { ok: false, error: "unauthenticated" });

  let body: { message?: string; session_id?: string };
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { ok: false, error: "invalid_json" });
  }

  const userMessage = safeStr(body.message);
  if (!userMessage) return json(req, 400, { ok: false, error: "message_required" });

  const sb = supabaseServiceClient();

  // 1. Resolver org_id
  const { data: mem } = await sb
    .from("debacu_eval_org_members")
    .select("org_id")
    .eq("auth_user_id", authUserId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!mem?.org_id) return json(req, 403, { ok: false, error: "no_active_membership" });
  const orgId = safeStr(mem.org_id);

  // 2. Obtener nombre de la organización
  const { data: org } = await sb
    .from("debacu_eval_organizations")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();
  const orgName = safeStr(org?.name) || "tu establecimiento";

  // 3. Obtener o crear sesión de chat
  let sessionId = safeStr(body.session_id);
  if (!sessionId) {
    const { data: sess, error: sessErr } = await sb
      .from("debacu_eval_chatbot_sessions")
      .insert({ org_id: orgId, auth_user_id: authUserId })
      .select("id")
      .single();
    if (sessErr || !sess) {
      console.error("session create error:", sessErr?.message);
      return json(req, 500, { ok: false, error: "session_create_failed" });
    }
    sessionId = sess.id;
  }

  // 4. Historial reciente (últimos 8 mensajes)
  const { data: history } = await sb
    .from("debacu_eval_chatbot_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(8);

  const chatHistory: ApiMsg[] = (history ?? []).map((m: any) => ({
    role:    m.role as MsgRole,
    content: safeStr(m.content),
  }));

  // 5. Documentos de conocimiento globales
  const { data: docs } = await sb
    .from("debacu_eval_chatbot_docs")
    .select("title, content")
    .eq("is_global", true)
    .order("category")
    .limit(10);

  // 6. Alarmas activas de la org (contexto de datos en vivo)
  const today = new Date().toISOString().split("T")[0];
  const { data: alerts } = await sb
    .from("debacu_eval_risk_alerts")
    .select("checkin_date, risk_level, incidents_count, total_net_loss")
    .eq("org_id", orgId)
    .eq("is_resolved", false)
    .in("risk_level", ["high", "medium", "critical"])
    .gte("checkin_date", today)
    .order("checkin_date", { ascending: true })
    .limit(5);

  // 7. Construir system prompt con contexto
  const docsContext = (docs ?? [])
    .map((d: any) => `## ${d.title}\n${d.content}`)
    .join("\n\n");

  const alertLines = (alerts ?? []).map((a: any) => {
    const date   = new Date(a.checkin_date).toLocaleDateString("es-ES");
    const risk   = String(a.risk_level).toUpperCase();
    const impact = a.total_net_loss != null
      ? new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(a.total_net_loss)
      : "—";
    return `  · ${date}: riesgo ${risk}, ${a.incidents_count ?? 0} incidencias, impacto ${impact}`;
  });

  const alertsSection = alertLines.length > 0
    ? `\n## Alarmas activas (${alertLines.length} reservas con riesgo alto/medio):\n${alertLines.join("\n")}`
    : "\n## Alarmas activas: ninguna en este momento.";

  const systemPrompt =
    `Eres el asistente inteligente de Debacu Evaluation 360 para ${orgName}, una plataforma SaaS para gestión de riesgo hotelero. Ayudas a interpretar datos de riesgo, usar la plataforma y entender las alertas de reservas.

Responde SIEMPRE en español. Sé conciso, directo y profesional. Usa bullet points cuando aporte claridad. No inventes datos que no estén en el contexto.
${alertsSection}

# Documentación de la plataforma:
${docsContext}`;

  // 8. Llamar a Claude
  const allMessages: ApiMsg[] = [...chatHistory, { role: "user", content: userMessage }];

  let reply: string;
  try {
    reply = await callClaude(allMessages, systemPrompt);
  } catch (err) {
    console.error("claude error:", err);
    return json(req, 500, { ok: false, error: "ai_error" });
  }

  // 9. Persistir mensajes
  await sb.from("debacu_eval_chatbot_messages").insert([
    { session_id: sessionId, role: "user",      content: userMessage },
    { session_id: sessionId, role: "assistant", content: reply       },
  ]);

  await sb
    .from("debacu_eval_chatbot_sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", sessionId);

  return json(req, 200, { ok: true, reply, session_id: sessionId });
});
