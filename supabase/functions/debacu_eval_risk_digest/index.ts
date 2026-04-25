// supabase/functions/debacu_eval_risk_digest/index.ts
// Cron diario (08:00 UTC): envía un email de resumen de alertas nuevas HIGH/MEDIUM a cada org.
// Invocación: POST con Authorization: Bearer SERVICE_ROLE_KEY
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import nodemailer from "npm:nodemailer@6.9.13";
import { supabaseServiceClient } from "../_shared/auth.ts";

const FROM_NAME  = "Debacu Evaluation";
const FROM_EMAIL = Deno.env.get("CONTACT_FROM_EMAIL") ?? "hola@debacu.com";
const SMTP_HOST  = Deno.env.get("IONOS_SMTP_HOST") ?? "";
const SMTP_PORT  = Number(Deno.env.get("IONOS_SMTP_PORT") ?? "587");
const SMTP_USER  = Deno.env.get("IONOS_SMTP_USER") ?? "";
const SMTP_PASS  = Deno.env.get("IONOS_SMTP_PASS") ?? "";

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-ES"); } catch { return iso; }
}

function riskLabel(level: string) {
  const l = level.toUpperCase();
  if (l === "CRITICAL" || l === "HIGH") return "ALTO";
  if (l === "MEDIUM") return "MEDIO";
  return level;
}

function riskColor(level: string) {
  const l = level.toUpperCase();
  if (l === "CRITICAL" || l === "HIGH") return "#ef4444";
  if (l === "MEDIUM") return "#f59e0b";
  return "#10b981";
}

type AlertRow = {
  id: string;
  checkin_date: string;
  risk_level: string;
  incidents_count: number | null;
  total_net_loss: number | null;
};

function buildDigestHtml(orgName: string, alerts: AlertRow[]) {
  const rows = alerts.map((a) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;">${fmtDate(a.checkin_date)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #1e293b;">
        <span style="background:${riskColor(a.risk_level)}22;color:${riskColor(a.risk_level)};padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">
          ${riskLabel(a.risk_level)}
        </span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;text-align:right;">${a.incidents_count ?? "—"}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;text-align:right;">
        ${a.total_net_loss != null ? new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(a.total_net_loss) : "—"}
      </td>
    </tr>`).join("");

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:640px;margin:40px auto;background:#1e293b;border-radius:12px;overflow:hidden;border:1px solid #334155;">
    <div style="background:#ef4444;padding:24px 32px;">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">⚠ Alerta de riesgo — Resumen diario</h1>
      <p style="margin:6px 0 0;color:#fecaca;font-size:13px;">${orgName}</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 20px;color:#cbd5e1;font-size:14px;line-height:1.6;">
        Se han detectado <strong style="color:#e2e8f0;">${alerts.length} reserva${alerts.length !== 1 ? "s" : ""} con riesgo alto o medio</strong>
        en las próximas fechas. Revisa las alarmas en el panel.
      </p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #334155;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#0f172a;">
            <th style="padding:10px 12px;text-align:left;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Check-in</th>
            <th style="padding:10px 12px;text-align:left;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Nivel</th>
            <th style="padding:10px 12px;text-align:right;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Incidencias</th>
            <th style="padding:10px 12px;text-align:right;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Impacto</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="text-align:center;margin-top:28px;">
        <a href="https://debacu.com/app/alarmas" style="display:inline-block;background:#ef4444;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:700;">
          Ver todas las alarmas →
        </a>
      </div>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #334155;">
      <p style="margin:0;color:#475569;font-size:11px;">© ${new Date().getFullYear()} Debacu · Gestión de riesgo hotelero</p>
    </div>
  </div>
</body>
</html>`;
}

function buildDigestText(orgName: string, alerts: AlertRow[]) {
  const lines = alerts.map((a) =>
    `  · ${fmtDate(a.checkin_date)} | ${riskLabel(a.risk_level)} | Incidencias: ${a.incidents_count ?? "—"}`
  );
  return [
    `[Debacu] Resumen de alertas — ${orgName}`,
    "",
    `${alerts.length} reserva(s) con riesgo alto o medio en las próximas fechas:`,
    ...lines,
    "",
    "Ver alertas: https://debacu.com/app/alarmas",
  ].join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!authHeader.includes(serviceKey)) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return new Response(JSON.stringify({ ok: false, error: "smtp_not_configured" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  const sb = supabaseServiceClient();
  const today = new Date().toISOString().split("T")[0];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Alertas nuevas del último día, futuras, no resueltas, alto/crítico/medio
  const { data: alerts, error: alertsErr } = await sb
    .from("debacu_eval_risk_alerts")
    .select("id, org_id, checkin_date, risk_level, incidents_count, total_net_loss")
    .eq("is_resolved", false)
    .in("risk_level", ["medium", "high", "critical"])
    .gte("checkin_date", today)
    .gte("created_at", since)
    .order("org_id")
    .order("checkin_date");

  if (alertsErr) {
    return new Response(JSON.stringify({ ok: false, error: alertsErr.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  if (!alerts || alerts.length === 0) {
    return new Response(JSON.stringify({ ok: true, orgs_notified: 0, message: "no_new_alerts" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  // Agrupar por org_id
  const byOrg = new Map<string, AlertRow[]>();
  for (const a of alerts as any[]) {
    const list = byOrg.get(a.org_id) ?? [];
    list.push(a);
    byOrg.set(a.org_id, list);
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: false },
  });

  let orgsNotified = 0;

  for (const [orgId, orgAlerts] of byOrg.entries()) {
    try {
      // Buscar nombre org + email del primer ADMIN de la org
      const { data: org } = await sb
        .from("debacu_eval_organizations")
        .select("name, customer_id")
        .eq("id", orgId)
        .maybeSingle();

      const { data: customer } = await sb
        .from("debacu_eval_customers")
        .select("email, name")
        .eq("id", org?.customer_id ?? "")
        .maybeSingle();

      const recipientEmail = customer?.email;
      if (!recipientEmail) continue;

      const orgName = org?.name ?? customer?.name ?? "tu establecimiento";

      await transporter.sendMail({
        from:    `"${FROM_NAME}" <${FROM_EMAIL}>`,
        to:      recipientEmail,
        subject: `[Debacu] ${orgAlerts.length} alerta${orgAlerts.length !== 1 ? "s" : ""} de riesgo — ${orgName}`,
        text:    buildDigestText(orgName, orgAlerts),
        html:    buildDigestHtml(orgName, orgAlerts),
      });

      orgsNotified++;
    } catch (e) {
      console.error(`risk_digest error org ${orgId}:`, String(e));
    }
  }

  return new Response(JSON.stringify({ ok: true, orgs_notified: orgsNotified }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
