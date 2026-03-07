import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Clock, CalendarRange, TrendingUp } from 'lucide-react';

interface LOSLeadTimeProps {
  data: {
    avgLOS: number;
    avgLeadTime: number;
    leadTimeBySegment: { name: string, value: number }[];
    topChannelsLOS: { name: string, value: number }[];
  };
}

const LOSLeadTime: React.FC<LOSLeadTimeProps> = ({ data }) => {
  return (
    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-purple-50 p-2 rounded-xl text-purple-600">
          <Clock size={20} />
        </div>
        <h3 className="font-bold text-gray-900">LOS & Lead Time</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">LOS Medio Global</p>
              <h4 className="text-2xl font-black text-gray-900">{data.avgLOS.toFixed(1)} <span className="text-xs font-bold text-gray-400">noches</span></h4>
            </div>
            <div className="bg-white p-2 rounded-xl shadow-sm">
              <CalendarRange size={16} className="text-purple-600" />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Top Canales por LOS</p>
            {data.topChannelsLOS.map((c, i) => (
              <div key={i} className="flex justify-between items-center text-[10px] font-bold">
                <span className="text-gray-500">{c.name}</span>
                <span className="text-purple-600">{c.value.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Lead Time Medio</p>
              <h4 className="text-2xl font-black text-gray-900">{data.avgLeadTime.toFixed(0)} <span className="text-xs font-bold text-gray-400">días</span></h4>
            </div>
            <div className="bg-white p-2 rounded-xl shadow-sm">
              <TrendingUp size={16} className="text-emerald-600" />
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600">
            <TrendingUp size={12} />
            <span>+2.4 días vs LY</span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Lead Time por Segmento</p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.leadTimeBySegment}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 10, fontWeight: 'bold'}} />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 10}} />
              <Tooltip 
                formatter={(value: number) => `${value.toFixed(1)} días`}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#8B5CF6" fillOpacity={0.8} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default LOSLeadTime;