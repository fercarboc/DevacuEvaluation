import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KPIData {
  value: number;
  lyValue: number;
  label: string;
  type: 'percentage' | 'currency' | 'number';
  rooms?: number;
}

interface KPIGridProps {
  stats: {
    occ: KPIData;
    adr: KPIData;
    revpar: KPIData;
    revenue: KPIData;
    pace: KPIData;
  };
}

const KPICard: React.FC<{ data: KPIData }> = ({ data }) => {
  const diff = data.value - data.lyValue;
  const diffPct = data.lyValue > 0 ? (diff / data.lyValue) * 100 : 0;
  const isPositive = diff >= 0;

  const formatValue = (val: number, type: string) => {
    if (type === 'percentage') return `${val.toFixed(1)}%`;
    if (type === 'currency') return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);
    return val.toLocaleString();
  };

  return (
    <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
      <div className="flex justify-between items-start mb-2">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest group-hover:text-blue-600 transition-colors">{data.label}</p>
        <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
          isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
        }`}>
          {isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {Math.abs(diffPct).toFixed(1)}%
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <h3 className="text-2xl font-black text-gray-900">{formatValue(data.value, data.type)}</h3>
        {data.rooms !== undefined && (
          <span className="text-[10px] font-bold text-gray-400">({data.rooms} RN)</span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 h-1 bg-gray-50 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full ${isPositive ? 'bg-emerald-500' : 'bg-rose-500'}`}
            style={{ width: `${Math.min(100, (data.value / (data.lyValue || 1)) * 50)}%` }}
          />
        </div>
        <span className="text-[9px] font-bold text-gray-300 uppercase">vs LY</span>
      </div>
    </div>
  );
};

const KPIGrid: React.FC<KPIGridProps> = ({ stats }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <KPICard data={stats.occ} />
      <KPICard data={stats.adr} />
      <KPICard data={stats.revpar} />
      <KPICard data={stats.revenue} />
      <KPICard data={stats.pace} />
    </div>
  );
};

export default KPIGrid;