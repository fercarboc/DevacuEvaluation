
import React from 'react';
import { PlanTier } from '../../auditor';
import { CreditCard, ShieldCheck, HelpCircle, ExternalLink } from 'lucide-react';

interface ConfigViewAuditorProps {
  currentPlan: PlanTier;
}

const ConfigViewAuditor: React.FC<ConfigViewAuditorProps> = ({ currentPlan }) => {
  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Configuración y Avisos</h2>
        <p className="text-slate-500">Gestión de cuenta, plan contratado y preferencias de auditoría.</p>
      </div>

      <div className="grid gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-6 flex items-center justify-between border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <CreditCard size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Plan Actual</h3>
                <p className="text-xs text-slate-400">Próxima facturación: 01 Jun 2024</p>
              </div>
            </div>
            <span className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-bold rounded-full">{currentPlan}</span>
          </div>
          <div className="p-6 bg-slate-50/50">
            <p className="text-sm text-slate-600 mb-4">Las funciones disponibles en su panel de control dependen íntegramente del plan contratado actualmente.</p>
            <button className="text-indigo-600 font-bold text-sm flex items-center gap-1 hover:underline">
              Mejorar mi plan
              <ExternalLink size={14} />
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <ShieldCheck size={20} />
            </div>
            <h3 className="font-bold text-slate-800">Cumplimiento y Privacidad</h3>
          </div>
          <div className="space-y-4">
             <div className="p-4 bg-slate-50 rounded-xl space-y-2">
               <p className="text-sm font-bold text-slate-800">Responsabilidad Operativa</p>
               <p className="text-xs text-slate-500 leading-relaxed">
                 Debacu Evaluation360 procesa datos internos facilitados por el establecimiento. El usuario es responsable de asegurar que el uso de la herramienta cumple con sus políticas corporativas de privacidad y ética operativa.
               </p>
             </div>
             <div className="p-4 bg-slate-50 rounded-xl space-y-2">
               <p className="text-sm font-bold text-slate-800">Trazabilidad de Auditor</p>
               <p className="text-xs text-slate-500 leading-relaxed">
                 Todas las acciones realizadas en este panel están siendo registradas bajo el usuario auditor <span className="font-mono text-indigo-600 font-bold">@GH-ADMIN-MAY-24</span>.
               </p>
             </div>
          </div>
        </div>

        {currentPlan === PlanTier.PREMIUM && (
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-6 text-white shadow-lg">
             <div className="flex items-center justify-between">
                <div>
                   <h3 className="font-bold text-lg mb-1">Integración API</h3>
                   <p className="text-slate-400 text-sm">Disponible para conectar con su sistema PMS actual.</p>
                </div>
                <div className="px-3 py-1 bg-white/10 rounded border border-white/20 text-[10px] font-bold tracking-widest uppercase">
                  READY
                </div>
             </div>
             <div className="mt-4 p-3 bg-white/5 rounded-lg text-xs text-slate-300 italic border border-white/5">
                "API disponible bajo acuerdo independiente y configuración técnica asistida."
             </div>
          </div>
        )}

        <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group">
          <div className="flex items-center gap-3">
             <HelpCircle size={20} className="text-slate-400 group-hover:text-indigo-600 transition-colors" />
             <span className="text-sm font-medium text-slate-700">Centro de Ayuda y Documentación</span>
          </div>
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="18" 
            height="18" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className="text-slate-300"
          >
            <path d="m9 18 6-6-6-6"/>
          </svg>
        </div>
      </div>
    </div>
  );
};

export default ConfigViewAuditor;
