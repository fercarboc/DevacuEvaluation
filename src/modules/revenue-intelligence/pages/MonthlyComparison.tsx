import React, { useMemo, useState } from "react";
import {
  Download,
  X,
  FileDown,
  TrendingUp,
  Calendar,
  ArrowRight,
  Building2,
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

function formatMoney(value: number) {
  return `${value.toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}€`;
}

function getDefaultRange() {
  return {
    from: "2026-01-01",
    to: "2026-12-31",
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

const MonthlyComparison: React.FC<MonthlyComparisonProps> = ({
  orgId,
  selectedPropertyId,
  properties = [],
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const defaultRange = getDefaultRange();

  const activeProperty =
    properties.find((p) => p.id === selectedPropertyId) ?? null;

  const {
    property,
    totals,
    months,
    loading,
    error,
  } = useRevenueMonthlySummary({
    orgId,
    propertyId: selectedPropertyId,
    from: defaultRange.from,
    to: defaultRange.to,
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

  const safeRoomsCount = useMemo(() => {
    if (property?.roomsCount && property.roomsCount > 0) return property.roomsCount;
    if (activeProperty?.roomsCount && activeProperty.roomsCount > 0) {
      return activeProperty.roomsCount;
    }
    return 0;
  }, [property, activeProperty]);

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
            Resumen ejecutivo mensual y comparativa YoY
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

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-sm text-red-700">
          {error}
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
                      {row.roomsSold}
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
                  <td className="px-6 py-4 text-right">{totals.roomsSold}</td>
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
                    Detalle Diario: {selectedMonth}
                  </h3>
                  <p className="text-xs text-blue-600 font-bold uppercase tracking-wider">
                    Análisis Pivot-Like
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

            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-gray-50 text-gray-400 font-bold uppercase tracking-wider text-[9px] sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-6 py-3 border-b border-gray-100">Fecha</th>
                    <th className="px-4 py-3 text-right border-b border-gray-100">
                      OCC %
                    </th>
                    <th className="px-4 py-3 text-right border-b border-gray-100">
                      Oc
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