
import React from 'react';
import { PlanTier } from '../../auditor';
import { MOCK_KPIS } from '../../constantsAuditor';
import DashboardAuditor from '../components/DashboardAuditor';
import { ShieldCheck, ArrowRight, Zap } from 'lucide-react';

interface SummaryViewAuditorProps {
  currentPlan: PlanTier;
}

const SummaryViewAuditor: React.FC<SummaryViewAuditorProps> = ({ currentPlan }) => {
  const isFree = currentPlan === PlanTier.FREE;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Resumen de Operaciones</h2>
          <p className="text-slate-500">Vista general del desempeño y niveles de riesgo detectados.</p>
        </div>
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-lg text-indigo-700 text-sm font-medium">
          <ShieldCheck size={18} />
          <span>Cumplimiento Normativo Interno: <span className="font-bold">Activo</span></span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {MOCK_KPIS.map((kpi, idx) => (
          <DashboardAuditor key={idx} kpi={kpi} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-8 rounded-2xl border border-slate-200 relative overflow-hidden">
            <h3 className="text-lg font-bold mb-4">Aviso de Seguridad Operativa</h3>
            <p className="text-slate-600 text-sm leading-relaxed mb-6">
              Todos los datos mostrados son agregados para uso interno del hotel. Debacu Evaluation360 garantiza que no se incluye información personal identificable (PII) en esta vista de resumen general. Este panel sirve para la toma de decisiones estratégicas basadas en el riesgo operativo acumulado.
            </p>
            <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex items-start gap-3">
              <div className="bg-white p-2 rounded shadow-sm">
                 <ArrowRight size={16} className="text-indigo-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Última actualización</p>
                <p className="text-sm text-slate-500">Hace 12 minutos - Datos en tiempo real</p>
              </div>
            </div>
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-slate-50 rounded-full opacity-50 pointer-events-none" />
          </div>
        </div>

        <div className="lg:col-span-1">
          {isFree ? (
            <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-8 rounded-2xl text-white shadow-xl h-full flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-6">
                  <Zap size={24} className="text-white fill-current" />
                </div>
                <h3 className="text-xl font-bold mb-2">Desbloquea el análisis avanzado</h3>
                <p className="text-indigo-100 text-sm mb-6 leading-relaxed">
                  Las funciones avanzadas de auditoría, gráficos comparativos e históricos profundos solo están disponibles en planes de pago.
                </p>
              </div>
              <button className="w-full bg-white text-indigo-700 font-bold py-3 rounded-xl hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2">
                Ver Planes de Pago
                <ArrowRight size={18} />
              </button>
            </div>
          ) : (
            <div className="bg-white p-8 rounded-2xl border border-slate-200 h-full">
              <h3 className="text-lg font-bold mb-4">Estado del Sistema</h3>
              <ul className="space-y-4">
                {[
                  { label: 'Integridad de Datos', status: 'Excelente' },
                  { label: 'Auditoría en Curso', status: '82%' },
                  { label: 'Nivel de Alerta', status: 'Bajo' },
                ].map((item, i) => (
                  <li key={i} className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-500 text-sm">{item.label}</span>
                    <span className="text-slate-800 font-semibold text-sm">{item.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SummaryViewAuditor;
