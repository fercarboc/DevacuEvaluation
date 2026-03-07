import React from 'react';
import { PickupInsight } from '../types';
import { Lightbulb, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

interface PickupInsightsPanelProps {
  insights: PickupInsight[];
}

const PickupInsightsPanel: React.FC<PickupInsightsPanelProps> = ({ insights }) => {
  return (
    <div className="w-64 flex-shrink-0 space-y-3">
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-4">
          <div className="bg-amber-100 p-1.5 rounded-lg text-amber-600">
            <Lightbulb size={16} />
          </div>
          <h3 className="font-bold text-gray-900 text-sm">Insights</h3>
        </div>

        <div className="space-y-3">
          {insights.map((insight, idx) => (
            <div 
              key={idx} 
              className={`p-3 rounded-xl border ${
                insight.type === 'positive' ? 'bg-emerald-50 border-emerald-100' :
                insight.type === 'negative' ? 'bg-rose-50 border-rose-100' :
                'bg-blue-50 border-blue-100'
              }`}
            >
              <div className="flex items-start gap-2">
                <div className={`mt-0.5 ${
                  insight.type === 'positive' ? 'text-emerald-600' :
                  insight.type === 'negative' ? 'text-rose-600' :
                  'text-blue-600'
                }`}>
                  {insight.type === 'positive' ? <TrendingUp size={14} /> :
                   insight.type === 'negative' ? <TrendingDown size={14} /> :
                   <AlertCircle size={14} />}
                </div>
                <div>
                  <p className={`text-[11px] font-bold leading-tight ${
                    insight.type === 'positive' ? 'text-emerald-800' :
                    insight.type === 'negative' ? 'text-rose-800' :
                    'text-blue-800'
                  }`}>
                    {insight.message}
                  </p>
                  {insight.date && (
                    <span className="text-[9px] font-bold uppercase tracking-wider opacity-60 mt-1 block">
                      {insight.date}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-indigo-600 p-4 rounded-2xl shadow-lg text-white relative overflow-hidden">
        <div className="relative z-10">
          <h4 className="font-bold text-xs mb-1">Tarifa Sugerida</h4>
          <p className="text-indigo-100 text-[10px] mb-3">Próximo fin de semana</p>
          <div className="text-2xl font-bold">+8.5%</div>
        </div>
        <div className="absolute -right-2 -bottom-2 opacity-10">
          <TrendingUp size={60} />
        </div>
      </div>
    </div>
  );
};

export default PickupInsightsPanel;