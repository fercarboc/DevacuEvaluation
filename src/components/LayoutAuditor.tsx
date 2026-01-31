
import React from 'react';
import { PlanTier, TabId } from '../auditor';
import { TABS } from '../constantsAuditor';
import { Lock, Hotel, Info } from 'lucide-react';

interface LayoutAuditorProps {
  children: React.ReactNode;
  currentPlan: PlanTier;
  onPlanChange: (plan: PlanTier) => void;
  activeTab: TabId;
  onTabChange: (tabId: TabId) => void;
  isTabAccessible: (minTier: PlanTier) => boolean;
}

const LayoutAuditor: React.FC<LayoutAuditorProps> = ({ 
  children, 
  currentPlan, 
  onPlanChange, 
  activeTab, 
  onTabChange, 
  isTabAccessible 
}) => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
            <Hotel size={24} />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight">Debacu <span className="text-indigo-600">Evaluation360</span></h1>
            <p className="text-xs text-slate-500 font-medium">Panel de Auditoría de Riesgo Interno</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-2 bg-slate-100 p-1 rounded-full border border-slate-200">
            {(Object.keys(PlanTier) as Array<keyof typeof PlanTier>).map((tier) => (
              <button
                key={tier}
                onClick={() => onPlanChange(PlanTier[tier])}
                className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${
                  currentPlan === tier 
                    ? 'bg-indigo-600 text-white shadow-sm' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tier}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 border-l border-slate-200 pl-6">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold">Gran Hotel Continental</p>
              <p className="text-xs text-indigo-600 font-bold tracking-wider">Plan {currentPlan}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center overflow-hidden">
               <img src="https://picsum.photos/seed/hotel/40/40" alt="Avatar" />
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white border-b border-slate-200 px-6 sticky top-[73px] z-40">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {TABS.map((tab) => {
            const accessible = isTabAccessible(tab.minTier);
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                disabled={!accessible}
                className={`flex items-center gap-2 px-4 py-4 text-sm font-medium transition-all relative border-b-2 whitespace-nowrap group ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600'
                    : accessible
                      ? 'border-transparent text-slate-500 hover:text-slate-800'
                      : 'border-transparent text-slate-300 cursor-not-allowed'
                }`}
              >
                {tab.icon}
                {tab.label}
                {!accessible && (
                  <div className="relative">
                    <Lock size={12} className="text-slate-300" />
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                      Disponible en plan {tab.minTier} o superior
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 p-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Info size={16} />
            <p>Debacu Evaluation360 es una herramienta privada de apoyo a decisiones operativas. No constituye un registro público ni una base oficial.</p>
          </div>
          <p className="text-slate-400 text-xs">© 2024 Debacu Technologies S.L. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
};

export default LayoutAuditor;
