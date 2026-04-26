// supabase/functions/debacu_eval_welcome_email_dispatch/index.ts
// Cron horario: envía los emails de bienvenida pendientes (send_after <= NOW()).
// Invocación: POST con Authorization: Bearer SERVICE_ROLE_KEY
// Recomendado: pg_cron cada hora → ver supabase/sql/welcome_email_queue.sql
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import nodemailer from "npm:nodemailer@6.9.13";
import { supabaseServiceClient } from "../_shared/auth.ts";

const FROM_NAME  = "Debacu Evaluation";
const FROM_EMAIL = Deno.env.get("CONTACT_FROM_EMAIL") ?? "hola@debacu.com";
const SMTP_HOST  = Deno.env.get("IONOS_SMTP_HOST") ?? "";
const SMTP_PORT  = Number(Deno.env.get("IONOS_SMTP_PORT") ?? "587");
const SMTP_USER  = Deno.env.get("IONOS_SMTP_USER") ?? "";
const SMTP_PASS  = Deno.env.get("IONOS_SMTP_PASS") ?? "";

const PLAN_LABEL: Record<string, string> = {
  BASIC:      "Basic",
  MEDIUM:     "Professional",
  PREMIUM:    "Enterprise",
  TRIAL:      "Trial",
};

function planLabel(code: string | null) {
  return PLAN_LABEL[String(code ?? "").toUpperCase()] ?? (code ?? "Basic");
}

function buildEmailHtml(name: string | null, plan: string | null) {
  const greeting = name ? `Hola ${name},` : "Hola,";
  const planStr  = planLabel(plan);

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#1e293b;border-radius:12px;overflow:hidden;border:1px solid #334155;">

    <!-- Header -->
    <div style="background:#2563eb;padding:28px 32px;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">
        Bienvenido a Debacu Evaluation
      </h1>
      <p style="margin:6px 0 0;color:#bfdbfe;font-size:14px;">Plan ${planStr}</p>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <p style="margin:0 0 16px;color:#e2e8f0;font-size:15px;line-height:1.6;">${greeting}</p>
      <p style="margin:0 0 16px;color:#cbd5e1;font-size:14px;line-height:1.7;">
        Tu cuenta de <strong style="color:#e2e8f0;">Debacu Evaluation</strong> está lista.
        Ahora puedes consultar el historial de riesgo de tus huéspedes, registrar incidencias
        y proteger los ingresos de tu establecimiento.
      </p>

      <p style="margin:0 0 8px;color:#94a3b8;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
        Primeros pasos recomendados
      </p>
      <ul style="margin:0 0 24px;padding-left:20px;color:#cbd5e1;font-size:14px;line-height:1.8;">
        <li>Completa el <strong>perfil de tu establecimiento</strong> (tipo, categoría, ADR, temporadas).</li>
        <li>Realiza tu primera <strong>consulta manual</strong> de un huésped por documento o email.</li>
        <li>Registra incidencias previas para enriquecer tu base de datos desde el inicio.</li>
      </ul>

      <!-- CTA -->
      <div style="text-align:center;margin:28px 0;">
        <a href="https://www.debacuapp.com/app" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:0.2px;">
          Acceder al panel →
        </a>
      </div>

      <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">
        Si tienes cualquier pregunta, responde a este email y te atendemos.
        Este mensaje fue enviado automáticamente tras tu primer acceso.
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;border-top:1px solid #334155;">
      <p style="margin:0;color:#475569;font-size:11px;">
        © ${new Date().getFullYear()} Debacu · Gestión de riesgo hotelero
      </p>
    </div>
  </div>
</body>
</html>`;
}

function buildEmailText(name: string | null, plan: string | null) {
  const greeting = name ? `Hola ${name},` : "Hola,";
  return [
    greeting,
    "",
    `Bienvenido a Debacu Evaluation (Plan ${planLabel(plan)}).`,
    "",
    "Tu cuenta está lista. Primeros pasos:",
    "  1. Completa el perfil de tu establecimiento.",
    "  2. Realiza tu primera consulta manual de un huésped.",
    "  3. Registra incidencias previas para enriquecer tu base de datos.",
    "",
    "Accede al panel: https://www.debacuapp.com/app",
    "",
    "— Equipo Debacu",
  ].join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Solo service role puede invocar este endpoint
  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!authHeader.includes(serviceKey)) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return new Response(JSON.stringify({ ok: false, error: "smtp_not_configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sb = supabaseServiceClient();
  const now = new Date().toISOString();

  // Pending: send_after <= NOW() AND sent_at IS NULL (máx 50 por ejecución)
  const { data: pending, error: fetchErr } = await sb
    .from("debacu_eval_welcome_emails")
    .select("id, recipient_email, recipient_name, plan_code")
    .is("sent_at", null)
    .lte("send_after", now)
    .limit(50);

  if (fetchErr) {
    return new Response(JSON.stringify({ ok: false, error: fetchErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!pending || pending.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, message: "no_pending" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: false },
  });

  let sent = 0;
  let errors = 0;

  for (const row of pending as any[]) {
    try {
      await transporter.sendMail({
        from:    `"${FROM_NAME}" <${FROM_EMAIL}>`,
        to:      row.recipient_email,
        subject: "Bienvenido a Debacu Evaluation — tu cuenta está lista",
        text:    buildEmailText(row.recipient_name, row.plan_code),
        html:    buildEmailHtml(row.recipient_name, row.plan_code),
      });

      await sb
        .from("debacu_eval_welcome_emails")
        .update({ sent_at: new Date().toISOString(), error_detail: null })
        .eq("id", row.id);

      sent++;
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      console.error(`welcome_email dispatch error [${row.id}]:`, msg);

      await sb
        .from("debacu_eval_welcome_emails")
        .update({ error_detail: msg.slice(0, 500) })
        .eq("id", row.id);

      errors++;
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, errors, total: pending.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
