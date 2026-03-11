import React from "react";
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
} from "recharts";
import {
  Bell,
  ChevronRight,
  ShieldAlert,
  TrendingUp,
  Search,
  Settings,
  LayoutDashboard,
  PieChart,
  Calendar,
  Layers,
  Zap,
} from "lucide-react";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const revenueData = [
  { name: "Jan", revenue: 65000, bookings: 420 },
  { name: "Feb", revenue: 59000, bookings: 380 },
  { name: "Mar", revenue: 80000, bookings: 510 },
  { name: "Apr", revenue: 81000, bookings: 520 },
  { name: "May", revenue: 95000, bookings: 610 },
  { name: "Jun", revenue: 110000, bookings: 720 },
  { name: "Jul", revenue: 125000, bookings: 840 },
];

export const DashboardMockup = () => {
  return (
    <div className="w-full max-w-6xl mx-auto rounded-2xl overflow-hidden shadow-2xl shadow-blue-900/30 border border-white/[0.12] bg-[#020617]/90 backdrop-blur-sm">
      <div className="flex h-[600px]">
        {/* Sidebar */}
        <div className="w-16 md:w-56 border-r border-white/[0.08] flex flex-col p-4 gap-6">
          <div className="flex items-center gap-3 px-2 mb-4">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
              <div className="w-4 h-4 bg-white rounded-sm" />
            </div>
            <span className="font-bold text-sm hidden md:block text-white">
              debacu
            </span>
          </div>

          <nav className="flex flex-col gap-1">
            {[
              {
                icon: <LayoutDashboard size={18} />,
                label: "Dashboard",
                active: true,
              },
              { icon: <TrendingUp size={18} />, label: "Revenue" },
              { icon: <ShieldAlert size={18} />, label: "Risk Panel" },
              { icon: <Calendar size={18} />, label: "Bookings" },
              { icon: <Layers size={18} />, label: "Inventory" },
              { icon: <PieChart size={18} />, label: "Analytics" },
            ].map((item, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer",
                  item.active
                    ? "bg-blue-600/10 text-blue-400"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                )}
              >
                {item.icon}
                <span className="text-sm font-medium hidden md:block">
                  {item.label}
                </span>
              </div>
            ))}
          </nav>

          <div className="mt-auto flex flex-col gap-1">
            <div className="flex items-center gap-3 px-3 py-2 text-slate-400 hover:bg-white/5 rounded-lg cursor-pointer">
              <Settings size={18} />
              <span className="text-sm font-medium hidden md:block">
                Settings
              </span>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="h-16 border-b border-white/[0.08] flex items-center justify-between px-6">
            <div className="flex items-center gap-4 flex-1">
              <div className="relative max-w-xs w-full hidden md:block">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  size={14}
                />
                <input
                  type="text"
                  placeholder="Search analytics..."
                  className="w-full bg-white/5 border border-white/10 rounded-full py-1.5 pl-9 pr-4 text-xs text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                  Live Analysis
                </span>
              </div>

              <Bell
                size={16}
                className="text-slate-400 cursor-pointer hover:text-white"
              />
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 border border-white/10" />
            </div>
          </header>

          {/* Scrollable dashboard content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* KPI Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                {
                  label: "Monthly Revenue",
                  value: "€125,430",
                  trend: "+14.2%",
                },
                {
                  label: "Avg. Daily Rate",
                  value: "€142.50",
                  trend: "+5.1%",
                },
                {
                  label: "RevPAR",
                  value: "€118.20",
                  trend: "+8.4%",
                },
                {
                  label: "Occupancy Rate",
                  value: "84.2%",
                  trend: "-2.1%",
                },
              ].map((kpi, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-white/[0.05] bg-white/[0.01] p-4"
                >
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    {kpi.label}
                  </p>
                  <div className="flex items-baseline justify-between">
                    <h4 className="text-xl font-bold text-white">{kpi.value}</h4>
                    <span
                      className={cn(
                        "text-[10px] font-bold",
                        kpi.trend.startsWith("+")
                          ? "text-emerald-400"
                          : "text-rose-400"
                      )}
                    >
                      {kpi.trend}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 rounded-2xl border border-white/[0.05] bg-white/[0.01] p-5">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    Revenue Performance
                  </h3>
                  <div className="flex gap-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-[10px] text-slate-500">
                        Revenue
                      </span>
                    </div>
                  </div>
                </div>

                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueData}>
                      <defs>
                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="5%"
                            stopColor="#3B82F6"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="#3B82F6"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>

                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.03)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#64748b", fontSize: 10 }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#64748b", fontSize: 10 }}
                        tickFormatter={(val) => `€${val / 1000}k`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0F172A",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "8px",
                          fontSize: "10px",
                          color: "#fff",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#3B82F6"
                        fillOpacity={1}
                        fill="url(#colorRev)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.05] bg-white/[0.01] p-5">
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-6">
                  Risk Indicators
                </h3>

                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldAlert size={14} className="text-rose-500" />
                      <span className="text-[10px] font-bold text-rose-500 uppercase">
                        Critical Risk
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Unusual cancellation spike in Segment B (OTA)
                    </p>
                  </div>

                  <div className="space-y-3">
                    {[
                      {
                        label: "Operational Alerts",
                        value: 12,
                        color: "bg-amber-500",
                      },
                      {
                        label: "Revenue Leakage",
                        value: 4,
                        color: "bg-rose-500",
                      },
                      {
                        label: "Guest Sentiment",
                        value: 94,
                        color: "bg-emerald-500",
                        isPercent: true,
                      },
                    ].map((item, i) => (
                      <div key={i}>
                        <div className="flex justify-between text-[10px] mb-1">
                          <span className="text-slate-400">{item.label}</span>
                          <span className="font-bold text-white">
                            {item.value}
                            {item.isPercent ? "%" : ""}
                          </span>
                        </div>
                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full", item.color)}
                            style={{
                              width: `${
                                item.isPercent
                                  ? item.value
                                  : (item.value / 20) * 100
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2">
                    <button className="inline-flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 font-semibold">
                      Ver detalle
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  title: "Risk Score",
                  value: "72 / 100",
                  subtitle: "Nivel de exposición actual",
                  icon: <ShieldAlert size={18} className="text-rose-400" />,
                },
                {
                  title: "Revenue Trend",
                  value: "+12.4%",
                  subtitle: "Evolución frente al periodo anterior",
                  icon: <TrendingUp size={18} className="text-emerald-400" />,
                },
                {
                  title: "Operational Search",
                  value: "Fast lookup",
                  subtitle: "Consulta rápida de señales y actividad",
                  icon: <Search size={18} className="text-blue-400" />,
                },
              ].map((card, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-white/[0.05] bg-white/[0.01] p-5"
                >
                  <div className="flex items-center gap-3 mb-3">
                    {card.icon}
                    <h4 className="text-sm font-semibold text-white">
                      {card.title}
                    </h4>
                  </div>
                  <div className="text-2xl font-bold text-white">{card.value}</div>
                  <p className="mt-1 text-xs text-slate-500">{card.subtitle}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};