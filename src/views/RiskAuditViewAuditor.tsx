
import React from 'react';
import { PlanTier } from '../../auditor';
import { RISK_DISTRIBUTION_DATA } from '../../constantsAuditor';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Filter, Calendar, AlertTriangle } from 'lucide-react';

interface RiskAuditViewAuditorProps {
  currentPlan: PlanTier;
}

const RiskAuditViewAuditor: React.FC<RiskAuditViewAuditorProps> = ({ currentPlan }) => {
  const isBasic = currentPlan === PlanTier.BASIC;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Auditoría de Riesgo Operativo</h2>
          <p className="text-slate-500">Análisis cualitativo y cuantitativo de las operaciones internas.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            <Calendar size={16} />
            Mayo 2024
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            <Filter size={16} />
            Filtros
          </button>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3 text-amber-800">
        <AlertTriangle size={20} className="shrink-0" />
        <p className="text-sm">
          <span className="font-bold">Nota legal:</span> Esta clasificación es puramente orientativa para uso operativo interno y no constituye un informe legal, policial ni una base de datos pública.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-slate-800">Distribución de Riesgo</h3>
            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">ESTE MES</span>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={RISK_DISTRIBUTION_DATA}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {RISK_DISTRIBUTION_DATA.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-slate-800">Comparativa Mensual</h3>
            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">EVOLUCIÓN</span>
          </div>
          <div className="h-[300px] w-full">
            {isBasic ? (
              <div className="h-full w-full flex flex-col items-center justify-center text-center p-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <p className="text-slate-500 font-medium mb-2">Gráfico comparativo bloqueado</p>
                <p className="text-xs text-slate-400 max-w-[200px]">Actualiza a plan <span className="text-indigo-600 font-bold underline">MEDIUM</span> para ver la comparativa vs mes anterior.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={RISK_DISTRIBUTION_DATA}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {RISK_DISTRIBUTION_DATA.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RiskAuditViewAuditor;
