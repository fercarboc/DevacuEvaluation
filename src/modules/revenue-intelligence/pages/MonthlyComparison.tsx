import React, { useMemo, useState } from "react";
import { useRevenueProperty } from "../context/RevenuePropertyContext";
import {
  Download,
  X,
  FileDown,
  TrendingUp,
  Calendar,
  ArrowRight,
  Building2,
} from "lucide-react";

type RevenuePropertyLite = {
  id: string;
  name: string;
  roomsCount: number;
};

type DailyDataRow = {
  propertyId: string;
  date: string; // YYYY-MM-DD
  occ: number;
  roomsSold: number;
  adr: number;
  revenue: number;
  pvp: number;
};

type MonthlyDataRow = {
  propertyId: string;
  month: string; // YYYY-MM
  occ: number;
  rn: number;
  adr: number;
  revenue: number;
  revpar: number;
  difVsLY: number;
};

type MonthlyComparisonProps = {
  properties?: RevenuePropertyLite[];
  monthlyData?: MonthlyDataRow[];
  dailyData?: DailyDataRow[];
};

const FALLBACK_PROPERTIES: RevenuePropertyLite[] = [
  {
    id: "26bff2d1-2072-480f-a7c3-e90ea4373a8e",
    name: "DEMOHOTEL",
    roomsCount: 22,
  },
  {
    id: "146a504b-e6fe-4c4f-8a84-40b24ff179c7",
    name: "HOTEL_4",
    roomsCount: 20,
  },
];

const FALLBACK_MONTHLY_DATA: MonthlyDataRow[] = [
  {
    propertyId: "26bff2d1-2072-480f-a7c3-e90ea4373a8e",
    month: "2026-05",
    occ: 73.8,
    rn: 93,
    adr: 123.52,
    revenue: 11487.63,
    revpar: 91.17,
    difVsLY: 0.4,
  },
  {
    propertyId: "26bff2d1-2072-480f-a7c3-e90ea4373a8e",
    month: "2026-04",
    occ: 79.4,
    rn: 429,
    adr: 126.81,
    revenue: 54401.36,
    revpar: 100.74,
    difVsLY: 3.8,
  },
  {
    propertyId: "26bff2d1-2072-480f-a7c3-e90ea4373a8e",
    month: "2026-03",
    occ: 87.3,
    rn: 487,
    adr: 123.77,
    revenue: 60274.13,
    revpar: 108.02,
    difVsLY: 0.7,
  },
  {
    propertyId: "146a504b-e6fe-4c4f-8a84-40b24ff179c7",
    month: "2026-05",
    occ: 62.4,
    rn: 76,
    adr: 88.4,
    revenue: 6718.4,
    revpar: 55.99,
    difVsLY: -1.8,
  },
  {
    propertyId: "146a504b-e6fe-4c4f-8a84-40b24ff179c7",
    month: "2026-04",
    occ: 68.2,
    rn: 102,
    adr: 85.7,
    revenue: 8741.4,
    revpar: 58.28,
    difVsLY: 1.4,
  },
  {
    propertyId: "146a504b-e6fe-4c4f-8a84-40b24ff179c7",
    month: "2026-03",
    occ: 71.1,
    rn: 115,
    adr: 83.9,
    revenue: 9648.5,
    revpar: 59.96,
    difVsLY: 2.1,
  },
];

const FALLBACK_DAILY_DATA: DailyDataRow[] = [
  {
    propertyId: "26bff2d1-2072-480f-a7c3-e90ea4373a8e",
    date: "2026-05-01",
    occ: 55.6,
    roomsSold: 10,
    adr: 126.0,
    revenue: 1260.0,
    pvp: 112.71,
  },
  {
    propertyId: "26bff2d1-2072-480f-a7c3-e90ea4373a8e",
    date: "2026-05-02",
    occ: 83.3,
    roomsSold: 15,
    adr: 125.87,
    revenue: 1888.06,
    pvp: 132.23,
  },
  {
    propertyId: "26bff2d1-2072-480f-a7c3-e90ea4373a8e",
    date: "2026-05-03",
    occ: 100.0,
    roomsSold: 18,
    adr: 120.89,
    revenue: 2176.1,
    pvp: 132.23,
  },
  {
    propertyId: "26bff2d1-2072-480f-a7c3-e90ea4373a8e",
    date: "2026-05-04",
    occ: 83.3,
    roomsSold: 15,
    adr: 118.93,
    revenue: 1783.98,
    pvp: 122.47,
  },
  {
    propertyId: "26bff2d1-2072-480f-a7c3-e90ea4373a8e",
    date: "2026-05-05",
    occ: 83.3,
    roomsSold: 15,
    adr: 120.85,
    revenue: 1812.73,
    pvp: 117.83,
  },
  {
    propertyId: "26bff2d1-2072-480f-a7c3-e90ea4373a8e",
    date: "2026-05-06",
    occ: 77.8,
    roomsSold: 14,
    adr: 130.31,
    revenue: 1824.3,
    pvp: 118.84,
  },
  {
    propertyId: "26bff2d1-2072-480f-a7c3-e90ea4373a8e",
    date: "2026-05-07",
    occ: 33.3,
    roomsSold: 6,
    adr: 123.74,
    revenue: 742.45,
    pvp: 118.84,
  },
  {
    propertyId: "146a504b-e6fe-4c4f-8a84-40b24ff179c7",
    date: "2026-05-01",
    occ: 45.0,
    roomsSold: 9,
    adr: 84.5,
    revenue: 760.5,
    pvp: 82.0,
  },
  {
    propertyId: "146a504b-e6fe-4c4f-8a84-40b24ff179c7",
    date: "2026-05-02",
    occ: 55.0,
    roomsSold: 11,
    adr: 86.2,
    revenue: 948.2,
    pvp: 84.0,
  },
  {
    propertyId: "146a504b-e6fe-4c4f-8a84-40b24ff179c7",
    date: "2026-05-03",
    occ: 60.0,
    roomsSold: 12,
    adr: 88.1,
    revenue: 1057.2,
    pvp: 85.5,
  },
];

