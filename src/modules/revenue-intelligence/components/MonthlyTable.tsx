import React from 'react';
import { MonthlyData } from '../types';

interface MonthlyTableProps {
  data: MonthlyData[];
}

const MonthlyTable: React.FC<MonthlyTableProps> = ({ data }) => {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-500 font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="px-6 py-4">Mes</th>
              <th className="px-6 py-4 text-right">OCC %</th>
              <th className="px-6 py-4 text-right">RN (Rooms)</th>
              <th className="px-6 py-4 text-right">ADR</th>
              <th className="px-6 py-4 text-right">Revenue</th>
              <th className="px-6 py-4 text-right">RevPAR</th>
              <th className="px-6 py-4 text-right">DIF vs LY</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 font-bold text-gray-900">{row.month}</td>
                <td className="px-6 py-4 text-right font-mono">{row.occ.toFixed(1)}%</td>
                <td className="px-6 py-4 text-right">{row.rn.toLocaleString()}</td>
                <td className="px-6 py-4 text-right">{row.adr.toFixed(2)}€</td>
                <td className="px-6 py-4 text-right font-bold text-gray-900">{row.revenue.toLocaleString()}€</td>
                <td className="px-6 py-4 text-right">{row.revpar.toFixed(2)}€</td>
                <td className={`px-6 py-4 text-right font-bold ${row.difVsLY >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {row.difVsLY >= 0 ? `+${row.difVsLY.toFixed(1)}%` : `${row.difVsLY.toFixed(1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MonthlyTable;
