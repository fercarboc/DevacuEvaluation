import React, { useMemo, useState } from "react";
import { useRevenueProperty } from "../context/RevenuePropertyContext";
import { useRevenueChannels } from "../hooks/useRevenueChannels";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import {
  TrendingUp,
  Users,
  Building2,
  Calendar,
  BarChart3,
  Loader2,
} from "lucide-react";

type ChannelsSegmentsProps = {
  orgId: string;
  properties?: Array<{
    id: string;
    name: string;
  }>;
};

const FALLBACK_PROPERTIES = [
  {
    id: "26bff2d1-2072-480f-a7c3-e90ea4373a8e",
    name: "DEMOHOTEL",
  },
  {
    id: "146a504b-e6fe-4c4f-8a84-40b24ff179c7",
    name: "HOTEL_4",
  },
];

const ChannelsSegments: React.FC<ChannelsSegmentsProps> = ({
  orgId,
  properties = FALLBACK_PROPERTIES,
}) => {
  const { propertyId, setPropertyId } = useRevenueProperty();

  const [dateRange, setDateRange] = useState({
    from: "2026-01-01",
    to: "2026-12-31",
  });

  const activeProperty = properties.find((p) => p.id === propertyId);

  const { data, loading, error } = useRevenueChannels(
    orgId,
    propertyId ?? "",
    dateRange.from,
    dateRange.to
  );

  const stats = useMemo(() => {
    const totalSales = data.reduce((acc, r) => acc + r.totalSales, 0);
    const totalRevenue = data.reduce((acc, r) => acc + r.totalRevenue, 0);
    const adr = totalSales > 0 ? totalRevenue / totalSales : 0;

    return {
      totalSales,
      totalRevenue,
      adr,
      topChannel: data[0]?.channel ?? "-",
    };
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Canales
            </h1>

            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md text-[10px] font-bold flex items-center gap-1">
              <Building2 size={10} />
              {activeProperty?.name ?? "Sin propiedad"}
            </span>
          </div>

          <p className="text-gray-500 text-sm">
            Producción de revenue por canal
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="bg-white px-3 py-2 rounded-xl border border-gray-200 shadow-sm text-sm font-medium"
            value={propertyId ?? ""}
            onChange={(e) => setPropertyId(e.target.value)}
          >
            <option value="">Selecciona propiedad</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-gray-200 shadow-sm">
            <Calendar size={16} className="text-gray-400" />

            <input
              type="date"
              className="text-xs font-bold outline-none bg-transparent"
              value={dateRange.from}
              onChange={(e) =>
                setDateRange({ ...dateRange, from: e.target.value })
              }
            />

            <span className="text-gray-300">—</span>

            <input
              type="date"
              className="text-xs font-bold outline-none bg-transparent"
              value={dateRange.to}
              onChange={(e) =>
                setDateRange({ ...dateRange, to: e.target.value })
              }
            />
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <TrendingUp size={20} />
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Revenue
            </span>
          </div>

          <p className="text-2xl font-black text-gray-900">
            {stats.totalRevenue.toLocaleString()}€
          </p>
        </div>

        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Users size={20} />
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Sales
            </span>
          </div>

          <p className="text-2xl font-black text-gray-900">
            {stats.totalSales}
          </p>
        </div>

        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <BarChart3 size={20} />
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              ADR
            </span>
          </div>

          <p className="text-2xl font-black text-gray-900">
            {stats.adr.toFixed(2)}€
          </p>
        </div>

        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Building2 size={20} />
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Top canal
            </span>
          </div>

          <p className="text-2xl font-black text-gray-900">
            {stats.topChannel}
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 mb-8 flex items-center gap-2">
          <BarChart3 className="text-blue-600" />
          Revenue por canal
        </h3>

        <div className="h-80">
          {!propertyId ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">
              Selecciona una propiedad
            </div>
          ) : loading ? (
            <div className="h-full flex items-center justify-center text-gray-400">
              <Loader2 className="animate-spin" />
            </div>
          ) : error ? (
            <div className="h-full flex items-center justify-center text-sm text-red-500">
              {error}
            </div>
          ) : data.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">
              Sin datos para este rango
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#F1F5F9"
                />
                <XAxis
                  dataKey="channel"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 700 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 700 }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "16px",
                    border: "none",
                    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                  }}
                />
                <Bar
                  dataKey="totalRevenue"
                  fill="#3B82F6"
                  radius={[8, 8, 0, 0]}
                  barSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-50">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="text-blue-600" />
            Resumen por canal
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-400 font-bold uppercase tracking-widest text-[10px]">
              <tr>
                <th className="px-6 py-4">Canal</th>
                <th className="px-4 py-4 text-right">Sales</th>
                <th className="px-4 py-4 text-right">Revenue</th>
                <th className="px-6 py-4 text-right">ADR</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {!propertyId ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-8 text-center text-gray-400"
                  >
                    Selecciona una propiedad
                  </td>
                </tr>
              ) : loading ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-8 text-center text-gray-400"
                  >
                    Cargando...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-8 text-center text-red-500"
                  >
                    {error}
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-8 text-center text-gray-400"
                  >
                    Sin datos para este rango
                  </td>
                </tr>
              ) : (
                data.map((row) => (
                  <tr key={row.channel} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-gray-900">
                      {row.channel}
                    </td>

                    <td className="px-4 py-4 text-right font-medium text-gray-600">
                      {row.totalSales}
                    </td>

                    <td className="px-4 py-4 text-right font-medium text-gray-900">
                      {row.totalRevenue.toLocaleString()}€
                    </td>

                    <td className="px-6 py-4 text-right font-bold text-blue-600">
                      {row.adr.toFixed(2)}€
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ChannelsSegments;