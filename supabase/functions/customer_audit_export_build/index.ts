// supabase/functions/debacu_eval_audit_exports_build/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

/* ======================================================
 * ENV
 * ====================================================== */
const DEFAULT_BUCKET = Deno.env.get("EXPORTS_BUCKET") || "audit-exports";
const DEFAULT_APP_CODE = "DEBACU_EVAL";

/* ======================================================
 * TYPES
 * ====================================================== */
type ExportType = "PDF" | "CSV";

type ExportScope =
  | "INCIDENTS_BY_PLATFORM_MONTHLY"
  | "INCIDENTS_BY_TYPE_MONTHLY"
  | "ECONOMIC_IMPACT_MONTHLY"
  | "DAILY_HOY_AYER_BY_TYPE"
  | "WEEKLY_7D_DAILY_SERIES";

type PeriodField = "evaluation_date" | "created_at";

type BuildReq = {
  // ✅ multi-org: recomendado obligatorio en UI
  org_id?: string | null;

  export_type: ExportType;
  export_scope: ExportScope;
  period_from: string; // YYYY-MM-DD
  period_to: string; // YYYY-MM-DD
  filters?: {
    use_created_at?: boolean;
    period_field?: PeriodField;
  } | null;
};

type TenantResolved = {
  org_id: string;
  customer_id: string;
  customer_name: string;
  app_code: string;
};

type EntitlementsRow = {
  org_id: string;
  customer_id: string;
  seats_used: number | null;
  plan_code: string | null;
  max_users: number | null;
  subscription_status: string | null; // ACTIVE | null
};

/* ======================================================
 * HELPERS (dates, numbers, csv)
 * ====================================================== */
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function assertDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("invalid_date_format");
}

