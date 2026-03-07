import React, { useState } from 'react';
import { DailyData } from '../types';
import { Edit2 } from 'lucide-react';

interface DayTableProps {
  data: DailyData[];
}

const DayTable: React.FC<DayTableProps> = ({ data }) => {
  const [localData, setLocalData] = useState(data);

  const handlePvpChange = (idx: number, newVal: string) => {
    const val = parseFloat(newVal);
    if (isNaN(val)) return;
    const updated = [...localData];
    updated[idx] = { ...updated[idx], pvp: val };
    setLocalData(updated);
  };

  const getOccColor = (occ: number) => {
    if (occ > 85) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    if (occ < 50) return 'bg-rose-50 text-rose-700 border-rose-100';
    return 'bg-gray-50 text-gray-700 border-gray-100';
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-500 font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="px-6 py-4">Día</th>
              <th className="px-6 py-4">Fecha</th>
              <th className="px-6 py-4 text-center">OCC %</th>
              <th className="px-6 py-4 text-right">Oc (Rooms)</th>
              <th className="px-6 py-4 text-right">ADR</th>
              <th className="px-6 py-4 text-right">Revenue</th>
              <th className="px-6 py-4 text-right">PVP (Tarifa)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {localData.map((row, idx) => {
              const dateObj = new Date(row.date);
              const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'short' });
              
              return (
                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-400 uppercase text-xs">{dayName}</td>
                  <td className="px-6 py-4 font-medium text-gray-900">{row.date}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-3 py-1 rounded-full border text-xs font-bold ${getOccColor(row.occ)}`}>
                      {row.occ.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-semibold">{row.roomsSold}</td>
                  <td className="px-6 py-4 text-right">{row.adr.toFixed(2)}€</td>
                  <td className="px-6 py-4 text-right font-bold">{row.revenue.toLocaleString()}€</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 group">
                      <input
                        type="number"
                        value={row.pvp.toFixed(2)}
                        onChange={(e) => handlePvpChange(idx, e.target.value)}
                        className="w-20 text-right bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none font-semibold text-blue-600"
                      />
                      <Edit2 size={12} className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DayTable;