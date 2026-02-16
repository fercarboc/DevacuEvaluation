import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

/* ======================================================
 * ENV
 * ====================================================== */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const DEFAULT_APP_CODE = "DEBACU_EVAL";
const EXPORT_BUCKET = "system-exports";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

/* ======================================================
 * CORS
 * ====================================================== */
function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://debacu.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

type WeeklyPoint = {
  day: string; // YYYY-MM-DD
  incidents: number;
  risk_high: number;
  risk_medium: number;
  risk_low: number;
  gross: number;
  recovered: number;
  net: number;
};

type ReqBody = {
  title?: string;
  period_from: string;
  period_to: string;
  period_field: PeriodField;
};

type EntitlementsRow = {
  org_id: string;
  customer_id: string | null;
  seats_used: number;
  plan_code: string | null;
  max_users: number | null;
  subscription_status: string | null; // en tu view ahora mismo: ACTIVE o null
};

/* ======================================================
 * SUPABASE CLIENTS
 * ====================================================== */
function sbAdmin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function sbUser(req: Request) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
}

/* ======================================================
 * HELPERS
 * ====================================================== */
function assertDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""))) throw new Error("invalid_date_format");
}

function clampRange(from: string, to: string) {
  return from <= to ? { from, to } : { from: to, to: from };
}

function safeNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(n: number) {
  return safeNum(n).toFixed(2);
}

function asciiSafe(s: string) {
  return String(s ?? "")
    .replaceAll("→", "-")
    .replaceAll("·", "-")
    .replaceAll("€", "EUR")
    .replace(/[^\x20-\x7EÁÉÍÓÚÜÑáéíóúüñ]/g, " ");
}

function dayMMDD(isoDay: string) {
  return String(isoDay ?? "").slice(5, 10);
}

function bucketRiskFromRating(ratingRaw: unknown) {
  const r = safeNum(ratingRaw);
  if (r === 1 || r === 2) return "HIGH";
  if (r === 3) return "MEDIUM";
  if (r === 4 || r === 5) return "LOW";
  return "LOW";
}

/* ======================================================
 * AUTH + ORG RESOLUTION (JWT-only)
 * ====================================================== */
async function getAuthUserOrThrow(sb: ReturnType<typeof sbUser>) {
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");
  return data.user;
}

async function resolveOrgIdForUserOrThrow(
  admin: ReturnType<typeof sbAdmin>,
  userId: string
): Promise<string> {
  const { data, error } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.org_id) throw new Error("NO_ORG_FOR_USER");
  return String(data.org_id);
}

async function loadEntitlementsOrThrow(
  admin: ReturnType<typeof sbAdmin>,
  orgId: string
): Promise<EntitlementsRow> {
  const { data, error } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, seats_used, plan_code, max_users, subscription_status")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("NO_ENTITLEMENTS");
  return data as EntitlementsRow;
}

function assertOrgEnabledOrThrow(ent: EntitlementsRow) {
  // Tu view hoy solo trae ACTIVE o null. Si mañana amplías a TRIAL_ACTIVE, ajusta aquí.
  if (ent.subscription_status !== "ACTIVE") throw new Error("PLAN_NOT_ACTIVE");
  if (!ent.plan_code || !ent.max_users) throw new Error("NO_PLAN_LIMITS");
  if (ent.seats_used > ent.max_users) throw new Error(`SEATS_EXCEEDED:${ent.seats_used}/${ent.max_users}`);
}

/* ======================================================
 * DATA LOAD
 * ====================================================== */
async function loadWeeklySeries(
  admin: ReturnType<typeof sbAdmin>,
  params: { customerId: string; from: string; to: string; periodField: PeriodField }
): Promise<WeeklyPoint[]> {
  const dateCol = params.periodField === "created_at" ? "created_at" : "evaluation_date";

  const { data, error } = await admin
    .from("debacu_evaluations")
    .select(`id, ${dateCol}, rating, economic_impact_gross, economic_recovered, economic_net_loss`)
    .eq("customer_id", params.customerId)
    .gte(dateCol, params.from)
    .lte(dateCol, params.to);

  if (error) throw new Error(error.message);

  const map = new Map<string, WeeklyPoint>();

  for (const row of (data ?? []) as any[]) {
    const iso = String(row[dateCol] ?? "").slice(0, 10);
    if (!iso) continue;

    if (!map.has(iso)) {
      map.set(iso, {
        day: iso,
        incidents: 0,
        risk_high: 0,
        risk_medium: 0,
        risk_low: 0,
        gross: 0,
        recovered: 0,
        net: 0,
      });
    }

    const p = map.get(iso)!;
    p.incidents += 1;

    const bucket = bucketRiskFromRating(row.rating);
    if (bucket === "HIGH") p.risk_high += 1;
    else if (bucket === "MEDIUM") p.risk_medium += 1;
    else p.risk_low += 1;

    const gross = safeNum(row.economic_impact_gross);
    const recovered = safeNum(row.economic_recovered);
    const netLoss = safeNum(row.economic_net_loss);

    p.gross += gross;
    p.recovered += recovered;
    p.net += netLoss > 0 ? netLoss : Math.max(0, gross - recovered);
  }

  // rellena huecos día a día
  const out: WeeklyPoint[] = [];
  const start = new Date(params.from + "T00:00:00Z");
  const end = new Date(params.to + "T00:00:00Z");

  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    out.push(
      map.get(day) ?? {
        day,
        incidents: 0,
        risk_high: 0,
        risk_medium: 0,
        risk_low: 0,
        gross: 0,
        recovered: 0,
        net: 0,
      }
    );
  }

  return out;
}

