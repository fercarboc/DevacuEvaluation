// supabase/functions/system_weekly_report_snapshot_generate/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

const EXPORT_BUCKET = "system-exports";
const APP_ID = "DEBACU_EVAL";

type PeriodField = "evaluation_date" | "created_at";

type ReqBody = {
  org_id?: string | null; // ✅ multi-org (opcional)
  title?: string;
  period_from: string; // YYYY-MM-DD
  period_to: string; // YYYY-MM-DD
  period_field?: PeriodField; // default evaluation_date

  // snapshot de la UI
  image_png_data_url: string; // data:image/png;base64,...
};

type EntitlementsRow = {
  org_id: string;
  customer_id: string | null;
  seats_used: number;
  plan_code: string | null;
  max_users: number | null;
  subscription_status: string | null; // ACTIVE | null
};

/* ======================================================
 * Helpers
 * ====================================================== */
function assertDate(s: string, name: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""))) throw new Error(`BAD_${name.toUpperCase()}`);
}

function clampRange(from: string, to: string) {
  return from <= to ? { from, to } : { from: to, to: from };
}

function stripPngDataUrl(dataUrl: string) {
  const m = (dataUrl || "").match(/^data:image\/png;base64,(.+)$/);
  if (!m) throw new Error("BAD_IMAGE_DATA_URL");
  return m[1];
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function asciiSafe(s: string) {
  return String(s ?? "")
    .replaceAll("→", "-")
    .replaceAll("·", "-")
    .replaceAll("€", "EUR")
    .replace(/[^\x20-\x7EÁÉÍÓÚÜÑáéíóúüñ]/g, " ");
}

/* ======================================================
 * Multi-org + entitlements
 * ====================================================== */
async function resolveOrgIdForUserOrThrow(
  admin: ReturnType<typeof supabaseServiceClient>,
  userId: string,
  requestedOrgId?: string | null
): Promise<string> {
  if (requestedOrgId) {
    // prefer ACTIVE membership if status column exists
    try {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id")
        .eq("org_id", requestedOrgId)
        .eq("user_id", userId)
        .eq("status", "ACTIVE")
        .maybeSingle();

      if (error) throw error;
      if (!data?.org_id) throw new Error("FORBIDDEN");
      return String(data.org_id);
    } catch {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id")
        .eq("org_id", requestedOrgId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error || !data?.org_id) throw new Error("FORBIDDEN");
      return String(data.org_id);
    }
  }

  // fallback deterministic: first ACTIVE else first
  try {
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, created_at")
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data?.org_id) throw new Error("FORBIDDEN");
    return String(data.org_id);
  } catch {
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data?.org_id) throw new Error("FORBIDDEN");
    return String(data.org_id);
  }
}

async function loadEntitlementsOrThrow(admin: ReturnType<typeof supabaseServiceClient>, orgId: string) {
  const { data, error } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, seats_used, plan_code, max_users, subscription_status")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error || !data?.org_id) throw new Error("FORBIDDEN");
  return data as EntitlementsRow;
}

function assertOrgEnabledOrThrow(ent: EntitlementsRow) {
  if (ent.subscription_status !== "ACTIVE") throw new Error("PLAN_NOT_ACTIVE");
  if (!ent.customer_id) throw new Error("FORBIDDEN");
  if (!ent.plan_code || !Number.isFinite(Number(ent.max_users))) throw new Error("PLAN_LIMITS_MISSING");
  if (ent.max_users != null && ent.seats_used > ent.max_users) throw new Error("SEATS_EXCEEDED");
}

/* ======================================================
 * PDF build: snapshot -> A4 con título + subtítulo
 * ====================================================== */
async function buildPdfFromSnapshot(params: { title: string; subtitle: string; pngBytes: Uint8Array }) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4 portrait

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();

  // Title
  page.drawText(asciiSafe(params.title), {
    x: 40,
    y: height - 52,
    size: 16,
    font: fontBold,
    color: rgb(0.06, 0.09, 0.16),
  });

  // Subtitle
  page.drawText(asciiSafe(params.subtitle), {
    x: 40,
    y: height - 72,
    size: 10,
    font,
    color: rgb(0.4, 0.45, 0.52),
  });

  // Image
  const png = await pdf.embedPng(params.pngBytes);

  const margin = 40;
  const topReserved = 110;
  const availableWidth = width - margin * 2;
  const availableHeight = height - topReserved - margin;

  const scale = Math.min(availableWidth / png.width, availableHeight / png.height);

  const imgWidth = png.width * scale;
  const imgHeight = png.height * scale;

  const x = (width - imgWidth) / 2;
  const y = margin;

  page.drawImage(png, { x, y, width: imgWidth, height: imgHeight });

  return await pdf.save(); // Uint8Array
}

/* ======================================================
 * Export logging (audit_exports)
 * ====================================================== */
async function insertPendingExport(admin: ReturnType<typeof supabaseServiceClient>, row: any) {
  const { data, error } = await admin.from("audit_exports").insert(row).select("id").single();
  if (error || !data?.id) throw new Error("EXPORT_INSERT_FAILED");
  return String(data.id);
}

async function markExportReady(admin: ReturnType<typeof supabaseServiceClient>, exportId: string, patch: any) {
  const { error } = await admin.from("audit_exports").update(patch).eq("id", exportId);
  if (error) throw new Error("EXPORT_UPDATE_FAILED");
}

async function markExportFailed(admin: ReturnType<typeof supabaseServiceClient>, exportId: string, detail: string) {
  await admin.from("audit_exports").update({ status: "FAILED", error_detail: detail }).eq("id", exportId);
}

