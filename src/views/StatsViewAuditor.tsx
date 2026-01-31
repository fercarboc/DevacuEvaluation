
import React from 'react';
import { PlanTier } from '../../auditor';
import { STATS_DAILY_DATA } from '../../constantsAuditor';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CalendarRange, Activity } from 'lucide-react';

interface StatsViewAuditorProps {
  currentPlan: PlanTier;
}

const StatsViewAuditor: React.FC<StatsViewAuditorProps> = ({ currentPlan }) => {
  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Estadísticas Operativas</h2>
          <p className="text-slate-500">Métricas diarias y por tipo de motivo operacional.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="bg-white border border-slate-200 rounded-lg text-sm px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500">
            <option>Últimos 7 días</option>
            <option>Últimos 30 días</option>
            <option>Año actual</option>
          </select>
          <button className="p-2 bg-indigo-600 text-white rounded-lg shadow-md hover:bg-indigo-700 transition-colors">
            <CalendarRange size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200">
           <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-slate-800">Consultas diarias</h3>
            <div className="flex gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                <span className="text-[10px] font-bold text-slate-400">TOTAL</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <span className="text-[10px] font-bold text-slate-400">ALTO RIESGO</span>
              </div>
            </div>
          </div>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={STATS_DAILY_DATA}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
                <Area type="monotone" dataKey="highRisk" stroke="#ef4444" strokeWidth={2} fillOpacity={0} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Activity size={18} className="text-indigo-600" />
              Resumen de Actividad
            </h3>
            <div className="space-y-4">
              {[
                { label: 'Identificación', value: '342', color: 'bg-blue-500' },
                { label: 'Check-in Audit', value: '185', color: 'bg-emerald-500' },
                { label: 'Seguridad', value: '92', color: 'bg-orange-500' },
                { label: 'Otros', value: '45', color: 'bg-slate-400' },
              ].map((item, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-tight text-slate-500">
                    <span>{item.label}</span>
                    <span className="text-slate-800">{item.value}</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${item.color}`} 
                      style={{ width: `${(parseInt(item.value) / 500) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsViewAuditor;
