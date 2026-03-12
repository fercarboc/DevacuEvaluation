import React, { useEffect, useMemo, useState } from "react";
import {
  TrendingUp,
  Users,
  Calendar,
  BarChart3,
  Building2,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

import { getRevenuePickupSummary } from "../services/revenuePickup.service";

type PickupAdvancedProps = {
  orgId: string | null;
  selectedPropertyId: string | null;
  selectedPropertyName?: string | null;
};

type PickupByArrivalRow = {
  date: string;
  rn: number;
  revenue: number;
  netRevenue: number;
  adr: number;
  leadTime: number;
  paceRevenue: number;
  paceRN: number;
};

type PickupComparisonRow = {
  date: string;
  currentRevenue: number;
  currentRN: number;
  compareRevenue: number;
  compareRN: number;
  deltaRevenue: number;
  deltaRevenuePct: number;
  deltaRN: number;
  deltaRNPct: number;
};

type PickupSummaryData = {
  property: {
    id: string;
    code?: string;
    name: string;
    roomsCount: number;
  };
  range: {
    booking_from: string;
    booking_to: string;
    compare_from: string;
    compare_to: string;
  };
  summary: {
    totalPickupRN: number;
    totalPickupRevenue: number;
    totalPickupNetRevenue: number;
    avgLeadTime: number;
    pickupADR: number;
  };
  pickupByArrival: PickupByArrivalRow[];
  pickupComparison: PickupComparisonRow[];
};

type ViewMode = "revenue" | "rn";

function formatEuro(value: number) {
  return `${value.toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}€`;
}

function formatCompactEuro(value: number) {
  return `${value.toLocaleString("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}€`;
}

function formatPct(value: number) {
  if (!Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export default function PickupAdvanced({
  orgId,
  selectedPropertyId,
  selectedPropertyName,
}: PickupAdvancedProps) {
  const [windowDays, setWindowDays] = useState<7 | 15 | 30>(7);
  const [viewMode, setViewMode] = useState<ViewMode>("revenue");

  const [data, setData] = useState<PickupSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId || !selectedPropertyId) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = (await getRevenuePickupSummary({
          orgId,
          propertyId: selectedPropertyId,
          windowDays,
        })) as PickupSummaryData;

        if (!cancelled) {
          setData(response);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? "No se pudo cargar el pickup.");
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [orgId, selectedPropertyId, windowDays]);

  const pickupRows = data?.pickupByArrival ?? [];
  const comparisonRows = data?.pickupComparison ?? [];
  const summary = data?.summary;

  const chartData = useMemo(() => {
    return pickupRows.map((row) => ({
      ...row,
      chartValue: viewMode === "revenue" ? row.revenue : row.rn,
      compareValue: viewMode === "revenue" ? row.paceRevenue : row.paceRN,
    }));
  }, [pickupRows, viewMode]);

  const headlinePropertyName =
    data?.property?.name ?? selectedPropertyName ?? "Propiedad activa";

  const rangeText =
    data?.range
      ? `Ventas captadas entre ${data.range.booking_from} y ${data.range.booking_to} · comparado contra ${data.range.compare_from} a ${data.range.compare_to}`
      : "Análisis de pickup real basado en fecha de reserva";

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Pickup Avanzado
            </h1>

            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md text-[10px] font-bold flex items-center gap-1">
              <Building2 size={10} />
              {headlinePropertyName}
            </span>
          </div>

          <p className="text-gray-500 text-sm">{rangeText}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
            {[7, 15, 30].map((d) => (
              <button
                key={d}
                onClick={() => setWindowDays(d as 7 | 15 | 30)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  windowDays === d
                    ? "bg-blue-600 text-white shadow-md"
                    : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                Últimos {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {!selectedPropertyId && (
        <div className="flex items-center gap-3 bg-amber-50 text-amber-700 p-4 rounded-2xl border border-amber-100">
          <AlertCircle size={18} />
          <span className="text-sm font-semibold">
            Selecciona una propiedad para ver el pickup.
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 bg-rose-50 text-rose-700 p-4 rounded-2xl border border-rose-100">
          <AlertCircle size={18} />
          <span className="text-sm font-semibold">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <TrendingUp size={20} />
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Pickup Revenue
            </span>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 size={16} className="animate-spin" />
              Cargando...
            </div>
          ) : (
            <>
              <p className="text-2xl font-black text-gray-900">
                {formatCompactEuro(summary?.totalPickupRevenue ?? 0)}
              </p>
              <p className="text-[10px] text-emerald-500 font-bold mt-1">
                Neto: {formatCompactEuro(summary?.totalPickupNetRevenue ?? 0)}
              </p>
            </>
          )}
        </div>

        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Users size={20} />
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Pickup RN
            </span>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 size={16} className="animate-spin" />
              Cargando...
            </div>
          ) : (
            <>
              <p className="text-2xl font-black text-gray-900">
                {(summary?.totalPickupRN ?? 0).toLocaleString("es-ES")}
              </p>
              <p className="text-[10px] text-gray-400 font-bold mt-1">
                Noches reservadas en ventana
              </p>
            </>
          )}
        </div>

        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Calendar size={20} />
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Lead Time Medio
            </span>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 size={16} className="animate-spin" />
              Cargando...
            </div>
          ) : (
            <>
              <p className="text-2xl font-black text-gray-900">
                {(summary?.avgLeadTime ?? 0).toFixed(1)}d
              </p>
              <p className="text-[10px] text-gray-400 font-bold mt-1">
                Antelación media de reserva
              </p>
            </>
          )}
        </div>

        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <BarChart3 size={20} />
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              ADR Pickup
            </span>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 size={16} className="animate-spin" />
              Cargando...
            </div>
          ) : (
            <>
              <p className="text-2xl font-black text-gray-900">
                {formatEuro(summary?.pickupADR ?? 0)}
              </p>
              <p className="text-[10px] text-gray-400 font-bold mt-1">
                Precio medio de nuevas ventas
              </p>
            </>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="text-blue-600" />
            Curva de Pickup por Fecha de Arribo
          </h3>

          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setViewMode("revenue")}
              className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${
                viewMode === "revenue"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-400"
              }`}
            >
              Revenue
            </button>

            <button
              onClick={() => setViewMode("rn")}
              className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${
                viewMode === "rn"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-400"
              }`}
            >
              RN
            </button>
          </div>
        </div>

        <div className="h-80">
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-gray-400">
              <div className="flex items-center gap-2">
                <Loader2 size={18} className="animate-spin" />
                Cargando pickup...
              </div>
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm font-medium">
              No hay datos de pickup para esta ventana.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorPickupMain" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorPickupCompare" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94A3B8" stopOpacity={0.08} />
                    <stop offset="95%" stopColor="#94A3B8" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#F1F5F9"
                />
                <XAxis
                  dataKey="date"
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
                  formatter={(value: any, name: string) => {
                    if (viewMode === "revenue") {
                      return [formatEuro(Number(value)), name];
                    }
                    return [Number(value).toLocaleString("es-ES"), name];
                  }}
                />

                <Area
                  type="monotone"
                  dataKey="compareValue"
                  stroke="#94A3B8"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorPickupCompare)"
                  name="Ventana anterior"
                />

                <Area
                  type="monotone"
                  dataKey="chartValue"
                  stroke="#3B82F6"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorPickupMain)"
                  name="Ventana actual"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-50">
          <h3 className="text-lg font-bold text-gray-900">
            Detalle de Pickup por Fecha de Arribo
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-400 font-bold uppercase tracking-widest text-[10px]">
              <tr>
                <th className="px-6 py-4">Fecha Arribo</th>
                <th className="px-4 py-4 text-right">RN Pickup</th>
                <th className="px-4 py-4 text-right">Rev. Bruto</th>
                <th className="px-4 py-4 text-right">Rev. Neto</th>
                <th className="px-4 py-4 text-right">ADR</th>
                <th className="px-4 py-4 text-right">Lead Time</th>
                <th className="px-4 py-4 text-right">Revenue comp.</th>
                <th className="px-6 py-4 text-right">Pace</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-gray-400">
                    <div className="inline-flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      Cargando detalle...
                    </div>
                  </td>
                </tr>
              ) : pickupRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-gray-400">
                    No hay datos de pickup para la propiedad seleccionada.
                  </td>
                </tr>
              ) : (
                pickupRows.map((row, i) => {
                  const revenuePct =
                    row.paceRevenue > 0
                      ? ((row.revenue - row.paceRevenue) / row.paceRevenue) * 100
                      : null;

                  const isPositive = revenuePct !== null && revenuePct >= 0;

                  return (
                    <tr key={`${row.date}-${i}`} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-gray-900">{row.date}</td>
                      <td className="px-4 py-4 text-right font-medium text-gray-600">
                        {row.rn.toLocaleString("es-ES")}
                      </td>
                      <td className="px-4 py-4 text-right font-bold text-gray-900">
                        {formatEuro(row.revenue)}
                      </td>
                      <td className="px-4 py-4 text-right font-bold text-emerald-600">
                        {formatEuro(row.netRevenue)}
                      </td>
                      <td className="px-4 py-4 text-right font-medium text-gray-600">
                        {formatEuro(row.adr)}
                      </td>
                      <td className="px-4 py-4 text-right font-medium text-gray-400">
                        {row.leadTime.toFixed(1)}d
                      </td>
                      <td className="px-4 py-4 text-right font-medium text-gray-500">
                        {row.paceRevenue > 0 ? formatEuro(row.paceRevenue) : "—"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {revenuePct === null ? (
                          <span className="font-bold text-gray-300">—</span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 font-bold ${
                              isPositive ? "text-emerald-500" : "text-rose-500"
                            }`}
                          >
                            {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                            {formatPct(revenuePct)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-50">
          <h3 className="text-lg font-bold text-gray-900">
            Comparativa Pickup vs Ventana Anterior
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-400 font-bold uppercase tracking-widest text-[10px]">
              <tr>
                <th className="px-6 py-4">Fecha Arribo</th>
                <th className="px-4 py-4 text-right">Rev. actual</th>
                <th className="px-4 py-4 text-right">Rev. comp.</th>
                <th className="px-4 py-4 text-right">Δ Revenue</th>
                <th className="px-4 py-4 text-right">RN actual</th>
                <th className="px-4 py-4 text-right">RN comp.</th>
                <th className="px-6 py-4 text-right">Δ RN</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-gray-400">
                    <div className="inline-flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      Cargando comparación...
                    </div>
                  </td>
                </tr>
              ) : comparisonRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-gray-400">
                    No hay comparativa disponible.
                  </td>
                </tr>
              ) : (
                comparisonRows.map((row, i) => (
                  <tr key={`${row.date}-${i}`} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-gray-900">{row.date}</td>
                    <td className="px-4 py-4 text-right font-bold text-gray-900">
                      {formatEuro(row.currentRevenue)}
                    </td>
                    <td className="px-4 py-4 text-right text-gray-500">
                      {formatEuro(row.compareRevenue)}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span
                        className={`font-bold ${
                          row.deltaRevenuePct >= 0 ? "text-emerald-500" : "text-rose-500"
                        }`}
                      >
                        {formatPct(row.deltaRevenuePct)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right font-medium text-gray-700">
                      {row.currentRN.toLocaleString("es-ES")}
                    </td>
                    <td className="px-4 py-4 text-right text-gray-500">
                      {row.compareRN.toLocaleString("es-ES")}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span
                        className={`font-bold ${
                          row.deltaRNPct >= 0 ? "text-emerald-500" : "text-rose-500"
                        }`}
                      >
                        {formatPct(row.deltaRNPct)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}