/* ======================================================
 * PDF UI PRIMITIVES
 * ====================================================== */
const COLORS = {
  text: rgb(0.06, 0.09, 0.16),
  muted: rgb(0.42, 0.46, 0.52),
  line: rgb(0.9, 0.91, 0.93),
  card: rgb(1, 1, 1),

  high: rgb(0.94, 0.27, 0.27),
  medium: rgb(0.96, 0.62, 0.04),
  low: rgb(0.13, 0.77, 0.37),

  blue: rgb(0.15, 0.39, 0.92),
  green: rgb(0.09, 0.64, 0.29),
};

function drawCard(page: any, x: number, y: number, w: number, h: number) {
  page.drawRectangle({ x, y, width: w, height: h, color: COLORS.card, borderColor: COLORS.line, borderWidth: 1 });
}
function drawSectionTitle(page: any, fontBold: any, x: number, y: number, title: string) {
  page.drawText(title, { x, y, size: 12, font: fontBold, color: COLORS.text });
}
function drawLegendValue(page: any, font: any, x: number, y: number, label: string, value: string, color: any) {
  page.drawCircle({ x: x + 4, y: y + 4, size: 3, color });
  page.drawText(`${label}: ${value}`, { x: x + 12, y, size: 9, font, color: COLORS.muted });
}
function drawKpi(
  page: any,
  font: any,
  fontBold: any,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  value: string,
  subtitle: string
) {
  drawCard(page, x, y, w, h);
  page.drawText(title, { x: x + 12, y: y + h - 18, size: 9, font, color: COLORS.muted });
  page.drawText(value, { x: x + 12, y: y + h - 40, size: 16, font: fontBold, color: COLORS.text });
  page.drawText(subtitle, { x: x + 12, y: y + 10, size: 9, font, color: COLORS.muted });
}
function drawChartFrame(page: any, x: number, y: number, w: number, h: number) {
  drawCard(page, x, y, w, h);
  const rows = 4;
  for (let i = 1; i < rows; i++) {
    const gy = y + (h * i) / rows;
    page.drawLine({
      start: { x: x + 10, y: gy },
      end: { x: x + w - 10, y: gy },
      thickness: 0.6,
      color: COLORS.line,
    });
  }
}
function drawXAxisLabels(page: any, font: any, x: number, y: number, w: number, labels: string[]) {
  if (labels.length <= 1) return;
  const innerW = w - 20;
  const step = innerW / (labels.length - 1);
  for (let i = 0; i < labels.length; i++) {
    const lx = x + 10 + step * i;
    const show = labels.length <= 8 ? true : i % 2 === 0;
    if (!show) continue;
    page.drawText(labels[i], { x: lx - 10, y, size: 8, font, color: COLORS.muted });
  }
}
function drawLineSeries(page: any, x: number, y: number, w: number, h: number, values: number[], color: any) {
  const innerX = x + 10;
  const innerY = y + 10;
  const innerW = w - 20;
  const innerH = h - 20;

  const max = Math.max(1, ...values);
  const min = 0;
  const range = Math.max(1, max - min);
  const step = innerW / Math.max(1, values.length - 1);

  let prevX = innerX;
  let prevY = innerY + ((values[0] - min) / range) * innerH;

  for (let i = 1; i < values.length; i++) {
    const cx = innerX + step * i;
    const cy = innerY + ((values[i] - min) / range) * innerH;
    page.drawLine({ start: { x: prevX, y: prevY }, end: { x: cx, y: cy }, thickness: 2, color });
    prevX = cx;
    prevY = cy;
  }
}
function drawBarSeries(page: any, x: number, y: number, w: number, h: number, values: number[], color: any) {
  const innerX = x + 10;
  const innerY = y + 10;
  const innerW = w - 20;
  const innerH = h - 20;

  const max = Math.max(1, ...values);
  const gap = 6;
  const barW = (innerW - gap * (values.length - 1)) / Math.max(1, values.length);

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const bh = (v / max) * innerH;
    const bx = innerX + i * (barW + gap);
    page.drawRectangle({ x: bx, y: innerY, width: Math.max(1, barW), height: Math.max(0, bh), color });
  }
}
function drawBarValueLabels(page: any, font: any, x: number, y: number, w: number, h: number, values: number[]) {
  const innerX = x + 10;
  const innerY = y + 10;
  const innerW = w - 20;
  const innerH = h - 20;

  const max = Math.max(1, ...values);
  const gap = 6;
  const barW = (innerW - gap * (values.length - 1)) / Math.max(1, values.length);

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!v) continue;
    const bh = (v / max) * innerH;
    const bx = innerX + i * (barW + gap);
    const label = String(v);
    page.drawText(label, {
      x: bx + barW / 2 - label.length * 3,
      y: innerY + bh + 4,
      size: 9,
      font,
      color: COLORS.muted,
    });
  }
}

