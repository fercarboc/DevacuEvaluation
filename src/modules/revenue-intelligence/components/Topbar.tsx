import React, { useState } from 'react';
import { useRevenue } from '../context/RevenueContext';
import { useAuth } from '../context/AuthContext';
import { 
  Building2, 
  ChevronDown, 
  Bell, 
  User as UserIcon, 
  Search, 
  LogOut, 
  ShieldCheck, 
  Settings,
  CreditCard
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const Topbar: React.FC = () => {
  const { properties, activePropertyId, setActivePropertyId } = useRevenue();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  
  const activeProperty = properties.find(p => p.id === activePropertyId);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 px-8 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-8 flex-1">
        <div className="relative group">
          <button className="flex items-center gap-3 px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all border border-gray-100">
            <div className="bg-blue-600 p-1.5 rounded-lg text-white">
              <Building2 size={18} />
            </div>
            <div className="text-left">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Propiedad Activa</p>
              <p className="text-sm font-bold text-gray-900 leading-none">{activeProperty?.name || 'Seleccionar...'}</p>
            </div>
            <ChevronDown size={16} className="text-gray-400 ml-2" />
          </button>
          
          <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
            <div className="p-2">
              {properties.map(p => (
                <button
                  key={p.id}
                  onClick={() => setActivePropertyId(p.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                    activePropertyId === p.id ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50 text-gray-600'
                  }`}
                >
                  <Building2 size={16} />
                  <div className="text-left">
                    <p className="text-sm font-bold">{p.name}</p>
                    <p className="text-[10px] opacity-60">{p.city}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-md w-full relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar reservas, fechas, informes..."
            className="w-full bg-gray-50 border-none rounded-xl py-2.5 pl-12 pr-4 text-sm focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        {user?.role === 'ADMIN' && (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-600 rounded-full border border-rose-100">
            <ShieldCheck size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Admin</span>
          </div>
        )}

        <button className="p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-xl transition-all relative">
          <Bell size={20} />
          <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
        </button>
        <div className="h-8 w-px bg-gray-100 mx-2"></div>
        
        <div className="relative">
          <button 
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-3 pl-2 pr-1 py-1 hover:bg-gray-50 rounded-xl transition-all"
          >
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-gray-900 leading-none">{user?.fullName}</p>
              <p className="text-[10px] font-bold text-blue-600 uppercase mt-1">{user?.planCode} Plan</p>
            </div>
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-blue-100">
              <UserIcon size={20} />
            </div>
          </button>

          {isUserMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setIsUserMenuOpen(false)}></div>
              <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-3xl shadow-2xl border border-gray-100 py-3 z-20 animate-in fade-in slide-in-from-top-2">
                <div className="px-6 py-3 border-b border-gray-50 mb-2">
                  <p className="text-xs font-bold text-gray-900">{user?.fullName}</p>
                  <p className="text-[10px] text-gray-400 font-medium truncate">{user?.email}</p>
                </div>
                
                <div className="px-2 space-y-1">
                  <Link 
                    to="/account" 
                    className="flex items-center gap-3 p-3 rounded-2xl text-sm font-bold text-gray-600 hover:bg-gray-50 hover:text-blue-600 transition-all"
                    onClick={() => setIsUserMenuOpen(false)}
                  >
                    <UserIcon size={18} className="text-gray-400" />
                    Mi cuenta
                  </Link>
                  <Link 
                    to="/account" 
                    className="flex items-center gap-3 p-3 rounded-2xl text-sm font-bold text-gray-600 hover:bg-gray-50 hover:text-blue-600 transition-all"
                    onClick={() => setIsUserMenuOpen(false)}
                  >
                    <CreditCard size={18} className="text-gray-400" />
                    Planes y Facturación
                  </Link>
                  <button 
                    disabled
                    className="w-full flex items-center gap-3 p-3 rounded-2xl text-sm font-bold text-gray-300 cursor-not-allowed"
                  >
                    <Settings size={18} />
                    Ajustes
                  </button>
                </div>

                <div className="px-2 mt-2 pt-2 border-t border-gray-50">
                  <button 
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl text-sm font-bold text-rose-500 hover:bg-rose-50 transition-all"
                  >
                    <LogOut size={18} />
                    Cerrar sesión
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Topbar;