function toNumber(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function monthKeyFromDateStr(yyyy_mm_dd: string) {
  return String(yyyy_mm_dd).slice(0, 7); // YYYY-MM
}

function asMoney(n: number) {
  return n.toFixed(2);
}

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function sha256Hex(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ======================================================
 * MULTI-ORG RESOLUTION
 * ====================================================== */
async function resolveOrgId(
  admin: ReturnType<typeof createClient>,
  userId: string,
  requestedOrgId?: string | null
): Promise<string> {
  // 1) si viene org_id, validar membership (preferido)
  if (requestedOrgId) {
    // Intento con status=ACTIVE si existe la columna; si no, fallback sin status.
    try {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id")
        .eq("org_id", requestedOrgId)
        .eq("user_id", userId)
        // si existe status, esto valida “activa”
        // (si no existe, saltará error y caemos al catch)
        .eq("status", "ACTIVE")
        .maybeSingle();

      if (error) throw error;
      if (!data?.org_id) throw new Error("FORBIDDEN_NOT_MEMBER");
      return String(data.org_id);
    } catch {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id")
        .eq("org_id", requestedOrgId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw new Error(`MEMBERSHIP_FAILED:${error.message}`);
      if (!data?.org_id) throw new Error("FORBIDDEN_NOT_MEMBER");
      return String(data.org_id);
    }
  }

  // 2) fallback determinista: primera membership (idealmente ACTIVE)
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
    if (!data?.org_id) throw new Error("FORBIDDEN_NO_ORG");
    return String(data.org_id);
  } catch {
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`MEMBERSHIP_FAILED:${error.message}`);
    if (!data?.org_id) throw new Error("FORBIDDEN_NO_ORG");
    return String(data.org_id);
  }
}

async function resolveTenant(
  admin: ReturnType<typeof createClient>,
  orgId: string
): Promise<TenantResolved> {
  const { data: org, error: orgErr } = await admin
    .from("debacu_eval_organizations")
    .select("id, customer_id, name")
    .eq("id", orgId)
    .maybeSingle();

  if (orgErr) throw new Error(`ORG_LOOKUP_FAILED:${orgErr.message}`);
  if (!org?.customer_id) throw new Error("FORBIDDEN_NO_CUSTOMER");

  return {
    org_id: String(org.id),
    customer_id: String(org.customer_id),
    customer_name: String(org.name ?? ""),
    app_code: DEFAULT_APP_CODE,
  };
}

async function requirePlanActiveForOrg(
  admin: ReturnType<typeof createClient>,
  orgId: string
): Promise<EntitlementsRow> {
  // ✅ usa la vista (sin RPC) que ya creaste
  const { data, error } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, seats_used, plan_code, max_users, subscription_status")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`ENTITLEMENTS_FAILED:${error.message}`);
  if (!data?.org_id || !data?.customer_id) throw new Error("FORBIDDEN_NO_CUSTOMER");

  // Regla estricta: si no hay ACTIVE, no hay export
  if (data.subscription_status !== "ACTIVE") throw new Error("PLAN_NOT_ACTIVE");

  return data as EntitlementsRow;
}

/* ======================================================
 * DATA FETCH
 * ====================================================== */
type EvalRow = {
  platform: string | null;
  incident_type: string | null;
  rating: number | null;
  evaluation_date: string | null;
  created_at: string;
  economic_impact_gross: string | number | null;
  economic_recovered: string | number | null;
  economic_net_loss: string | number | null;
};

async function fetchEvaluationsForRange(
  sb: ReturnType<typeof createClient>,
  creatorCustomerUuid: string,
  periodField: PeriodField,
  from: string,
  to: string
): Promise<EvalRow[]> {
  // Preferimos debacu_eval_evaluations, pero soportamos fallback por si tu entorno aún tiene debacu_evaluations.
  const primary = Deno.env.get("EVALUATIONS_TABLE") || "debacu_eval_evaluations";
  const fallback = "debacu_evaluations";

  const cols = [
    "platform",
    "incident_type",
    "rating",
    "evaluation_date",
    "created_at",
    "economic_impact_gross",
    "economic_recovered",
    "economic_net_loss",
  ].join(",");

  async function run(table: string) {
    if (periodField === "evaluation_date") {
      const { data, error } = await sb
        .from(table)
        .select(cols)
        .eq("creator_customer_uuid", creatorCustomerUuid)
        .gte("evaluation_date", from)
        .lte("evaluation_date", to)
        .order("evaluation_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any;
    }

    const fromTs = `${from}T00:00:00.000Z`;
    const toTs = `${to}T23:59:59.999Z`;

    const { data, error } = await sb
      .from(table)
      .select(cols)
      .eq("creator_customer_uuid", creatorCustomerUuid)
      .gte("created_at", fromTs)
      .lte("created_at", toTs)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as any;
  }

  try {
    return await run(primary);
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    // fallback solo si el error apunta a tabla inexistente
    if (msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation")) {
      return await run(fallback);
    }
    throw new Error(`QUERY_FAILED:${msg}`);
  }
}

/* ======================================================
 * AGGREGATIONS
 * ====================================================== */
type PlatformMonthlyRow = {
  month: string;
  platform: string;
  incidents: number;
  gross: number;
  recovered: number;
  net: number;
};

type TypeMonthlyRow = {
  month: string;
  incident_type: string;
  incidents: number;
  gross: number;
  recovered: number;
  net: number;
};

type EconMonthlyRow = {
  month: string;
  incidents: number;
  gross: number;
  recovered: number;
  net: number;
};

function computeNet(gross: number, recovered: number, netStored: number | null) {
  if (netStored != null && Number.isFinite(netStored)) return Math.max(0, netStored);
  return Math.max(0, gross - recovered);
}

function getRowDateKey(r: EvalRow, periodField: PeriodField): string {
  if (periodField === "evaluation_date") {
    const d = (r.evaluation_date ?? "").slice(0, 10);
    if (d) return d;
  }
  return String(r.created_at).slice(0, 10);
}

function buildIncidentsByPlatformMonthly(rows: EvalRow[], periodField: PeriodField): PlatformMonthlyRow[] {
  const map = new Map<string, PlatformMonthlyRow>();

  for (const r of rows) {
    const dKey = getRowDateKey(r, periodField);
    const month = monthKeyFromDateStr(dKey);
    const platform = (r.platform ?? "UNKNOWN").trim() || "UNKNOWN";

    const gross = toNumber(r.economic_impact_gross);
    const recovered = toNumber(r.economic_recovered);
    const netStored = r.economic_net_loss == null ? null : toNumber(r.economic_net_loss);
    const net = computeNet(gross, recovered, netStored);

    const k = `${month}||${platform}`;
    const cur = map.get(k) ?? { month, platform, incidents: 0, gross: 0, recovered: 0, net: 0 };
    cur.incidents += 1;
    cur.gross += gross;
    cur.recovered += recovered;
    cur.net += net;
    map.set(k, cur);
  }

  return Array.from(map.values()).sort((a, b) =>
    a.month === b.month ? a.platform.localeCompare(b.platform) : a.month.localeCompare(b.month)
  );
}

function buildIncidentsByTypeMonthly(rows: EvalRow[], periodField: PeriodField): TypeMonthlyRow[] {
  const map = new Map<string, TypeMonthlyRow>();

  for (const r of rows) {
    const dKey = getRowDateKey(r, periodField);
    const month = monthKeyFromDateStr(dKey);
    const incident_type = (r.incident_type ?? "UNKNOWN").trim() || "UNKNOWN";

    const gross = toNumber(r.economic_impact_gross);
    const recovered = toNumber(r.economic_recovered);
    const netStored = r.economic_net_loss == null ? null : toNumber(r.economic_net_loss);
    const net = computeNet(gross, recovered, netStored);

    const k = `${month}||${incident_type}`;
    const cur = map.get(k) ?? { month, incident_type, incidents: 0, gross: 0, recovered: 0, net: 0 };
    cur.incidents += 1;
    cur.gross += gross;
    cur.recovered += recovered;
    cur.net += net;
    map.set(k, cur);
  }

  return Array.from(map.values()).sort((a, b) =>
    a.month === b.month ? a.incident_type.localeCompare(b.incident_type) : a.month.localeCompare(b.month)
  );
}

function buildEconomicImpactMonthly(rows: EvalRow[], periodField: PeriodField): EconMonthlyRow[] {
  const map = new Map<string, EconMonthlyRow>();

  for (const r of rows) {
    const dKey = getRowDateKey(r, periodField);
    const month = monthKeyFromDateStr(dKey);

    const gross = toNumber(r.economic_impact_gross);
    const recovered = toNumber(r.economic_recovered);
    const netStored = r.economic_net_loss == null ? null : toNumber(r.economic_net_loss);
    const net = computeNet(gross, recovered, netStored);

    const cur = map.get(month) ?? { month, incidents: 0, gross: 0, recovered: 0, net: 0 };
    cur.incidents += 1;
    cur.gross += gross;
    cur.recovered += recovered;
    cur.net += net;
    map.set(month, cur);
  }

  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

/* ======================================================
 * DAILY + WEEKLY
 * ====================================================== */
type DailyHoyAyerRow = {
  incident_type: string;
  incidents_today: number;
  incidents_yesterday: number;
  delta: number;

  gross_today: number;
  recovered_today: number;
  net_today: number;

  gross_yesterday: number;
  recovered_yesterday: number;
  net_yesterday: number;
};

function isSameDay(row: EvalRow, periodField: PeriodField, yyyy_mm_dd: string) {
  const dKey = getRowDateKey(row, periodField);
  return dKey === yyyy_mm_dd;
}

function buildDailyHoyAyerByType(
  rows: EvalRow[],
  periodField: PeriodField,
  dayYesterday: string,
  dayToday: string
): DailyHoyAyerRow[] {
  const map = new Map<string, DailyHoyAyerRow>();

  function getOrInit(type: string) {
    const cur =
      map.get(type) ??
      ({
        incident_type: type,
        incidents_today: 0,
        incidents_yesterday: 0,
        delta: 0,
        gross_today: 0,
        recovered_today: 0,
        net_today: 0,
        gross_yesterday: 0,
        recovered_yesterday: 0,
        net_yesterday: 0,
      } as DailyHoyAyerRow);
    map.set(type, cur);
    return cur;
  }

  for (const r of rows) {
    const incident_type = (r.incident_type ?? "UNKNOWN").trim() || "UNKNOWN";

    const gross = toNumber(r.economic_impact_gross);
    const recovered = toNumber(r.economic_recovered);
    const netStored = r.economic_net_loss == null ? null : toNumber(r.economic_net_loss);
    const net = computeNet(gross, recovered, netStored);

    if (isSameDay(r, periodField, dayToday)) {
      const cur = getOrInit(incident_type);
      cur.incidents_today += 1;
      cur.gross_today += gross;
      cur.recovered_today += recovered;
      cur.net_today += net;
    } else if (isSameDay(r, periodField, dayYesterday)) {
      const cur = getOrInit(incident_type);
      cur.incidents_yesterday += 1;
      cur.gross_yesterday += gross;
      cur.recovered_yesterday += recovered;
      cur.net_yesterday += net;
    }
  }

  const out = Array.from(map.values());
  for (const r of out) r.delta = r.incidents_today - r.incidents_yesterday;

  out.sort((a, b) =>
    b.incidents_today !== a.incidents_today ? b.incidents_today - a.incidents_today : b.delta - a.delta
  );
  return out;
}

type WeeklyDailySeriesRow = {
  day: string; // YYYY-MM-DD
  incidents: number;
  risk_high: number; // rating 1-2
  risk_medium: number; // rating 3
  risk_low: number; // rating 4-5
  gross: number;
  recovered: number;
  net: number;
};

function riskBucketFromRating(rating: number | null) {
  const v = Number(rating);
  if (!Number.isFinite(v)) return "UNKNOWN";
  if (v <= 2) return "HIGH";
  if (v === 3) return "MEDIUM";
  return "LOW";
}

function buildWeekly7dDailySeries(rows: EvalRow[], periodField: PeriodField): WeeklyDailySeriesRow[] {
  const map = new Map<string, WeeklyDailySeriesRow>();

  for (const r of rows) {
    const day = getRowDateKey(r, periodField);

    const gross = toNumber(r.economic_impact_gross);
    const recovered = toNumber(r.economic_recovered);
    const netStored = r.economic_net_loss == null ? null : toNumber(r.economic_net_loss);
    const net = computeNet(gross, recovered, netStored);

    const cur =
      map.get(day) ??
      ({
        day,
        incidents: 0,
        risk_high: 0,
        risk_medium: 0,
        risk_low: 0,
        gross: 0,
        recovered: 0,
        net: 0,
      } as WeeklyDailySeriesRow);

    cur.incidents += 1;

    const bucket = riskBucketFromRating(r.rating);
    if (bucket === "HIGH") cur.risk_high += 1;
    else if (bucket === "MEDIUM") cur.risk_medium += 1;
    else if (bucket === "LOW") cur.risk_low += 1;

    cur.gross += gross;
    cur.recovered += recovered;
    cur.net += net;

    map.set(day, cur);
  }

  return Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day));
}

/* ======================================================
 * CSV BUILDERS
 * ====================================================== */
function toCsvPlatformMonthly(rows: PlatformMonthlyRow[]) {
  const header = ["month", "platform", "incidents", "gross", "recovered", "net_loss"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.month),
        csvEscape(r.platform),
        csvEscape(r.incidents),
        csvEscape(asMoney(r.gross)),
        csvEscape(asMoney(r.recovered)),
        csvEscape(asMoney(r.net)),
      ].join(",")
    );
  }
  return lines.join("\n");
}

