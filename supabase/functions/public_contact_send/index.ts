import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import nodemailer from "npm:nodemailer@6.9.13";

import { json, preflight } from "../_shared/cors.ts";
import { supabaseServiceClient } from "../_shared/auth.ts";

type ReqBody = {
  name?: string | null;
  email?: string | null;
  company?: string | null;
  phone?: string | null;
  message?: string | null;
  website?: string | null; // honeypot anti-spam
};

function sanitize(v?: string | null) {
  return String(v ?? "").trim();
}

function isEmail(v?: string | null) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v ?? "").trim());
}

function limit(v: string, max: number) {
  return v.length > max ? v.slice(0, max) : v;
}

function escapeHtml(v: string) {
  return v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);

  if (req.method !== "POST") {
    return json(req, 405, {
      ok: false,
      error: "request_failed",
      detail: "method_not_allowed",
    });
  }

  const sb = supabaseServiceClient();

  let contactRequestId: string | null = null;

  try {
    const body = (await req.json().catch(() => ({}))) as ReqBody;

    const name = limit(sanitize(body?.name), 120);
    const email = limit(sanitize(body?.email), 180);
    const company = limit(sanitize(body?.company), 180);
    const phone = limit(sanitize(body?.phone), 60);
    const message = limit(sanitize(body?.message), 4000);
    const website = sanitize(body?.website); // honeypot

    // Honeypot anti-spam: si viene relleno, fingimos éxito y no hacemos nada
    if (website) {
      return json(req, 200, {
        ok: true,
        message: "request_received",
      });
    }

    if (!name || name.length < 2) {
      return json(req, 400, {
        ok: false,
        error: "request_failed",
        detail: "invalid_name",
      });
    }

    if (!isEmail(email)) {
      return json(req, 400, {
        ok: false,
        error: "request_failed",
        detail: "invalid_email",
      });
    }

    if (!message || message.length < 10) {
      return json(req, 400, {
        ok: false,
        error: "request_failed",
        detail: "invalid_message",
      });
    }

    const smtpHost = Deno.env.get("IONOS_SMTP_HOST");
    const smtpPort = Number(Deno.env.get("IONOS_SMTP_PORT") || "587");
    const smtpUser = Deno.env.get("IONOS_SMTP_USER");
    const smtpPass = Deno.env.get("IONOS_SMTP_PASS");

    const toEmail = Deno.env.get("CONTACT_TO_EMAIL") || "contacto@debacu.com";
    const fromEmail = Deno.env.get("CONTACT_FROM_EMAIL") || "contacto@debacu.com";

    if (!smtpHost || !smtpUser || !smtpPass) {
      return json(req, 500, {
        ok: false,
        error: "request_failed",
        detail: "smtp_not_configured",
      });
    }

    // 1) Guardar primero en BD con estado PENDING
    const { data: insertedRow, error: insertError } = await sb
      .from("public_contact_requests")
      .insert({
        name,
        email,
        company: company || null,
        phone: phone || null,
        message,
        source: "public_web",
        status: "PENDING",
        error_detail: null,
        sent_at: null,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("public_contact_requests insert error:", insertError.message);
      return json(req, 500, {
        ok: false,
        error: "request_failed",
        detail: "contact_request_insert_failed",
      });
    }

    contactRequestId = insertedRow?.id ?? null;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: false, // 587 STARTTLS
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      tls: {
        minVersion: "TLSv1.2",
        rejectUnauthorized: false,
      },
    });

    const submittedAt = new Date().toISOString();

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeCompany = escapeHtml(company || "No indicado");
    const safePhone = escapeHtml(phone || "No indicado");
    const safeMessage = escapeHtml(message);

    const subject = "[Debacu Web] Nueva solicitud de información";

    const text = [
      "Nueva solicitud de información desde la web pública de Debacu",
      "",
      `Nombre: ${name}`,
      `Email: ${email}`,
      `Empresa / Hotel: ${company || "No indicado"}`,
      `Teléfono: ${phone || "No indicado"}`,
      `Fecha: ${submittedAt}`,
      "",
      "Mensaje:",
      message,
    ].join("\n");

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.5;">
        <h2 style="margin-bottom: 16px;">Nueva solicitud de información</h2>

        <table style="border-collapse: collapse; width: 100%; max-width: 720px;">
          <tr>
            <td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Nombre</strong></td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">${safeName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Email</strong></td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">${safeEmail}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Empresa / Hotel</strong></td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">${safeCompany}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Teléfono</strong></td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">${safePhone}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Fecha</strong></td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">${submittedAt}</td>
          </tr>
        </table>

        <h3 style="margin-top: 24px;">Mensaje</h3>
        <div style="padding: 12px; border: 1px solid #e2e8f0; background: #f8fafc; white-space: pre-wrap;">${safeMessage}</div>
      </div>
    `;

    // 2) Enviar email
    await transporter.sendMail({
      from: `"Debacu Web" <${fromEmail}>`,
      to: toEmail,
      replyTo: email,
      subject,
      text,
      html,
    });

    // 3) Actualizar registro a SENT
    if (contactRequestId) {
      const { error: updateSentError } = await sb
        .from("public_contact_requests")
        .update({
          status: "SENT",
          sent_at: new Date().toISOString(),
          error_detail: null,
        })
        .eq("id", contactRequestId);

      if (updateSentError) {
        console.error(
          "public_contact_requests update SENT error:",
          updateSentError.message
        );
      }
    }

    return json(req, 200, {
      ok: true,
      message: "request_sent",
      data: {
        id: contactRequestId,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    console.error("public_contact_send error:", msg);

    // 4) Si falla el envío después de insertar, marcar ERROR
    if (contactRequestId) {
      const sb = supabaseServiceClient();

      const { error: updateErrorStatusError } = await sb
        .from("public_contact_requests")
        .update({
          status: "ERROR",
          error_detail: msg,
        })
        .eq("id", contactRequestId);

      if (updateErrorStatusError) {
        console.error(
          "public_contact_requests update ERROR error:",
          updateErrorStatusError.message
        );
      }
    }

    return json(req, 500, {
      ok: false,
      error: "request_failed",
      detail: "internal_error",
    });
  }
});