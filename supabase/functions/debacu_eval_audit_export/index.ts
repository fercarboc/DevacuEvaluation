// supabase/functions/debacu_eval_audit_export/index.ts
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

type AuditSource = "ALL" | "PRODUCT" | "SYSTEM";
type ExportFormat = "CSV" | "PDF" | "XML";

type Body = {
  format: ExportFormat;

  source?: AuditSource;
  customer?: string | null;
  type?: string | null;
  from?: string | null;
  to?: string | null;

  delivered_to_name: string;
  delivered_to_org?: string | null;
  delivered_to_reason: string;
  delivered_to_reference?: string | null;

  limit?: number;
};

// ✅ CORS
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*", // en prod puedes poner tu dominio exacto
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(res: any, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function safeFileNamePart(v: string) {
  return (
    v
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_\-\.]/g, "")
      .slice(0, 60) || "export"
  );
}

async function sha256Hex(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const arr = Array.from(new Uint8Array(hash));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function csvEscape(v: any) {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  const needs = /[",\n\r]/.test(s);
  const out = s.replace(/"/g, '""');
  return needs ? `"${out}"` : out;
}

function buildCSV(rows: any[]) {
  const headers = [
    "created_at",
    "source",
    "type",
    "customer_id",
    "app_id",
    "stripe_subscription_id",
    "payload",
  ];
  const lines = [headers.join(",")];

  for (const r of rows) {
    const line = [
      csvEscape(r.created_at),
      csvEscape(r.source),
      csvEscape(r.type),
      csvEscape(r.customer_id),
      csvEscape(r.app_id),
      csvEscape(r.stripe_subscription_id),
      csvEscape(r.payload),
    ].join(",");
    lines.push(line);
  }

  return new TextEncoder().encode(lines.join("\n"));
}

function buildXML(rows: any[]) {
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<audit_export>`);
  parts.push(`<events count="${rows.length}">`);

  for (const r of rows) {
    parts.push(`<event>`);
    parts.push(`<created_at>${esc(String(r.created_at ?? ""))}</created_at>`);
    parts.push(`<source>${esc(String(r.source ?? ""))}</source>`);
    parts.push(`<type>${esc(String(r.type ?? ""))}</type>`);
    parts.push(`<customer_id>${esc(String(r.customer_id ?? ""))}</customer_id>`);
    parts.push(`<app_id>${esc(String(r.app_id ?? ""))}</app_id>`);
    parts.push(
      `<stripe_subscription_id>${esc(
        String(r.stripe_subscription_id ?? "")
      )}</stripe_subscription_id>`
    );
    parts.push(`<payload>${esc(JSON.stringify(r.payload ?? {}))}</payload>`);
    parts.push(`</event>`);
  }

  parts.push(`</events>`);
  parts.push(`</audit_export>`);

  return new TextEncoder().encode(parts.join("\n"));
}

async function buildPDF(rows: any[], title: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const page = pdf.addPage([842, 595]);
  const { width, height } = page.getSize();

  let y = height - 40;
  page.drawText(title, { x: 40, y, size: 14, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  y -= 18;

  page.drawText(`Eventos: ${rows.length}`, { x: 40, y, size: 10, font, color: rgb(0.35, 0.35, 0.35) });
  y -= 16;

  const cols = [
    { label: "Fecha", w: 160 },
    { label: "Origen", w: 90 },
    { label: "Tipo", w: 140 },
    { label: "Cliente", w: 170 },
    { label: "App", w: 110 },
    { label: "Stripe", w: 140 },
  ];

  const startX = 40;
  const rowH = 14;

  let x = startX;
  for (const c of cols) {
    page.drawText(c.label, { x, y, size: 9, font: fontBold });
    x += c.w;
  }
  y -= 10;
  page.drawLine({ start: { x: startX, y }, end: { x: width - 40, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  y -= 10;

  const maxRows = Math.min(rows.length, 35);
  for (let i = 0; i < maxRows; i++) {
    const r = rows[i];
    x = startX;

    const cells = [
      String(r.created_at ?? ""),
      String(r.source ?? ""),
      String(r.type ?? ""),
      String(r.customer_id ?? ""),
      String(r.app_id ?? ""),
      String(r.stripe_subscription_id ?? ""),
    ];

    for (let c = 0; c < cols.length; c++) {
      const text = cells[c].length > 30 ? cells[c].slice(0, 30) + "…" : cells[c];
      page.drawText(text, { x, y, size: 8, font, color: rgb(0.2, 0.2, 0.2) });
      x += cols[c].w;
    }

    y -= rowH;
    if (y < 60) break;
  }

  const bytes = await pdf.save();
  return new Uint8Array(bytes);
}

Deno.serve(async (req) => {
  // ✅ Responder preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) return json({ error: "Missing Bearer token" }, 401);

    // Validamos user con el JWT, pero consultamos/insertamos con service role
    const sbUser = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: userData, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Invalid auth" }, 401);

    const user = userData.user;
    const email = (user.email || "").toLowerCase();
    if (email !== "admin@debacu.com") return json({ error: "Forbidden" }, 403);

    const body = (await req.json()) as Body;

    if (!body.format || !["CSV", "PDF", "XML"].includes(body.format)) {
      return json({ error: "Invalid format" }, 400);
    }
    if (!body.delivered_to_name?.trim()) return json({ error: "delivered_to_name required" }, 400);
    if (!body.delivered_to_reason?.trim()) return json({ error: "delivered_to_reason required" }, 400);

    const limit = Math.min(Math.max(body.limit ?? 5000, 1), 20000);

    // ✅ Sacar eventos (RPC que ya tienes)
    const { data: rows, error: rpcErr } = await sbUser.rpc("admin_list_audit_events", {
      p_source: body.source ?? "ALL",
      p_customer: body.customer ?? null,
      p_type: body.type ?? null,
      p_from: body.from ?? null,
      p_to: body.to ?? null,
      p_limit: limit,
      p_offset: 0,
    });

    if (rpcErr) return json({ error: rpcErr.message }, 400);

    const dataRows = Array.isArray(rows) ? rows : [];
    const now = new Date();
    const dateTag = now.toISOString().slice(0, 10);

    const customerTag = body.customer ? safeFileNamePart(body.customer) : "all";
    const sourceTag = safeFileNamePart(body.source ?? "ALL");
    const typeTag = body.type ? safeFileNamePart(body.type) : "all";

    const baseName = `audit_${dateTag}_${sourceTag}_${customerTag}_${typeTag}`;
    const fileName = `${baseName}.${body.format.toLowerCase()}`;

    const bucket = "audit-exports";
    const storagePath = `${dateTag}/${fileName}`;

    let fileBytes: Uint8Array;
    let contentType = "application/octet-stream";

    if (body.format === "CSV") {
      fileBytes = buildCSV(dataRows);
      contentType = "text/csv";
    } else if (body.format === "XML") {
      fileBytes = buildXML(dataRows);
      contentType = "application/xml";
    } else {
      const title = `Debacu Evaluation 360 — Auditoría (${dateTag})`;
      fileBytes = await buildPDF(dataRows, title);
      contentType = "application/pdf";
    }

    const sha = await sha256Hex(fileBytes);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    const { error: upErr } = await sb.storage
      .from(bucket)
      .upload(storagePath, fileBytes, { contentType, upsert: true });

    if (upErr) return json({ error: upErr.message }, 400);

    const { data: ins, error: insErr } = await sb
      .from("debacu_eval_audit_exports")
      .insert({
        generated_by_user_id: user.id,
        generated_by_email: email,

        delivered_to_name: body.delivered_to_name.trim(),
        delivered_to_org: body.delivered_to_org?.trim() || null,
        delivered_to_reason: body.delivered_to_reason.trim(),
        delivered_to_reference: body.delivered_to_reference?.trim() || null,

        filter_source: body.source ?? null,
        filter_customer: body.customer ?? null,
        filter_type: body.type ?? null,
        filter_from: body.from ? body.from.slice(0, 10) : null,
        filter_to: body.to ? body.to.slice(0, 10) : null,

        format: body.format,
        row_count: dataRows.length,
        storage_bucket: bucket,
        storage_path: storagePath,
        file_sha256: sha,
        file_bytes: fileBytes.byteLength,
        meta: { limit },
      })
      .select("id")
      .maybeSingle();

    if (insErr) return json({ error: insErr.message }, 400);

    const { data: signed, error: signErr } = await sb.storage
      .from(bucket)
      .createSignedUrl(storagePath, 60 * 10);

    if (signErr) return json({ error: signErr.message }, 400);

    return json({
      export_id: ins?.id,
      bucket,
      path: storagePath,
      file_name: fileName,
      sha256: sha,
      bytes: fileBytes.byteLength,
      row_count: dataRows.length,
      signed_url: signed?.signedUrl,
    });
  } catch (e: any) {
    return json({ error: e?.message || "Unexpected error" }, 500);
  }
});