function toCsvTypeMonthly(rows: TypeMonthlyRow[]) {
  const header = ["month", "incident_type", "incidents", "gross", "recovered", "net_loss"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.month),
        csvEscape(r.incident_type),
        csvEscape(r.incidents),
        csvEscape(asMoney(r.gross)),
        csvEscape(asMoney(r.recovered)),
        csvEscape(asMoney(r.net)),
      ].join(",")
    );
  }
  return lines.join("\n");
}

function toCsvEconMonthly(rows: EconMonthlyRow[]) {
  const header = ["month", "incidents", "gross", "recovered", "net_loss"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.month),
        csvEscape(r.incidents),
        csvEscape(asMoney(r.gross)),
        csvEscape(asMoney(r.recovered)),
        csvEscape(asMoney(r.net)),
      ].join(",")
    );
  }
  return lines.join("\n");
}

function toCsvDailyHoyAyerByType(rows: DailyHoyAyerRow[]) {
  const header = [
    "incident_type",
    "incidents_today",
    "incidents_yesterday",
    "delta",
    "gross_today",
    "recovered_today",
    "net_today",
    "gross_yesterday",
    "recovered_yesterday",
    "net_yesterday",
  ];
  const lines = [header.join(",")];

  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.incident_type),
        csvEscape(r.incidents_today),
        csvEscape(r.incidents_yesterday),
        csvEscape(r.delta),
        csvEscape(asMoney(r.gross_today)),
        csvEscape(asMoney(r.recovered_today)),
        csvEscape(asMoney(r.net_today)),
        csvEscape(asMoney(r.gross_yesterday)),
        csvEscape(asMoney(r.recovered_yesterday)),
        csvEscape(asMoney(r.net_yesterday)),
      ].join(",")
    );
  }
  return lines.join("\n");
}

