import React from 'react';
import { Calendar, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { EventRow } from '../../types';

interface PickupRow {
  date: string;
  roomsHoy: number;
  roomsHistory: number;
  pickup: number;
  adrHoy: number;
  revHoy: number;
  cancelRate: number;
  demandIndex: 'Verde' | 'Amarillo' | 'Rojo';
  event?: EventRow;
  action: string;
}

interface PickupPaceTableProps {
  data: PickupRow[];
}

const PickupPaceTable: React.FC<PickupPaceTableProps> = ({ data }) => {
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });
  };

  const getDemandColor = (index: string) => {
    if (index === 'Rojo') return 'bg-rose-500';
    if (index === 'Amarillo') return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-6 border-b border-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-blue-50 p-2 rounded-xl text-blue-600">
            <Calendar size={20} />
          </div>
          <h3 className="font-bold text-gray-900">Pickup / Pace Accionable</h3>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500" /> Baja
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-amber-500" /> Media
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-rose-500" /> Alta
          </div>
        </div>
      </div>

      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-gray-50 z-10">
            <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              <th className="px-6 py-4 border-b border-gray-100">Fecha Llegada</th>
              <th className="px-4 py-4 border-b border-gray-100 text-center">RN Hoy</th>
              <th className="px-4 py-4 border-b border-gray-100 text-center">RN -30d</th>
              <th className="px-4 py-4 border-b border-gray-100 text-center">Pickup</th>
              <th className="px-4 py-4 border-b border-gray-100 text-right">ADR</th>
              <th className="px-4 py-4 border-b border-gray-100 text-right">Rev Hoy</th>
              <th className="px-4 py-4 border-b border-gray-100 text-center">Cancel %</th>
              <th className="px-4 py-4 border-b border-gray-100 text-center">Demanda</th>
              <th className="px-4 py-4 border-b border-gray-100">Evento</th>
              <th className="px-6 py-4 border-b border-gray-100">Acción Recomendada</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50 transition-colors group">
                <td className="px-6 py-3 text-xs font-bold text-gray-900 whitespace-nowrap">
                  {formatDate(row.date)}
                </td>
                <td className="px-4 py-3 text-xs font-black text-gray-900 text-center">
                  {row.roomsHoy}
                </td>
                <td className="px-4 py-3 text-xs font-bold text-gray-400 text-center">
                  {row.roomsHistory}
                </td>
                <td className={`px-4 py-3 text-xs font-black text-center ${
                  row.pickup > 0 ? 'text-emerald-600' : row.pickup < 0 ? 'text-rose-600' : 'text-gray-400'
                }`}>
                  <div className="flex items-center justify-center gap-1">
                    {row.pickup > 0 && <TrendingUp size={12} />}
                    {row.pickup < 0 && <TrendingDown size={12} />}
                    {row.pickup > 0 ? `+${row.pickup}` : row.pickup}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs font-bold text-gray-900 text-right whitespace-nowrap">
                  {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(row.adrHoy)}
                </td>
                <td className="px-4 py-3 text-xs font-black text-blue-600 text-right whitespace-nowrap">
                  {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(row.revHoy)}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    row.cancelRate > 20 ? 'bg-rose-50 text-rose-600' : 'bg-gray-50 text-gray-500'
                  }`}>
                    {row.cancelRate.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className={`w-3 h-3 rounded-full mx-auto shadow-sm ${getDemandColor(row.demandIndex)}`} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {row.event ? (
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1 w-fit ${
                      row.event.impact === 'HIGH' ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'
                    }`}>
                      <Info size={10} />
                      {row.event.name}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-6 py-3">
                  <div className={`text-[10px] font-bold flex items-center gap-2 ${
                    row.action.includes('Subir') ? 'text-emerald-600' : 
                    row.action.includes('Revisar') ? 'text-amber-600' : 'text-gray-500'
                  }`}>
                    {row.action.includes('Subir') ? <TrendingUp size={14} /> : 
                     row.action.includes('Revisar') ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                    {row.action}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PickupPaceTable;