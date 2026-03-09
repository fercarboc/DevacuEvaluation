import React, { useMemo, useState } from "react";
import {
  Download,
  X,
  FileDown,
  TrendingUp,
  Calendar,
  ArrowRight,
  Building2,
  BarChart3,
  Hotel,
  Euro,
} from "lucide-react";

import { useRevenueMonthlySummary } from "../hooks/useRevenueMonthlySummary";
import { useRevenueDayByDaySummary } from "../hooks/useRevenueDayByDaySummary";

type RevenuePropertyLite = {
  id: string;
  name: string;
  roomsCount: number;
};

type MonthlyComparisonProps = {
  orgId: string | null;
  selectedPropertyId: string | null;
  properties?: RevenuePropertyLite[];
};

type QuickFilter =
  | "Año actual"
  | "Año anterior"
  | "Últimos 12 meses"
  | "Personalizado";

function formatMoney(value: number) {
  return `${value.toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}€`;
}

function formatDeltaPct(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatDeltaAbs(value: number, isMoney = false) {
  const sign = value > 0 ? "+" : "";
  if (isMoney) {
    return `${sign}${value.toLocaleString("es-ES", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}€`;
  }
  return `${sign}${value.toFixed(1)}`;
}

function deltaClass(value: number) {
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-rose-600";
  return "text-gray-500";
}

function toISODate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftYearRange(from: string, to: string, targetYear: number) {
  const fromMonthDay = from.slice(4);
  const toMonthDay = to.slice(4);

  return {
    from: `${targetYear}${fromMonthDay}`,
    to: `${targetYear}${toMonthDay}`,
  };
}

function getCurrentYearRange() {
  const now = new Date();
  const year = now.getFullYear();

  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  };
}

function getPreviousYearRange() {
  const now = new Date();
  const year = now.getFullYear() - 1;

  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  };
}

function getYearRange(year: number) {
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  };
}

function getLast12MonthsRange() {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  return {
    from: toISODate(from),
    to: toISODate(to),
  };
}

function getMonthRange(month: string) {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;

  const from = `${yearStr}-${monthStr}-01`;
  const endDate = new Date(year, monthIndex + 1, 0);
  const to = `${yearStr}-${monthStr}-${String(endDate.getDate()).padStart(2, "0")}`;

  return { from, to };
}

function getYearFromDate(value: string) {
  return Number(value.slice(0, 4));
}

