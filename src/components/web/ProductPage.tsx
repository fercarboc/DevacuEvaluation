import React from 'react';
import { motion } from 'motion/react';
import { 
  ChevronRight, 
  ShieldAlert, 
  TrendingUp, 
  Activity, 
  BrainCircuit, 
  CheckCircle2, 
  Database, 
  Cpu, 
  LayoutDashboard, 
  Zap,
  Hotel,
  Building2,
  Home,
  Trees,
  Users,
  ArrowRight,
  AlertCircle,
  Search,
  BarChart3
} from 'lucide-react';
import { cn } from '../lib/utils';
import { DashboardMockup } from './DashboardMockup';

const FeatureCard = ({ title, description, functions, icon }: { title: string, description: string, functions: string[], icon: React.ReactNode }) => (
  <div className="glass-card p-8 border-white/[0.05] bg-slate-950/50 flex flex-col h-full group hover:border-blue-500/30 transition-all">
    <div className="w-12 h-12 rounded-xl bg-blue-600/10 flex items-center justify-center mb-6 text-blue-500 group-hover:scale-110 transition-transform">
      {icon}
    </div>
    <h3 className="text-xl font-bold mb-4 text-white">{title}</h3>
    <p className="text-sm text-slate-400 mb-8 leading-relaxed">{description}</p>
    <div className="mt-auto space-y-3">
      {functions.map((f, i) => (
        <div key={i} className="flex items-center gap-3 text-xs text-slate-500">
          <div className="w-1 h-1 rounded-full bg-blue-500" />
          {f}
        </div>
      ))}
    </div>
  </div>
);

const Step = ({ number, title, description, icon }: { number: string, title: string, description: string, icon: React.ReactNode }) => (
  <div className="relative flex flex-col items-center text-center group">
    <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-white/10 flex items-center justify-center mb-6 text-blue-500 relative z-10 group-hover:border-blue-500/50 transition-all">
      {icon}
      <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-blue-600 text-[10px] font-bold text-white flex items-center justify-center border-2 border-[#020617]">
        {number}
      </div>
    </div>
    <h4 className="text-lg font-bold mb-2 text-white">{title}</h4>
    <p className="text-sm text-slate-500 max-w-[200px]">{description}</p>
  </div>
);

export const ProductPage = ({ setCurrentPage }: { setCurrentPage: (p: any) => void }) => {
  return (
    <div className="pt-20 min-h-screen bg-[#020617]">
      {/* Hero Section */}
      <section className="pt-20 pb-32 px-6 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-600/10 via-transparent to-transparent -z-10" />
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-bold tracking-tight mb-8 max-w-5xl mx-auto leading-[1.1] text-gradient">
              La plataforma de inteligencia operativa para hoteles
            </h1>
            <p className="text-lg md:text-xl text-slate-400 max-w-3xl mx-auto mb-12">
              Debacu analiza datos operativos y comerciales del hotel para detectar patrones, generar alertas y ayudar a tomar decisiones más inteligentes.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
              <button 
                onClick={() => setCurrentPage('request-access')}
                className="btn-primary text-lg px-8 py-4 w-full sm:w-auto"
              >
                Solicitar acceso <ChevronRight size={20} />
              </button>
              <button 
                onClick={() => setCurrentPage('technology')}
                className="btn-secondary text-lg px-8 py-4 w-full sm:w-auto"
              >
                Ver tecnología <ChevronRight size={20} />
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            <div className="absolute -inset-10 bg-blue-600/20 blur-[100px] rounded-full opacity-30 -z-10" />
            <DashboardMockup />
          </motion.div>
        </div>
      </section>

      {/* Sector Problem */}
      <section className="section-padding bg-slate-950/50 border-y border-white/[0.05]">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-5xl font-display font-bold mb-8 leading-tight">
                Los hoteles generan datos constantemente, pero rara vez los utilizan para tomar mejores decisiones
              </h2>
              <p className="text-slate-400 text-lg mb-8">
                Debacu transforma estos datos en inteligencia accionable, resolviendo los problemas estructurales de visibilidad en el sector hospitality.
              </p>
              <div className="space-y-4">
                {[
                  "Incidencias operativas que no se analizan",
                  "Falta de visibilidad sobre patrones de comportamiento",
                  "Fugas de revenue difíciles de detectar",
                  "Información dispersa entre sistemas"
                ].map((p, i) => (
                  <div key={i} className="flex items-center gap-3 text-slate-300">
                    <AlertCircle size={18} className="text-blue-500" />
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="glass-card p-8 border-blue-500/20 bg-blue-500/5">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center text-blue-500">
                    <Zap size={20} />
                  </div>
                  <h4 className="font-bold text-white">Solución Debacu</h4>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">
                  Nuestra plataforma centraliza, normaliza y analiza cada señal operativa para que el equipo de gestión pueda actuar de forma proactiva en lugar de reactiva.
                </p>
                <div className="h-32 bg-slate-900/50 rounded-lg border border-white/5 flex items-center justify-center overflow-hidden">
                  <div className="flex gap-2">
                    {[40, 70, 45, 90, 65, 80].map((h, i) => (
                      <motion.div 
                        key={i}
                        initial={{ height: 0 }}
                        whileInView={{ height: h }}
                        className="w-4 bg-blue-600/40 rounded-t-sm"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What Debacu Does */}
      <section className="section-padding">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-5xl font-display font-bold mb-6">Una plataforma diseñada para entender lo que ocurre en tu hotel</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">Cuatro pilares fundamentales para profesionalizar la gestión de tu alojamiento.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard 
              title="Evaluación de riesgo operativo"
              description="Debacu analiza incidencias y señales operativas para detectar patrones que afectan al funcionamiento del hotel."
              icon={<ShieldAlert size={24} />}
              functions={["Registro estructurado de incidencias", "Detección de patrones repetitivos", "Indicadores de riesgo operativo"]}
            />
            <FeatureCard 
              title="Revenue Intelligence"
              description="Debacu analiza datos comerciales del hotel para entender cómo se genera el revenue y detectar fugas."
              icon={<TrendingUp size={24} />}
              functions={["Producción por canal", "Comportamiento de reserva", "Evolución de ingresos"]}
            />
            <FeatureCard 
              title="Análisis de comportamiento"
              description="Debacu permite detectar patrones de comportamiento en los datos del hotel para anticipar necesidades."
              icon={<Activity size={24} />}
              functions={["Identificación de tendencias", "Detección de anomalías", "Análisis de actividad histórica"]}
            />
            <FeatureCard 
              title="Inteligencia artificial aplicada"
              description="La plataforma utiliza motores analíticos y agentes inteligentes para interpretar los datos del hotel automáticamente."
              icon={<BrainCircuit size={24} />}
              functions={["Detección automática de patrones", "Interpretación de tendencias", "Recomendaciones operativas"]}
            />
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="section-padding bg-slate-950/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-3xl font-display font-bold mb-4">Cómo funciona Debacu</h2>
            <p className="text-slate-500">Un proceso fluido desde la captura hasta la decisión.</p>
          </div>

          <div className="grid md:grid-cols-4 gap-12 relative">
            <div className="hidden md:block absolute top-8 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/20 to-transparent -z-0" />
            <Step 
              number="1"
              title="Captura de datos"
              description="El sistema recibe información desde PMS, exportaciones CSV y registros operativos."
              icon={<Database size={24} />}
            />
            <Step 
              number="2"
              title="Procesamiento"
              description="Los datos se normalizan y se estructuran en un modelo analítico coherente."
              icon={<Cpu size={24} />}
            />
            <Step 
              number="3"
              title="Análisis inteligente"
              description="Los motores analíticos detectan patrones y generan señales de valor."
              icon={<Zap size={24} />}
            />
            <Step 
              number="4"
              title="Visualización"
              description="El hotel visualiza dashboards, alertas y métricas clave para actuar."
              icon={<LayoutDashboard size={24} />}
            />
          </div>
        </div>
      </section>

      {/* Product Modules */}
      <section className="section-padding">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-3xl font-display font-bold mb-4">Módulos de la plataforma</h2>
            <p className="text-slate-500">Herramientas especializadas para cada área de gestión.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              { title: 'Risk Intelligence', desc: 'Sistema de análisis de señales operativas que permite detectar patrones de riesgo en la actividad del hotel.', icon: <ShieldAlert className="text-blue-500" /> },
              { title: 'Revenue Intelligence', desc: 'Panel analítico que permite entender la evolución del revenue del hotel y optimizar la distribución.', icon: <TrendingUp className="text-emerald-500" /> },
              { title: 'Behaviour Analysis', desc: 'Herramienta de análisis de comportamiento basada en datos históricos para predecir tendencias.', icon: <Activity className="text-violet-500" /> },
              { title: 'Data Intelligence', desc: 'Sistema encargado de procesar y estructurar los datos antes del análisis profundo.', icon: <Layers className="text-blue-400" /> }
            ].map((module, i) => (
              <div key={i} className="p-8 bg-white/[0.02] border border-white/[0.05] rounded-2xl flex gap-6 group hover:bg-white/[0.04] transition-all">
                <div className="w-12 h-12 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center shrink-0">
                  {module.icon}
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white mb-2">{module.title}</h4>
                  <p className="text-sm text-slate-500 leading-relaxed">{module.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dashboard Section */}
      <section className="section-padding bg-slate-950/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-display font-bold mb-6">Panel de inteligencia del hotel</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">Una visión clara y en tiempo real de lo que está ocurriendo en tu hotel para una gestión sin sorpresas.</p>
          </div>
          <div className="glass-card p-4 border-white/[0.05] overflow-hidden">
             <div className="aspect-video bg-slate-900 rounded-lg overflow-hidden relative group">
                <img 
                  src="https://picsum.photos/seed/dashboard/1600/900" 
                  alt="Dashboard Preview" 
                  className="w-full h-full object-cover opacity-50 group-hover:scale-105 transition-transform duration-700"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="grid grid-cols-2 gap-4 w-full max-w-2xl px-6">
                    <div className="p-4 bg-slate-950/80 backdrop-blur border border-white/10 rounded-xl">
                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Alertas Operativas</p>
                      <div className="space-y-2">
                        <div className="h-2 w-full bg-red-500/20 rounded-full" />
                        <div className="h-2 w-2/3 bg-orange-500/20 rounded-full" />
                      </div>
                    </div>
                    <div className="p-4 bg-slate-950/80 backdrop-blur border border-white/10 rounded-xl">
                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Revenue Index</p>
                      <div className="text-2xl font-bold text-emerald-500">+12.4%</div>
                    </div>
                  </div>
                </div>
             </div>
          </div>
        </div>
      </section>

      {/* For Whom */}
      <section className="section-padding">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-3xl font-display font-bold mb-4">Diseñado para hoteles que quieren operar con más inteligencia</h2>
            <p className="text-slate-500">Soluciones adaptadas a cada tipo de alojamiento.</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            {[
              { name: 'Hoteles independientes', icon: <Hotel size={24} /> },
              { name: 'Cadenas pequeñas', icon: <Building2 size={24} /> },
              { name: 'Apartamentos turísticos', icon: <Home size={24} /> },
              { name: 'Alojamientos rurales', icon: <Trees size={24} /> },
              { name: 'Grupos hoteleros', icon: <Users size={24} /> }
            ].map((segment, i) => (
              <div key={i} className="p-6 bg-white/[0.02] border border-white/[0.05] rounded-xl text-center flex flex-col items-center gap-4 hover:bg-white/[0.05] transition-all cursor-default">
                <div className="text-blue-500">{segment.icon}</div>
                <span className="text-xs font-bold text-slate-400 leading-tight">{segment.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="section-padding bg-blue-600/5">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-3xl font-display font-bold mb-4">Beneficios de utilizar Debacu</h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { title: 'Mejor control operativo', desc: 'Visibilidad total sobre incidencias y procesos internos.' },
              { title: 'Detección temprana', desc: 'Identifica problemas antes de que afecten a la experiencia del huésped.' },
              { title: 'Comprensión del revenue', desc: 'Análisis profundo de canales y comportamiento de reserva.' },
              { title: 'Decisiones con datos', desc: 'Elimina la intuición y basa tu estrategia en información real.' }
            ].map((benefit, i) => (
              <div key={i} className="flex gap-4">
                <CheckCircle2 className="text-blue-500 shrink-0" size={24} />
                <div>
                  <h4 className="font-bold text-white mb-2">{benefit.title}</h4>
                  <p className="text-sm text-slate-500">{benefit.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section-padding bg-gradient-to-b from-transparent to-blue-600/10">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-6xl font-display font-bold mb-8">Convierte los datos de tu hotel en decisiones inteligentes</h2>
          <p className="text-xl text-slate-400 mb-12">Únete a los hoteles que ya están profesionalizando su operativa con inteligencia artificial.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button 
              onClick={() => setCurrentPage('request-access')}
              className="btn-primary text-lg px-10 py-5 w-full sm:w-auto"
            >
              Solicitar acceso
            </button>
            <button 
              onClick={() => setCurrentPage('technology')}
              className="btn-secondary text-lg px-10 py-5 w-full sm:w-auto"
            >
              Explorar tecnología
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

const Layers = ({ className }: { className?: string }) => (
  <svg 
    width="24" 
    height="24" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
    <path d="m2.6 11.08 8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9" />
    <path d="m2.6 15.08 8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9" />
  </svg>
);
