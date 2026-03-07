import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { KPIStats } from '../types';

interface KPIcardProps {
  stats: KPIStats;
}

const KPIcard: React.FC<KPIcardProps> = ({ stats }) => {
  const diff = stats.value - stats.lastYearValue;
  const diffPercent = (diff / stats.lastYearValue) * 100;
  const isPositive = diff >= 0;

  const formatValue = (val: number) => {
    if (stats.type === 'percentage') return `${val.toFixed(1)}%`;
    if (stats.type === 'currency') return `${val.toLocaleString()}€`;
    return val.toLocaleString();
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
      <div className="text-sm font-medium text-gray-500 mb-2 uppercase tracking-wider">{stats.label}</div>
      <div className="flex items-end justify-between">
        <div className="text-3xl font-bold text-gray-900">{formatValue(stats.value)}</div>
        <div className={`flex items-center text-sm font-semibold ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
          {isPositive ? <ArrowUpRight size={16} className="mr-1" /> : <ArrowDownRight size={16} className="mr-1" />}
          {Math.abs(diffPercent).toFixed(1)}%
        </div>
      </div>
      <div className="mt-2 text-xs text-gray-400">vs año anterior</div>
    </div>
  );
};

export default KPIcard;
