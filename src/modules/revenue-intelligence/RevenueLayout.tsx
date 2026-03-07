import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Calendar, BarChart3, TrendingUp, Settings, FileUp, FileText, CalendarDays, ShieldCheck, PieChart } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { RevenueProvider } from './context/RevenuePropertyContext';
import Topbar from './components/Topbar';

const Sidebar: React.FC = () => {
  const { user } = useAuth();
  
  const navItems = [
    { to: '/revenue/dashboard', icon: LayoutDashboard, label: 'Dashboard', minPlan: 'FREE' },
    { to: '/revenue/daily', icon: Calendar, label: 'Día x Día', minPlan: 'FREE' },
    { to: '/revenue/monthly', icon: TrendingUp, label: 'Mensual', minPlan: 'FREE' },
    { to: '/revenue/channels', icon: PieChart, label: 'Canales & Segmentos', minPlan: 'BASIC' },
    { to: '/revenue/pickup-advanced', icon: BarChart3, label: 'Pickup Avanzado', minPlan: 'BASIC' },
    { to: '/revenue/import', icon: FileUp, label: 'Importación', minPlan: 'BASIC' },
    { to: '/revenue/reports', icon: FileText, label: 'Informes', minPlan: 'MEDIUM' },
    { to: '/revenue/events', icon: CalendarDays, label: 'Eventos', minPlan: 'MEDIUM' },
    { to: '/revenue/settings-properties', icon: Settings, label: 'Propiedades', minPlan: 'FREE' },
  ];

  const planHierarchy = ['FREE', 'BASIC', 'MEDIUM', 'PREMIUM', 'ENTERPRISE'];
  const userPlanIndex = planHierarchy.indexOf(user?.planCode || 'FREE');

  const filteredNavItems = navItems.filter(item => {
    const itemMinPlanIndex = planHierarchy.indexOf(item.minPlan);
    return userPlanIndex >= itemMinPlanIndex;
  });

  return (
    <aside className="w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col z-50">
      <div className="h-16 flex items-center px-8 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">D</div>
          <span className="text-xl font-bold text-gray-900 tracking-tight">Debacu</span>
        </div>
      </div>
      <nav className="flex-1 px-4 py-6 overflow-y-auto">
        <ul className="space-y-1">
          {filteredNavItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center px-4 py-3 rounded-xl transition-all duration-200 group ${
                    isActive
                      ? 'bg-blue-50 text-blue-600 shadow-sm'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                  }`
                }
              >
                <item.icon className={`w-5 h-5 mr-3 transition-colors ${
                  'group-hover:text-blue-600'
                }`} />
                <span className="font-semibold text-sm">{item.label}</span>
              </NavLink>
            </li>
          ))}

          {user?.role === 'ADMIN' && (
            <li className="pt-4 mt-4 border-t border-gray-50">
              <div className="flex items-center px-4 py-3 rounded-xl text-gray-300 cursor-not-allowed group">
                <ShieldCheck className="w-5 h-5 mr-3" />
                <span className="font-semibold text-sm">Admin (próximamente)</span>
              </div>
            </li>
          )}
        </ul>
      </nav>
      <div className="p-4 border-t border-gray-100">
        <div className="bg-gray-50 p-4 rounded-xl space-y-3">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Suscripción</div>
          <div className="flex items-center justify-between">
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-[10px] font-black uppercase tracking-widest">
              {user?.planCode}
            </span>
            {user?.planCode === 'FREE' && (
              <span className="text-[10px] font-bold text-gray-400">Trial</span>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};

const RevenueLayout: React.FC = () => {
  return (
    <RevenueProvider>
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar />
          <main className="flex-1 overflow-x-hidden overflow-y-auto p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </RevenueProvider>
  );
};

export default RevenueLayout;
