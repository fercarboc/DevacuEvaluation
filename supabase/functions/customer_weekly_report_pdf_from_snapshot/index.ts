import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

/* ======================================================
 * ENV
 * ====================================================== */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_APP_CODE = "DEBACU_EVAL";
const EXPORT_BUCKET = "system-exports";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

/* ======================================================
 * CORS + RESP
 * ====================================================== */
function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";

  // si viene un Origin válido (local o prod), lo devolvemos tal cual
  // si no, fallback a debacu.com (evita "*" con credenciales / headers sensibles)
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://debacu.com";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-session-token",
    "Access-Control-Max-Age": "86400",
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

/* ======================================================
 * TYPES
 * ====================================================== */
type PeriodField = "evaluation_date" | "created_at";

type ReqBody = {
  title?: string;
  period_from: string; // YYYY-MM-DD
  period_to: string; // YYYY-MM-DD
  period_field?: PeriodField; // default evaluation_date
  image_png_data_url: string; // data:image/png;base64,...
};

type SessionResolved = {
  customer_id: string;
  customer_name: string;
  app_code: string;
};

/* ======================================================
 * HELPERS
 * ====================================================== */
function assertDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("invalid_date_format");
}

function stripPngDataUrl(dataUrl: string) {
  const m = (dataUrl || "").match(/^data:image\/png;base64,(.+)$/);
  if (!m) throw new Error("invalid_image_data_url");
  return m[1];
}

function b64ToBytes(b64: string): Uint8Array {
  // Deno Edge Runtime expone atob
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ======================================================
 * SESSION RESOLVE (x-session-token)
 * ====================================================== */
async function resolveSessionCustomer(
  sb: ReturnType<typeof createClient>,
  token: string
): Promise<SessionResolved> {
  const { data, error } = await sb
    .from("debacu_eval_sessions")
    .select("customer_id, customer_name, app_code, revoked_at, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("invalid_session_token");
  if (data.revoked_at) throw new Error("session_revoked");
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) throw new Error("session_expired");

  return {
    customer_id: String(data.customer_id),
    customer_name: String(data.customer_name ?? ""),
    app_code: String(data.app_code ?? DEFAULT_APP_CODE),
  };
}

/* ======================================================
 * PDF GENERATION
 * ====================================================== */
async function buildPdfFromSnapshot(params: {
  title: string;
  subtitle: string;
  pngBytes: Uint8Array;
}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4 portrait

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();

  // Title
  page.drawText(params.title, {
    x: 40,
    y: height - 52,
    size: 16,
    font: fontBold,
    color: rgb(0.06, 0.09, 0.16),
  });

  // Subtitle
  page.drawText(params.subtitle, {
    x: 40,
    y: height - 72,
    size: 10,
    font,
    color: rgb(0.4, 0.45, 0.52),
  });

  // Image
  const png = await pdf.embedPng(params.pngBytes);

  const margin = 40;
  const topReserved = 110; // espacio para título + subtítulo
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
 * MAIN
 * ====================================================== */
Deno.serve(async (req: Request) => {
  // ✅ PRE-FLIGHT: responder SIEMPRE, sin validar nada
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "method_not_allowed" });
  }

  try {
    const sessionToken = req.headers.get("x-session-token") ?? "";
    if (!sessionToken) return json(req, 401, { ok: false, error: "missing_session_token" });

    let body: ReqBody;
    try {
      body = (await req.json()) as ReqBody;
    } catch {
      return json(req, 400, { ok: false, error: "invalid_json" });
    }

    const title = (body.title ?? "Informe semanal (7 días)").slice(0, 120);
    const periodFrom = String(body.period_from ?? "");
    const periodTo = String(body.period_to ?? "");
    const periodField: PeriodField = (body.period_field as any) || "evaluation_date";

    assertDate(periodFrom);
    assertDate(periodTo);
    if (periodFrom > periodTo) return json(req, 400, { ok: false, error: "invalid_period_range" });

    if (!body.image_png_data_url) return json(req, 400, { ok: false, error: "missing_image_png_data_url" });

    // decode PNG
    const b64 = stripPngDataUrl(body.image_png_data_url);
    const pngBytes = b64ToBytes(b64);

    // supabase admin
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // validar sesión
    const sess = await resolveSessionCustomer(sb, sessionToken);

    const subtitle = `${sess.customer_name} · ${periodFrom} → ${periodTo} · Campo: ${periodField}`;

    // pdf
    const pdfBytes = await buildPdfFromSnapshot({
      title,
      subtitle,
      pngBytes,
    });

    // upload
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `weekly_report_${ts}.pdf`;
    const storagePath = `weekly-reports/${sess.customer_id}/${fileName}`;

    const { error: uploadError } = await sb.storage.from(EXPORT_BUCKET).upload(storagePath, pdfBytes, {
      contentType: "application/pdf",
      upsert: false,
    });

    if (uploadError) throw new Error(`upload_failed:${uploadError.message}`);

    // signed url (1h)
    const { data: signed, error: signedErr } = await sb.storage
      .from(EXPORT_BUCKET)
      .createSignedUrl(storagePath, 60 * 60);

    if (signedErr) throw new Error(`signed_url_failed:${signedErr.message}`);

    return json(req, 200, {
      ok: true,
      customer_id: sess.customer_id,
      customer_name: sess.customer_name,
      period_from: periodFrom,
      period_to: periodTo,
      period_field: periodField,
      storage_bucket: EXPORT_BUCKET,
      storage_path: storagePath,
      file_size_bytes: pdfBytes?.length ?? null,
      download_url: signed?.signedUrl ?? null,
    });
  } catch (e: any) {
    return json(req, 500, { ok: false, error: "request_failed", detail: String(e?.message ?? e) });
  }
});
