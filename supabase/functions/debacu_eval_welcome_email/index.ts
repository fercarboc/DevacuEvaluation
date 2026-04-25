// supabase/functions/debacu_eval_welcome_email/index.ts
// Encola un email de bienvenida para el usuario autenticado.
// Llamado desde el frontend al detectar que el perfil de hotel es null (primer login).
// El envío real lo hace debacu_eval_welcome_email_dispatch (cron horario).
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
  const authEmail  = safeStr(authUser?.email).toLowerCase();
  if (!authUserId) return json(req, 401, { ok: false, error: "unauthenticated" });

  const sb = supabaseServiceClient();

  // 1) Resolver customer_id y plan desde org membership
  const { data: mem } = await sb
    .from("debacu_eval_org_members")
    .select("org_id")
    .eq("auth_user_id", authUserId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!mem?.org_id) return json(req, 200, { ok: true, skipped: true, reason: "no_active_membership" });

  const orgId = String(mem.org_id);

  const { data: org } = await sb
    .from("debacu_eval_organizations")
    .select("customer_id")
    .eq("id", orgId)
    .maybeSingle();

  if (!org?.customer_id) return json(req, 200, { ok: true, skipped: true, reason: "no_customer" });

  const customerId = String(org.customer_id);

  // 2) Nombre del cliente
  const { data: customer } = await sb
    .from("debacu_eval_customers")
    .select("name, email")
    .eq("id", customerId)
    .maybeSingle();

  const recipientEmail = safeStr(customer?.email) || authEmail;
  const recipientName  = safeStr(customer?.name)  || null;

  // 3) Plan actual
  const { data: ent } = await sb
    .from("debacu_eval_org_entitlements_v")
    .select("plan_code")
    .eq("org_id", orgId)
    .maybeSingle();

  const planCode = safeStr(ent?.plan_code) || null;

  // 4) Insertar en cola (UNIQUE customer_id: si ya existe no hace nada)
  const { error: insertErr } = await sb
    .from("debacu_eval_welcome_emails")
    .insert({
      customer_id:     customerId,
      org_id:          orgId,
      recipient_email: recipientEmail,
      recipient_name:  recipientName,
      plan_code:       planCode,
      // send_after usa el DEFAULT: NOW() + 1h
    })
    .select("id")
    .maybeSingle();

  // error 23505 = UNIQUE violation: ya estaba encolado (o ya enviado), ignoramos
  if (insertErr && insertErr.code !== "23505") {
    console.error("welcome_email insert error:", insertErr.message);
    return json(req, 500, { ok: false, error: "queue_insert_failed" });
  }

  const alreadyQueued = insertErr?.code === "23505";
  return json(req, 200, { ok: true, queued: !alreadyQueued, already_queued: alreadyQueued });
});