/* ======================================================
 * PDF GENERATION
 * ====================================================== */
async function buildWeeklyPdf(params: { title: string; subtitle: string; points: WeeklyPoint[] }) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();

  page.drawRectangle({ x: 0, y: height - 90, width, height: 90, color: rgb(0.97, 0.98, 0.99) });
  page.drawText("DEBACU", { x: 40, y: height - 38, size: 10, font: fontBold, color: COLORS.muted });
  page.drawText(asciiSafe(params.title), { x: 40, y: height - 60, size: 18, font: fontBold, color: COLORS.text });
  page.drawText(asciiSafe(params.subtitle), { x: 40, y: height - 78, size: 10, font, color: COLORS.muted });

  const totalInc = params.points.reduce((a, p) => a + p.incidents, 0);
  const high = params.points.reduce((a, p) => a + p.risk_high, 0);
  const med = params.points.reduce((a, p) => a + p.risk_medium, 0);
  const low = params.points.reduce((a, p) => a + p.risk_low, 0);

  const gross = params.points.reduce((a, p) => a + p.gross, 0);
  const rec = params.points.reduce((a, p) => a + p.recovered, 0);
  const net = params.points.reduce((a, p) => a + p.net, 0);
  const pct = gross > 0 ? Math.round((rec / gross) * 100) : 0;

  const kpiY = height - 190;
  const kpiH = 68;
  const kpiW = (width - 40 * 2 - 12 * 2) / 3;

  drawKpi(page, font, fontBold, 40, kpiY, kpiW, kpiH, "Incidencias (rango)", String(totalInc), `Alto: ${high} - Medio: ${med} - Bajo: ${low}`);
  drawKpi(page, font, fontBold, 40 + kpiW + 12, kpiY, kpiW, kpiH, "Total", `${money(gross)} EUR`, `Recuperado: ${money(rec)} EUR (${pct}%)`);
  drawKpi(page, font, fontBold, 40 + (kpiW + 12) * 2, kpiY, kpiW, kpiH, "Perdida neta", `${money(net)} EUR`, "Neto = net_loss o (total - recuperado)");

  const chartX = 40;
  const chartW = width - 80;
  const labels = params.points.map((p) => dayMMDD(p.day));

  const rTitleY = kpiY - 30;
  drawSectionTitle(page, fontBold, chartX, rTitleY, "Riesgo por dia");
  drawLegendValue(page, font, chartX + 140, rTitleY - 2, "Alto", String(high), COLORS.high);
  drawLegendValue(page, font, chartX + 220, rTitleY - 2, "Medio", String(med), COLORS.medium);
  drawLegendValue(page, font, chartX + 310, rTitleY - 2, "Bajo", String(low), COLORS.low);

  const riskY = kpiY - 170;
  const riskH = 120;
  drawChartFrame(page, chartX, riskY, chartW, riskH);
  drawLineSeries(page, chartX, riskY, chartW, riskH, params.points.map((p) => p.risk_high), COLORS.high);
  drawLineSeries(page, chartX, riskY, chartW, riskH, params.points.map((p) => p.risk_medium), COLORS.medium);
  drawLineSeries(page, chartX, riskY, chartW, riskH, params.points.map((p) => p.risk_low), COLORS.low);
  drawXAxisLabels(page, font, chartX, riskY - 12, chartW, labels);

  const iTitleY = riskY - 38;
  drawSectionTitle(page, fontBold, chartX, iTitleY, "Incidencias por dia");
  drawLegendValue(page, font, chartX + 170, iTitleY - 2, "Total", String(totalInc), COLORS.blue);

  const incY = riskY - 168;
  const incH = 120;
  drawChartFrame(page, chartX, incY, chartW, incH);
  const incVals = params.points.map((p) => p.incidents);
  drawBarSeries(page, chartX, incY, chartW, incH, incVals, COLORS.blue);
  drawBarValueLabels(page, font, chartX, incY, chartW, incH, incVals);
  drawXAxisLabels(page, font, chartX, incY - 12, chartW, labels);

  const eTitleY = incY - 38;
  drawSectionTitle(page, fontBold, chartX, eTitleY, "Impacto economico:");
  drawLegendValue(page, font, chartX + 260, eTitleY - 2, "Total", `${money(gross)} EUR`, COLORS.blue);
  drawLegendValue(page, font, chartX + 360, eTitleY - 2, "Recuperado", `${money(rec)} EUR`, COLORS.green);
  drawLegendValue(page, font, chartX + 485, eTitleY - 2, "Neto", `${money(net)} EUR`, COLORS.high);

  const ecoY = incY - 190;
  const ecoH = 135;
  drawChartFrame(page, chartX, ecoY, chartW, ecoH);
  drawLineSeries(page, chartX, ecoY, chartW, ecoH, params.points.map((p) => p.gross), COLORS.blue);
  drawLineSeries(page, chartX, ecoY, chartW, ecoH, params.points.map((p) => p.recovered), COLORS.green);
  drawLineSeries(page, chartX, ecoY, chartW, ecoH, params.points.map((p) => p.net), COLORS.high);
  drawXAxisLabels(page, font, chartX, ecoY - 12, chartW, labels);

  page.drawLine({ start: { x: 40, y: 28 }, end: { x: width - 40, y: 28 }, thickness: 0.8, color: COLORS.line });
  page.drawText(asciiSafe(`Generado por Debacu - ${new Date().toISOString().slice(0, 10)} - Confidencial`), {
    x: 40,
    y: 14,
    size: 9,
    font,
    color: COLORS.muted,
  });

  return await pdf.save();
}