const MonthlyComparison: React.FC<MonthlyComparisonProps> = ({
  properties = FALLBACK_PROPERTIES,
  monthlyData = FALLBACK_MONTHLY_DATA,
  dailyData = FALLBACK_DAILY_DATA,
}) => {
  const { propertyId } = useRevenueProperty();
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const activeProperty =
    properties.find((p) => p.id === propertyId) ?? properties[0] ?? null;

  const activePropertyId = propertyId ?? activeProperty?.id ?? null;

  const filteredMonthlyData = useMemo(() => {
    if (!activePropertyId) return [];
    return monthlyData
      .filter((row) => row.propertyId === activePropertyId)
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [monthlyData, activePropertyId]);

  const filteredDailyData = useMemo(() => {
    if (!activePropertyId) return [];
    return dailyData.filter((row) => row.propertyId === activePropertyId);
  }, [dailyData, activePropertyId]);

  const drillDownData = useMemo(() => {
    if (!selectedMonth) return [];
    return filteredDailyData
      .filter((d) => d.date.startsWith(selectedMonth))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [selectedMonth, filteredDailyData]);

  const drillDownTotals = useMemo(() => {
    if (drillDownData.length === 0 || !activeProperty) return null;

    const revenue = drillDownData.reduce((acc, curr) => acc + curr.revenue, 0);
    const roomsSold = drillDownData.reduce((acc, curr) => acc + curr.roomsSold, 0);

    return {
      revenue,
      adr: roomsSold > 0 ? revenue / roomsSold : 0,
      occ:
        drillDownData.reduce((acc, curr) => acc + curr.occ, 0) /
        drillDownData.length,
      revpar:
        activeProperty.roomsCount > 0
          ? revenue / (drillDownData.length * activeProperty.roomsCount)
          : 0,
    };
  }, [drillDownData, activeProperty]);

  const handleExportCSV = () => {
    if (!selectedMonth || drillDownData.length === 0 || !activeProperty) return;

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
      (d.revenue / activeProperty.roomsCount).toFixed(2),
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

  if (!activeProperty) {
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
              {activeProperty.name}
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
          >
            <Download size={20} />
          </button>
        </div>
      </div>

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
                <th className="px-6 py-5 text-right">Dif vs LY</th>
                <th className="px-8 py-5 text-right">Acciones</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {filteredMonthlyData.map((row, idx) => (
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

                  <td className="px-6 py-5 text-right font-medium">{row.rn}</td>

                  <td className="px-6 py-5 text-right font-semibold text-gray-700">
                    {row.adr.toFixed(2)}€
                  </td>

                  <td className="px-6 py-5 text-right font-bold text-gray-900">
                    {row.revenue.toLocaleString()}€
                  </td>

                  <td className="px-6 py-5 text-right text-gray-500">
                    {row.revpar.toFixed(2)}€
                  </td>

                  <td
                    className={`px-6 py-5 text-right font-bold ${
                      row.difVsLY >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {row.difVsLY >= 0
                      ? `+${row.difVsLY.toFixed(1)}%`
                      : `${row.difVsLY.toFixed(1)}%`}
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

              {filteredMonthlyData.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-8 py-10 text-center text-gray-400">
                    Sin datos mensuales para esta propiedad
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
                  {drillDownData.map((d, i) => (
                    <tr key={`${d.date}-${i}`} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-2.5 font-bold text-gray-700">{d.date}</td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        {d.occ.toFixed(1)}%
                      </td>
                      <td className="px-4 py-2.5 text-right">{d.roomsSold}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">
                        {d.adr.toFixed(2)}€
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-gray-900">
                        {d.revenue.toLocaleString()}€
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-400">
                        {(d.revenue / activeProperty.roomsCount).toFixed(2)}€
                      </td>
                      <td className="px-6 py-2.5 text-right opacity-60">
                        {d.pvp.toFixed(2)}€
                      </td>
                    </tr>
                  ))}
                </tbody>

                {drillDownTotals && (
                  <tfoot className="bg-blue-600 text-white font-bold sticky bottom-0">
                    <tr>
                      <td className="px-6 py-4">TOTALES / MEDIAS</td>
                      <td className="px-4 py-4 text-right">
                        {drillDownTotals.occ.toFixed(1)}%
                      </td>
                      <td className="px-4 py-4 text-right">
                        {drillDownData.reduce((acc, curr) => acc + curr.roomsSold, 0)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {drillDownTotals.adr.toFixed(2)}€
                      </td>
                      <td className="px-4 py-4 text-right text-emerald-300">
                        {drillDownTotals.revenue.toLocaleString()}€
                      </td>
                      <td className="px-4 py-4 text-right opacity-70">
                        {drillDownTotals.revpar.toFixed(2)}€
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