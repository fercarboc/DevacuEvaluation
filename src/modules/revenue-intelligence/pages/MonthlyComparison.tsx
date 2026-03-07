import React, { useState, useMemo } from 'react';
import { useRevenue } from '../context/RevenuePropertyContext';
import { Download, X, FileDown, TrendingUp, Calendar, ArrowRight, Building2 } from 'lucide-react';
import { DailyData, MonthlyData } from '../types';

const MonthlyComparison: React.FC = () => {
  const { monthlyData, dailyData, activePropertyId, properties } = useRevenue();
  const activeProperty = properties.find(p => p.id === activePropertyId);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const drillDownData = useMemo(() => {
    if (!selectedMonth) return [];
    return dailyData.filter(d => d.date.startsWith(selectedMonth))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [selectedMonth, dailyData]);

  const drillDownTotals = useMemo(() => {
    if (drillDownData.length === 0) return null;
    const revenue = drillDownData.reduce((acc, curr) => acc + curr.revenue, 0);
    const roomsSold = drillDownData.reduce((acc, curr) => acc + curr.roomsSold, 0);
    return {
      revenue,
      adr: revenue / roomsSold || 0,
      occ: drillDownData.reduce((acc, curr) => acc + curr.occ, 0) / drillDownData.length,
      revpar: revenue / (drillDownData.length * (activeProperty?.roomsCount || 18))
    };
  }, [drillDownData, activeProperty]);

  const handleExportCSV = () => {
    if (!selectedMonth) return;
    const headers = ['Fecha', 'OCC%', 'Rooms Sold', 'ADR', 'Revenue', 'RevPAR', 'PVP'];
    const rows = drillDownData.map(d => [
      d.date,
      d.occ.toFixed(1),
      d.roomsSold,
      d.adr.toFixed(2),
      d.revenue.toFixed(2),
      (d.revenue / (activeProperty?.roomsCount || 18)).toFixed(2),
      d.pvp.toFixed(2)
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `detalle_${selectedMonth}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">Comparación Mensual</h1>
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md text-[10px] font-bold flex items-center gap-1">
              <Building2 size={10} />
              {activeProperty?.name}
            </span>
          </div>
          <p className="text-gray-500">Resumen ejecutivo mensual y comparativa YoY</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2.5 bg-white border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 transition-colors shadow-sm">
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
              {monthlyData.map((row, idx) => (
                <tr 
                  key={idx} 
                  className={`hover:bg-blue-50/30 transition-colors group cursor-pointer ${selectedMonth === row.month ? 'bg-blue-50/50' : ''}`}
                  onClick={() => setSelectedMonth(selectedMonth === row.month ? null : row.month)}
                >
                  <td className="px-8 py-5 font-bold text-gray-900 flex items-center gap-3">
                    <Calendar size={18} className="text-gray-400" />
                    {row.month}
                  </td>
                  <td className="px-6 py-5 text-right font-mono font-semibold text-gray-600">{row.occ.toFixed(1)}%</td>
                  <td className="px-6 py-5 text-right font-medium">{row.rn}</td>
                  <td className="px-6 py-5 text-right font-semibold text-gray-700">{row.adr.toFixed(2)}€</td>
                  <td className="px-6 py-5 text-right font-bold text-gray-900">{row.revenue.toLocaleString()}€</td>
                  <td className="px-6 py-5 text-right text-gray-500">{row.revpar.toFixed(2)}€</td>
                  <td className={`px-6 py-5 text-right font-bold ${row.difVsLY >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {row.difVsLY >= 0 ? `+${row.difVsLY.toFixed(1)}%` : `${row.difVsLY.toFixed(1)}%`}
                  </td>
                  <td className="px-8 py-5 text-right">
                    <button className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                      <ArrowRight size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drill Down Detail */}
      {selectedMonth && (
        <div className="animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-white rounded-3xl shadow-xl border border-blue-100 overflow-hidden">
            <div className="p-6 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-blue-600 p-2 rounded-xl text-white">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Detalle Diario: {selectedMonth}</h3>
                  <p className="text-xs text-blue-600 font-bold uppercase tracking-wider">Análisis Pivot-Like</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleExportCSV}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-blue-200 text-blue-600 rounded-xl text-xs font-bold hover:bg-blue-50 transition-colors"
                >
                  <FileDown size={16} />
                  Exportar CSV
                </button>
                <button 
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
                    <th className="px-4 py-3 text-right border-b border-gray-100">OCC %</th>
                    <th className="px-4 py-3 text-right border-b border-gray-100">Oc</th>
                    <th className="px-4 py-3 text-right border-b border-gray-100">ADR</th>
                    <th className="px-4 py-3 text-right border-b border-gray-100">Revenue</th>
                    <th className="px-4 py-3 text-right border-b border-gray-100">RevPAR</th>
                    <th className="px-6 py-3 text-right border-b border-gray-100">PVP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {drillDownData.map((d, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-2.5 font-bold text-gray-700">{d.date}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{d.occ.toFixed(1)}%</td>
                      <td className="px-4 py-2.5 text-right">{d.roomsSold}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{d.adr.toFixed(2)}€</td>
                      <td className="px-4 py-2.5 text-right font-bold text-gray-900">{d.revenue.toLocaleString()}€</td>
                      <td className="px-4 py-2.5 text-right text-gray-400">{(d.revenue / (activeProperty?.roomsCount || 18)).toFixed(2)}€</td>
                      <td className="px-6 py-2.5 text-right opacity-60">{d.pvp.toFixed(2)}€</td>
                    </tr>
                  ))}
                </tbody>
                {drillDownTotals && (
                  <tfoot className="bg-blue-600 text-white font-bold sticky bottom-0">
                    <tr>
                      <td className="px-6 py-4">TOTALES / MEDIAS</td>
                      <td className="px-4 py-4 text-right">{drillDownTotals.occ.toFixed(1)}%</td>
                      <td className="px-4 py-4 text-right">{drillDownData.reduce((acc, curr) => acc + curr.roomsSold, 0)}</td>
                      <td className="px-4 py-4 text-right">{drillDownTotals.adr.toFixed(2)}€</td>
                      <td className="px-4 py-4 text-right text-emerald-300">{drillDownTotals.revenue.toLocaleString()}€</td>
                      <td className="px-4 py-4 text-right opacity-70">{drillDownTotals.revpar.toFixed(2)}€</td>
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