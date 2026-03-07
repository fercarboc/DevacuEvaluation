import React, { useState, useMemo } from 'react';
import { useRevenue } from '../context/RevenuePropertyContext';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell 
} from 'recharts';
import { 
  Calendar, Filter, TrendingUp, Users, Globe, PieChart as PieIcon, 
  BarChart3, Table as TableIcon, ChevronDown, Download, Info, Building2,
  AlertCircle
} from 'lucide-react';
import { Channel, Segment, DailyChannelSegmentRow } from '../types';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1'];

const ChannelsSegments: React.FC = () => {
  const { dailyByChannelSegment, activePropertyId, properties, reservations } = useRevenue();
  const activeProperty = properties.find(p => p.id === activePropertyId);

  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [mode, setMode] = useState<'channel' | 'segment' | 'both' | 'cancellations'>('channel');
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [metric, setMetric] = useState<'revenue' | 'rn'>('revenue');

  // Filter reservations based on date range (arrival date)
  const filteredReservations = useMemo(() => {
    let data = reservations;
    if (dateRange.from) data = data.filter(d => d.arrivalDate >= dateRange.from);
    if (dateRange.to) data = data.filter(d => d.arrivalDate <= dateRange.to);
    return data;
  }, [reservations, dateRange]);

  // Aggregated data for charts and tables
  const stats = useMemo(() => {
    const channelMap: Record<string, { rn: number, revenue: number, netRevenue: number, commission: number, cancelled: number, total: number, los: number }> = {};
    const segmentMap: Record<string, { rn: number, revenue: number, netRevenue: number, commission: number, cancelled: number, total: number, los: number }> = {};
    const crossMap: Record<string, Record<string, number>> = {};

    let totalRN = 0;
    let totalRevenue = 0;
    let totalNetRevenue = 0;
    let totalCancelled = 0;
    let totalRes = 0;

    filteredReservations.forEach(res => {
      const isCancelled = res.status === 'CANCELLED' || res.status === 'NO_SHOW';
      
      // Channel stats
      if (!channelMap[res.channel]) channelMap[res.channel] = { rn: 0, revenue: 0, netRevenue: 0, commission: 0, cancelled: 0, total: 0, los: 0 };
      channelMap[res.channel].total += 1;
      if (isCancelled) {
        channelMap[res.channel].cancelled += 1;
        totalCancelled += 1;
      } else {
        const comm = (res.revenue * res.commissionPct) / 100;
        channelMap[res.channel].rn += res.rooms * res.nights;
        channelMap[res.channel].revenue += res.revenue;
        channelMap[res.channel].netRevenue += (res.revenue - comm);
        channelMap[res.channel].commission += comm;
        channelMap[res.channel].los += res.nights;
        
        totalRN += res.rooms * res.nights;
        totalRevenue += res.revenue;
        totalNetRevenue += (res.revenue - comm);
      }
      totalRes += 1;

      // Segment stats
      if (!segmentMap[res.segment]) segmentMap[res.segment] = { rn: 0, revenue: 0, netRevenue: 0, commission: 0, cancelled: 0, total: 0, los: 0 };
      segmentMap[res.segment].total += 1;
      if (isCancelled) {
        segmentMap[res.segment].cancelled += 1;
      } else {
        const comm = (res.revenue * res.commissionPct) / 100;
        segmentMap[res.segment].rn += res.rooms * res.nights;
        segmentMap[res.segment].revenue += res.revenue;
        segmentMap[res.segment].netRevenue += (res.revenue - comm);
        segmentMap[res.segment].commission += comm;
        segmentMap[res.segment].los += res.nights;
      }

      // Cross stats (only confirmed)
      if (!isCancelled) {
        if (!crossMap[res.channel]) crossMap[res.channel] = {};
        if (!crossMap[res.channel][res.segment]) crossMap[res.channel][res.segment] = 0;
        crossMap[res.channel][res.segment] += metric === 'revenue' ? res.revenue : res.rooms * res.nights;
      }
    });

    const channelList = Object.entries(channelMap).map(([name, s]) => ({
      name,
      rn: s.rn,
      revenue: s.revenue,
      netRevenue: s.netRevenue,
      commission: s.commission,
      adr: s.rn > 0 ? s.revenue / s.rn : 0,
      adrNet: s.rn > 0 ? s.netRevenue / s.rn : 0,
      share: totalRevenue > 0 ? (s.revenue / totalRevenue) * 100 : 0,
      shareNet: totalNetRevenue > 0 ? (s.netRevenue / totalNetRevenue) * 100 : 0,
      cancelRate: s.total > 0 ? (s.cancelled / s.total) * 100 : 0,
      los: s.total - s.cancelled > 0 ? s.los / (s.total - s.cancelled) : 0
    })).sort((a, b) => b.revenue - a.revenue);

    const segmentList = Object.entries(segmentMap).map(([name, s]) => ({
      name,
      rn: s.rn,
      revenue: s.revenue,
      netRevenue: s.netRevenue,
      commission: s.commission,
      adr: s.rn > 0 ? s.revenue / s.rn : 0,
      adrNet: s.rn > 0 ? s.netRevenue / s.rn : 0,
      share: totalRevenue > 0 ? (s.revenue / totalRevenue) * 100 : 0,
      shareNet: totalNetRevenue > 0 ? (s.netRevenue / totalNetRevenue) * 100 : 0,
      cancelRate: s.total > 0 ? (s.cancelled / s.total) * 100 : 0,
      los: s.total - s.cancelled > 0 ? s.los / (s.total - s.cancelled) : 0
    })).sort((a, b) => b.revenue - a.revenue);

    return {
      totalRN,
      totalRevenue,
      totalNetRevenue,
      totalCommission: totalRevenue - totalNetRevenue,
      totalCancelled,
      totalRes,
      cancelRate: totalRes > 0 ? (totalCancelled / totalRes) * 100 : 0,
      adr: totalRN > 0 ? totalRevenue / totalRN : 0,
      adrNet: totalRN > 0 ? totalNetRevenue / totalRN : 0,
      channelList,
      segmentList,
      crossMap,
      topChannel: channelList[0],
      topSegment: segmentList[0]
    };
  }, [filteredReservations, metric]);

  const chartData = mode === 'channel' ? stats.channelList : stats.segmentList;

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Canales & Segmentos</h1>
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md text-[10px] font-bold flex items-center gap-1">
              <Building2 size={10} />
              {activeProperty?.name}
            </span>
          </div>
          <p className="text-gray-500 text-sm">Análisis avanzado de producción, cancelaciones y rentabilidad neta</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
            <button 
              onClick={() => setMode('channel')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'channel' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              Canal
            </button>
            <button 
              onClick={() => setMode('segment')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'segment' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              Segmento
            </button>
            <button 
              onClick={() => setMode('both')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'both' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              Cruce
            </button>
            <button 
              onClick={() => setMode('cancellations')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'cancellations' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
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
              onChange={e => setDateRange({...dateRange, from: e.target.value})}
            />
            <span className="text-gray-300">—</span>
            <input 
              type="date" 
              className="text-xs font-bold outline-none bg-transparent"
              value={dateRange.to}
              onChange={e => setDateRange({...dateRange, to: e.target.value})}
            />
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <TrendingUp size={20} />
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Revenue Neto</span>
          </div>
          <p className="text-2xl font-black text-gray-900">{stats.totalNetRevenue.toLocaleString()}€</p>
          <p className="text-[10px] text-gray-400 font-bold mt-1">Bruto: {stats.totalRevenue.toLocaleString()}€</p>
        </div>

        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Users size={20} />
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ADR Neto</span>
          </div>
          <p className="text-2xl font-black text-gray-900">{stats.adrNet.toFixed(2)}€</p>
          <p className="text-[10px] text-gray-400 font-bold mt-1">Bruto: {stats.adr.toFixed(2)}€</p>
        </div>

        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <AlertCircle size={20} />
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Cancel Rate</span>
          </div>
          <p className="text-2xl font-black text-gray-900">{stats.cancelRate.toFixed(1)}%</p>
          <p className="text-[10px] text-gray-400 font-bold mt-1">{stats.totalCancelled} reservas perdidas</p>
        </div>

        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <Calendar size={20} />
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">LOS Medio</span>
          </div>
          <p className="text-2xl font-black text-gray-900">{(stats.totalRN / (stats.totalRes - stats.totalCancelled) || 0).toFixed(1)}</p>
          <p className="text-[10px] text-gray-400 font-bold mt-1">Noches por estancia</p>
        </div>

        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <PieIcon size={20} />
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Comisión Total</span>
          </div>
          <p className="text-2xl font-black text-gray-900">{stats.totalCommission.toLocaleString()}€</p>
          <p className="text-[10px] text-gray-400 font-bold mt-1">{(stats.totalCommission / stats.totalRevenue * 100 || 0).toFixed(1)}% sobre bruto</p>
        </div>
      </div>

      {mode === 'cancellations' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-8 flex items-center gap-2">
              <AlertCircle className="text-rose-500" />
              Cancel Rate por Canal
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.channelList}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} unit="%" />
                  <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="cancelRate" fill="#EF4444" radius={[8, 8, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-8 flex items-center gap-2">
              <PieIcon className="text-rose-500" />
              Distribución de Cancelaciones
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.channelList.filter(c => c.cancelRate > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="cancelRate"
                  >
                    {stats.channelList.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 700 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : mode !== 'both' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Main Chart: Gross vs Net */}
          <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <BarChart3 className="text-blue-600" />
                Revenue Bruto vs Neto por {mode === 'channel' ? 'Canal' : 'Segmento'}
              </h3>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                  <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 700 }} />
                  <Bar dataKey="revenue" name="Bruto" fill="#E2E8F0" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="netRevenue" name="Neto" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* LOS Chart */}
          <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <TrendingUp className="text-blue-600" />
                LOS Medio por {mode === 'channel' ? 'Canal' : 'Segmento'}
              </h3>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#F1F5F9" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} width={100} />
                  <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="los" name="LOS Medio" fill="#8B5CF6" radius={[0, 8, 8, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Detailed Table */}
          <div className="lg:col-span-2 bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <TableIcon className="text-blue-600" />
                Análisis de Rentabilidad por {mode === 'channel' ? 'Canal' : 'Segmento'}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-400 font-bold uppercase tracking-widest text-[10px]">
                  <tr>
                    <th className="px-6 py-4">{mode === 'channel' ? 'Canal' : 'Segmento'}</th>
                    <th className="px-4 py-4 text-right">RN</th>
                    <th className="px-4 py-4 text-right">LOS</th>
                    <th className="px-4 py-4 text-right">Rev. Bruto</th>
                    <th className="px-4 py-4 text-right">Comisión</th>
                    <th className="px-4 py-4 text-right">Rev. Neto</th>
                    <th className="px-4 py-4 text-right">ADR Neto</th>
                    <th className="px-6 py-4 text-right">Share Neto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {chartData.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                          <span className="font-bold text-gray-900">{row.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right font-medium text-gray-600">{row.rn}</td>
                      <td className="px-4 py-4 text-right font-medium text-gray-600">{row.los.toFixed(1)}</td>
                      <td className="px-4 py-4 text-right font-medium text-gray-400">{row.revenue.toLocaleString()}€</td>
                      <td className="px-4 py-4 text-right font-medium text-rose-500">-{row.commission.toLocaleString()}€</td>
                      <td className="px-4 py-4 text-right font-bold text-gray-900">{row.netRevenue.toLocaleString()}€</td>
                      <td className="px-4 py-4 text-right font-bold text-blue-600">{row.adrNet.toFixed(2)}€</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500" style={{ width: `${row.shareNet}%` }}></div>
                          </div>
                          <span className="font-bold text-gray-900 w-10">{row.shareNet.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Cross Table (Pivot) remains similar but with net revenue toggle if needed */
        <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-50 flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <TableIcon className="text-blue-600" />
              Matriz Canal vs Segmento (Confirmadas)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-gray-50 text-gray-400 font-bold uppercase tracking-widest text-[10px]">
                <tr>
                  <th className="px-6 py-4 border-r border-gray-100">Canal \ Segmento</th>
                  {stats.segmentList.map(s => (
                    <th key={s.name} className="px-4 py-4 text-center">{s.name}</th>
                  ))}
                  <th className="px-6 py-4 text-right bg-blue-50 text-blue-600">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stats.channelList.map(c => (
                  <tr key={c.name} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-gray-900 border-r border-gray-100 bg-gray-50/30">{c.name}</td>
                    {stats.segmentList.map(s => {
                      const val = stats.crossMap[c.name]?.[s.name] || 0;
                      return (
                        <td key={s.name} className="px-4 py-4 text-center font-medium text-gray-600">
                          {metric === 'revenue' ? `${val.toLocaleString()}€` : val}
                        </td>
                      );
                    })}
                    <td className="px-6 py-4 text-right font-black text-blue-700 bg-blue-50/30">
                      {metric === 'revenue' ? `${c.revenue.toLocaleString()}€` : c.rn}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChannelsSegments;