import React, { useState } from 'react';
import { api } from './services/mockApi';
import { User } from './types';
import { Login } from './components/Login';
import { SearchRatings } from './components/SearchRatings';
import { RatingForm } from './components/RatingForm';
import { SubscriptionManager } from './components/SubscriptionManager';
import { Layout, Search, PlusCircle, CreditCard, LogOut, Menu } from 'lucide-react';

function App() {
  const [user, setUser] = useState<User | null>(api.getCurrentUser());
  const [currentView, setCurrentView] = useState<'search' | 'add' | 'subscription'>('search');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
    setCurrentView('search');
  };

  const handleLogout = async () => {
    await api.logout();
    setUser(null);
  };

  if (!user) {
    return <Login onLoginSuccess={handleLogin} />;
  }

  const NavItem = ({ view, icon: Icon, label }: { view: typeof currentView; icon: any; label: string }) => (
    <button
      onClick={() => {
        setCurrentView(view);
        setMobileMenuOpen(false);
      }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
        currentView === view 
          ? 'bg-indigo-50 text-indigo-700 font-medium' 
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <Icon className={`w-5 h-5 ${currentView === view ? 'text-indigo-600' : 'text-slate-400'}`} />
      {label}
    </button>
  );

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-2 text-indigo-700 font-bold text-xl leading-tight">
             <Layout className="w-8 h-8 flex-shrink-0" />
             <span>Debacu<br/>Evaluation360</span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Menú Principal
          </div>
          <NavItem view="search" icon={Search} label="Consultar" />
          <NavItem view="add" icon={PlusCircle} label="Añadir Valoración" />
          
          <div className="mt-8 px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Administración
          </div>
          <NavItem view="subscription" icon={CreditCard} label="Mi Cuenta & Plan" />
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50">
           <div className="flex items-center gap-3 mb-4 px-2">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                {user.username[0].toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-medium text-slate-900 truncate">{user.fullName}</p>
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
              </div>
           </div>
           <button 
             onClick={handleLogout}
             className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
           >
             <LogOut className="w-4 h-4" />
             Cerrar Sesión
           </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden bg-white border-b border-slate-200 p-4 flex justify-between items-center">
          <div className="font-bold text-indigo-700">Debacu Evaluation360</div>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-slate-600">
            <Menu className="w-6 h-6" />
          </button>
        </header>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute inset-0 z-50 bg-white p-4">
             <div className="flex justify-end mb-4">
               <button onClick={() => setMobileMenuOpen(false)}><LogOut className="w-6 h-6" /></button>
             </div>
             <div className="space-y-4">
                <NavItem view="search" icon={Search} label="Consultar" />
                <NavItem view="add" icon={PlusCircle} label="Añadir Valoración" />
                <NavItem view="subscription" icon={CreditCard} label="Mi Cuenta" />
                <hr />
                <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-red-600">Cerrar Sesión</button>
             </div>
          </div>
        )}

        {/* View Content */}
        <main className="flex-1 overflow-auto p-4 md:p-8">
          {currentView === 'search' && <SearchRatings currentUser={user} />}
          {currentView === 'add' && <RatingForm />}
          {currentView === 'subscription' && <SubscriptionManager user={user} onUserUpdate={setUser} />}
        </main>
      </div>
    </div>
  );
}

export default App;