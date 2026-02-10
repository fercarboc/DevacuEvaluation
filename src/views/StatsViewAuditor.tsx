import React, { useEffect, useMemo, useState } from "react";
import { PlanTier } from "../../auditor";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CalendarRange, Activity, FileText } from "lucide-react";
import { callEvalFn } from "@/services/callEvalFn";

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
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="font-bold text-slate-800">{title}</div>
          <button
            className="text-slate-500 hover:text-slate-700"
            onClick={onClose}
            aria-label="Cerrar"
          >
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
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}): Promise<OperationalStatsResponse> {
  const res = await callEvalFn("client_operational_stats", {
    period_from: params.from,
    period_to: params.to,
  });

  if (!res || typeof res !== "object") {
    throw new Error("Respuesta inválida del servidor.");
  }

  const ok = Boolean((res as any).ok);
  if (!ok) throw new Error((res as any).error ?? "No se pudo cargar estadísticas.");

  return res as OperationalStatsResponse;
}

/** ======================================================
 * Props
 * ====================================================== */
interface StatsViewAuditorProps {
  currentPlan: PlanTier;
}

type Preset = "LAST_7" | "LAST_30" | "YEAR";

const StatsViewAuditor: React.FC<StatsViewAuditorProps> = ({ currentPlan }) => {
  /** ---------------------------
   * Filtros
   * --------------------------- */
  const [preset, setPreset] = useState<Preset>("LAST_7");

  const [rangeOpen, setRangeOpen] = useState(false);
  const [from, setFrom] = useState<string>(() => {
    const d = addDays(startOfToday(), -6);
    return toISODate(d);
  });
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
        const data = await fetchOperationalStats({ from, to });
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
      return;
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const daily = resp?.daily ?? [];
  const hourly = resp?.hourly ?? null;

  /** ---------------------------
   * Chart data
   * - DAILY: asegura días vacíos
   * - HOURLY: 0..23 siempre
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
      map.set(key, { x: mmdd(key), count: 0, highRisk: 0, mediumRisk: 0, lowRisk: 0, records: 0 });
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
   * Modales stubs
   * --------------------------- */
  const [openDailyReport, setOpenDailyReport] = useState(false);
  const [openWeeklyReport, setOpenWeeklyReport] = useState(false);
  const [openAuditReport, setOpenAuditReport] = useState(false);
  const [openAbuseReport, setOpenAbuseReport] = useState(false);
  const [openEconomicReport, setOpenEconomicReport] = useState(false);

  return (
    <div className="space-y-8">
      {/* Header + filtros */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Estadísticas Operativas</h2>
          <p className="text-slate-500">
            {isSingleDay
              ? "Vista por horas (solo un día seleccionado)."
              : "Métricas diarias y distribución por riesgo."}
          </p>
          {error ? <div className="mt-2 text-sm text-red-600">{error}</div> : null}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as Preset)}
            className="bg-white border border-slate-200 rounded-lg text-sm px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="LAST_7">Últimos 7 días</option>
            <option value="LAST_30">Últimos 30 días</option>
            <option value="YEAR">Año actual</option>
          </select>

          <button
            onClick={() => setRangeOpen(true)}
            className="p-2 bg-indigo-600 text-white rounded-lg shadow-md hover:bg-indigo-700 transition-colors"
            title="Rango desde / hasta"
          >
            <CalendarRange size={20} />
          </button>
        </div>
      </div>

      {/* Layout: gráfico + panel derecho */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 min-w-0 bg-white p-6 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-slate-800">
              {isSingleDay ? "Consultas por hora" : "Consultas diarias"}
            </h3>

            <div className="flex gap-4 flex-wrap justify-end">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-indigo-500" />
                <span className="text-[10px] font-bold text-slate-400">TOTAL</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-[10px] font-bold text-slate-400">ALTO</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-[10px] font-bold text-slate-400">MEDIO</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
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
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />

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
        <div className="lg:col-span-1 min-w-0 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Activity size={18} className="text-indigo-600" />
              Resumen de Actividad
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs font-bold uppercase text-slate-500">Consultas</div>
                <div className="mt-1 text-2xl font-extrabold text-slate-800">{summary.consultas}</div>
                <div className="mt-1 text-[11px] text-slate-500">
                  Rango: {from} → {to}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs font-bold uppercase text-slate-500">Registros añadidos</div>
                <div className="mt-1 text-2xl font-extrabold text-slate-800">{summary.registros}</div>
                <div className="mt-1 text-[11px] text-slate-500">
                  Rango: {from} → {to}
                </div>
              </div>
            </div>

            {/* Riesgo agregado útil (ALTO+MEDIO) */}
            <div className="mt-3 rounded-xl border border-slate-200 p-3">
              <div className="text-xs font-bold uppercase text-slate-500">Riesgo (alto+medio)</div>
              <div className="mt-1 text-2xl font-extrabold text-slate-800">{summary.risky}</div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Alto</div>
                  <div className="text-sm font-extrabold text-slate-800">{summary.high}</div>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Medio</div>
                  <div className="text-sm font-extrabold text-slate-800">{summary.medium}</div>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Bajo</div>
                  <div className="text-sm font-extrabold text-slate-800">{summary.low}</div>
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-2">
              <button
                onClick={() => setOpenDailyReport(true)}
                className="w-full flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 hover:bg-slate-50"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <FileText size={16} className="text-indigo-600" />
                  Informe diario (Hoy/Ayer)
                </span>
                <span className="text-xs text-slate-500">PDF / CSV</span>
              </button>

              <button
                onClick={() => setOpenWeeklyReport(true)}
                className="w-full flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 hover:bg-slate-50"
              >
                <span className="text-sm font-semibold text-slate-800">Informe semanal</span>
                <span className="text-xs text-slate-500">PDF / CSV</span>
              </button>

              <button
                onClick={() => setOpenAuditReport(true)}
                className="w-full flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 hover:bg-slate-50"
              >
                <span className="text-sm font-semibold text-slate-800">Informe de auditoría</span>
                <span className="text-xs text-slate-500">Trazabilidad</span>
              </button>

              <button
                onClick={() => setOpenAbuseReport(true)}
                className="w-full flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 hover:bg-slate-50"
              >
                <span className="text-sm font-semibold text-slate-800">Uso y abuso</span>
                <span className="text-xs text-slate-500">Alertas</span>
              </button>

              <button
                onClick={() => setOpenEconomicReport(true)}
                className="w-full flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 hover:bg-slate-50"
              >
                <span className="text-sm font-semibold text-slate-800">Impacto económico</span>
                <span className="text-xs text-slate-500">ROI</span>
              </button>
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
              onClick={() => setRangeOpen(false)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
            >
              Aplicar
            </button>
          </div>
        </div>
      </Modal>

      {/* Stubs */}
      <Modal open={openDailyReport} title="Informe diario" onClose={() => setOpenDailyReport(false)}>
        <div className="text-sm text-slate-700">Aquí irá el modal independiente de “Informe diario”.</div>
      </Modal>

      <Modal open={openWeeklyReport} title="Informe semanal" onClose={() => setOpenWeeklyReport(false)}>
        <div className="text-sm text-slate-700">Aquí irá el modal independiente de “Informe semanal”.</div>
      </Modal>

      <Modal open={openAuditReport} title="Informe de auditoría" onClose={() => setOpenAuditReport(false)}>
        <div className="text-sm text-slate-700">Aquí irá el modal independiente de auditoría.</div>
      </Modal>

      <Modal open={openAbuseReport} title="Uso y abuso" onClose={() => setOpenAbuseReport(false)}>
        <div className="text-sm text-slate-700">Aquí irá el modal de uso/abuso.</div>
      </Modal>

      <Modal open={openEconomicReport} title="Impacto económico" onClose={() => setOpenEconomicReport(false)}>
        <div className="text-sm text-slate-700">Aquí irá el modal de impacto económico.</div>
      </Modal>
    </div>
  );
};

export default StatsViewAuditor;
