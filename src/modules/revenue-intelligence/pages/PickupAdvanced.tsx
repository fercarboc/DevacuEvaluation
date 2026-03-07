 import React, { useState, useMemo } from 'react';
import { useRevenue } from '../context/RevenueContext';
import { TrendingUp, Users, Calendar, BarChart3, Building2, Download, Info, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

const PickupAdvanced: React.FC = () => {
  const { reservations, activePropertyId, properties } = useRevenue();
  const activeProperty = properties.find(p => p.id === activePropertyId);

  const [windowDays, setWindowDays] = useState<7 | 15 | 30>(7);
  const [viewMode, setViewMode] = useState<'revenue' | 'rn'>('revenue');

  // Pickup calculation logic:
  // For each arrival date in the future, find reservations booked within the last X days.
  const pickupAnalysis = useMemo(() => {
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setDate(now.getDate() - windowDays);
    const windowStartStr = windowStart.toISOString().split('T')[0];
    const todayStr = now.toISOString().split('T')[0];

    const arrivalMap: Record<string, { rn: number, revenue: number, netRevenue: number, count: number, leadTime: number }> = {};
    
    let totalPickupRN = 0;
    let totalPickupRevenue = 0;
    let totalPickupNetRevenue = 0;
    let totalLeadTime = 0;
    let totalPickupCount = 0;

    reservations.forEach(res => {
      // Only confirmed/checked-in/out for pickup (exclude cancelled/no-show for net pickup)
      if (res.status === 'CANCELLED' || res.status === 'NO_SHOW') return;

      // Check if booked within the window
      if (res.bookingDate >= windowStartStr && res.bookingDate <= todayStr) {
        const arrival = res.arrivalDate;
        if (!arrivalMap[arrival]) arrivalMap[arrival] = { rn: 0, revenue: 0, netRevenue: 0, count: 0, leadTime: 0 };
        
        const comm = (res.revenue * res.commissionPct) / 100;
        const netRev = res.revenue - comm;

        arrivalMap[arrival].rn += res.rooms * res.nights;
        arrivalMap[arrival].revenue += res.revenue;
        arrivalMap[arrival].netRevenue += netRev;
        arrivalMap[arrival].count += 1;
        
        const lead = Math.max(0, (new Date(res.arrivalDate).getTime() - new Date(res.bookingDate).getTime()) / (1000 * 60 * 60 * 24));
        arrivalMap[arrival].leadTime += lead;

        totalPickupRN += res.rooms * res.nights;
        totalPickupRevenue += res.revenue;
        totalPickupNetRevenue += netRev;
        totalPickupCount += 1;
        totalLeadTime += lead;
      }
    });

    const list = Object.entries(arrivalMap).map(([date, s]) => ({
      date,
      rn: s.rn,
      revenue: s.revenue,
      netRevenue: s.netRevenue,
      adr: s.rn > 0 ? s.revenue / s.rn : 0,
      leadTime: s.count > 0 ? s.leadTime / s.count : 0,
      paceLY: s.revenue * (0.8 + Math.random() * 0.4) // Mock Pace vs LY
    })).sort((a, b) => a.date.localeCompare(b.date));

    return {
      list,
      totalPickupRN,
      totalPickupRevenue,
      totalPickupNetRevenue,
      avgLeadTime: totalPickupCount > 0 ? totalLeadTime / totalPickupCount : 0,
      pickupNeto: totalPickupNetRevenue
    };
  }, [reservations, windowDays]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Pickup Avanzado</h1>
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md text-[10px] font-bold flex items-center gap-1">
              <Building2 size={10} />
              {activeProperty?.name}
            </span>
          </div>
          <p className="text-gray-500 text-sm">Análisis de pickup real basado en fecha de reserva (Booking Date)</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
            {[7, 15, 30].map((d) => (
              <button
                key={d}
                onClick={() => setWindowDays(d as any)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${windowDays === d ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                Últimos {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <TrendingUp size={20} />
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Pickup Revenue</span>
          </div>
          <p className="text-2xl font-black text-gray-900">{pickupAnalysis.totalPickupRevenue.toLocaleString()}€</p>
          <p className="text-[10px] text-emerald-500 font-bold mt-1">Neto: {pickupAnalysis.totalPickupNetRevenue.toLocaleString()}€</p>
        </div>

        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Users size={20} />
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Pickup RN</span>
          </div>
          <p className="text-2xl font-black text-gray-900">{pickupAnalysis.totalPickupRN}</p>
          <p className="text-[10px] text-gray-400 font-bold mt-1">Noches reservadas en ventana</p>
        </div>

        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Calendar size={20} />
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Lead Time Medio</span>
          </div>
          <p className="text-2xl font-black text-gray-900">{pickupAnalysis.avgLeadTime.toFixed(1)}d</p>
          <p className="text-[10px] text-gray-400 font-bold mt-1">Antelación media de reserva</p>
        </div>

        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <BarChart3 size={20} />
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ADR Pickup</span>
          </div>
          <p className="text-2xl font-black text-gray-900">
            {(pickupAnalysis.totalPickupRevenue / pickupAnalysis.totalPickupRN || 0).toFixed(2)}€
          </p>
          <p className="text-[10px] text-gray-400 font-bold mt-1">Precio medio de nuevas ventas</p>
        </div>
      </div>

      {/* Main Chart */}
      <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="text-blue-600" />
            Curva de Pickup por Fecha de Arribo
          </h3>
          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button 
              onClick={() => setViewMode('revenue')}
              className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${viewMode === 'revenue' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}
            >
              Revenue
            </button>
            <button 
              onClick={() => setViewMode('rn')}
              className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${viewMode === 'rn' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}
            >
              RN
            </button>
          </div>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={pickupAnalysis.list}>
              <defs>
                <linearGradient id="colorPickup" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
              <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
              <Area type="monotone" dataKey={viewMode} stroke="#3B82F6" strokeWidth={3} fillOpacity={1} fill="url(#colorPickup)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed Table */}
      <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-50">
          <h3 className="text-lg font-bold text-gray-900">Detalle de Pickup por Fecha de Arribo</h3>
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
                <th className="px-6 py-4 text-right">Pace vs LY</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pickupAnalysis.list.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-gray-900">{row.date}</td>
                  <td className="px-4 py-4 text-right font-medium text-gray-600">{row.rn}</td>
                  <td className="px-4 py-4 text-right font-bold text-gray-900">{row.revenue.toLocaleString()}€</td>
                  <td className="px-4 py-4 text-right font-bold text-emerald-600">{row.netRevenue.toLocaleString()}€</td>
                  <td className="px-4 py-4 text-right font-medium text-gray-600">{row.adr.toFixed(2)}€</td>
                  <td className="px-4 py-4 text-right font-medium text-gray-400">{row.leadTime.toFixed(1)}d</td>
                  <td className="px-6 py-4 text-right">
                    <span className={`font-bold ${row.revenue > row.paceLY ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {row.revenue > row.paceLY ? '+' : ''}{((row.revenue / row.paceLY - 1) * 100).toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PickupAdvanced;