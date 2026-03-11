import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  ArrowLeft, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  ShieldCheck,
  Activity,
  TrendingUp,
  Zap,
  LayoutDashboard
} from 'lucide-react';
import { cn } from '../lib/utils';

export const LoginPage = ({ onBack, onGoToRequest }: { onBack: () => void, onGoToRequest: () => void }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Login logic would go here
    alert('Funcionalidad de acceso en desarrollo. Por favor, solicita acceso si aún no lo tienes.');
  };

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col lg:flex-row">
      {/* Left Side: Login Form */}
      <div className="flex-1 flex flex-col justify-center px-6 py-20 lg:px-24">
        <div className="max-w-md w-full mx-auto">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors mb-12 group"
          >
            <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
            Volver
          </button>

          <div className="mb-10">
            <h1 className="text-4xl font-display font-bold text-white mb-4">Acceso a Debacu</h1>
            <p className="text-slate-400">
              Inicia sesión para acceder a tu entorno de análisis e inteligencia operativa.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Mail size={18} />
                </div>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-3 py-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors" 
                  placeholder="tu@email.com" 
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-500 uppercase">Contraseña</label>
                <button type="button" className="text-xs text-blue-500 hover:underline">¿Has olvidado tu contraseña?</button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Lock size={18} />
                </div>
                <input 
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-10 py-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors" 
                  placeholder="••••••••" 
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-white/10 bg-white/5 text-blue-600 focus:ring-0 focus:ring-offset-0" 
                />
                <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">Recordarme</span>
              </label>
            </div>

            <button type="submit" className="btn-primary w-full py-4 text-base">
              Iniciar sesión
            </button>
          </form>

          <div className="mt-10 text-center">
            <p className="text-sm text-slate-500">
              ¿Todavía no tienes acceso?{' '}
              <button 
                onClick={onGoToRequest}
                className="text-blue-500 font-bold hover:underline"
              >
                Solicitar acceso
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Right Side: Visual Content */}
      <div className="hidden lg:flex flex-1 bg-blue-600/5 border-l border-white/[0.05] relative overflow-hidden items-center justify-center p-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-600/10 via-transparent to-transparent" />
        
        <div className="max-w-md w-full relative z-10">
          <div className="mb-12">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-600/40 mb-8">
              <div className="w-8 h-8 bg-white rounded-md" />
            </div>
            <h2 className="text-4xl font-display font-bold text-white mb-6 leading-tight">Inteligencia operativa para hospitality</h2>
            <p className="text-slate-400 text-lg leading-relaxed">
              La plataforma líder en análisis de riesgo, revenue intelligence y toma de decisiones basada en datos para el sector hotelero.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: <ShieldCheck size={20} />, label: "Análisis de riesgo" },
              { icon: <TrendingUp size={20} />, label: "Revenue intelligence" },
              { icon: <Zap size={20} />, label: "Alertas operativas" },
              { icon: <LayoutDashboard size={20} />, label: "Decisiones con datos" }
            ].map((item, i) => (
              <div key={i} className="p-4 bg-white/[0.03] border border-white/[0.05] rounded-xl flex flex-col gap-3">
                <div className="text-blue-500">{item.icon}</div>
                <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">{item.label}</span>
              </div>
            ))}
          </div>

          {/* Mini Dashboard Preview */}
          <div className="mt-12 glass-card p-6 border-white/[0.05] bg-slate-950/50">
            <div className="flex items-center justify-between mb-6">
              <div className="h-2 w-24 bg-white/10 rounded-full" />
              <div className="h-2 w-12 bg-blue-500/40 rounded-full" />
            </div>
            <div className="space-y-3">
              <div className="h-1.5 w-full bg-white/5 rounded-full" />
              <div className="h-1.5 w-4/5 bg-white/5 rounded-full" />
              <div className="h-1.5 w-2/3 bg-white/5 rounded-full" />
            </div>
            <div className="mt-6 flex gap-2 items-end h-16">
              {[40, 70, 45, 90, 65, 80].map((h, i) => (
                <div key={i} style={{ height: `${h}%` }} className="flex-1 bg-blue-600/20 rounded-t-sm" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
