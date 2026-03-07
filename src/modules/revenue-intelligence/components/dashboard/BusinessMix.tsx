import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { PieChart as PieIcon, BarChart3, Table as TableIcon } from 'lucide-react';

interface BusinessMixData {
  name: string;
  rn: number;
  grossRevenue: number;
  commission: number;
  netRevenue: number;
  adrNeto: number;
  cancelRate: number;
  noShowRate: number;
  revenue: number;
}

interface BusinessMixProps {
  data: BusinessMixData[];
  mode: 'channel' | 'segment';
  setMode: (m: 'channel' | 'segment') => void;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1'];

const BusinessMix: React.FC<BusinessMixProps> = ({ data, mode, setMode }) => {
  const formatCurrency = (val: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-50 p-2 rounded-xl text-emerald-600">
            <PieIcon size={20} />
          </div>
          <h3 className="font-bold text-gray-900">Mix de Negocio (Neto)</h3>
        </div>
        <div className="flex bg-gray-50 p-1 rounded-2xl border border-gray-100">
          <button
            onClick={() => setMode('channel')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              mode === 'channel' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            Canal
          </button>
          <button
            onClick={() => setMode('segment')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              mode === 'segment' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            Segmento
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Revenue Neto por {mode === 'channel' ? 'Canal' : 'Segmento'}</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 10, fontWeight: 'bold'}} />
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="netRevenue" radius={[0, 4, 4, 0]}>
                  {data.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cancel Rate por {mode === 'channel' ? 'Canal' : 'Segmento'}</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 10, fontWeight: 'bold'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 10}} unit="%" />
                <Tooltip 
                  formatter={(value: number) => `${value.toFixed(1)}%`}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="cancelRate" radius={[4, 4, 0, 0]}>
                  {data.map((_, index) => (
                    <Cell key={`cell-${index}`} fill="#EF4444" fillOpacity={0.6} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50">
              <th className="px-4 py-3">{mode === 'channel' ? 'Canal' : 'Segmento'}</th>
              <th className="px-4 py-3 text-center">RN</th>
              <th className="px-4 py-3 text-right">Rev Bruto</th>
              <th className="px-4 py-3 text-right">Comisión €</th>
              <th className="px-4 py-3 text-right">Rev Neto</th>
              <th className="px-4 py-3 text-right">ADR Neto</th>
              <th className="px-4 py-3 text-center">Cancel %</th>
              <th className="px-4 py-3 text-center">No-show %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-xs font-bold text-gray-900">{row.name}</td>
                <td className="px-4 py-3 text-xs font-bold text-center text-gray-600">{row.rn}</td>
                <td className="px-4 py-3 text-xs font-bold text-right text-gray-400">{formatCurrency(row.grossRevenue)}</td>
                <td className="px-4 py-3 text-xs font-bold text-right text-rose-400">{formatCurrency(row.commission)}</td>
                <td className="px-4 py-3 text-xs font-black text-right text-emerald-600">{formatCurrency(row.netRevenue)}</td>
                <td className="px-4 py-3 text-xs font-bold text-right text-gray-900">{formatCurrency(row.adrNeto)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${row.cancelRate > 15 ? 'bg-rose-50 text-rose-600' : 'bg-gray-50 text-gray-500'}`}>
                    {row.cancelRate.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="text-[10px] font-bold text-gray-400">{row.noShowRate.toFixed(1)}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BusinessMix;