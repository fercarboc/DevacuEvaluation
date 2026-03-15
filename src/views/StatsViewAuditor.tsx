import React, { useEffect, useMemo, useState } from "react";
import { PlanTier } from "../../auditor";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { CalendarRange, Activity, FileText } from "lucide-react";
import { callEvalFn } from "@/services/callEvalFn";
import { LS_KEYS } from "@/services/storageKeys";
import { EconomicImpactDialog } from "@/components/reports/EconomicImpactDialog";
import { DailyReportDialog } from "@/components/reports/DailyReportDialog";
import { WeeklyReportDialog } from "@/components/reports/WeeklyReportDialog";

/** ======================================================
 * Tipos (respuesta Edge)
 * ====================================================== */
type DailyPoint = {
  date: string; // YYYY-MM-DD
  count: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
  records: number;
};

type HourlyPoint = {
  hour: number; // 0..23
  count: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
};

type OperationalStatsResponse = {
  ok: boolean;
  period_from: string;
  period_to: string;
  mode: "DAILY" | "HOURLY";
  totals: {
    consultas: number;
    registros: number;
    risk: {
      high: number;
      medium: number;
      low: number;
      risky: number; // high+medium
    };
  };
  daily: DailyPoint[];
  hourly: HourlyPoint[] | null;
};

/** ======================================================
 * Tipos export (Edge customer_audit_export_build)
 * ====================================================== */
type ExportType = "PDF" | "CSV";
type ExportScope =
  | "INCIDENTS_BY_PLATFORM_MONTHLY"
  | "INCIDENTS_BY_TYPE_MONTHLY"
  | "ECONOMIC_IMPACT_MONTHLY"
  | "DAILY_HOY_AYER_BY_TYPE"
  | "WEEKLY_7D_DAILY_SERIES";

type BuildExportResponse = {
  ok: boolean;
  export_id: string;
  status: "READY" | "FAILED" | string;
  row_count: number;
  sha256: string;
  file_size_bytes: number;
  storage_bucket: string;
  storage_path: string;
  download_url: string | null;
  error?: string;
  detail?: string;
};

/** ======================================================
 * Revenue Alerts (test interno)
 * ====================================================== */
type RevenueAlertPreviewItem = {
  org_id: string;
  property_id: string;
  stay_date: string;
  alert_type: string;
  severity: string;
  metric_value: number | null;
  threshold_value: number | null;
  title: string;
  description: string;
  source: string;
};

type RevenueAlertsGenerateResponse = {
  ok: boolean;
  data: RevenueAlertPreviewItem[] | any[];
  meta?: {
    orgId?: string;
    propertyId?: string;
    dateFrom?: string;
    dateTo?: string;
    rowsRead?: number;
    alertsDetected?: number;
    alertsInserted?: number;
    action?: "PREVIEW" | "GENERATE";
  };
};

/** ======================================================
 * Helpers
 * ====================================================== */
function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function parseISODateOnly(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function mmdd(iso: string) {
  return iso.slice(5);
}

function hourLabel(h: number) {
  return String(h).padStart(2, "0") + ":00";
}

function clampDateRange(from: string, to: string) {
  const a = parseISODateOnly(from);
  const b = parseISODateOnly(to);
  if (a > b) return { from: to, to: from };
  return { from, to };
}

function triggerDownload(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function getActivePropertyIdFromStorage() {
  return (
    localStorage.getItem(LS_KEYS.ACTIVE_PROPERTY_ID) ||
    null
  );
}

/** ======================================================
 * Modal base (simple)
 * ====================================================== */
function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="font-bold text-slate-800">{title}</div>
          <button className="text-slate-500 hover:text-slate-700" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/** ======================================================
 * Fetch real (Edge)
 * ====================================================== */
async function fetchOperationalStats(params: {
  from: string;
  to: string;
  orgId: string;
}): Promise<OperationalStatsResponse> {
  const res = await callEvalFn("client_operational_stats", {
    org_id: params.orgId,
    period_from: params.from,
    period_to: params.to,
  });

  if (!res || typeof res !== "object") {
    throw new Error("Respuesta inválida del servidor.");
  }
  if (!Boolean((res as any).ok)) {
    throw new Error((res as any).error ?? "No se pudo cargar estadísticas.");
  }

  return res as OperationalStatsResponse;
}

async function buildAuditExport(params: {
  export_type: ExportType;
  export_scope: ExportScope;
  period_from: string;
  period_to: string;
  filters?: { period_field?: "evaluation_date" | "created_at"; use_created_at?: boolean } | null;
}): Promise<BuildExportResponse> {
  const res = await callEvalFn("customer_audit_export_build", params);

  if (!res || typeof res !== "object") {
    throw new Error("Respuesta inválida del servidor (export).");
  }
  if (!(res as any).ok) {
    throw new Error((res as any).error ?? (res as any).detail ?? "No se pudo generar el export.");
  }

  return res as BuildExportResponse;
}

async function runRevenueAlerts(params: {
  action: "PREVIEW" | "GENERATE";
  orgId: string;
  propertyId: string;
  from: string;
  to: string;
}): Promise<RevenueAlertsGenerateResponse> {
  const res = await callEvalFn("debacu_eval_revenue_alerts_generate", {
    action: params.action,
    org_id: params.orgId,
    property_id: params.propertyId,
    date_from: params.from,
    date_to: params.to,
  });

  if (!res || typeof res !== "object") {
    throw new Error("Respuesta inválida del servidor (revenue alerts).");
  }

  if (!(res as any).ok) {
    throw new Error(
      (res as any).detail ??
        (res as any).error ??
        "No se pudo ejecutar la generación de alertas."
    );
  }

  return res as RevenueAlertsGenerateResponse;
}

/** ======================================================
 * ExportDialog (se mantiene para auditoría/mensuales)
 * ====================================================== */
function ExportDialog({
  open,
  title,
  description,
  defaultScope,
  from,
  to,
  periodField,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  defaultScope: ExportScope;
  from: string;
  to: string;
  periodField: "evaluation_date" | "created_at";
  onClose: () => void;
}) {
  const [exportType, setExportType] = useState<ExportType>("PDF");
  const [scope, setScope] = useState<ExportScope>(defaultScope);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<BuildExportResponse | null>(null);

  useEffect(() => {
    if (open) {
      setExportType("PDF");
      setScope(defaultScope);
      setBusy(false);
      setErr(null);
      setResult(null);
    }
  }, [open, defaultScope]);

  const onGenerate = async () => {
    try {
      setBusy(true);
      setErr(null);
      setResult(null);

      const r = await buildAuditExport({
        export_type: exportType,
        export_scope: scope,
        period_from: from,
        period_to: to,
        filters: { period_field: periodField },
      });

      setResult(r);
      if (r.download_url) triggerDownload(r.download_url);
    } catch (e: any) {
      setErr(e?.message ?? "No se pudo generar el informe.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="space-y-4">
        <div className="text-sm text-slate-600">{description}</div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-bold uppercase text-slate-500">Rango</div>
          <div className="mt-1 text-sm font-semibold text-slate-800">
            {from} → {to}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Campo: {periodField}</div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-xs font-bold text-slate-500">Formato</div>
            <select
              value={exportType}
              onChange={(e) => setExportType(e.target.value as ExportType)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="PDF">PDF</option>
              <option value="CSV">CSV</option>
            </select>
          </label>

          <label className="space-y-1">
            <div className="text-xs font-bold text-slate-500">Scope</div>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as ExportScope)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="INCIDENTS_BY_TYPE_MONTHLY">Incidencias por tipo (mensual)</option>
              <option value="INCIDENTS_BY_PLATFORM_MONTHLY">Incidencias por plataforma (mensual)</option>
              <option value="ECONOMIC_IMPACT_MONTHLY">Impacto económico (mensual)</option>
              <option value="WEEKLY_7D_DAILY_SERIES">Informe semanal (7 días)</option>
            </select>
          </label>
        </div>

        {err ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        ) : null}

        {result ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Generado: {result.export_id} · filas: {result.row_count} · tamaño: {result.file_size_bytes} bytes
            {result.download_url ? (
              <>
                {" "}
                ·{" "}
                <button
                  className="font-semibold underline"
                  onClick={() => result.download_url && triggerDownload(result.download_url)}
                >
                  Descargar
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
            disabled={busy}
          >
            Cerrar
          </button>
          <button
            onClick={onGenerate}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-60"
            disabled={busy}
          >
            {busy ? "Generando..." : "Generar y descargar"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** ======================================================
 * Props
 * ====================================================== */
interface StatsViewAuditorProps {
  currentPlan: PlanTier;
}

type Preset = "LAST_7" | "LAST_30" | "YEAR";

const StatsViewAuditor: React.FC<StatsViewAuditorProps> = ({ currentPlan }) => {
  void currentPlan;

  /** ---------------------------
   * orgId / propertyId (localStorage)
   * --------------------------- */
  const [orgId, setOrgId] = useState<string | null>(() => localStorage.getItem(LS_KEYS.ORG_ID));
  const [propertyId, setPropertyId] = useState<string | null>(() => getActivePropertyIdFromStorage());

  useEffect(() => {
    setOrgId(localStorage.getItem(LS_KEYS.ORG_ID));
    setPropertyId(getActivePropertyIdFromStorage());

    const onStorage = (e: StorageEvent) => {
      if (e.key === "debacu_eval_org_id") {
        setOrgId(e.newValue);
      }

      if (e.key === "revenue_active_property_id" || e.key === "debacu_eval_property_id") {
        setPropertyId(getActivePropertyIdFromStorage());
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /** ---------------------------
   * Filtros
   * --------------------------- */
  const [preset, setPreset] = useState<Preset>("LAST_7");

  const [rangeOpen, setRangeOpen] = useState(false);
  const [from, setFrom] = useState<string>(() => toISODate(addDays(startOfToday(), -6)));
  const [to, setTo] = useState<string>(() => toISODate(startOfToday()));

  useEffect(() => {
    const today = startOfToday();

    if (preset === "LAST_7") {
      setFrom(toISODate(addDays(today, -6)));
      setTo(toISODate(today));
    } else if (preset === "LAST_30") {
      setFrom(toISODate(addDays(today, -29)));
      setTo(toISODate(today));
    } else if (preset === "YEAR") {
      const y = today.getFullYear();
      setFrom(`${y}-01-01`);
      setTo(toISODate(today));
    }
  }, [preset]);

  const isSingleDay = from === to;

  /** ---------------------------
   * Data
   * --------------------------- */
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resp, setResp] = useState<OperationalStatsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        if (!orgId) {
          setError("No hay orgId activo.");
          setResp(null);
          setLoading(false);
          return;
        }

        const data = await fetchOperationalStats({ from, to, orgId });
        if (cancelled) return;
        setResp(data);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "No se pudo cargar estadísticas.");
        setResp(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const fromD = parseISODateOnly(from);
    const toD = parseISODateOnly(to);

    if (fromD > toD) {
      setError("El rango es inválido: 'Desde' es posterior a 'Hasta'.");
      setResp(null);
      return;
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [from, to, orgId]);

  const daily = resp?.daily ?? [];
  const hourly = resp?.hourly ?? null;

  /** ---------------------------
   * Revenue alerts test states
   * --------------------------- */
  const [alertsBusy, setAlertsBusy] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [alertsResult, setAlertsResult] = useState<RevenueAlertsGenerateResponse | null>(null);

  const handleRevenueAlerts = async (action: "PREVIEW" | "GENERATE") => {
    try {
      setAlertsBusy(true);
      setAlertsError(null);
      setAlertsResult(null);

      if (!orgId) throw new Error("No hay orgId activo.");
      if (!propertyId) throw new Error("No hay propertyId activo.");

      const res = await runRevenueAlerts({
        action,
        orgId,
        propertyId,
        from,
        to,
      });

      setAlertsResult(res);
    } catch (e: any) {
      setAlertsError(e?.message ?? "No se pudo ejecutar revenue alerts.");
    } finally {
      setAlertsBusy(false);
    }
  };

  /** ---------------------------
   * Chart data
   * --------------------------- */
  const chartData = useMemo(() => {
    if (isSingleDay && hourly) {
      return hourly.map((h) => ({
        x: hourLabel(h.hour),
        count: Number(h.count ?? 0),
        highRisk: Number(h.highRisk ?? 0),
        mediumRisk: Number(h.mediumRisk ?? 0),
        lowRisk: Number(h.lowRisk ?? 0),
      }));
    }

    const map = new Map<string, any>();
    const fromD = parseISODateOnly(from);
    const toD = parseISODateOnly(to);

    for (let d = new Date(fromD); d <= toD; d = addDays(d, 1)) {
      const key = toISODate(d);
      map.set(key, {
        x: mmdd(key),
        count: 0,
        highRisk: 0,
        mediumRisk: 0,
        lowRisk: 0,
        records: 0,
      });
    }

    for (const p of daily) {
      const dayKey = (p.date ?? "").slice(0, 10);
      if (!dayKey) continue;

      map.set(dayKey, {
        x: mmdd(dayKey),
        count: Number(p.count ?? 0),
        highRisk: Number(p.highRisk ?? 0),
        mediumRisk: Number(p.mediumRisk ?? 0),
        lowRisk: Number(p.lowRisk ?? 0),
        records: Number(p.records ?? 0),
      });
    }

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => v);
  }, [isSingleDay, hourly, daily, from, to]);

  /** ---------------------------
   * Summary
   * --------------------------- */
  const summary = useMemo(() => {
    const t = resp?.totals;
    return {
      consultas: Number(t?.consultas ?? 0),
      registros: Number(t?.registros ?? 0),
      high: Number(t?.risk?.high ?? 0),
      medium: Number(t?.risk?.medium ?? 0),
      low: Number(t?.risk?.low ?? 0),
      risky: Number(t?.risk?.risky ?? 0),
    };
  }, [resp]);

  /** ---------------------------
   * period_field
   * --------------------------- */
  const [periodField, setPeriodField] = useState<"evaluation_date" | "created_at">("evaluation_date");

  /** ---------------------------
   * Dialogs
   * --------------------------- */
  const [openDailyReport, setOpenDailyReport] = useState(false);
  const [openWeeklyReport, setOpenWeeklyReport] = useState(false);
  const [openEconomicReport, setOpenEconomicReport] = useState(false);

  const todayIso = toISODate(startOfToday());
  const last7FromIso = toISODate(addDays(startOfToday(), -6));
  const weeklyDialogRange = { from: last7FromIso, to: todayIso };

  return (
    <div className="space-y-8">
      {/* Header + filtros */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Estadísticas Operativas</h2>
          <p className="text-slate-500">
            {isSingleDay ? "Vista por horas (solo un día seleccionado)." : "Métricas diarias y distribución por riesgo."}
          </p>
          {error ? <div className="mt-2 text-sm text-red-600">{error}</div> : null}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as Preset)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="LAST_7">Últimos 7 días</option>
            <option value="LAST_30">Últimos 30 días</option>
            <option value="YEAR">Año actual</option>
          </select>

          <button
            type="button"
            onClick={() => setRangeOpen(true)}
            className="rounded-lg bg-indigo-600 p-2 text-white shadow-md transition-colors hover:bg-indigo-700"
            title="Rango desde / hasta"
          >
            <CalendarRange size={20} />
          </button>
        </div>
      </div>

      {/* Layout: gráfico + panel derecho */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-2">
          <div className="mb-8 flex items-center justify-between">
            <h3 className="font-bold text-slate-800">{isSingleDay ? "Consultas por hora" : "Consultas diarias"}</h3>

            <div className="flex flex-wrap justify-end gap-4">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-indigo-500" />
                <span className="text-[10px] font-bold text-slate-400">TOTAL</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-red-500" />
                <span className="text-[10px] font-bold text-slate-400">ALTO</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="text-[10px] font-bold text-slate-400">MEDIO</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-bold text-slate-400">BAJO</span>
              </div>
            </div>
          </div>

          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />

                <XAxis
                  dataKey="x"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  interval={isSingleDay ? 1 : 0}
                />

                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748b" }}
                />

                <Tooltip
                  formatter={(value: any, name: any) => {
                    const map: Record<string, string> = {
                      count: "Total",
                      highRisk: "Alto",
                      mediumRisk: "Medio",
                      lowRisk: "Bajo",
                    };
                    return [value, map[name] ?? name];
                  }}
                  labelFormatter={(label) => label}
                />

                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#6366f1"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorCount)"
                />
                <Area type="monotone" dataKey="highRisk" stroke="#ef4444" strokeWidth={2} fillOpacity={0} />
                <Area type="monotone" dataKey="mediumRisk" stroke="#f59e0b" strokeWidth={2} fillOpacity={0} />
                <Area type="monotone" dataKey="lowRisk" stroke="#10b981" strokeWidth={2} fillOpacity={0} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {loading ? <div className="mt-4 text-sm text-slate-500">Cargando métricas…</div> : null}
        </div>

        {/* Panel derecho */}
        <div className="min-w-0 space-y-6 lg:col-span-1">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="mb-6 flex items-center gap-2 font-bold text-slate-800">
              <Activity size={18} className="text-indigo-600" />
              Resumen de Actividad
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs font-bold uppercase text-slate-500">Consultas</div>
                <div className="mt-1 text-2xl font-extrabold text-slate-800">{summary.consultas}</div>
                <div className="mt-1 text-[11px] text-slate-500">Rango: {from} → {to}</div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs font-bold uppercase text-slate-500">Registros añadidos</div>
                <div className="mt-1 text-2xl font-extrabold text-slate-800">{summary.registros}</div>
                <div className="mt-1 text-[11px] text-slate-500">Rango: {from} → {to}</div>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-slate-200 p-3">
              <div className="text-xs font-bold uppercase text-slate-500">Riesgo (alto+medio)</div>
              <div className="mt-1 text-2xl font-extrabold text-slate-800">{summary.risky}</div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Alto</div>
                  <div className="text-sm font-extrabold text-slate-800">{summary.high}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Medio</div>
                  <div className="text-sm font-extrabold text-slate-800">{summary.medium}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Bajo</div>
                  <div className="text-sm font-extrabold text-slate-800">{summary.low}</div>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-3">
              <div>
                <div className="text-xs font-bold uppercase text-slate-500">Campo para informes</div>
                <div className="text-[11px] text-slate-500">evaluation_date es lo recomendado</div>
              </div>

              <select
                value={periodField}
                onChange={(e) => setPeriodField(e.target.value as "evaluation_date" | "created_at")}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
              >
                <option value="evaluation_date">evaluation_date</option>
                <option value="created_at">created_at</option>
              </select>
            </div>

            <div className="mt-6 space-y-2">
              <button
                type="button"
                onClick={() => setOpenDailyReport(true)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 hover:bg-slate-50"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <FileText size={16} className="text-indigo-600" />
                  Informe diario (Hoy/Ayer)
                </span>
                <span className="text-xs text-slate-500">Modal</span>
              </button>

              <button
                type="button"
                onClick={() => setOpenWeeklyReport(true)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 hover:bg-slate-50"
              >
                <span className="text-sm font-semibold text-slate-800">Informe semanal</span>
                <span className="text-xs text-slate-500">Modal</span>
              </button>

              <button
                type="button"
                onClick={() => setOpenEconomicReport(true)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 hover:bg-slate-50"
              >
                <span className="text-sm font-semibold text-slate-800">Impacto económico</span>
                <span className="text-xs text-slate-500">Modal</span>
              </button>
            </div>

            {/* Revenue Alerts test interno */}
            <div className="mt-6 rounded-xl border border-slate-200 p-4">
              <div className="text-xs font-bold uppercase text-slate-500">Revenue Alerts (test interno)</div>

              <div className="mt-1 text-[11px] text-slate-500">
                Usa el rango actual: {from} → {to}
              </div>

              <div className="mt-1 text-[11px] text-slate-500">
                orgId: {orgId ?? "—"}
              </div>

              <div className="mt-1 text-[11px] text-slate-500">
                propertyId: {propertyId ?? "—"}
              </div>

              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={() => handleRevenueAlerts("PREVIEW")}
                  disabled={alertsBusy || !orgId || !propertyId}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  {alertsBusy ? "Procesando..." : "Preview alertas revenue"}
                </button>

                <button
                  type="button"
                  onClick={() => handleRevenueAlerts("GENERATE")}
                  disabled={alertsBusy || !orgId || !propertyId}
                  className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {alertsBusy ? "Procesando..." : "Generar alertas revenue"}
                </button>
              </div>

              {alertsError ? (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {alertsError}
                </div>
              ) : null}

              {alertsResult ? (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  <div className="font-semibold">Acción: {alertsResult.meta?.action ?? "-"}</div>
                  <div>Filas leídas: {alertsResult.meta?.rowsRead ?? 0}</div>
                  <div>Detectadas: {alertsResult.meta?.alertsDetected ?? alertsResult.data?.length ?? 0}</div>
                  <div>Insertadas: {alertsResult.meta?.alertsInserted ?? 0}</div>
                </div>
              ) : null}

              {alertsResult?.data?.length ? (
                <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Fecha</th>
                        <th className="px-3 py-2 text-left">Tipo</th>
                        <th className="px-3 py-2 text-left">Severidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(alertsResult.data as RevenueAlertPreviewItem[]).map((a, idx) => (
                        <tr
                          key={`${a.stay_date}-${a.alert_type}-${idx}`}
                          className="border-t border-slate-100"
                        >
                          <td className="px-3 py-2">{a.stay_date}</td>
                          <td className="px-3 py-2">{a.alert_type}</td>
                          <td className="px-3 py-2">{a.severity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Modal rango calendario */}
      <Modal open={rangeOpen} title="Filtrar por rango" onClose={() => setRangeOpen(false)}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <div className="text-xs font-bold text-slate-500">Desde</div>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>

            <label className="space-y-1">
              <div className="text-xs font-bold text-slate-500">Hasta</div>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setRangeOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
            >
              Cancelar
            </button>

            <button
              onClick={() => {
                const fixed = clampDateRange(from, to);
                setFrom(fixed.from);
                setTo(fixed.to);
                setRangeOpen(false);
              }}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
            >
              Aplicar
            </button>
          </div>
        </div>
      </Modal>

      {/* DailyReportDialog */}
      <DailyReportDialog
        open={openDailyReport}
        onClose={() => setOpenDailyReport(false)}
        orgId={orgId ?? ""}
      />

      {/* WeeklyReportDialog */}
      <WeeklyReportDialog
        open={openWeeklyReport}
        onClose={() => setOpenWeeklyReport(false)}
        defaultFrom={weeklyDialogRange.from}
        defaultTo={weeklyDialogRange.to}
        periodField={periodField}
        orgId={orgId}
      />

      {/* EconomicImpactDialog */}
      <EconomicImpactDialog
        open={openEconomicReport}
        onClose={() => setOpenEconomicReport(false)}
        orgId={orgId ?? ""}
        periodField={periodField}
      />
    </div>
  );
};

export default StatsViewAuditor;