/* ======================================================
 * MAIN (JWT-only)
 * ====================================================== */
export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  try {
    let body: ReqBody;
    try {
      body = (await req.json()) as ReqBody;
    } catch {
      return json(req, 400, { ok: false, error: "invalid_json" });
    }

    const title = body.title ?? "Informe semanal (7 dias)";
    const periodField = body.period_field ?? "evaluation_date";

    const rawFrom = String(body.period_from ?? "");
    const rawTo = String(body.period_to ?? "");
    assertDate(rawFrom);
    assertDate(rawTo);
    const fixed = clampRange(rawFrom, rawTo);

    const userClient = sbUser(req);
    const admin = sbAdmin();

    // 1) JWT user
    const user = await getAuthUserOrThrow(userClient);

    // 2) org_id -> entitlements
    const orgId = await resolveOrgIdForUserOrThrow(admin, user.id);
    const ent = await loadEntitlementsOrThrow(admin, orgId);

    // 3) enforce plan + seats (base)
    assertOrgEnabledOrThrow(ent);

    // 4) data (por customer)
    const customerId = String(ent.customer_id ?? "");
    if (!customerId) throw new Error("NO_CUSTOMER_ON_ORG");

    const points = await loadWeeklySeries(admin, {
      customerId,
      from: fixed.from,
      to: fixed.to,
      periodField,
    });

    const subtitle = `${asciiSafe(user.email ?? "")} | ${fixed.from} - ${fixed.to} | Campo: ${periodField} | Org: ${orgId}`;

    // 5) pdf + upload
    const pdfBytes = await buildWeeklyPdf({ title, subtitle, points });

    const fileName = `weekly_basic_${Date.now()}.pdf`;
    const storagePath = `weekly-reports/${customerId}/${fileName}`;

    const { error: uploadError } = await admin.storage
      .from(EXPORT_BUCKET)
      .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: false });

    if (uploadError) throw new Error(uploadError.message);

    const { data: signed, error: signedErr } = await admin.storage
      .from(EXPORT_BUCKET)
      .createSignedUrl(storagePath, 60 * 60);

    if (signedErr) throw new Error(signedErr.message);

    return json(req, 200, {
      ok: true,
      download_url: signed?.signedUrl ?? null,
      storage_path: storagePath,
      row_count: points.length,
      entitlements: {
        org_id: orgId,
        customer_id: customerId,
        plan_code: ent.plan_code,
        max_users: ent.max_users,
        seats_used: ent.seats_used,
        subscription_status: ent.subscription_status,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const status =
      msg === "UNAUTHENTICATED" ? 401 :
      msg === "NO_ORG_FOR_USER" ? 403 :
      msg.startsWith("PLAN_NOT_ACTIVE") ? 402 :
      msg.startsWith("SEATS_EXCEEDED") ? 403 :
      500;

    return json(req, status, { ok: false, error: "request_failed", detail: msg });
  }
});
