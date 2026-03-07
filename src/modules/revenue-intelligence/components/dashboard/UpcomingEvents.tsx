import React from 'react';
import { Calendar, MapPin, AlertCircle, CheckCircle2, TrendingUp } from 'lucide-react';
import { EventType, EventImpact } from '../../types';

interface EventDisplay {
  id: string;
  name: string;
  type: EventType;
  startDate: string;
  endDate: string;
  impact: EventImpact;
  currentOcc: number;
  recommendation: string;
}

interface UpcomingEventsProps {
  events: EventDisplay[];
}

const UpcomingEvents: React.FC<UpcomingEventsProps> = ({ events }) => {
  const getImpactColor = (impact: EventImpact) => {
    if (impact === 'HIGH') return 'text-rose-600 bg-rose-50';
    if (impact === 'MEDIUM') return 'text-amber-600 bg-amber-50';
    return 'text-blue-600 bg-blue-50';
  };

  const formatDateRange = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    if (start === end) return s.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    return `${s.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} - ${e.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}`;
  };

  return (
    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-amber-50 p-2 rounded-xl text-amber-600">
          <Calendar size={20} />
        </div>
        <h3 className="font-bold text-gray-900">Eventos Próximos</h3>
      </div>

      <div className="space-y-4">
        {events.map((event) => (
          <div key={event.id} className="p-4 rounded-2xl border border-gray-50 hover:border-amber-100 transition-all group">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h4 className="text-sm font-black text-gray-900 group-hover:text-amber-600 transition-colors">{event.name}</h4>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{formatDateRange(event.startDate, event.endDate)}</p>
              </div>
              <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest ${getImpactColor(event.impact)}`}>
                Impacto {event.impact}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div className="bg-gray-50 p-2 rounded-xl">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Occ Libros</p>
                <p className="text-sm font-black text-gray-900">{event.currentOcc.toFixed(1)}%</p>
              </div>
              <div className="bg-gray-50 p-2 rounded-xl">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Tipo</p>
                <p className="text-sm font-black text-gray-900">{event.type}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[10px] font-bold text-blue-600 bg-blue-50/50 p-2 rounded-xl">
              <TrendingUp size={12} />
              <span>{event.recommendation}</span>
            </div>
          </div>
        ))}

        {events.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No hay eventos próximos</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default UpcomingEvents;
