// supabase/functions/debacu_eval_audit_export/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

import { json, preflight } from "../_shared/cors.ts";
import { requireAdmin, supabaseServiceClient } from "../_shared/auth.ts";

/* ======================================================
 * Types
 * ====================================================== */
type AuditSource = "ALL" | "PRODUCT" | "SYSTEM";
type ExportFormat = "CSV" | "PDF" | "XML";

type Body = {
  format: ExportFormat;

  source?: AuditSource;
  customer?: string | null;
  type?: string | null;
  from?: string | null; // ISO
  to?: string | null; // ISO

  delivered_to_name: string;
  delivered_to_org?: string | null;
  delivered_to_reason: string;
  delivered_to_reference?: string | null;

  limit?: number;
};

/* ======================================================
 * Config
 * ====================================================== */
const EXPORT_BUCKET = "system-exports"; // <- según tu doc/arquitectura
const SIGNED_URL_TTL_SECONDS = 600;

/* ======================================================
 * Utils
 * ====================================================== */
async function readJsonSafe<T>(req: Request): Promise<T | null> {
  try {
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function isIsoLike(v: any) {
  if (typeof v !== "string") return false;
  return v.includes("T") || /^\d{4}-\d{2}-\d{2}/.test(v);
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
  const headers = ["created_at", "source", "type", "customer_id", "app_id", "stripe_subscription_id", "payload"];
  const lines = [headers.join(",")];

  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.created_at),
        csvEscape(r.source),
        csvEscape(r.type),
        csvEscape(r.customer_id),
        csvEscape(r.app_id),
        csvEscape(r.stripe_subscription_id),
        csvEscape(r.payload),
      ].join(","),
    );
  }

  return new TextEncoder().encode(lines.join("\n"));
}

function buildXML(rows: any[]) {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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
    parts.push(`<stripe_subscription_id>${esc(String(r.stripe_subscription_id ?? ""))}</stripe_subscription_id>`);
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

  const page = pdf.addPage([842, 595]); // A4 landscape
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

  page.drawLine({
    start: { x: startX, y },
    end: { x: width - 40, y },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  });
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

/* ======================================================
 * Audit query (NO RPC)
 * ====================================================== */
async function listAuditRows(sb: ReturnType<typeof supabaseServiceClient>, body: Body) {
  const source: AuditSource = (body.source ?? "ALL") as AuditSource;
  const limit = Math.min(Math.max(Number(body.limit ?? 5000), 1), 20000);

  let q = sb
    .from("debacu_eval_audit_log")
    .select(
      "id, created_at, customer_id, app_id, event_type, action, entity, meta",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  // Heurística de “source”
  if (source === "SYSTEM") q = q.eq("entity", "stripe");
  if (source === "PRODUCT") q = q.neq("entity", "stripe");

  if (body.customer) q = q.eq("customer_id", safeStr(body.customer));
  if (body.type) q = q.eq("event_type", safeStr(body.type));

  if (body.from && isIsoLike(body.from)) q = q.gte("created_at", body.from);
  if (body.to && isIsoLike(body.to)) q = q.lte("created_at", body.to);

  const { data, error } = await q;
  if (error) throw new Error("DB_AUDIT_LIST_FAILED");

  const rows = Array.isArray(data) ? data : [];

  // Normalización de salida como en tu audit_api
  return rows.map((r: any) => ({
    created_at: r.created_at,
    customer_id: r.customer_id,
    app_id: r.app_id,
    source: r.entity === "stripe" ? "SYSTEM" : "PRODUCT",
    type: r.event_type ?? r.action ?? "—",
    stripe_subscription_id: r?.meta?.stripe_subscription_id ?? null,
    payload: r.meta ?? null,
  }));
}

/* ======================================================
 * Main
 * ====================================================== */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "request_failed", detail: "METHOD_NOT_ALLOWED" });
  }

  // ✅ admin-only JWT (sin allowlist local)
  let adminUser: any;
  try {
    const admin = await requireAdmin(req);
    // requireAdmin puede devolver user o un objeto; nos cubrimos
    adminUser = (admin as any)?.user ?? admin;
  } catch (e: any) {
    const msg = e?.message ?? "";
    const status = msg === "UNAUTHENTICATED" ? 401 : 403;
    const detail = status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN";
    return json(req, status, { ok: false, error: "request_failed", detail });
  }

  const body = await readJsonSafe<Body>(req);
  if (!body) {
    return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_json" });
  }

  const format = body.format;
  if (!format || !["CSV", "PDF", "XML"].includes(format)) {
    return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_format" });
  }

  if (!safeStr(body.delivered_to_name)) {
    return json(req, 400, { ok: false, error: "request_failed", detail: "missing_delivered_to_name" });
  }
  if (!safeStr(body.delivered_to_reason)) {
    return json(req, 400, { ok: false, error: "request_failed", detail: "missing_delivered_to_reason" });
  }

  const sb = supabaseServiceClient();

  // 1) obtener filas (NO RPC)
  let rows: any[] = [];
  try {
    rows = await listAuditRows(sb, body);
  } catch {
    return json(req, 500, { ok: false, error: "request_failed", detail: "DB_AUDIT_LIST_FAILED" });
  }

  // 2) construir fichero
  const now = new Date();
  const dateTag = now.toISOString().slice(0, 10);

  const customerTag = body.customer ? safeFileNamePart(body.customer) : "all";
  const sourceTag = safeFileNamePart(body.source ?? "ALL");
  const typeTag = body.type ? safeFileNamePart(body.type) : "all";

  const baseName = `audit_${dateTag}_${sourceTag}_${customerTag}_${typeTag}`;
  const ext = format.toLowerCase();
  const fileName = `${baseName}.${ext}`;

  // ✅ path UUID (sin upsert)
  const objectId = crypto.randomUUID();
  const storagePath = `${dateTag}/${objectId}.${ext}`;

  let fileBytes: Uint8Array;
  let contentType = "application/octet-stream";

  try {
    if (format === "CSV") {
      fileBytes = buildCSV(rows);
      contentType = "text/csv";
    } else if (format === "XML") {
      fileBytes = buildXML(rows);
      contentType = "application/xml";
    } else {
      const title = `Debacu Evaluation 360 — Auditoría (${dateTag})`;
      fileBytes = await buildPDF(rows, title);
      contentType = "application/pdf";
    }
  } catch {
    return json(req, 500, { ok: false, error: "request_failed", detail: "FILE_BUILD_FAILED" });
  }

  const sha = await sha256Hex(fileBytes);

  // 3) upload a Storage
  const { error: upErr } = await sb.storage.from(EXPORT_BUCKET).upload(storagePath, fileBytes, {
    contentType,
    upsert: false,
  });
  if (upErr) {
    return json(req, 500, { ok: false, error: "request_failed", detail: "UPLOAD_FAILED" });
  }

  // 4) insert DB (si falla, BORRAR storage best-effort)
  let exportId: string | null = null;

  try {
    // ⚠️ Ajusta aquí si tu tabla tiene columnas distintas.
    // Meta razonable: guardamos file_name aparte (útil en UI) aunque el objeto sea UUID.
    const { data: ins, error: insErr } = await sb
      .from("debacu_eval_audit_exports")
      .insert({
        generated_by_user_id: adminUser?.id ?? null,
        generated_by_email: (adminUser?.email ?? "").toLowerCase() || null,

        delivered_to_name: safeStr(body.delivered_to_name),
        delivered_to_org: safeStr(body.delivered_to_org ?? "") || null,
        delivered_to_reason: safeStr(body.delivered_to_reason),
        delivered_to_reference: safeStr(body.delivered_to_reference ?? "") || null,

        filter_source: body.source ?? null,
        filter_customer: body.customer ?? null,
        filter_type: body.type ?? null,
        filter_from: body.from ? String(body.from).slice(0, 10) : null,
        filter_to: body.to ? String(body.to).slice(0, 10) : null,

        format,
        row_count: rows.length,

        storage_bucket: EXPORT_BUCKET,
        storage_path: storagePath,
        file_name: fileName, // <- si tu tabla no tiene file_name, quítalo
        file_sha256: sha,
        file_bytes: fileBytes.byteLength,

        meta: {
          limit: Math.min(Math.max(Number(body.limit ?? 5000), 1), 20000),
          content_type: contentType,
        },
      })
      .select("id, created_at")
      .single();

    if (insErr) throw insErr;
    exportId = ins?.id ?? null;

    // 5) signed URL
    const { data: signed, error: signErr } = await sb.storage
      .from(EXPORT_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

    if (signErr) {
      // NO borramos el archivo (ya hay fila DB). Devuelve error genérico.
      return json(req, 500, { ok: false, error: "request_failed", detail: "SIGNED_URL_FAILED" });
    }

    return json(req, 200, {
      ok: true,
      data: {
        export_id: exportId,
        created_at: ins?.created_at ?? null,
        bucket: EXPORT_BUCKET,
        path: storagePath,
        file_name: fileName,
        sha256: sha,
        bytes: fileBytes.byteLength,
        row_count: rows.length,
        signed_url: signed?.signedUrl ?? null,
      },
    });
  } catch {
    // hygiene: borrar orphan file best-effort
    try {
      await sb.storage.from(EXPORT_BUCKET).remove([storagePath]);
    } catch {
      // ignore
    }
    return json(req, 500, { ok: false, error: "request_failed", detail: "DB_INSERT_FAILED" });
  }
});