function toCsvWeekly7dDailySeries(rows: WeeklyDailySeriesRow[]) {
  const header = ["day", "incidents", "risk_high", "risk_medium", "risk_low", "gross", "recovered", "net_loss"];
  const lines = [header.join(",")];

  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.day),
        csvEscape(r.incidents),
        csvEscape(r.risk_high),
        csvEscape(r.risk_medium),
        csvEscape(r.risk_low),
        csvEscape(asMoney(r.gross)),
        csvEscape(asMoney(r.recovered)),
        csvEscape(asMoney(r.net)),
      ].join(",")
    );
  }
  return lines.join("\n");
}

/* ======================================================
 * PDF helpers (WinAnsi safe + layout)
 * ====================================================== */
function sanitizeWinAnsi(s: string) {
  return String(s ?? "")
    .replaceAll("—", "-")
    .replaceAll("–", "-")
    .replaceAll("→", "->")
    .replaceAll("€", "EUR")
    .replaceAll("\u00A0", " ")
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .replaceAll("‘", "'")
    .replaceAll("’", "'")
    .replaceAll("Δ", "Delta")
    .replaceAll("•", "-");
}

function fitTextToWidth(font: any, text: string, fontSize: number, maxWidth: number) {
  const t = sanitizeWinAnsi(text ?? "");
  if (maxWidth <= 0) return "";
  if (font.widthOfTextAtSize(t, fontSize) <= maxWidth) return t;

  const ell = "...";
  const ellW = font.widthOfTextAtSize(ell, fontSize);
  if (ellW > maxWidth) return "";

  let lo = 0;
  let hi = t.length;

  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const candidate = t.slice(0, mid);
    const w = font.widthOfTextAtSize(candidate, fontSize);
    if (w + ellW <= maxWidth) lo = mid;
    else hi = mid - 1;
  }

  return t.slice(0, lo) + ell;
}

