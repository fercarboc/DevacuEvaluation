
import React from 'react';
import { PlanTier } from '../../auditor';
import { FileText, Table, AlertCircle, Download, CheckCircle2 } from 'lucide-react';

interface ExportsViewAuditorProps {
  currentPlan: PlanTier;
}

const ExportsViewAuditor: React.FC<ExportsViewAuditorProps> = ({ currentPlan }) => {
  const isPremium = currentPlan === PlanTier.PREMIUM;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-slate-800">Exportaciones</h2>
        <p className="text-slate-500">Descarga informes operativos para análisis externo o presentación interna.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center text-center space-y-6">
          <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center">
            <FileText size={40} />
          </div>
          <div>
            <h3 className="font-bold text-lg">Informe PDF</h3>
            <p className="text-sm text-slate-500 mt-2">Documento formateado con gráficos y conclusiones de riesgo para gerencia.</p>
          </div>
          <button className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center gap-2">
            <Download size={18} />
            Exportar PDF
          </button>
        </div>

        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center">
            <Table size={40} />
          </div>
          <div>
            <h3 className="font-bold text-lg">Datos Crudos (CSV/Excel)</h3>
            <p className="text-sm text-slate-500 mt-2">Listado completo de consultas para procesado en herramientas de BI externas.</p>
          </div>
          <button className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center gap-2">
            <Download size={18} />
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="bg-white p-8 rounded-2xl border border-slate-200 space-y-6">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <AlertCircle size={20} className="text-indigo-600" />
          Información Importante de Exportación
        </h3>
        <div className="space-y-4">
          <div className="flex gap-3">
             <div className="w-5 h-5 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center shrink-0 mt-0.5">
               <CheckCircle2 size={12} />
             </div>
             <p className="text-sm text-slate-600 leading-relaxed">
               El hotel es <span className="font-bold">exclusivamente responsable</span> del uso, custodia y eliminación segura de los datos una vez exportados del sistema Evaluation360.
             </p>
          </div>
          <div className="flex gap-3">
             <div className="w-5 h-5 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center shrink-0 mt-0.5">
               <CheckCircle2 size={12} />
             </div>
             <p className="text-sm text-slate-600 leading-relaxed">
               Las exportaciones generadas están marcadas con una marca de agua digital que vincula el archivo al usuario auditor autenticado para garantizar la trazabilidad interna.
             </p>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100">
           {isPremium ? (
             <p className="text-xs font-bold text-emerald-600 bg-emerald-50 p-3 rounded-lg text-center uppercase tracking-wide">
               Tu plan PREMIUM permite exportaciones ilimitadas e indicadores preparados para API.
             </p>
           ) : (
             <p className="text-xs font-bold text-indigo-600 bg-indigo-50 p-3 rounded-lg text-center uppercase tracking-wide">
               Plan MEDIUM: Límite de 10 exportaciones mensuales. Actualiza a PREMIUM para uso ilimitado.
             </p>
           )}
        </div>
      </div>
    </div>
  );
};

export default ExportsViewAuditor;