/* ======================================================
 * Errors (STRICT)
 * ====================================================== */
function mapError(e: unknown): { status: number; detail: string } {
  const msg = String((e as any)?.message ?? e ?? "request_failed");

  if (msg === "UNAUTHENTICATED") return { status: 401, detail: "UNAUTHENTICATED" };
  if (msg === "PLAN_NOT_ACTIVE") return { status: 402, detail: "PLAN_NOT_ACTIVE" };
  if (msg === "FORBIDDEN") return { status: 403, detail: "FORBIDDEN" };
  if (msg === "SEATS_EXCEEDED") return { status: 403, detail: "SEATS_EXCEEDED" };

  if (msg.startsWith("BAD_")) return { status: 400, detail: msg };
  if (msg === "PLAN_LIMITS_MISSING") return { status: 500, detail: "PLAN_LIMITS_MISSING" };

  if (msg === "EXPORT_INSERT_FAILED") return { status: 500, detail: "EXPORT_INSERT_FAILED" };
  if (msg === "EXPORT_UPDATE_FAILED") return { status: 500, detail: "EXPORT_UPDATE_FAILED" };

  if (msg === "UPLOAD_FAILED") return { status: 500, detail: "UPLOAD_FAILED" };
  if (msg === "SIGNED_URL_FAILED") return { status: 500, detail: "SIGNED_URL_FAILED" };

  return { status: 500, detail: "request_failed" };
}

/* ======================================================
 * MAIN (JWT-only)
 * ====================================================== */
export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "request_failed", detail: "method_not_allowed" });
  }

  const admin = supabaseServiceClient();

  try {
    const user = await requireUser(req);

    const body = (await req.json().catch(() => ({}))) as ReqBody;

    const title = String(body.title ?? "Informe semanal (snapshot)").slice(0, 120);
    const rawFrom = String(body.period_from ?? "");
    const rawTo = String(body.period_to ?? "");
    assertDate(rawFrom, "period_from");
    assertDate(rawTo, "period_to");
    const fixed = clampRange(rawFrom, rawTo);

    const period_field: PeriodField = (body.period_field ?? "evaluation_date") as PeriodField;

    if (!body.image_png_data_url) throw new Error("BAD_IMAGE_DATA_URL");

    // ✅ org
    const orgId = await resolveOrgIdForUserOrThrow(admin, user.id, body.org_id ? String(body.org_id) : null);

    // ✅ entitlements
    const ent = await loadEntitlementsOrThrow(admin, orgId);
    assertOrgEnabledOrThrow(ent);

    const customerId = String(ent.customer_id ?? "");
    if (!customerId) throw new Error("FORBIDDEN");

    // decode PNG
    const b64 = stripPngDataUrl(body.image_png_data_url);
    const pngBytes = b64ToBytes(b64);

    // ⚠️ consejo práctico: si la imagen viene enorme, esta función puede petar por payload.
    // (no lo bloqueo aquí, pero si ves 413/timeout, hay que pasar a “upload PNG -> generar PDF server-side”.)

    const subtitle = `${asciiSafe(user.email ?? "")} · ${fixed.from} - ${fixed.to} · Campo: ${period_field} · Org: ${orgId}`;

    // 1) Generar PDF
    const pdfBytes = await buildPdfFromSnapshot({ title, subtitle, pngBytes });

    // 2) Crear export (PENDING) ANTES de upload
    const exportId = crypto.randomUUID();
    const storagePath = `debacu_eval/org/${orgId}/weekly_snapshots/${exportId}.pdf`;

    let exportRowId: string | null = null;
    exportRowId = await insertPendingExport(admin, {
      id: exportId,               // si tu tabla no permite setear id, quita esta línea
      app_id: APP_ID,
      org_id: orgId,
      customer_id: customerId,

      export_type: "PDF",
      scope: "WEEKLY_SNAPSHOT",
      status: "PENDING",

      title,
      period_from: fixed.from,
      period_to: fixed.to,
      period_field,

      storage_bucket: EXPORT_BUCKET,
      storage_path: storagePath,
    });

    try {
      // 3) Upload
      const up = await admin.storage
        .from(EXPORT_BUCKET)
        .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });

      if (up.error) throw new Error("UPLOAD_FAILED");

      // 4) Metadata + signed url
      const fileSize = pdfBytes.byteLength;
      const hash = await sha256Hex(pdfBytes);

      const signed = await admin.storage.from(EXPORT_BUCKET).createSignedUrl(storagePath, 60 * 10);
      if (signed.error || !signed.data?.signedUrl) throw new Error("SIGNED_URL_FAILED");

      // 5) Update READY
      await markExportReady(admin, exportRowId, {
        status: "READY",
        file_size_bytes: fileSize,
        sha256: hash,
        storage_bucket: EXPORT_BUCKET,
        storage_path: storagePath,
        error_detail: null,
      });

      return json(req, 200, {
        ok: true,
        export_id: exportId,
        org_id: orgId,
        app_id: APP_ID,

        period_from: fixed.from,
        period_to: fixed.to,
        period_field,

        storage_bucket: EXPORT_BUCKET,
        storage_path: storagePath,

        file_size_bytes: fileSize,
        sha256: hash,

        download_url: signed.data.signedUrl,
        expires_in: 600,
      });
    } catch (err: any) {
      const detail = String(err?.message ?? err ?? "FAILED");
      if (exportRowId) await markExportFailed(admin, exportRowId, detail);
      throw err;
    }
  } catch (e) {
    const mapped = mapError(e);
    return json(req, mapped.status, { ok: false, error: "request_failed", detail: mapped.detail });
  }
});