type PdfTable = {
  title: string;
  subtitle: string;
  columns: { key: string; label: string; width: number; align?: "left" | "right" | "center" }[];
  rows: Record<string, string>[];
};

async function buildPdfLandscape(table: PdfTable): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 842;
  const PAGE_H = 595;

  const margin = 36;
  const topPad = 14;

  const padX = 6;

  const titleSize = 18;
  const subtitleSize = 10;
  const headerSize = 10;
  const rowSize = 10;

  const headerH = 22;
  const rowH = 18;

  const tableW = table.columns.reduce((acc, c) => acc + c.width, 0);
  const maxTableW = PAGE_W - margin * 2;

  const clampTableW = Math.min(tableW, maxTableW);
  const tableX = Math.max(margin, (PAGE_W - clampTableW) / 2);

  const gapAfterTitle = 18;
  const sepColor = rgb(0.87, 0.89, 0.92);

  function drawHeader(page: any, yTop: number) {
    page.drawRectangle({
      x: tableX,
      y: yTop - headerH,
      width: clampTableW,
      height: headerH,
      color: rgb(0.95, 0.96, 0.98),
    });

    let x = tableX;

    for (const c of table.columns) {
      const cellW = Math.min(c.width, tableX + clampTableW - x);
      if (cellW <= 0) break;

      const label = fitTextToWidth(fontBold, c.label, headerSize, cellW - padX * 2);

      if (c.align === "right") {
        const textW = fontBold.widthOfTextAtSize(label, headerSize);
        page.drawText(label, { x: x + cellW - padX - textW, y: yTop - headerH + 7, size: headerSize, font: fontBold });
      } else if (c.align === "center") {
        const textW = fontBold.widthOfTextAtSize(label, headerSize);
        page.drawText(label, { x: x + (cellW - textW) / 2, y: yTop - headerH + 7, size: headerSize, font: fontBold });
      } else {
        page.drawText(label, { x: x + padX, y: yTop - headerH + 7, size: headerSize, font: fontBold });
      }

      x += c.width;
      if (x >= tableX + clampTableW) break;
    }

    page.drawLine({
      start: { x: tableX, y: yTop - headerH },
      end: { x: tableX + clampTableW, y: yTop - headerH },
      thickness: 1,
      color: sepColor,
    });

    return yTop - headerH;
  }

  function drawTitleBlock(page: any) {
    let y = PAGE_H - margin - topPad;

    page.drawText(fitTextToWidth(fontBold, table.title, titleSize, maxTableW), {
      x: tableX,
      y,
      size: titleSize,
      font: fontBold,
    });
    y -= 24;

    page.drawText(fitTextToWidth(font, table.subtitle, subtitleSize, maxTableW), {
      x: tableX,
      y,
      size: subtitleSize,
      font,
    });
    y -= 16;

    page.drawLine({
      start: { x: tableX, y: y - 8 },
      end: { x: tableX + clampTableW, y: y - 8 },
      thickness: 1,
      color: sepColor,
    });

    y -= 22 + gapAfterTitle;
    return y;
  }

  function drawFooter(page: any) {
    page.drawLine({
      start: { x: tableX, y: margin + 24 },
      end: { x: tableX + clampTableW, y: margin + 24 },
      thickness: 1,
      color: sepColor,
    });
    page.drawText("Debacu Evaluation360 - Export auditable", { x: tableX, y: margin + 10, size: 9, font });
  }

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = drawTitleBlock(page);
  y = drawHeader(page, y) - 6;

  const minY = margin + 40;

  for (const r of table.rows) {
    if (y - rowH < minY) {
      drawFooter(page);
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = drawTitleBlock(page);
      y = drawHeader(page, y) - 6;
    }

    let x = tableX;

    for (const c of table.columns) {
      const cellW = Math.min(c.width, tableX + clampTableW - x);
      if (cellW <= 0) break;

      const raw = r[c.key] ?? "";
      const val = fitTextToWidth(font, raw, rowSize, cellW - padX * 2);

      if (c.align === "right") {
        const textW = font.widthOfTextAtSize(val, rowSize);
        page.drawText(val, { x: x + cellW - padX - textW, y, size: rowSize, font });
      } else if (c.align === "center") {
        const textW = font.widthOfTextAtSize(val, rowSize);
        page.drawText(val, { x: x + (cellW - textW) / 2, y, size: rowSize, font });
      } else {
        page.drawText(val, { x: x + padX, y, size: rowSize, font });
      }

      x += c.width;
      if (x >= tableX + clampTableW) break;
    }

    page.drawLine({
      start: { x: tableX, y: y - 6 },
      end: { x: tableX + clampTableW, y: y - 6 },
      thickness: 0.8,
      color: sepColor,
    });

    y -= rowH;
  }

  drawFooter(page);
  return await pdf.save();
}

