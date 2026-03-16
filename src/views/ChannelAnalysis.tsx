import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  customerRevenueChannelsGet,
  type RevenueChannelRow,
  type PeriodField,
} from "@/services/revenueService";

const COLORS = {
  primary: "#0f172a", // slate-900
  danger: "#dc2626", // red-600
};

function isoDate(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function currentMonthRange() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { from: isoDate(from), to: isoDate(now) };
}

function lastNDaysRange(n: number) {
  const to = new Date();
  const from = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  return { from: isoDate(from), to: isoDate(to) };
}

function money(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("es-ES", { maximumFractionDigits: 0 });
}

function pct(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return Math.round(Math.max(0, Math.min(100, v)));
}

function labelRow(r: RevenueChannelRow) {
  const cg = (r.channel_group ?? "").toUpperCase();
  const pk = (r.platform_key ?? "").toUpperCase();
  return `${cg} / ${pk.replace(/_/g, " ")}`;
}

// label compacto para eje Y (sin reventar ancho)
function compactLabel(s: string) {
  const t = (s ?? "").trim();
  if (t.length <= 18) return t;
  return t.slice(0, 18) + "…";
}

const ChannelAnalysis: React.FC = () => {
  // ✅ draft (no dispara carga)
  const defaultRange = useMemo(() => currentMonthRange(), []);
  const [draftFrom, setDraftFrom] = useState(defaultRange.from);
  const [draftTo, setDraftTo] = useState(defaultRange.to);
  const [draftField, setDraftField] = useState<PeriodField>("evaluation_date");

  // ✅ applied (dispara carga)
  const [periodFrom, setPeriodFrom] = useState(defaultRange.from);
  const [periodTo, setPeriodTo] = useState(defaultRange.to);
  const [periodField, setPeriodField] = useState<PeriodField>("evaluation_date");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<RevenueChannelRow[]>([]);

  const applyFilters = () => {
    setPeriodFrom(draftFrom);
    setPeriodTo(draftTo);
    setPeriodField(draftField);
  };

  const setCurrentMonth = () => {
    const r = currentMonthRange();
    setDraftFrom(r.from);
    setDraftTo(r.to);
  };

  const setLast30 = () => {
    const r = lastNDaysRange(30);
    setDraftFrom(r.from);
    setDraftTo(r.to);
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setError(null);
        setLoading(true);

        const resp = await customerRevenueChannelsGet({
          period_from: periodFrom,
          period_to: periodTo,
          period_field: periodField,
        });

        if (cancelled) return;
        setRows(resp.rows ?? []);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "Error cargando datos");
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [periodFrom, periodTo, periodField]);

  const chartData = useMemo(() => {
    return (rows ?? []).map((r) => {
      const full = labelRow(r);
      return {
        key: `${r.channel_group}-${r.platform_key}`,
        channel: compactLabel(full),
        channelFull: full,
        incidents: Number(r.total_records ?? 0),
      };
    });
  }, [rows]);

  const insight = useMemo(() => {
    if (!rows?.length) return null;
    const top = [...rows].sort((a, b) => (b.net_total ?? 0) - (a.net_total ?? 0))[0];
    if (!top) return null;

    const topShare = pct((Number(top.pct_net_share ?? 0) || 0) * 100);

    const totalInc = rows.reduce((acc, r) => acc + Number(r.total_records ?? 0), 0);
    const topInc = Number(top.total_records ?? 0);
    const topIncPct = totalInc > 0 ? pct((topInc / totalInc) * 100) : 0;

    return { label: labelRow(top), netSharePct: topShare, incidentsPct: topIncPct };
  }, [rows]);

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <header className="space-y-2">
  {/* ✅ HEADER: título izquierda, filtros derecha */}
  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
    {/* title/desc */}
    <div className="space-y-2">
      <h1 className="text-2xl font-bold text-gray-900">Análisis por Canal</h1>
      <p className="text-gray-500">Identifica cómo se reparte el riesgo.</p>
    </div>

    {/* filtros (derecha) */}
    <div className="flex flex-col items-start lg:items-end gap-2">
      <div className="flex gap-3 flex-wrap justify-start lg:justify-end items-end">
        <div className="flex flex-col">
          <label className="text-xs font-medium text-gray-600 mb-1">Desde</label>
          <input
            type="date"
            value={draftFrom}
            onChange={(e) => setDraftFrom(e.target.value)}
            className="h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white text-gray-900"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs font-medium text-gray-600 mb-1">Hasta</label>
          <input
            type="date"
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
            className="h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white text-gray-900"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs font-medium text-gray-600 mb-1">Campo de periodo</label>
          <select
            value={draftField}
            onChange={(e) => setDraftField(e.target.value as PeriodField)}
            className="h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white text-gray-900"
          >
            <option value="evaluation_date">evaluation_date</option>
            <option value="created_at">created_at</option>
          </select>
        </div>

        <button
          type="button"
          onClick={setCurrentMonth}
          className="h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white hover:bg-gray-50 text-gray-900"
        >
          Mes actual
        </button>

        <button
          type="button"
          onClick={setLast30}
          className="h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white hover:bg-gray-50 text-gray-900"
        >
          Últimos 30 días
        </button>

        <button
          type="button"
          onClick={applyFilters}
          className="h-10 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
        >
          Aplicar
        </button>
      </div>

      <div className="text-sm text-gray-500">
        {loading ? "Cargando…" : error ? "Error" : ``}
      </div>
    </div>
  </div>

  {error && (
    <div className="mt-3 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">
      {error}
    </div>
  )}
</header>


      {/* ✅ grid: tabla más grande */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* CHART: ocupa 2/5 */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm lg:col-span-2">
          <h3 className="text-lg font-semibold mb-1">Comparativa de Incidencias por Canal/Plataforma</h3>

          <p className="text-[11px] text-gray-500 mb-3 leading-snug">
            Incidencias = nº de evaluaciones registradas con impacto económico en el periodo seleccionado.
          </p>

          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ left: 8, right: 8, top: 0, bottom: 0 }}
                barCategoryGap={10}
                barGap={2}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="channel"
                  type="category"
                  stroke="#64748b"
                  fontSize={11}
                  width={92}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: "#f8fafc" }}
                  contentStyle={{ borderRadius: "8px", backgroundColor: "#fff", border: "1px solid #e2e8f0", color: "#1e293b" }}
                  formatter={(value: any, name: any) => {
                    if (name === "Inc. Totales") return [`${value}`, name];
                    return [value, name];
                  }}
                  labelFormatter={(label: any, payload: any) => {
                    const p = Array.isArray(payload) && payload[0]?.payload ? payload[0].payload : null;
                    return p?.channelFull ?? label;
                  }}
                />
                <Bar dataKey="incidents" name="Inc. Totales" radius={[0, 4, 4, 0]} barSize={22}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.incidents > 3 ? COLORS.danger : COLORS.primary}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {insight && !loading && !error && (
            <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-100">
              <p className="text-sm text-slate-800">
                <span className="font-semibold">Insight:</span> {insight.label} concentra{" "}
                <span className="font-semibold">{insight.netSharePct}%</span> del net loss del periodo y{" "}
                <span className="font-semibold">{insight.incidentsPct}%</span> de las incidencias.
              </p>
            </div>
          )}
        </div>

        {/* TABLE: ocupa 3/5 */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm overflow-hidden lg:col-span-3">
          <h3 className="text-lg font-semibold mb-6">Métricas Detalladas</h3>

          <div className="w-full overflow-hidden">
            <table className="w-full table-fixed text-left text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="pb-3 px-3 font-semibold text-gray-600 w-[40%]">Canal</th>
                  <th className="pb-3 px-3 font-semibold text-gray-600 text-right w-[12%]">Inc.</th>
                  <th className="pb-3 px-3 font-semibold text-gray-600 text-right w-[16%]">Bruto €</th>
                  <th className="pb-3 px-3 font-semibold text-gray-600 text-right w-[16%]">Recup. €</th>
                  <th className="pb-3 px-3 font-semibold text-gray-600 text-right w-[16%]">Net €</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {(rows ?? []).map((r) => {
                  const incidents = Number(r.total_records ?? 0);
                  const gross = Number(r.gross_total ?? 0);
                  const recovered = Number(r.recovered_total ?? 0);
                  const net = Number(r.net_total ?? 0);

                  return (
                    <tr
                      key={`${r.channel_group}-${r.platform_key}`}
                      className="hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="py-3 px-3 font-medium text-gray-800 truncate">{labelRow(r)}</td>

                      <td className="py-3 px-3 text-right text-gray-700 tabular-nums">{incidents}</td>

                      <td className="py-3 px-3 text-right text-gray-700 tabular-nums">{money(gross)}</td>

                      <td className="py-3 px-3 text-right text-gray-700 tabular-nums">{money(recovered)}</td>

                      <td className="py-3 px-3 text-right">
                        <span
                          className={`inline-flex items-center justify-end px-2 py-1 rounded-md text-[11px] font-bold tabular-nums ${
                            net > 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {money(net)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 text-[11px] text-gray-500">
            Riesgo alto = rating 1–2, medio = 3, bajo = 4–5. Net loss = economic_net_loss o (gross − recovered).
          </div>

          {!loading && !error && (rows?.length ?? 0) === 0 && (
            <div className="mt-4 p-4 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-600">
              No hay datos en el periodo seleccionado.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChannelAnalysis;
