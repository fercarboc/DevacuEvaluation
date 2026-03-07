import React from 'react';
import { PickupData, EventRow } from '../types';

interface PickupTableProps {
  data: PickupData[];
  visibleColumns?: Record<string, boolean>;
  events?: EventRow[];
}

const PickupTable: React.FC<PickupTableProps> = ({ data, visibleColumns = {}, events = [] }) => {
  const getDemandColor = (index: string) => {
    switch (index) {
      case 'Verde': return 'bg-emerald-500';
      case 'Amarillo': return 'bg-amber-500';
      case 'Rojo': return 'bg-rose-500';
      default: return 'bg-gray-300';
    }
  };

  const getEventForDate = (date: string) => {
    return events.find(e => date >= e.startDate && date <= e.endDate);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto scrollbar-thin">
        <table className="w-full text-[10px] text-left border-collapse">
          <thead className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider text-[9px] sticky top-0 z-20 shadow-sm">
            <tr>
              <th className="px-4 py-3 sticky left-0 bg-gray-50 z-30 border-b border-gray-100">Fecha llegada</th>
              <th className="px-2 py-3 text-center border-b border-gray-100">Eventos</th>
              <th className="px-2 py-3 text-center border-b border-gray-100">Demanda</th>
              <th className="px-3 py-3 text-right border-b border-gray-100">OCC Hoy</th>
              <th className="px-3 py-3 text-right border-b border-gray-100">Rooms Hoy</th>
              {visibleColumns['Rooms Hist.'] !== false && <th className="px-3 py-3 text-right border-b border-gray-100">Rooms Hist.</th>}
              <th className="px-3 py-3 text-right border-b border-gray-100">Pickup</th>
              {visibleColumns['ADR Hoy'] !== false && <th className="px-3 py-3 text-right border-b border-gray-100">ADR Hoy</th>}
              <th className="px-3 py-3 text-right border-b border-gray-100">Rev. Hoy</th>
              {visibleColumns['Rev. Hist.'] !== false && <th className="px-3 py-3 text-right border-b border-gray-100">Rev. Hist.</th>}
              <th className="px-3 py-3 text-right border-b border-gray-100">Rev. Pickup</th>
              {visibleColumns['RevPAR'] === true && <th className="px-3 py-3 text-right border-b border-gray-100">RevPAR</th>}
              <th className="px-4 py-3 text-right border-b border-gray-100">Pace vs LY</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row, idx) => {
              const event = getEventForDate(row.arrivalDate);
              return (
                <tr key={idx} className="hover:bg-blue-50/30 transition-colors group">
                  <td className="px-4 py-2.5 font-bold text-gray-900 sticky left-0 bg-white group-hover:bg-gray-50 z-10 border-r border-gray-100">
                    {row.arrivalDate}
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    {event && (
                      <span 
                        className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-md text-[8px] font-bold uppercase tracking-tighter"
                        title={event.name}
                      >
                        {event.type}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <div className="flex justify-center">
                      <div 
                        className={`w-2 h-2 rounded-full shadow-sm ${getDemandColor(row.demandIndex)}`}
                        title={`Demanda: ${row.demandIndex}`}
                      ></div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-600">
                    {row.occToday.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium">{row.roomsToday}</td>
                  {visibleColumns['Rooms Hist.'] !== false && <td className="px-3 py-2.5 text-right text-gray-400">{row.roomsHistory}</td>}
                  <td className={`px-3 py-2.5 text-right font-bold ${row.pickup > 0 ? 'text-emerald-600' : row.pickup < 0 ? 'text-rose-600' : 'text-gray-300'}`}>
                    {row.pickup > 0 ? `+${row.pickup}` : row.pickup}
                  </td>
                  {visibleColumns['ADR Hoy'] !== false && <td className="px-3 py-2.5 text-right font-medium">{row.adrToday.toFixed(2)}€</td>}
                  <td className="px-3 py-2.5 text-right font-bold text-gray-900">{row.revenueToday.toLocaleString()}€</td>
                  {visibleColumns['Rev. Hist.'] !== false && <td className="px-3 py-2.5 text-right text-gray-400">{row.revenueHistory.toLocaleString()}€</td>}
                  <td className={`px-3 py-2.5 text-right font-bold ${row.revenuePickup > 0 ? 'text-emerald-600' : row.revenuePickup < 0 ? 'text-rose-600' : 'text-gray-300'}`}>
                    {row.revenuePickup > 0 ? `+${row.revenuePickup.toLocaleString()}` : row.revenuePickup.toLocaleString()}€
                  </td>
                  {visibleColumns['RevPAR'] === true && <td className="px-3 py-2.5 text-right text-gray-400">{(row.revenueToday / 18).toFixed(2)}€</td>}
                  <td className={`px-4 py-2.5 text-right font-bold ${row.paceVsLY >= 0 ? 'text-emerald-600' : row.paceVsLY >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {row.paceVsLY >= 0 ? `+${row.paceVsLY.toFixed(1)}%` : `${row.paceVsLY.toFixed(1)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-900 text-white font-bold sticky bottom-0 z-20">
            <tr>
              <td className="px-4 py-3 sticky left-0 bg-gray-900 z-10">TOTALES</td>
              <td></td>
              <td></td>
              <td className="px-3 py-3 text-right">
                {(data.reduce((acc, curr) => acc + curr.occToday, 0) / data.length).toFixed(1)}%
              </td>
              <td className="px-3 py-3 text-right">
                {data.reduce((acc, curr) => acc + curr.roomsToday, 0)}
              </td>
              {visibleColumns['Rooms Hist.'] !== false && (
                <td className="px-3 py-3 text-right opacity-50">
                  {data.reduce((acc, curr) => acc + curr.roomsHistory, 0)}
                </td>
              )}
              <td className="px-3 py-3 text-right text-emerald-400">
                +{data.reduce((acc, curr) => acc + curr.pickup, 0)}
              </td>
              {visibleColumns['ADR Hoy'] !== false && (
                <td className="px-3 py-3 text-right">
                  {(data.reduce((acc, curr) => acc + curr.adrToday, 0) / data.length).toFixed(2)}€
                </td>
              )}
              <td className="px-3 py-3 text-right">
                {data.reduce((acc, curr) => acc + curr.revenueToday, 0).toLocaleString()}€
              </td>
              {visibleColumns['Rev. Hist.'] !== false && (
                <td className="px-3 py-3 text-right opacity-50">
                  {data.reduce((acc, curr) => acc + curr.revenueHistory, 0).toLocaleString()}€
                </td>
              )}
              <td className="px-3 py-3 text-right text-emerald-400">
                +{data.reduce((acc, curr) => acc + curr.revenuePickup, 0).toLocaleString()}€
              </td>
              {visibleColumns['RevPAR'] === true && (
                <td className="px-3 py-3 text-right opacity-50">
                  {(data.reduce((acc, curr) => acc + curr.revenueToday, 0) / (data.length * 18)).toFixed(2)}€
                </td>
              )}
              <td className="px-4 py-3 text-right">
                {(data.reduce((acc, curr) => acc + curr.paceVsLY, 0) / data.length).toFixed(1)}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default PickupTable;