/* ======================================================
 * STORAGE UPLOAD + SIGNED URL (higiene: no orphan)
 * ====================================================== */
async function uploadBytes(
  sb: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
  bytes: Uint8Array,
  contentType: string
) {
  const { error } = await sb.storage.from(bucket).upload(path, bytes, {
    contentType,
    // ✅ sin upsert:true (path lleva UUID, no debe pisarse)
    upsert: false,
  });
  if (error) throw new Error(`STORAGE_UPLOAD_FAILED:${error.message}`);
}

async function signUrl(sb: ReturnType<typeof createClient>, bucket: string, path: string) {
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 60 * 15);
  if (error) throw new Error(`SIGNED_URL_FAILED:${error.message}`);
  return data?.signedUrl ?? null;
}

async function deletePathBestEffort(sb: ReturnType<typeof createClient>, bucket: string, path: string) {
  try {
    await sb.storage.from(bucket).remove([path]);
  } catch {
    // best-effort: no throw
  }
}

/* ======================================================
 * ERROR MAPPING (no stack traces)
 * ====================================================== */
function mapError(e: unknown): { status: number; detail: string } {
  const msg = String((e as any)?.message ?? e ?? "request_failed");

  // 401
  if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED" || msg.includes("JWT")) {
    return { status: 401, detail: "UNAUTHENTICATED" };
  }

  // 402
  if (msg === "PLAN_NOT_ACTIVE") {
    return { status: 402, detail: "PLAN_NOT_ACTIVE" };
  }

  // 403
  if (
    msg.startsWith("FORBIDDEN") ||
    msg.startsWith("MEMBERSHIP_FAILED") ||
    msg.startsWith("ORG_LOOKUP_FAILED") ||
    msg.startsWith("ENTITLEMENTS_FAILED")
  ) {
    return { status: 403, detail: msg.startsWith("FORBIDDEN") ? msg : "FORBIDDEN" };
  }

  // 400
  if (
    msg.startsWith("missing_") ||
    msg.startsWith("invalid_") ||
    msg === "invalid_json" ||
    msg === "method_not_allowed"
  ) {
    return { status: 400, detail: msg };
  }

  // 500 genérico (sin stack)
  return { status: 500, detail: "INTERNAL" };
}

/* ======================================================
 * MAIN (JWT-only)
 * ====================================================== */
