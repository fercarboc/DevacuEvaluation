
import React, { useState } from 'react';
import { PlanTier, HistoryEntry } from '../../auditor';
import { MOCK_HISTORY } from '../../constantsAuditor';
import { Search, ChevronLeft, ChevronRight, FileText, X, ShieldCheck, AlertCircle, Clock, User, Download, Info } from 'lucide-react';

interface HistoryViewAuditorProps {
  currentPlan: PlanTier;
}

const HistoryViewAuditor: React.FC<HistoryViewAuditorProps> = ({ currentPlan }) => {
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);

  const closeFicha = () => setSelectedEntry(null);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Histórico de Consultas</h2>
          <p className="text-slate-500">Trazabilidad operativa y auditoría interna.</p>
        </div>
        <div className="relative w-full md:w-64 shadow-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="ID o Usuario Auditor..." 
            className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-4 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                <th className="px-6 py-4">Fecha / Hora</th>
                <th className="px-6 py-4">Tipo de Consulta</th>
                <th className="px-6 py-4">Riesgo Detectado</th>
                <th className="px-6 py-4">Usuario Auditor</th>
                <th className="px-6 py-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MOCK_HISTORY.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap font-medium">{entry.date}</td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-800">{entry.type}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                      entry.risk === 'Alto' ? 'bg-red-50 text-red-700 border-red-100' :
                      entry.risk === 'Medio' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                      'bg-green-50 text-green-700 border-green-100'
                    }`}>
                      {entry.risk}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 font-medium italic">{entry.userRole}</td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => setSelectedEntry(entry)}
                      className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 text-[11px] font-bold uppercase ml-auto transition-all group-hover:translate-x-[-4px]"
                    >
                      <FileText size={14} />
                      Ver Ficha
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-tight">
            Trazabilidad Total: 1,248 registros
          </p>
          <div className="flex items-center gap-2">
            <button className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 transition-colors disabled:opacity-30">
              <ChevronLeft size={18} />
            </button>
            <div className="flex items-center gap-1">
              <button className="w-8 h-8 rounded-lg bg-indigo-600 text-white text-xs font-bold shadow-sm">1</button>
              <button className="w-8 h-8 rounded-lg hover:bg-slate-200 text-xs font-bold text-slate-600 transition-colors">2</button>
            </div>
            <button className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center gap-2">
        <Info size={14} className="text-slate-400" />
        <p className="text-[11px] text-slate-500 font-medium">
          El histórico completo y la descarga masiva dependen del plan contratado. Actualmente visualizando rango operativo estándar.
        </p>
      </div>

      {/* Modal: Ficha de Auditoría */}
      {selectedEntry && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-300">
          <div 
            className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-50 border-b border-slate-200 px-8 py-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center shadow-inner">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">Ficha Técnica</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Auditoría Evaluation360</p>
                </div>
              </div>
              <button 
                onClick={closeFicha}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-8 overflow-y-auto max-h-[70vh]">
              <div className={`p-5 rounded-2xl border flex items-center gap-4 shadow-sm ${
                selectedEntry.risk === 'Alto' ? 'bg-red-50 border-red-100 text-red-900' :
                selectedEntry.risk === 'Medio' ? 'bg-amber-50 border-amber-100 text-amber-900' :
                'bg-emerald-50 border-emerald-100 text-emerald-900'
              }`}>
                {selectedEntry.risk === 'Alto' ? <AlertCircle size={28} className="shrink-0" /> : <ShieldCheck size={28} className="shrink-0" />}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">Evaluación de Riesgo</p>
                  <p className="text-xl font-black">NIVEL {selectedEntry.risk.toUpperCase()}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-y-6 gap-x-12">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ID Operativo</p>
                  <p className="text-sm font-mono font-bold text-slate-800">EV360-{selectedEntry.id.padStart(6, '0')}</p>
                </div>
                <div className="space-y-1 text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Timestamp</p>
                  <div className="flex items-center justify-end gap-1.5 text-sm font-bold text-slate-800">
                    <Clock size={14} className="text-slate-400" />
                    <span>{selectedEntry.date}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tipo de Auditoría</p>
                  <p className="text-sm font-bold text-slate-800">{selectedEntry.type}</p>
                </div>
                <div className="space-y-1 text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Responsable</p>
                  <div className="flex items-center justify-end gap-1.5 text-sm font-bold text-slate-800">
                    <User size={14} className="text-slate-400" />
                    <span>{selectedEntry.userRole}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-6 border-t border-slate-100">
                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Análisis Operativo del Sistema</h4>
                <div className="bg-slate-50 p-5 rounded-2xl text-sm text-slate-600 leading-relaxed italic border border-slate-200/50 shadow-inner">
                  "El registro consultado presenta un patrón de recurrencia en la operativa de su hotel. No se identifica a la persona, sino el riesgo asociado a la acción. Recomendamos revisión de protocolos internos para: <span className="text-indigo-700 font-bold">{selectedEntry.type}</span>."
                </div>
              </div>

              <div className="flex items-center justify-between pt-6 border-t border-slate-100">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Validación de Trazabilidad</span>
                  <span className="text-[10px] font-mono text-slate-400 uppercase">SHA-256: 7d2a...f91c</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black uppercase border border-emerald-100">
                  <ShieldCheck size={12} />
                  Integridad OK
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border-t border-slate-200 px-8 py-5 flex items-center justify-between">
              <p className="text-[10px] text-slate-400 max-w-[240px] leading-tight font-medium">
                Documento de uso interno exclusivo. La marca de agua digital garantiza la autoría de @GH-ADMIN-MAY-24.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={closeFicha}
                  className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-all"
                >
                  Cerrar
                </button>
                <button className="px-5 py-2.5 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 flex items-center gap-2 transition-all transform hover:scale-105 active:scale-95">
                  <Download size={16} />
                  PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryViewAuditor;