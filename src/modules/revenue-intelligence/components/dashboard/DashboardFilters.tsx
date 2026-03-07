 import React from 'react';
import { Filter, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react';
import { DashboardPeriod } from '../../types';

interface DashboardFiltersProps {
  period: DashboardPeriod;
  setPeriod: (p: DashboardPeriod) => void;
  isNet: boolean;
  setIsNet: (v: boolean) => void;
  includeCancelled: boolean;
  setIncludeCancelled: (v: boolean) => void;
  includeNoShow: boolean;
  setIncludeNoShow: (v: boolean) => void;
  activePropertyName?: string;
}

const DashboardFilters: React.FC<DashboardFiltersProps> = ({
  period, setPeriod,
  isNet, setIsNet,
  includeCancelled, setIncludeCancelled,
  includeNoShow, setIncludeNoShow,
  activePropertyName
}) => {
  const periodLabels: Record<DashboardPeriod, string> = {
    MTD: 'MTD (Mes en curso)',
    LAST_30: 'Últimos 30 días',
    NEXT_30: 'Próximos 30 días',
    NEXT_90: 'Próximos 90 días',
    YTD: 'YTD (Año en curso)'
  };

  return (
    <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="bg-blue-50 p-2 rounded-xl text-blue-600">
            <Filter size={18} />
          </div>
          <div className="flex bg-gray-50 p-1 rounded-2xl border border-gray-100">
            {(['MTD', 'LAST_30', 'NEXT_30', 'NEXT_90', 'YTD'] as DashboardPeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  period === p ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Gross/Net Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Vista:</span>
            <button
              onClick={() => setIsNet(!isNet)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                isNet ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-blue-50 border-blue-100 text-blue-700'
              }`}
            >
              {isNet ? <Eye size={14} /> : <EyeOff size={14} />}
              {isNet ? 'Neto' : 'Bruto'}
            </button>
          </div>

          {/* Cancelled Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Canceladas:</span>
            <button
              onClick={() => setIncludeCancelled(!includeCancelled)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                includeCancelled ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-gray-50 border-gray-200 text-gray-400'
              }`}
            >
              {includeCancelled ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              {includeCancelled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* No-Show Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">No-Show:</span>
            <button
              onClick={() => setIncludeNoShow(!includeNoShow)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                includeNoShow ? 'bg-amber-50 border-amber-100 text-amber-700' : 'bg-gray-50 border-gray-200 text-gray-400'
              }`}
            >
              {includeNoShow ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              {includeNoShow ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-gray-50 flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest">
        <div className="flex items-center gap-4">
          <span>Hotel activo: <span className="text-gray-900">{activePropertyName}</span></span>
          <span>Periodo: <span className="text-gray-900">{periodLabels[period]}</span></span>
          <span>Vista: <span className={isNet ? 'text-emerald-600' : 'text-blue-600'}>{isNet ? 'NETO' : 'BRUTO'}</span></span>
        </div>
        <div className="flex items-center gap-4">
          <span>Canceladas: <span className={includeCancelled ? 'text-rose-600' : 'text-gray-400'}>{includeCancelled ? 'ON' : 'OFF'}</span></span>
          <span>No-show: <span className={includeNoShow ? 'text-amber-600' : 'text-gray-400'}>{includeNoShow ? 'ON' : 'OFF'}</span></span>
        </div>
      </div>
    </div>
  );
};

export default DashboardFilters;