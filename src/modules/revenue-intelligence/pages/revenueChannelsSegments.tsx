import React, { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
 XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Calendar,
  TrendingUp,
  Users,
  PieChart as PieIcon,
  BarChart3,
  Table as TableIcon,
  Download,
  Building2,
  Info,
  Grid3X3,
} from "lucide-react";

import { useRevenueChannelsSegments } from "../hooks/useRevenueChannelsSegments";

const COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#6366F1",
];

type RevenueChannelsSegmentsProps = {
  orgId: string | null;
  selectedPropertyId: string | null;
  properties: Array<{
    id: string;
    name: string;
  }>;
};

type ViewMode = "channel" | "segment" | "cross";

function formatMoney(value: number) {
  return `${value.toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}€`;
}

const RevenueChannelsSegments: React.FC<RevenueChannelsSegmentsProps> = ({
  orgId,
  selectedPropertyId,
  properties,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>("channel");

  const [dateRange, setDateRange] = useState({
    from: "2025-01-01",
    to: "2026-12-31",
  });

  const activeProperty =
    properties.find((p) => p.id === selectedPropertyId) ?? null;

  const isInvalidRange = dateRange.from > dateRange.to;

  const { summary, rows, loading, error } = useRevenueChannelsSegments({
    orgId,
    propertyId: selectedPropertyId,
    from: dateRange.from,
    to: dateRange.to,
    mode: viewMode,
    enabled: Boolean(selectedPropertyId) && !isInvalidRange,
  });

  const chartData = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        name:
          viewMode === "cross"
            ? `${row.channel ?? "-"} · ${row.segment ?? "-"}`
            : row.label,
      })),
    [rows, viewMode]
  );

  const pieData = useMemo(() => {
    if (viewMode === "cross") {
      return chartData.slice(0, 8);
    }
    return chartData;
  }, [chartData, viewMode]);

  const titleByMode = {
    channel: "Revenue por Canal",
    segment: "Revenue por Segmento",
    cross: "Revenue por Cruce Canal / Segmento",
  };

  const shareTitleByMode = {
    channel: "Share de Revenue por Canal",
    segment: "Share de Revenue por Segmento",
    cross: "Share de Revenue por Cruce",
  };

  const tableTitleByMode = {
    channel: "Resumen por Canal",
    segment: "Resumen por Segmento",
    cross: "Resumen Canal / Segmento",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Canales & Segmentos
            </h1>

            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md text-[10px] font-bold flex items-center gap-1">
              <Building2 size={10} />
              {activeProperty?.name ?? "Sin propiedad"}
            </span>
          </div>

          <p className="text-gray-500 text-sm">
            Producción comercial por canal, segmento y cruce con rango de fechas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode("channel")}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === "channel"
                  ? "bg-blue-600 text-white shadow-md"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              Canal
            </button>

            <button
              type="button"
              onClick={() => setViewMode("segment")}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === "segment"
                  ? "bg-blue-600 text-white shadow-md"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              Segmento
            </button>

            <button
              type="button"
              onClick={() => setViewMode("cross")}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === "cross"
                  ? "bg-blue-600 text-white shadow-md"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              Cruce
            </button>

            <button
              disabled
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-gray-300 cursor-not-allowed"
              title="Pendiente de modelo de cancelaciones"
            >
              Cancelaciones
            </button>
          </div>

          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-gray-200 shadow-sm">
            <Calendar size={16} className="text-gray-400" />

            <input
              type="date"
              className="text-xs font-bold outline-none bg-transparent"
              value={dateRange.from}
              onChange={(e) =>
                setDateRange((prev) => ({ ...prev, from: e.target.value }))
              }
            />

            <span className="text-gray-300">—</span>

            <input
              type="date"
              className="text-xs font-bold outline-none bg-transparent"
              value={dateRange.to}
              onChange={(e) =>
                setDateRange((prev) => ({ ...prev, to: e.target.value }))
              }
            />
          </div>

          <button
            type="button"
            className="p-2.5 bg-white border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 transition-colors shadow-sm"
            title="Exportación pendiente"
          >
            <Download size={18} />
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 flex items-start gap-3">
        <Info size={16} className="text-blue-600 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-800">
          Esta pantalla usa Edge Function y ya soporta rango de fechas por
          propiedad. Canal y Segmento salen del modelo actual; Cancelaciones queda
          pendiente hasta que exista ese dato en origen.
        </div>
      </div>

      {isInvalidRange && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 text-sm text-amber-700">
          El rango de fechas no es válido: la fecha inicial no puede ser mayor que
          la fecha final.
        </div>
      )}

      {error && !isInvalidRange && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <TrendingUp size={20} />
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Revenue Total
            </span>
          </div>

          <p className="text-2xl font-black text-gray-900">
            {formatMoney(summary.totalRevenue)}
          </p>
        </div>

        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Users size={20} />
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Sales
            </span>
          </div>

          <p className="text-2xl font-black text-gray-900">
            {summary.totalSales}
          </p>
        </div>

        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <BarChart3 size={20} />
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              ADR
            </span>
          </div>

          <p className="text-2xl font-black text-gray-900">
            {formatMoney(summary.adr)}
          </p>
        </div>

        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <PieIcon size={20} />
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Top {viewMode === "channel" ? "Canal" : viewMode === "segment" ? "Segmento" : "Cruce"}
            </span>
          </div>

          <p className="text-2xl font-black text-gray-900">
            {summary.topLabel ?? "-"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="text-blue-600" />
              {titleByMode[viewMode]}
            </h3>
          </div>

          <div className="h-80">
            {loading ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                Cargando...
              </div>
            ) : chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                No hay datos para el rango seleccionado
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#F1F5F9"
                  />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fontWeight: 700 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fontWeight: 700 }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "16px",
                      border: "none",
                      boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                    }}
                    formatter={(value: number | string, key: string) => {
                      if (key === "share") return `${Number(value).toFixed(1)}%`;
                      return formatMoney(Number(value));
                    }}
                  />
                  <Bar
                    dataKey="totalRevenue"
                    name="Revenue"
                    fill="#3B82F6"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <PieIcon className="text-blue-600" />
              {shareTitleByMode[viewMode]}
            </h3>
          </div>

          <div className="h-80">
            {loading ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                Cargando...
              </div>
            ) : pieData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                No hay datos para el rango seleccionado
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="share"
                    nameKey="name"
                  >
                    {pieData.map((entry, index) => (
                      <Cell
                        key={`cell-${entry.name}-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>

                  <Tooltip
                    contentStyle={{
                      borderRadius: "16px",
                      border: "none",
                      boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                    }}
                    formatter={(value: number | string) =>
                      `${Number(value).toFixed(1)}%`
                    }
                  />

                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    wrapperStyle={{ fontSize: "10px", fontWeight: 700 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-50 flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <TableIcon className="text-blue-600" />
              {tableTitleByMode[viewMode]}
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-400 font-bold uppercase tracking-widest text-[10px]">
                <tr>
                  <th className="px-6 py-4">
                    {viewMode === "channel"
                      ? "Canal"
                      : viewMode === "segment"
                      ? "Segmento"
                      : "Cruce"}
                  </th>
                  <th className="px-4 py-4 text-right">Sales</th>
                  <th className="px-4 py-4 text-right">Revenue</th>
                  <th className="px-4 py-4 text-right">ADR</th>
                  <th className="px-6 py-4 text-right">Share</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {!loading &&
                  chartData.map((row, i) => (
                    <tr
                      key={`${row.name}-${i}`}
                      className="hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{
                              backgroundColor: COLORS[i % COLORS.length],
                            }}
                          />
                          <span className="font-bold text-gray-900">
                            {row.name}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-4 text-right font-medium text-gray-600">
                        {row.totalSales}
                      </td>

                      <td className="px-4 py-4 text-right font-bold text-gray-900">
                        {formatMoney(row.totalRevenue)}
                      </td>

                      <td className="px-4 py-4 text-right font-bold text-blue-600">
                        {formatMoney(row.adr)}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500"
                              style={{ width: `${Math.min(row.share, 100)}%` }}
                            />
                          </div>
                          <span className="font-bold text-gray-900 w-12">
                            {row.share.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}

                {!loading && chartData.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-10 text-center text-gray-400"
                    >
                      No hay datos para el rango seleccionado
                    </td>
                  </tr>
                )}

                {loading && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-10 text-center text-gray-400"
                    >
                      Cargando...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {viewMode === "cross" && (
          <div className="lg:col-span-2 bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Grid3X3 className="text-blue-600" />
              <h3 className="text-lg font-bold text-gray-900">
                Nota sobre cruce
              </h3>
            </div>

            <p className="text-sm text-gray-600">
              El cruce canal / segmento sale del mismo origen de revenue daily.
              Si más adelante queréis comisiones, revenue neto o cancelaciones,
              eso ya requiere ampliar el modelo de datos y la Edge Function.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RevenueChannelsSegments;