const MonthlyComparison: React.FC<MonthlyComparisonProps> = ({
  orgId,
  selectedPropertyId,
  properties = [],
}) => {
  const currentYear = new Date().getFullYear();

  const [quickFilter, setQuickFilter] = useState<QuickFilter>("Año actual");
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [compareYear, setCompareYear] = useState<number>(currentYear - 1);

  const initialRange = getCurrentYearRange();
  const [startDate, setStartDate] = useState<string>(initialRange.from);
  const [endDate, setEndDate] = useState<string>(initialRange.to);

  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const activeProperty =
    properties.find((p) => p.id === selectedPropertyId) ?? null;

  const isInvalidRange = !!startDate && !!endDate && startDate > endDate;

  const compareRange = useMemo(() => {
    if (!startDate || !endDate) {
      return { from: "", to: "" };
    }
    return shiftYearRange(startDate, endDate, compareYear);
  }, [startDate, endDate, compareYear]);

  const {
    property,
    totals,
    months,
    compareTotals,
    compareMonths,
    comparisonRows,
    loading,
    error,
  } = useRevenueMonthlySummary({
    orgId,
    propertyId: selectedPropertyId,
    from: startDate,
    to: endDate,
    compareFrom: compareRange.from,
    compareTo: compareRange.to,
  });

  const selectedMonthRange = useMemo(() => {
    return selectedMonth ? getMonthRange(selectedMonth) : null;
  }, [selectedMonth]);

  const {
    daily: drillDownData,
    totals: drillDownTotals,
    loading: drillDownLoading,
    error: drillDownError,
  } = useRevenueDayByDaySummary({
    orgId,
    propertyId: selectedPropertyId,
    from: selectedMonthRange?.from ?? "",
    to: selectedMonthRange?.to ?? "",
  });

  const headerPropertyName =
    property?.name ?? activeProperty?.name ?? "Sin propiedad";

  const availableYears = useMemo(() => {
    const start = 2025;
    const end = currentYear + 1;
    const years: number[] = [];

    for (let year = end; year >= start; year -= 1) {
      years.push(year);
    }

    return years;
  }, [currentYear]);

  const selectedMonthLabel = useMemo(() => {
    if (!selectedMonth) return "";
    return selectedMonth;
  }, [selectedMonth]);

  function applyQuickFilter(next: QuickFilter) {
    setQuickFilter(next);

    if (next === "Año actual") {
      const range = getCurrentYearRange();
      setSelectedYear(getYearFromDate(range.from));
      setStartDate(range.from);
      setEndDate(range.to);
      setSelectedMonth(null);
      return;
    }

    if (next === "Año anterior") {
      const range = getPreviousYearRange();
      setSelectedYear(getYearFromDate(range.from));
      setStartDate(range.from);
      setEndDate(range.to);
      setSelectedMonth(null);
      return;
    }

    if (next === "Últimos 12 meses") {
      const range = getLast12MonthsRange();
      setStartDate(range.from);
      setEndDate(range.to);
      setSelectedMonth(null);
      return;
    }
  }

  function handleYearChange(year: number) {
    setSelectedYear(year);
    setQuickFilter("Personalizado");
    const range = getYearRange(year);
    setStartDate(range.from);
    setEndDate(range.to);
    setSelectedMonth(null);
  }

  const handleExportCSV = () => {
    if (!selectedMonth || drillDownData.length === 0) return;

    const headers = [
      "Fecha",
      "OCC%",
      "Rooms Sold",
      "ADR",
      "Revenue",
      "RevPAR",
      "PVP",
    ];

    const rows = drillDownData.map((d) => [
      d.date,
      d.occ.toFixed(1),
      String(d.roomsSold),
      d.adr.toFixed(2),
      d.revenue.toFixed(2),
      d.revpar.toFixed(2),
      d.pvp.toFixed(2),
    ]);

    const csvContent = [headers, ...rows].map((e) => e.join(",")).join("\n");
    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", `detalle_${selectedMonth}.csv`);
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!selectedPropertyId) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 text-gray-500">
          Selecciona una propiedad para ver la comparativa mensual.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">
              Comparación Mensual
            </h1>

            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md text-[10px] font-bold flex items-center gap-1">
              <Building2 size={10} />
              {headerPropertyName}
            </span>
          </div>

          <p className="text-gray-500">
            Resumen ejecutivo mensual de producción y comparativa YoY
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="p-2.5 bg-white border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 transition-colors shadow-sm"
            title="Exportación pendiente"
          >
            <Download size={20} />
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Rápido:
            </div>

            <div className="flex bg-gray-100 p-1 rounded-xl flex-wrap">
              {[
                "Año actual",
                "Año anterior",
                "Últimos 12 meses",
                "Personalizado",
              ].map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => applyQuickFilter(filter as QuickFilter)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                    quickFilter === filter
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Año
              </span>
              <select
                value={selectedYear}
                onChange={(e) => handleYearChange(Number(e.target.value))}
                className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Comparar
              </span>
              <select
                value={compareYear}
                onChange={(e) => setCompareYear(Number(e.target.value))}
                className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setQuickFilter("Personalizado");
                  setStartDate(e.target.value);
                  setSelectedMonth(null);
                }}
                className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-gray-400 text-xs">→</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setQuickFilter("Personalizado");
                  setEndDate(e.target.value);
                  setSelectedMonth(null);
                }}
                className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="bg-blue-50 px-3 py-2 rounded-xl border border-blue-100 inline-flex items-center gap-2">
          <Calendar size={14} className="text-blue-600" />
          <span className="text-[11px] font-bold text-blue-700">
            Rango: {startDate} → {endDate} · Comparando contra {compareRange.from} → {compareRange.to}
          </span>
        </div>
      </div>

      {isInvalidRange && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 text-sm text-amber-700">
          El rango de fechas no es válido.
        </div>
      )}

      {error && !isInvalidRange && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!isInvalidRange && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <Euro size={20} />
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Revenue Total
              </span>
            </div>
            <p className="text-2xl font-black text-gray-900">
              {formatMoney(totals.revenue)}
            </p>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                <TrendingUp size={20} />
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                ADR Medio
              </span>
            </div>
            <p className="text-2xl font-black text-gray-900">
              {formatMoney(totals.adr)}
            </p>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                <BarChart3 size={20} />
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                RevPAR Medio
              </span>
            </div>
            <p className="text-2xl font-black text-gray-900">
              {formatMoney(totals.revpar)}
            </p>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                <Hotel size={20} />
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                OCC Media
              </span>
            </div>
            <p className="text-2xl font-black text-gray-900">
              {totals.occ.toFixed(1)}%
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-8 py-5">Mes</th>
                <th className="px-6 py-5 text-right">OCC %</th>
                <th className="px-6 py-5 text-right">RN</th>
                <th className="px-6 py-5 text-right">ADR</th>
                <th className="px-6 py-5 text-right">Revenue</th>
                <th className="px-6 py-5 text-right">RevPAR</th>
                <th className="px-6 py-5 text-right">Acciones</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-8 py-10 text-center text-gray-400">
                    Cargando...
                  </td>
                </tr>
              )}

              {!loading &&
                months.map((row, idx) => (
                  <tr
                    key={`${row.month}-${idx}`}
                    className={`hover:bg-blue-50/30 transition-colors group cursor-pointer ${
                      selectedMonth === row.month ? "bg-blue-50/50" : ""
                    }`}
                    onClick={() =>
                      setSelectedMonth(selectedMonth === row.month ? null : row.month)
                    }
                  >
                    <td className="px-8 py-5 font-bold text-gray-900 flex items-center gap-3">
                      <Calendar size={18} className="text-gray-400" />
                      {row.month}
                    </td>

                    <td className="px-6 py-5 text-right font-mono font-semibold text-gray-600">
                      {row.occ.toFixed(1)}%
                    </td>

                    <td className="px-6 py-5 text-right font-medium">
                      {row.rn}
                    </td>

                    <td className="px-6 py-5 text-right font-semibold text-gray-700">
                      {formatMoney(row.adr)}
                    </td>

                    <td className="px-6 py-5 text-right font-bold text-gray-900">
                      {formatMoney(row.revenue)}
                    </td>

                    <td className="px-6 py-5 text-right text-gray-500">
                      {formatMoney(row.revpar)}
                    </td>

                    <td className="px-8 py-5 text-right">
                      <button
                        type="button"
                        className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <ArrowRight size={18} />
                      </button>
                    </td>
                  </tr>
                ))}

              {!loading && months.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-8 py-10 text-center text-gray-400">
                    Sin datos mensuales para esta propiedad
                  </td>
                </tr>
              )}
            </tbody>

            {!loading && months.length > 0 && (
              <tfoot className="bg-gray-900 text-white font-bold">
                <tr>
                  <th className="px-8 py-4">TOTALES / MEDIAS</th>
                  <td className="px-6 py-4 text-right text-blue-400">
                    {totals.occ.toFixed(1)}%
                  </td>
                  <td className="px-6 py-4 text-right">{totals.rn}</td>
                  <td className="px-6 py-4 text-right">{formatMoney(totals.adr)}</td>
                  <td className="px-6 py-4 text-right text-emerald-400">
                    {formatMoney(totals.revenue)}
                  </td>
                  <td className="px-6 py-4 text-right opacity-70">
                    {formatMoney(totals.revpar)}
                  </td>
                  <td className="px-8 py-4"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">
            Comparativa mes a mes vs {compareYear}
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-6 py-4">Mes</th>
                <th className="px-4 py-4 text-right">Revenue actual</th>
                <th className="px-4 py-4 text-right">Revenue comp.</th>
                <th className="px-4 py-4 text-right">Δ Revenue</th>
                <th className="px-4 py-4 text-right">Δ Revenue %</th>
                <th className="px-4 py-4 text-right">ADR actual</th>
                <th className="px-4 py-4 text-right">ADR comp.</th>
                <th className="px-4 py-4 text-right">Δ ADR %</th>
                <th className="px-4 py-4 text-right">RevPAR actual</th>
                <th className="px-4 py-4 text-right">RevPAR comp.</th>
                <th className="px-4 py-4 text-right">Δ RevPAR %</th>
                <th className="px-4 py-4 text-right">OCC actual</th>
                <th className="px-4 py-4 text-right">OCC comp.</th>
                <th className="px-4 py-4 text-right">Δ OCC pts</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan={14} className="px-6 py-10 text-center text-gray-400">
                    Cargando comparativa...
                  </td>
                </tr>
              )}

              {!loading &&
                comparisonRows.map((row) => (
                  <tr key={row.monthKey} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-bold text-gray-900">{row.label}</td>

                    <td className="px-4 py-4 text-right font-bold text-gray-900">
                      {formatMoney(row.current.revenue)}
                    </td>
                    <td className="px-4 py-4 text-right text-gray-500">
                      {formatMoney(row.compare.revenue)}
                    </td>
                    <td className={`px-4 py-4 text-right font-bold ${deltaClass(row.delta.revenueAbs)}`}>
                      {formatDeltaAbs(row.delta.revenueAbs, true)}
                    </td>
                    <td className={`px-4 py-4 text-right font-bold ${deltaClass(row.delta.revenuePct)}`}>
                      {formatDeltaPct(row.delta.revenuePct)}
                    </td>

                    <td className="px-4 py-4 text-right font-semibold text-gray-900">
                      {formatMoney(row.current.adr)}
                    </td>
                    <td className="px-4 py-4 text-right text-gray-500">
                      {formatMoney(row.compare.adr)}
                    </td>
                    <td className={`px-4 py-4 text-right font-bold ${deltaClass(row.delta.adrPct)}`}>
                      {formatDeltaPct(row.delta.adrPct)}
                    </td>

                    <td className="px-4 py-4 text-right font-semibold text-gray-900">
                      {formatMoney(row.current.revpar)}
                    </td>
                    <td className="px-4 py-4 text-right text-gray-500">
                      {formatMoney(row.compare.revpar)}
                    </td>
                    <td className={`px-4 py-4 text-right font-bold ${deltaClass(row.delta.revparPct)}`}>
                      {formatDeltaPct(row.delta.revparPct)}
                    </td>

                    <td className="px-4 py-4 text-right font-semibold text-gray-900">
                      {row.current.occ.toFixed(1)}%
                    </td>
                    <td className="px-4 py-4 text-right text-gray-500">
                      {row.compare.occ.toFixed(1)}%
                    </td>
                    <td className={`px-4 py-4 text-right font-bold ${deltaClass(row.delta.occAbs)}`}>
                      {formatDeltaAbs(row.delta.occAbs)}
                    </td>
                  </tr>
                ))}

              {!loading && comparisonRows.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-6 py-10 text-center text-gray-400">
                    Sin datos comparativos para el rango seleccionado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedMonth && (
        <div className="animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-white rounded-3xl shadow-xl border border-blue-100 overflow-hidden">
            <div className="p-6 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-blue-600 p-2 rounded-xl text-white">
                  <TrendingUp size={20} />
                </div>

                <div>
                  <h3 className="font-bold text-gray-900">
                    Detalle Diario: {selectedMonthLabel}
                  </h3>
                  <p className="text-xs text-blue-600 font-bold uppercase tracking-wider">
                    Drill-down mensual
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-blue-200 text-blue-600 rounded-xl text-xs font-bold hover:bg-blue-50 transition-colors"
                >
                  <FileDown size={16} />
                  Exportar CSV
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedMonth(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-full transition-all"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {drillDownError && (
              <div className="px-6 pt-6">
                <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-sm text-red-700">
                  {drillDownError}
                </div>
              </div>
            )}

            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-gray-50 text-gray-400 font-bold uppercase tracking-wider text-[9px] sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-6 py-3 border-b border-gray-100">Fecha</th>
                    <th className="px-4 py-3 text-right border-b border-gray-100">
                      OCC %
                    </th>
                    <th className="px-4 py-3 text-right border-b border-gray-100">
                      RN
                    </th>
                    <th className="px-4 py-3 text-right border-b border-gray-100">
                      ADR
                    </th>
                    <th className="px-4 py-3 text-right border-b border-gray-100">
                      Revenue
                    </th>
                    <th className="px-4 py-3 text-right border-b border-gray-100">
                      RevPAR
                    </th>
                    <th className="px-6 py-3 text-right border-b border-gray-100">
                      PVP
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-50">
                  {drillDownLoading && (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-center text-gray-400">
                        Cargando...
                      </td>
                    </tr>
                  )}

                  {!drillDownLoading &&
                    drillDownData.map((d, i) => (
                      <tr key={`${d.date}-${i}`} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-2.5 font-bold text-gray-700">
                          {d.date}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono">
                          {d.occ.toFixed(1)}%
                        </td>
                        <td className="px-4 py-2.5 text-right">{d.roomsSold}</td>
                        <td className="px-4 py-2.5 text-right font-semibold">
                          {formatMoney(d.adr)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-gray-900">
                          {formatMoney(d.revenue)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-400">
                          {formatMoney(d.revpar)}
                        </td>
                        <td className="px-6 py-2.5 text-right opacity-60">
                          {formatMoney(d.pvp)}
                        </td>
                      </tr>
                    ))}

                  {!drillDownLoading && drillDownData.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-center text-gray-400">
                        Sin datos diarios para el mes seleccionado
                      </td>
                    </tr>
                  )}
                </tbody>

                {!drillDownLoading && drillDownData.length > 0 && (
                  <tfoot className="bg-blue-600 text-white font-bold sticky bottom-0">
                    <tr>
                      <td className="px-6 py-4">TOTALES / MEDIAS</td>
                      <td className="px-4 py-4 text-right">
                        {drillDownTotals.occ.toFixed(1)}%
                      </td>
                      <td className="px-4 py-4 text-right">
                        {drillDownTotals.roomsSold}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {formatMoney(drillDownTotals.adr)}
                      </td>
                      <td className="px-4 py-4 text-right text-emerald-300">
                        {formatMoney(drillDownTotals.revenue)}
                      </td>
                      <td className="px-4 py-4 text-right opacity-70">
                        {formatMoney(drillDownTotals.revpar)}
                      </td>
                      <td className="px-6 py-4"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MonthlyComparison;