
import React from 'react';
import { KPI } from '../auditor';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface DashboardAuditorProps {
  kpi: KPI;
}

const DashboardAuditor: React.FC<DashboardAuditorProps> = ({ kpi }) => {
  const isPositive = kpi.variation >= 0;

  const getBorderColor = () => {
    switch (kpi.type) {
      case 'risk-high': return 'border-l-red-500';
      case 'risk-medium': return 'border-l-amber-500';
      case 'risk-low': return 'border-l-green-500';
      default: return 'border-l-indigo-500';
    }
  };

  return (
    <div className={`bg-white p-6 rounded-xl border border-slate-200 border-l-4 ${getBorderColor()} shadow-sm hover:shadow-md transition-shadow`}>
      <p className="text-slate-500 text-sm font-medium mb-1">{kpi.label}</p>
      <div className="flex items-end justify-between">
        <h3 className="text-3xl font-bold text-slate-800">{kpi.value}</h3>
        <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${
          isPositive ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
        }`}>
          {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {Math.abs(kpi.variation)}%
        </div>
      </div>
      <p className="text-[10px] text-slate-400 mt-2 uppercase tracking-wider font-semibold">vs mes anterior</p>
    </div>
  );
};

export default DashboardAuditor;
