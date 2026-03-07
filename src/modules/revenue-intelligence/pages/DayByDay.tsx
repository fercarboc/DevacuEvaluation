import React, { useState, useMemo } from 'react';
import { useRevenue } from '../context/RevenuePropertyContext';
import { Calendar, Filter, Download, Info, Building2, Eye, X } from 'lucide-react';

const DayByDay: React.FC = () => {
  const { dailyData, events, activePropertyId, properties, dailyByChannelSegment } = useRevenue();
  const activeProperty = properties.find(p => p.id === activePropertyId);
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [quickFilter, setQuickFilter] = useState('Últimos 30 días');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const breakdownData = useMemo(() => {
    if (!selectedDate) return [];
    return dailyByChannelSegment.filter(d => d.date === selectedDate);
  }, [selectedDate, dailyByChannelSegment]);

  const filteredData = useMemo(() => {
    let data = [...dailyData];
    const now = new Date();

    if (quickFilter === 'Mes actual') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      data = data.filter(d => new Date(d.date) >= start);
    } else if (quickFilter === 'Mes anterior') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      data = data.filter(d => {
        const date = new Date(d.date);
        return date >= start && date <= end;
      });
    } else if (quickFilter === 'Últimos 7 días') {
      const start = new Date();
      start.setDate(now.getDate() - 7);
      data = data.filter(d => new Date(d.date) >= start);
    } else if (quickFilter === 'Últimos 30 días') {
      const start = new Date();
      start.setDate(now.getDate() - 30);
      data = data.filter(d => new Date(d.date) >= start);
    } else if (quickFilter === 'Personalizado' && startDate && endDate) {
      data = data.filter(d => d.date >= startDate && d.date <= endDate);
    }

    return data.sort((a, b) => b.date.localeCompare(a.date));
  }, [dailyData, quickFilter, startDate, endDate]);

  const totals = useMemo(() => {
    const count = filteredData.length;
    if (count === 0) return { occ: 0, adr: 0, revenue: 0, revpar: 0 };
    const revenue = filteredData.reduce((acc, curr) => acc + curr.revenue, 0);
    const roomsSold = filteredData.reduce((acc, curr) => acc + curr.roomsSold, 0);
    return {
      occ: filteredData.reduce((acc, curr) => acc + curr.occ, 0) / count,
      adr: revenue / roomsSold || 0,
      revenue,
      revpar: revenue / (count * (activeProperty?.roomsCount || 18))
    };
  }, [filteredData, activeProperty]);

  const getEventForDate = (date: string) => {
    return events.find(e => date >= e.startDate && date <= e.endDate);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">Producción Día x Día</h1>
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md text-[10px] font-bold flex items-center gap-1">
              <Building2 size={10} />
              {activeProperty?.name}
            </span>
          </div>
          <p className="text-gray-500">Detalle granular de rendimiento diario</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2.5 bg-white border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 transition-colors shadow-sm">
            <Download size={20} />
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Rápido:</div>
            <div className="flex bg-gray-100 p-1 rounded-xl">
              {['Mes actual', 'Mes anterior', 'Últimos 7 días', 'Últimos 30 días', 'Personalizado'].map((f) => (
                <button
                  key={f}
                  onClick={() => setQuickFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                    quickFilter === f 
                    ? 'bg-white text-blue-600 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {quickFilter === 'Personalizado' && (
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
              Mostrando {filteredData.length} días
              {filteredData.length > 0 && ` (${filteredData[filteredData.length-1].date} → ${filteredData[0].date})`}
            </span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider text-[10px] sticky top-0 z-20 shadow-sm">
              <tr>
                <th className="px-6 py-4 bg-gray-50 border-b border-gray-100">Fecha</th>
                <th className="px-4 py-4 text-center border-b border-gray-100">Eventos</th>
                <th className="px-4 py-4 text-right border-b border-gray-100">OCC %</th>
                <th className="px-4 py-4 text-right border-b border-gray-100">Rooms Sold</th>
                <th className="px-4 py-4 text-right border-b border-gray-100">ADR</th>
                <th className="px-4 py-4 text-right border-b border-gray-100">Revenue</th>
                <th className="px-4 py-4 text-right border-b border-gray-100">RevPAR</th>
                <th className="px-4 py-4 text-right border-b border-gray-100">PVP</th>
                <th className="px-6 py-4 text-center border-b border-gray-100">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredData.map((row, idx) => {
                const event = getEventForDate(row.date);
                return (
                  <tr key={idx} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-6 py-3 font-bold text-gray-900">{row.date}</td>
                    <td className="px-4 py-3 text-center">
                      {event && (
                        <span 
                          className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-md text-[9px] font-bold uppercase tracking-tighter"
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
                          className={`h-full ${row.occ > 80 ? 'bg-emerald-500' : row.occ < 40 ? 'bg-rose-500' : 'bg-blue-500'}`}
                          style={{ width: `${row.occ}%` }}
                        ></div>
                      </div>
                      <span className="font-mono font-semibold text-gray-600 w-12">{row.occ.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{row.roomsSold}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-700">{row.adr.toFixed(2)}€</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{row.revenue.toLocaleString()}€</td>
                  <td className="px-4 py-3 text-right text-gray-500">{(row.revenue / (activeProperty?.roomsCount || 18)).toFixed(2)}€</td>
                  <td className="px-4 py-3 text-right">
                    <span className="px-2 py-1 bg-gray-100 rounded text-[10px] font-bold text-gray-500">
                      {row.pvp.toFixed(2)}€
                    </span>
                  </td>
                  <td className="px-6 py-3 text-center">
                    <button 
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
          </tbody>
            <tfoot className="bg-gray-900 text-white font-bold sticky bottom-0 z-20">
              <tr>
                <th className="px-6 py-4">TOTALES / MEDIAS</th>
                <td></td>
                <td className="px-4 py-4 text-right text-blue-400">{totals.occ.toFixed(1)}%</td>
                <td className="px-4 py-4 text-right">{filteredData.reduce((acc, curr) => acc + curr.roomsSold, 0)}</td>
                <td className="px-4 py-4 text-right">{totals.adr.toFixed(2)}€</td>
                <td className="px-4 py-4 text-right text-emerald-400">{totals.revenue.toLocaleString()}€</td>
                <td className="px-4 py-4 text-right opacity-60">{totals.revpar.toFixed(2)}€</td>
                <td className="px-4 py-4"></td>
                <td className="px-6 py-4"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Breakdown Modal */}
      {selectedDate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Desglose de Producción</h3>
                <p className="text-sm text-gray-500 font-medium">Fecha: <span className="text-blue-600">{selectedDate}</span></p>
              </div>
              <button 
                onClick={() => setSelectedDate(null)}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-400"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[70vh]">
              {breakdownData.length > 0 ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-blue-50 p-4 rounded-2xl">
                      <p className="text-[10px] font-bold text-blue-400 uppercase mb-1">Total RN</p>
                      <p className="text-xl font-black text-blue-700">{breakdownData.reduce((acc, r) => acc + r.roomsSold, 0)}</p>
                    </div>
                    <div className="bg-emerald-50 p-4 rounded-2xl">
                      <p className="text-[10px] font-bold text-emerald-400 uppercase mb-1">Total Revenue</p>
                      <p className="text-xl font-black text-emerald-700">{breakdownData.reduce((acc, r) => acc + r.revenue, 0).toLocaleString()}€</p>
                    </div>
                    <div className="bg-amber-50 p-4 rounded-2xl">
                      <p className="text-[10px] font-bold text-amber-400 uppercase mb-1">ADR Medio</p>
                      <p className="text-xl font-black text-amber-700">
                        {(breakdownData.reduce((acc, r) => acc + r.revenue, 0) / breakdownData.reduce((acc, r) => acc + r.roomsSold, 0) || 0).toFixed(2)}€
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
                        {breakdownData.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50/50">
                            <td className="px-4 py-3 font-bold text-gray-900">{row.channel}</td>
                            <td className="px-4 py-3 font-medium text-gray-500">{row.segment}</td>
                            <td className="px-4 py-3 text-right font-bold text-gray-700">{row.roomsSold}</td>
                            <td className="px-4 py-3 text-right font-black text-gray-900">{row.revenue.toLocaleString()}€</td>
                            <td className="px-4 py-3 text-right text-gray-500">{(row.revenue / row.roomsSold).toFixed(2)}€</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-400 font-medium italic">No hay datos granulares disponibles para esta fecha.</p>
                </div>
              )}
            </div>
            
            <div className="p-6 bg-gray-50 flex justify-end">
              <button 
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
