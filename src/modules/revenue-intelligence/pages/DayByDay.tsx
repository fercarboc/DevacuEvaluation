import React, { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Download,
  Info,
  Building2,
  Eye,
  X,
} from "lucide-react";

import { useRevenueDayByDaySummary } from "../hooks/useRevenueDayByDaySummary";
import { useRevenueDayBreakdown } from "../hooks/useRevenueDayBreakdown";

type RevenuePropertyLite = {
  id: string;
  name: string;
  roomsCount: number;
};

type DayByDayProps = {
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

function toISODate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    from: toISODate(start),
    to: toISODate(end),
  };
}

function getPreviousMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);

  return {
    from: toISODate(start),
    to: toISODate(end),
  };
}

function getLastNDaysRange(days: number) {
  const now = new Date();
  const start = new Date();
  start.setDate(now.getDate() - days);

  return {
    from: toISODate(start),
    to: toISODate(now),
  };
}

const DayByDay: React.FC<DayByDayProps> = ({
  orgId,
  selectedPropertyId,
  properties = [],
}) => {
  const [quickFilter, setQuickFilter] = useState("Últimos 30 días");
  const [startDate, setStartDate] = useState<string>(getLastNDaysRange(30).from);
  const [endDate, setEndDate] = useState<string>(getLastNDaysRange(30).to);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    if (quickFilter === "Mes actual") {
      const range = getCurrentMonthRange();
      setStartDate(range.from);
      setEndDate(range.to);
    } else if (quickFilter === "Mes anterior") {
      const range = getPreviousMonthRange();
      setStartDate(range.from);
      setEndDate(range.to);
    } else if (quickFilter === "Últimos 7 días") {
      const range = getLastNDaysRange(7);
      setStartDate(range.from);
      setEndDate(range.to);
    } else if (quickFilter === "Últimos 30 días") {
      const range = getLastNDaysRange(30);
      setStartDate(range.from);
      setEndDate(range.to);
    }
  }, [quickFilter]);

  const activeProperty =
    properties.find((p) => p.id === selectedPropertyId) ?? null;

  const isInvalidRange = !!startDate && !!endDate && startDate > endDate;

  const {
    property,
    totals,
    daily,
    loading,
    error,
  } = useRevenueDayByDaySummary({
    orgId,
    propertyId: selectedPropertyId,
    from: startDate,
    to: endDate,
  });

  const {
    totals: breakdownTotals,
    rows: breakdownRows,
    loading: breakdownLoading,
    error: breakdownError,
  } = useRevenueDayBreakdown({
    orgId,
    propertyId: selectedPropertyId,
    date: selectedDate,
    enabled: !!selectedDate,
  });

  const headerPropertyName =
    property?.name ?? activeProperty?.name ?? "Sin propiedad";

  const tableRows = useMemo(() => {
    return daily ?? [];
  }, [daily]);

  const safeRoomsCount = useMemo(() => {
    if (property?.roomsCount && property.roomsCount > 0) return property.roomsCount;
    if (activeProperty?.roomsCount && activeProperty.roomsCount > 0) {
      return activeProperty.roomsCount;
    }
    return 0;
  }, [property, activeProperty]);

  if (!selectedPropertyId) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-gray-500">
          Selecciona una propiedad para ver la producción diaria.
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
              Producción Día x Día
            </h1>

            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md text-[10px] font-bold flex items-center gap-1">
              <Building2 size={10} />
              {headerPropertyName}
            </span>
          </div>

          <p className="text-gray-500">Detalle granular de rendimiento diario</p>
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

      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Rápido:
            </div>

            <div className="flex bg-gray-100 p-1 rounded-xl flex-wrap">
              {[
                "Mes actual",
                "Mes anterior",
                "Últimos 7 días",
                "Últimos 30 días",
                "Personalizado",
              ].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setQuickFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                    quickFilter === f
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {quickFilter === "Personalizado" && (
            <div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2">
              <div className="h-8 w-px bg-gray-100"></div>

              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-400 text-xs">→</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 flex items-center gap-2">
            <Info size={14} className="text-blue-600" />
            <span className="text-[11px] font-bold text-blue-700">
              Mostrando {tableRows.length} días
              {tableRows.length > 0 &&
                ` (${tableRows[tableRows.length - 1].date} → ${tableRows[0].date})`}
            </span>
          </div>
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

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider text-[10px] sticky top-0 z-20 shadow-sm">
              <tr>
                <th className="px-6 py-4 bg-gray-50 border-b border-gray-100">
                  Fecha
                </th>
                <th className="px-4 py-4 text-center border-b border-gray-100">
                  Eventos
                </th>
                <th className="px-4 py-4 text-right border-b border-gray-100">
                  OCC %
                </th>
                <th className="px-4 py-4 text-right border-b border-gray-100">
                  Rooms Sold
                </th>
                <th className="px-4 py-4 text-right border-b border-gray-100">
                  ADR
                </th>
                <th className="px-4 py-4 text-right border-b border-gray-100">
                  Revenue
                </th>
                <th className="px-4 py-4 text-right border-b border-gray-100">
                  RevPAR
                </th>
                <th className="px-4 py-4 text-right border-b border-gray-100">
                  PVP
                </th>
                <th className="px-6 py-4 text-center border-b border-gray-100">
                  Acción
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-6 py-10 text-center text-gray-400"
                  >
                    Cargando...
                  </td>
                </tr>
              )}

              {!loading &&
                tableRows.map((row, idx) => {
                  const event = row.event;

                  return (
                    <tr
                      key={`${row.date}-${idx}`}
                      className="hover:bg-blue-50/30 transition-colors group"
                    >
                      <td className="px-6 py-3 font-bold text-gray-900">
                        {row.date}
                      </td>

                      <td className="px-4 py-3 text-center">
                        {event && (
                          <span
                            className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-tighter"
                            style={{
                              backgroundColor: event.color || "#FEF3C7",
                              color: "#1F2937",
                            }}
                            title={event.name}
                          >
                            {event.type}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                row.occ > 80
                                  ? "bg-emerald-500"
                                  : row.occ < 40
                                  ? "bg-rose-500"
                                  : "bg-blue-500"
                              }`}
                              style={{ width: `${Math.min(row.occ, 100)}%` }}
                            ></div>
                          </div>

                          <span className="font-mono font-semibold text-gray-600 w-12">
                            {row.occ.toFixed(1)}%
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right font-medium">
                        {row.roomsSold}
                      </td>

                      <td className="px-4 py-3 text-right font-semibold text-gray-700">
                        {formatMoney(row.adr)}
                      </td>

                      <td className="px-4 py-3 text-right font-bold text-gray-900">
                        {formatMoney(row.revenue)}
                      </td>

                      <td className="px-4 py-3 text-right text-gray-500">
                        {formatMoney(row.revpar)}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <span className="px-2 py-1 bg-gray-100 rounded text-[10px] font-bold text-gray-500">
                          {formatMoney(row.pvp)}
                        </span>
                      </td>

                      <td className="px-6 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedDate(row.date)}
                          className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                          title="Ver desglose"
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}

              {!loading && tableRows.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-6 py-10 text-center text-gray-400"
                  >
                    Sin datos diarios para esta propiedad
                  </td>
                </tr>
              )}
            </tbody>

            <tfoot className="bg-gray-900 text-white font-bold sticky bottom-0 z-20">
              <tr>
                <th className="px-6 py-4">TOTALES / MEDIAS</th>
                <td></td>
                <td className="px-4 py-4 text-right text-blue-400">
                  {totals.occ.toFixed(1)}%
                </td>
                <td className="px-4 py-4 text-right">{totals.roomsSold}</td>
                <td className="px-4 py-4 text-right">
                  {formatMoney(totals.adr)}
                </td>
                <td className="px-4 py-4 text-right text-emerald-400">
                  {formatMoney(totals.revenue)}
                </td>
                <td className="px-4 py-4 text-right opacity-60">
                  {formatMoney(totals.revpar)}
                </td>
                <td className="px-4 py-4"></td>
                <td className="px-6 py-4"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {selectedDate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  Desglose de Producción
                </h3>
                <p className="text-sm text-gray-500 font-medium">
                  Fecha: <span className="text-blue-600">{selectedDate}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-400"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[70vh]">
              {breakdownError && (
                <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-sm text-red-700 mb-4">
                  {breakdownError}
                </div>
              )}

              {breakdownLoading ? (
                <div className="text-center py-12">
                  <p className="text-gray-400 font-medium italic">Cargando...</p>
                </div>
              ) : breakdownRows.length > 0 ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-blue-50 p-4 rounded-2xl">
                      <p className="text-[10px] font-bold text-blue-400 uppercase mb-1">
                        Total RN
                      </p>
                      <p className="text-xl font-black text-blue-700">
                        {breakdownTotals.roomsSold}
                      </p>
                    </div>

                    <div className="bg-emerald-50 p-4 rounded-2xl">
                      <p className="text-[10px] font-bold text-emerald-400 uppercase mb-1">
                        Total Revenue
                      </p>
                      <p className="text-xl font-black text-emerald-700">
                        {formatMoney(breakdownTotals.revenue)}
                      </p>
                    </div>

                    <div className="bg-amber-50 p-4 rounded-2xl">
                      <p className="text-[10px] font-bold text-amber-400 uppercase mb-1">
                        ADR Medio
                      </p>
                      <p className="text-xl font-black text-amber-700">
                        {formatMoney(breakdownTotals.adr)}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 text-gray-400 font-bold uppercase tracking-widest text-[10px]">
                        <tr>
                          <th className="px-4 py-3">Canal</th>
                          <th className="px-4 py-3">Segmento</th>
                          <th className="px-4 py-3 text-right">RN</th>
                          <th className="px-4 py-3 text-right">Revenue</th>
                          <th className="px-4 py-3 text-right">ADR</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-gray-50">
                        {breakdownRows.map((row, i) => (
                          <tr
                            key={`${row.channel}-${row.segment}-${i}`}
                            className="hover:bg-gray-50/50"
                          >
                            <td className="px-4 py-3 font-bold text-gray-900">
                              {row.channel}
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-500">
                              {row.segment}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-gray-700">
                              {row.roomsSold}
                            </td>
                            <td className="px-4 py-3 text-right font-black text-gray-900">
                              {formatMoney(row.revenue)}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-500">
                              {formatMoney(row.adr)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-400 font-medium italic">
                    No hay datos granulares disponibles para esta fecha.
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 bg-gray-50 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="px-6 py-2 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DayByDay;