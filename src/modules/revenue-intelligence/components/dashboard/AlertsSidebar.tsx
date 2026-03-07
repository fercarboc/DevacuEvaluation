import React, { useState } from 'react';
import { Bell, ChevronRight, ChevronDown, AlertCircle, Zap, ShieldAlert, TrendingDown, ArrowRight } from 'lucide-react';

interface Alert {
  id: string;
  type: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  message: string;
  action: string;
}

interface AlertsSidebarProps {
  alerts: Alert[];
}

const AlertsSidebar: React.FC<AlertsSidebarProps> = ({ alerts }) => {
  const [isOpen, setIsOpen] = useState(true);

  const getSeverityIcon = (severity: string) => {
    if (severity === 'HIGH') return <ShieldAlert size={16} className="text-rose-600" />;
    if (severity === 'MEDIUM') return <Zap size={16} className="text-amber-600" />;
    return <AlertCircle size={16} className="text-blue-600" />;
  };

  const getSeverityBg = (severity: string) => {
    if (severity === 'HIGH') return 'bg-rose-50 border-rose-100';
    if (severity === 'MEDIUM') return 'bg-amber-50 border-amber-100';
    return 'bg-blue-50 border-blue-100';
  };

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden h-fit">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-6 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="bg-rose-50 p-2 rounded-xl text-rose-600 relative">
            <Bell size={20} />
            {alerts.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-600 text-white text-[8px] font-black flex items-center justify-center rounded-full border-2 border-white">
                {alerts.length}
              </span>
            )}
          </div>
          <h3 className="font-bold text-gray-900">Alertas Automáticas</h3>
        </div>
        {isOpen ? <ChevronDown size={20} className="text-gray-400" /> : <ChevronRight size={20} className="text-gray-400" />}
      </button>

      {isOpen && (
        <div className="px-6 pb-6 space-y-4">
          {alerts.map((alert) => (
            <div key={alert.id} className={`p-4 rounded-2xl border ${getSeverityBg(alert.severity)} space-y-2`}>
              <div className="flex items-center gap-2">
                {getSeverityIcon(alert.severity)}
                <h4 className="text-xs font-black text-gray-900">{alert.title}</h4>
              </div>
              <p className="text-[11px] text-gray-600 font-medium leading-relaxed">
                {alert.message}
              </p>
              <button className="flex items-center gap-1 text-[10px] font-black text-gray-900 uppercase tracking-widest pt-2 hover:gap-2 transition-all">
                {alert.action}
                <ArrowRight size={12} />
              </button>
            </div>
          ))}

          {alerts.length === 0 && (
            <div className="py-4 text-center">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">No hay alertas activas</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AlertsSidebar;