export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed", detail: "method_not_allowed" });

  let storageUploaded = false;
  let storagePath = "";
  let exportId = "";
  const admin = supabaseServiceClient(); // ✅ service role centralizado

  try {
    // 1) JWT required (no x-session-token)
    const user = await requireUser(req);

    // 2) parse body
    let body: BuildReq;
    try {
      body = (await req.json()) as BuildReq;
    } catch {
      throw new Error("invalid_json");
    }

    const orgIdInput = body.org_id ? String(body.org_id) : null;

    // 3) org resolve + tenant
    const org_id = await resolveOrgId(admin, user.id, orgIdInput);
    const tenant = await resolveTenant(admin, org_id);

    // 4) plan gate (ACTIVE obligatorio para export)
    await requirePlanActiveForOrg(admin, org_id);

    // 5) validar request
    const exportType = body.export_type;
    const exportScope = body.export_scope;
    const periodFrom = String(body.period_from ?? "");
    const periodTo = String(body.period_to ?? "");

    if (exportType !== "PDF" && exportType !== "CSV") throw new Error("invalid_export_type");
    if (!exportScope) throw new Error("missing_export_scope");

    assertDate(periodFrom);
    assertDate(periodTo);
    if (periodFrom > periodTo) throw new Error("invalid_period_range");

    const filters = body.filters ?? {};
    const periodField: PeriodField =
      (filters?.period_field as PeriodField) || (filters?.use_created_at ? "created_at" : "evaluation_date");

    // 6) fetch raw rows (scoped by customer_id)
    const evalRows = await fetchEvaluationsForRange(admin, tenant.customer_id, periodField, periodFrom, periodTo);

    let fileBytes: Uint8Array;
    let contentType: string;
    let rowCount = 0;

    const subtitle = `Hotel: ${tenant.customer_name || "-"} | Periodo: ${periodFrom} -> ${periodTo} | Campo: ${periodField} | Generado: ${isoDate(
      new Date()
    )}`;

    // 7) build export
    if (exportScope === "INCIDENTS_BY_PLATFORM_MONTHLY") {
      const agg = buildIncidentsByPlatformMonthly(evalRows, periodField);
      rowCount = agg.length;

      if (exportType === "CSV") {
        fileBytes = new TextEncoder().encode(toCsvPlatformMonthly(agg));
        contentType = "text/csv";
      } else {
        const rows = agg.map((r) => ({
          month: r.month,
          platform: r.platform,
          incidents: String(r.incidents),
          gross: asMoney(r.gross),
          recovered: asMoney(r.recovered),
          net: asMoney(r.net),
        }));
        fileBytes = await buildPdfLandscape({
          title: "Incidencias por plataforma (mensual)",
          subtitle,
          columns: [
            { key: "month", label: "Mes", width: 90 },
            { key: "platform", label: "Plataforma", width: 220 },
            { key: "incidents", label: "Incid.", width: 70, align: "right" },
            { key: "gross", label: "Gross (EUR)", width: 120, align: "right" },
            { key: "recovered", label: "Recup. (EUR)", width: 120, align: "right" },
            { key: "net", label: "Perdida neta (EUR)", width: 150, align: "right" },
          ],
          rows,
        });
        contentType = "application/pdf";
      }
    } else if (exportScope === "INCIDENTS_BY_TYPE_MONTHLY") {
      const agg = buildIncidentsByTypeMonthly(evalRows, periodField);
      rowCount = agg.length;

      if (exportType === "CSV") {
        fileBytes = new TextEncoder().encode(toCsvTypeMonthly(agg));
        contentType = "text/csv";
      } else {
        const rows = agg.map((r) => ({
          month: r.month,
          incident_type: r.incident_type,
          incidents: String(r.incidents),
          gross: asMoney(r.gross),
          recovered: asMoney(r.recovered),
          net: asMoney(r.net),
        }));
        fileBytes = await buildPdfLandscape({
          title: "Incidencias por tipo (mensual)",
          subtitle,
          columns: [
            { key: "month", label: "Mes", width: 90 },
            { key: "incident_type", label: "Tipo incidencia", width: 250 },
            { key: "incidents", label: "Incid.", width: 70, align: "right" },
            { key: "gross", label: "Gross (EUR)", width: 120, align: "right" },
            { key: "recovered", label: "Recup. (EUR)", width: 120, align: "right" },
            { key: "net", label: "Perdida neta (EUR)", width: 150, align: "right" },
          ],
          rows,
        });
        contentType = "application/pdf";
      }
    } else if (exportScope === "ECONOMIC_IMPACT_MONTHLY") {
      const agg = buildEconomicImpactMonthly(evalRows, periodField);
      rowCount = agg.length;

      if (exportType === "CSV") {
        fileBytes = new TextEncoder().encode(toCsvEconMonthly(agg));
        contentType = "text/csv";
      } else {
        const rows = agg.map((r) => ({
          month: r.month,
          incidents: String(r.incidents),
          gross: asMoney(r.gross),
          recovered: asMoney(r.recovered),
          net: asMoney(r.net),
        }));
        fileBytes = await buildPdfLandscape({
          title: "Impacto economico (mensual)",
          subtitle,
          columns: [
            { key: "month", label: "Mes", width: 110 },
            { key: "incidents", label: "Incid.", width: 90, align: "right" },
            { key: "gross", label: "Gross (EUR)", width: 170, align: "right" },
            { key: "recovered", label: "Recup. (EUR)", width: 170, align: "right" },
            { key: "net", label: "Perdida neta (EUR)", width: 190, align: "right" },
          ],
          rows,
        });
        contentType = "application/pdf";
      }
    } else if (exportScope === "DAILY_HOY_AYER_BY_TYPE") {
      const agg = buildDailyHoyAyerByType(evalRows, periodField, periodFrom, periodTo);
      rowCount = agg.length;

      if (exportType === "CSV") {
        fileBytes = new TextEncoder().encode(toCsvDailyHoyAyerByType(agg));
        contentType = "text/csv";
      } else {
        const rows = agg.map((r) => ({
          incident_type: r.incident_type,
          incidents_yesterday: String(r.incidents_yesterday),
          incidents_today: String(r.incidents_today),
          delta: String(r.delta),
          net_today: asMoney(r.net_today),
        }));

        fileBytes = await buildPdfLandscape({
          title: "Informe diario (Hoy/Ayer) - Por tipo",
          subtitle,
          columns: [
            { key: "incident_type", label: "Tipo incidencia", width: 300, align: "left" },
            { key: "incidents_yesterday", label: "Ayer", width: 80, align: "center" },
            { key: "incidents_today", label: "Hoy", width: 80, align: "center" },
            { key: "delta", label: "Variacion", width: 90, align: "center" },
            { key: "net_today", label: "Neto hoy (EUR)", width: 220, align: "right" },
          ],
          rows,
        });
        contentType = "application/pdf";
      }
    } else if (exportScope === "WEEKLY_7D_DAILY_SERIES") {
      const agg = buildWeekly7dDailySeries(evalRows, periodField);
      rowCount = agg.length;

      if (exportType === "CSV") {
        fileBytes = new TextEncoder().encode(toCsvWeekly7dDailySeries(agg));
        contentType = "text/csv";
      } else {
        const rows = agg.map((r) => ({
          day: r.day,
          incidents: String(r.incidents),
          risk_high: String(r.risk_high),
          risk_medium: String(r.risk_medium),
          risk_low: String(r.risk_low),
          net: asMoney(r.net),
        }));

        fileBytes = await buildPdfLandscape({
          title: "Informe semanal - Serie diaria (7d)",
          subtitle,
          columns: [
            { key: "day", label: "Dia", width: 120 },
            { key: "incidents", label: "Incid.", width: 80, align: "right" },
            { key: "risk_high", label: "Alto", width: 70, align: "right" },
            { key: "risk_medium", label: "Medio", width: 80, align: "right" },
            { key: "risk_low", label: "Bajo", width: 70, align: "right" },
            { key: "net", label: "Neto (EUR)", width: 250, align: "right" },
          ],
          rows,
        });
        contentType = "application/pdf";
      }
    } else {
      throw new Error("unsupported_scope");
    }

    // 8) storage path
    exportId = crypto.randomUUID();
    const ext = exportType === "PDF" ? "pdf" : "csv";
    const dateFolder = isoDate(new Date());
    const safeScope = String(exportScope).toLowerCase();
    const safeHotel = (tenant.customer_name || "hotel").toLowerCase().replace(/[^a-z0-9]+/g, "");
    storagePath = `${dateFolder}/export_${dateFolder}_${safeScope}_${safeHotel}_${periodFrom}_${periodTo}_${exportId}.${ext}`;

    const sha = await sha256Hex(fileBytes);
    const sizeBytes = fileBytes.byteLength;

    // 9) upload + sign (si falla luego el insert => borrar)
    await uploadBytes(admin, DEFAULT_BUCKET, storagePath, fileBytes, contentType);
    storageUploaded = true;

    const downloadUrl = await signUrl(admin, DEFAULT_BUCKET, storagePath);

    // 10) audit insert + devolver created_at real
    const insertRow = {
      id: exportId,

      org_id: tenant.org_id, // si existe la columna en tu tabla, útil; si no, quítalo
      customer_id: tenant.customer_id, // si existe; si no, quítalo

      generated_by_user_id: user.id,
      generated_by_email: user.email ?? null,

      delivered_to_name: "Team Hotel",
      delivered_to_org: tenant.customer_name || "SELF",
      delivered_to_reason: "SELF_SERVICE_EXPORT",
      delivered_to_reference: exportScope,

      filter_source: exportScope,
      filter_customer: tenant.customer_name || null,
      filter_type: periodField,
      filter_from: periodFrom,
      filter_to: periodTo,

      format: exportType,
      row_count: rowCount,

      storage_bucket: DEFAULT_BUCKET,
      storage_path: storagePath,

      file_sha256: sha,
      file_bytes: sizeBytes,

      meta: {
        app_code: tenant.app_code,
        org_id: tenant.org_id,
        customer_id: tenant.customer_id,
        period_field: periodField,
        export_scope: exportScope,
      },
    };

    // ⚠️ Si tu tabla debacu_eval_audit_exports NO tiene org_id/customer_id como columnas,
    // elimina esas dos propiedades del insertRow.
    const { data: ins, error: insErr } = await admin
      .from("debacu_eval_audit_exports")
      .insert(insertRow as any)
      .select("id, created_at")
      .maybeSingle();

    if (insErr) throw new Error(`EXPORT_INSERT_FAILED:${insErr.message}`);

    return json(req, 200, {
      ok: true,
      export_id: exportId,
      status: "READY",
      created_at: ins?.created_at ?? null,
      row_count: rowCount,
      sha256: sha,
      file_size_bytes: sizeBytes,
      storage_bucket: DEFAULT_BUCKET,
      storage_path: storagePath,
      download_url: downloadUrl,
    });
  } catch (e) {
    // higiene: si ya subiste a storage y luego falló DB/sign => borrar best-effort
    if (storageUploaded && storagePath) {
      await deletePathBestEffort(admin, DEFAULT_BUCKET, storagePath);
    }

    const mapped = mapError(e);
    // ✅ no stack traces al cliente
    return json(req, mapped.status, { ok: false, error: "request_failed", detail: mapped.detail });
  }
});
