import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ✅ La versión la manda el servidor (no el cliente)
const TERMS_VERSION = "2026-01-24 - V1.0";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type PropertyType = "HOTEL" | "RURAL" | "APARTMENTS" | "HOSTEL" | "OTHER";

type Body = {
  request_id: string;
};

type PdfData = {
  request_id: string;
  terms_version: string;

  company_name: string;
  cif: string;
  contact_name: string;
  email: string;

  property_type?: PropertyType | null;
  city?: string | null;
  country?: string | null;
  legal_name?: string | null;
  address?: string | null;
  rooms_count?: number | null;
  website?: string | null;
  contact_role?: string | null;
  phone?: string | null;
  notes?: string | null;
};

async function buildPdf(data: PdfData, acceptedAtIso: string) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 48;
  let y = 800;

  const drawTitle = (text: string) => {
    page.drawText(text, {
      x: margin,
      y,
      size: 16,
      font: fontBold,
      color: rgb(0.05, 0.1, 0.2),
    });
    y -= 28;
  };

  const drawLine = (label: string, value: string) => {
    page.drawText(label, {
      x: margin,
      y,
      size: 10.5,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText(value || "-", {
      x: margin + 170,
      y,
      size: 10.5,
      font,
      color: rgb(0.15, 0.15, 0.15),
    });
    y -= 18;
  };

  const drawParagraph = (text: string) => {
    const size = 10.5;
    const maxWidth = 595.28 - margin * 2;
    const words = text.split(" ");
    let line = "";
    const lines: string[] = [];

    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      const width = font.widthOfTextAtSize(test, size);
      if (width > maxWidth) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);

    for (const l of lines) {
      page.drawText(l, { x: margin, y, size, font, color: rgb(0.2, 0.2, 0.2) });
      y -= 14.5;
    }
    y -= 10;
  };

  drawTitle("Justificante de aceptación de condiciones");
  drawLine("Solicitud (ID):", data.request_id);
  drawLine("Fecha/hora aceptación:", acceptedAtIso);
  drawLine("Versión términos:", data.terms_version);

  y -= 6;
  drawTitle("Datos declarados por el solicitante");
  drawLine("Nombre comercial:", data.company_name);
  drawLine("Razón social:", data.legal_name ?? "-");
  drawLine("CIF:", data.cif);
  drawLine("Dirección:", data.address ?? "-");
  drawLine("Ciudad:", data.city ?? "-");
  drawLine("País:", data.country ?? "-");
  drawLine("Tipo alojamiento:", data.property_type ?? "-");
  drawLine("Nº habitaciones:", data.rooms_count?.toString() ?? "-");
  drawLine("Web:", data.website ?? "-");
  drawLine("Responsable:", data.contact_name);
  drawLine("Cargo:", data.contact_role ?? "-");
  drawLine("Email:", data.email);
  drawLine("Teléfono:", data.phone ?? "-");

  y -= 6;
  drawTitle("Declaración");
  drawParagraph(
    "El solicitante declara haber leído y aceptado expresamente los Términos y condiciones, " +
      "así como la política de uso profesional y acceso restringido del servicio Debacu Evaluation360. " +
      "Este justificante se genera como evidencia interna de aceptación, con la versión indicada y " +
      "la fecha/hora de aceptación."
  );

  if (data.notes?.trim()) {
    y -= 6;
    drawTitle("Observaciones");
    drawParagraph(data.notes.trim());
  }

  page.drawText("Debacu Evaluation360 · Centro legal", {
    x: margin,
    y: 28,
    size: 9,
    font,
    color: rgb(0.45, 0.45, 0.45),
  });

  return await pdfDoc.save();
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "Method not allowed" });

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = (await req.json()) as Body;

    if (!body?.request_id) return json(400, { error: "request_id required" });

    // ✅ Leer todos los datos desde la tabla
    const { data: row, error: reqErr } = await supabase
      .from("debacu_eval_access_requests")
      .select(
        "id,status,company_name,legal_name,cif,address,city,country,property_type,rooms_count,website,contact_name,contact_role,email,phone,notes"
      )
      .eq("id", body.request_id)
      .maybeSingle();

    if (reqErr) return json(500, { error: reqErr.message });
    if (!row) return json(404, { error: "request not found" });

    // mínimos reales (por si acaso)
    if (!row.company_name) return json(400, { error: "company_name missing in request row" });
    if (!row.cif) return json(400, { error: "cif missing in request row" });
    if (!row.contact_name) return json(400, { error: "contact_name missing in request row" });
    if (!row.email) return json(400, { error: "email missing in request row" });

    const acceptedAt = new Date().toISOString();

    const pdfData: PdfData = {
      request_id: row.id,
      terms_version: TERMS_VERSION,
      company_name: row.company_name,
      legal_name: row.legal_name,
      cif: row.cif,
      address: row.address,
      city: row.city,
      country: row.country,
      property_type: row.property_type as PropertyType | null,
      rooms_count: row.rooms_count,
      website: row.website,
      contact_name: row.contact_name,
      contact_role: row.contact_role,
      email: row.email,
      phone: row.phone,
      notes: row.notes,
    };

    const pdfBytes = await buildPdf(pdfData, acceptedAt);

    const digest = await crypto.subtle.digest("SHA-256", pdfBytes);
    const sha256 = toHex(digest);

    const safeTs = acceptedAt.replace(/[:.]/g, "-");
    const bucket = "debacu_legal_acceptances";
    const path = `debacu_eval/${row.id}/terms_acceptance_${safeTs}.pdf`;

    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, pdfBytes, { contentType: "application/pdf", upsert: false });

    if (upErr) return json(500, { error: `upload failed: ${upErr.message}` });

    // ✅ Signed URL (bucket privado)
    const { data: signed, error: signErr } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60); // 1 hora

    if (signErr) return json(500, { error: `signed url failed: ${signErr.message}` });

    // ✅ Guardar evidencia en la solicitud
    const { error: updErr } = await supabase
      .from("debacu_eval_access_requests")
      .update({
        accepted_terms: true,
        accepted_terms_pdf_path: path,
        accepted_terms_pdf_sha256: sha256,
        accepted_terms_accepted_at: acceptedAt,
        terms_version: TERMS_VERSION,
      })
      .eq("id", row.id);

    if (updErr) return json(500, { error: updErr.message });

    // ✅ Devolver en el formato que tu front espera
    return json(200, {
      proof: {
        request_id: row.id,
        bucket,
        path,
        signed_url: signed?.signedUrl ?? null,
        sha256,
        accepted_at: acceptedAt,
      },
    });
  } catch (e: any) {
    return json(500, { error: e?.message ?? String(e) });
  }
});
