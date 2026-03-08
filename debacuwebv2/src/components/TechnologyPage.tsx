import React from 'react';
import { motion } from 'motion/react';
import { 
  Database, 
  Cpu, 
  BrainCircuit, 
  LayoutDashboard, 
  ArrowRight, 
  ShieldAlert, 
  TrendingUp, 
  Activity, 
  Layers, 
  Cloud, 
  Users, 
  Zap,
  Server,
  Network,
  Lock,
  Search,
  Bot
} from 'lucide-react';
import { cn } from '../lib/utils';

const TechDiagram = () => (
  <div className="relative w-full max-w-5xl mx-auto py-12 md:py-20 overflow-hidden">
    <div className="flex flex-col md:flex-row items-center justify-between gap-12 relative z-10">
      {/* Data Sources */}
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        className="flex flex-col gap-4 items-center"
      >
        <div className="glass-card p-4 border-blue-500/20 bg-blue-500/5 w-36 text-center shadow-lg shadow-blue-500/5">
          <Database className="mx-auto mb-2 text-blue-400" size={24} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300">Data Sources</span>
        </div>
        <div className="flex flex-col gap-2 w-full">
          {['PMS Systems', 'CSV Exports', 'Operational Data'].map((s) => (
            <div key={s} className="px-3 py-1.5 rounded bg-white/5 border border-white/10 text-[9px] text-slate-400 font-mono text-center">{s}</div>
          ))}
        </div>
      </motion.div>

      <div className="hidden md:flex flex-col items-center gap-2 text-slate-700">
        <div className="w-12 h-[1px] bg-gradient-to-r from-blue-500/50 to-transparent" />
        <ArrowRight size={16} />
      </div>

      {/* Processing */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        className="glass-card p-6 border-violet-500/20 bg-violet-500/5 w-56 text-center relative"
      >
        <div className="absolute -top-3 -right-3 w-8 h-8 bg-violet-600 rounded-full flex items-center justify-center shadow-lg shadow-violet-600/40 animate-pulse">
          <Zap size={14} className="text-white" />
        </div>
        <Cpu className="mx-auto mb-3 text-violet-400" size={36} />
        <h4 className="text-xs font-bold uppercase mb-3 text-violet-300 tracking-widest">Processing Layer</h4>
        <div className="space-y-2">
          <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              className="h-full bg-gradient-to-r from-violet-600 to-fuchsia-500" 
            />
          </div>
          <div className="flex justify-between text-[8px] font-mono text-slate-500">
            <span>NORMALIZING</span>
            <span>74%</span>
          </div>
        </div>
      </motion.div>

      <div className="hidden md:flex flex-col items-center gap-2 text-slate-700">
        <div className="w-12 h-[1px] bg-gradient-to-r from-violet-500/50 to-transparent" />
        <ArrowRight size={16} />
      </div>

      {/* AI Engines */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        className="flex flex-col gap-4 items-center"
      >
        <div className="glass-card p-6 border-emerald-500/20 bg-emerald-500/5 w-56 text-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <BrainCircuit className="mx-auto mb-3 text-emerald-400" size={36} />
          <h4 className="text-xs font-bold uppercase mb-3 text-emerald-300 tracking-widest">AI Engines</h4>
          <div className="grid grid-cols-4 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <motion.div 
                key={i}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, delay: i * 0.2, repeat: Infinity }}
                className="w-full h-2 bg-emerald-500/30 rounded-sm" 
              />
            ))}
          </div>
        </div>
      </motion.div>

      <div className="hidden md:flex flex-col items-center gap-2 text-slate-700">
        <div className="w-12 h-[1px] bg-gradient-to-r from-emerald-500/50 to-transparent" />
        <ArrowRight size={16} />
      </div>

      {/* Dashboards */}
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        whileInView={{ opacity: 1, x: 0 }}
        className="glass-card p-4 border-blue-500/20 bg-blue-500/5 w-36 text-center"
      >
        <LayoutDashboard className="mx-auto mb-2 text-blue-400" size={24} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300">Dashboards</span>
        <div className="mt-3 flex justify-center gap-1">
          <div className="w-1 h-3 bg-blue-500/40 rounded-full" />
          <div className="w-1 h-5 bg-blue-500/60 rounded-full" />
          <div className="w-1 h-4 bg-blue-500/40 rounded-full" />
        </div>
      </motion.div>
    </div>

    {/* Connecting Lines (Background) */}
    <svg className="absolute inset-0 w-full h-full -z-10 opacity-30" preserveAspectRatio="none">
      <defs>
        <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="50%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
      </defs>
      <path 
        d="M 150 150 L 850 150" 
        stroke="url(#lineGrad)" 
        strokeWidth="1" 
        fill="none" 
        strokeDasharray="10,10"
        className="animate-[dash_20s_linear_infinite]"
      />
    </svg>
  </div>
);

export const TechnologyPage = ({ setCurrentPage }: { setCurrentPage: (p: any) => void }) => {
  return (
    <div className="pt-20">
      {/* Hero Section */}
      <section className="section-padding relative overflow-hidden">
        <div className="max-w-7xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-widest mb-8">
              <Cpu size={12} />
              Engineering & AI
            </div>
            <h1 className="text-4xl md:text-6xl font-display font-bold mb-8 text-gradient">
              Debacu AI — Inteligencia aplicada a la operativa hotelera
            </h1>
            <p className="text-lg md:text-xl text-slate-400 max-w-3xl mx-auto mb-12">
              Debacu integra análisis de datos, motores analíticos y agentes inteligentes para transformar información operativa en decisiones accionables para el hotel.
            </p>
          </motion.div>
          
          <TechDiagram />
        </div>
      </section>

      {/* Architecture Section */}
      <section className="section-padding bg-slate-950/50">
        <div className="max-w-7xl mx-auto">
          <div className="mb-16">
            <h2 className="text-3xl md:text-5xl font-display font-bold mb-6">Arquitectura tecnológica de Debacu</h2>
            <p className="text-slate-400 max-w-2xl">Diseñada para la escalabilidad, precisión y procesamiento en tiempo real de datos complejos del sector hospitality.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                icon: <Database className="text-blue-500" />,
                title: "Data ingestion layer",
                desc: "Captura de datos desde sistemas PMS, exportaciones CSV, incidencias operativas y datos de reservas. Los datos se normalizan y se almacenan en un modelo analítico diseñado para hospitality."
              },
              {
                icon: <Cpu className="text-violet-500" />,
                title: "Data processing layer",
                desc: "Procesamiento mediante normalización de datos, clasificación de eventos y generación de métricas operativas. Correlación entre diferentes fuentes para crear una base de conocimiento estructurada."
              },
              {
                icon: <BrainCircuit className="text-emerald-500" />,
                title: "Intelligence layer",
                desc: "Motores analíticos para detección de patrones, clasificación de señales, análisis de comportamiento y revenue. Generación automática de indicadores y alertas operativas críticas."
              },
              {
                icon: <LayoutDashboard className="text-blue-400" />,
                title: "Visualization layer",
                desc: "Presentación de resultados en dashboards interactivos, alertas en tiempo real, paneles de inteligencia y recomendaciones operativas basadas en datos."
              }
            ].map((layer, i) => (
              <div key={i} className="glass-card p-6 border-white/[0.05] relative group">
                <div className="absolute top-0 left-0 w-1 h-0 bg-blue-600 group-hover:h-full transition-all duration-300" />
                <div className="w-12 h-12 rounded-xl bg-white/[0.03] flex items-center justify-center mb-6">
                  {layer.icon}
                </div>
                <h3 className="text-lg font-bold mb-4">{layer.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{layer.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Debacu AI Section */}
      <section className="section-padding">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-5xl font-display font-bold mb-8">Debacu AI — Motor de inteligencia de la plataforma</h2>
              <p className="text-slate-400 text-lg mb-8">
                Debacu AI es la capa de inteligencia que analiza datos operativos y comerciales del hotel para detectar patrones, identificar anomalías y generar recomendaciones.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: <Activity size={16} />, label: "Modelos analíticos" },
                  { icon: <Lock size={16} />, label: "Reglas de clasificación" },
                  { icon: <TrendingUp size={16} />, label: "Análisis estadístico" },
                  { icon: <Users size={16} />, label: "Asistentes inteligentes" }
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                    <div className="text-blue-500">{item.icon}</div>
                    <span className="text-xs font-medium text-slate-300">{item.label}</span>
                  </div>
                ))}
              </div>
              <p className="mt-8 text-slate-500 text-sm italic">
                El objetivo es convertir datos dispersos en señales operativas útiles para la toma de decisiones estratégicas.
              </p>
            </motion.div>
            <div className="relative">
              <div className="absolute -inset-4 bg-blue-600/10 blur-3xl rounded-full" />
              <div className="glass-card p-8 border-white/[0.05] bg-slate-950/50 relative">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <div className="w-2 h-2 rounded-full bg-yellow-500" />
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                  </div>
                  <span className="text-[10px] font-mono text-slate-600">AI_ENGINE_CORE_V2.4</span>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-xs text-blue-400 font-mono">
                    <span className="opacity-50">01</span>
                    <span>INITIALIZING_NEURAL_LAYERS...</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-emerald-400 font-mono">
                    <span className="opacity-50">02</span>
                    <span>PATTERN_RECOGNITION_ACTIVE [98.4%]</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                    <span className="opacity-50">03</span>
                    <span>ANOMALY_DETECTION: NO_THREATS_FOUND</span>
                  </div>
                  <div className="h-24 w-full bg-white/[0.02] rounded border border-white/[0.05] flex items-end p-2 gap-1">
                    {[30, 60, 45, 80, 55, 90, 70, 40, 85].map((h, i) => (
                      <motion.div 
                        key={i} 
                        initial={{ height: 0 }}
                        animate={{ height: `${h}%` }}
                        transition={{ delay: i * 0.1, repeat: Infinity, repeatType: 'reverse', duration: 2 }}
                        className="flex-1 bg-blue-500/30 rounded-t-[1px]" 
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Intelligence Engines */}
      <section className="section-padding bg-slate-950/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-display font-bold mb-4">Motores de Inteligencia</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">Cuatro motores especializados trabajando en paralelo para una visión 360º de tu hotel.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                icon: <ShieldAlert className="text-rose-500" />,
                title: "Risk Intelligence Engine",
                desc: "Motor especializado en evaluar señales operativas relacionadas con la actividad del hotel. Análisis de incidencias, detección de patrones repetitivos y generación de indicadores de riesgo preventivos.",
                features: ["Prevención operativa", "Control de calidad", "Detección de fraude"]
              },
              {
                icon: <TrendingUp className="text-blue-500" />,
                title: "Revenue Intelligence Engine",
                desc: "Motor analítico centrado en el rendimiento comercial. Analiza producción por canal, comportamiento de reserva y evolución de ingresos para detectar oportunidades de optimización.",
                features: ["Channel mix optimization", "Booking behavior", "Revenue leakage detection"]
              },
              {
                icon: <Activity className="text-emerald-500" />,
                title: "Behaviour Analysis Engine",
                desc: "Motor de análisis de comportamiento basado en datos históricos. Permite identificar tendencias recurrentes y señales relevantes que ayudan a comprender el funcionamiento real del hotel.",
                features: ["Guest profiling", "Seasonal trends", "Pattern recognition"]
              },
              {
                icon: <Layers className="text-violet-500" />,
                title: "Data Intelligence Engine",
                desc: "Motor encargado de procesar y estructurar los datos de entrada. Normalización de métricas, estructuración de información y preparación de datos para el análisis profundo.",
                features: ["Data cleansing", "Metric normalization", "API integration"]
              }
            ].map((engine, i) => (
              <div key={i} className="glass-card p-8 border-white/[0.05] glass-card-hover">
                <div className="flex items-start gap-6">
                  <div className="w-14 h-14 rounded-2xl bg-white/[0.03] flex items-center justify-center shrink-0">
                    {engine.icon}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-4">{engine.title}</h3>
                    <p className="text-slate-400 text-sm leading-relaxed mb-6">{engine.desc}</p>
                    <div className="flex flex-wrap gap-2">
                      {engine.features.map((f) => (
                        <span key={f} className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 py-1 bg-white/[0.03] rounded border border-white/[0.05]">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Agents Section */}
      <section className="section-padding">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="order-2 lg:order-1 grid grid-cols-1 gap-4">
              {[
                { 
                  name: "Risk Analysis Agent", 
                  icon: <ShieldAlert size={18} />, 
                  desc: "Analiza señales operativas y patrones de incidencias.",
                  status: "Active"
                },
                { 
                  name: "Revenue Analysis Agent", 
                  icon: <TrendingUp size={18} />, 
                  desc: "Evalúa tendencias de ingresos y desviaciones comerciales.",
                  status: "Monitoring"
                },
                { 
                  name: "Operational Insight Agent", 
                  icon: <Zap size={18} />, 
                  desc: "Detecta mejoras posibles en procesos internos.",
                  status: "Active"
                }
              ].map((agent, i) => (
                <div key={i} className="glass-card p-6 border-white/[0.05] flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-600/10 flex items-center justify-center text-blue-500">
                      {agent.icon}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">{agent.name}</h4>
                      <p className="text-xs text-slate-500">{agent.desc}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase">{agent.status}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-widest mb-8">
                <Bot size={12} />
                AI Agents
              </div>
              <h2 className="text-3xl md:text-5xl font-display font-bold mb-8">Agentes inteligentes de Debacu</h2>
              <p className="text-slate-400 text-lg mb-8">
                Debacu incorpora agentes inteligentes que ayudan a interpretar la información y generar análisis automatizados. No sustituyen al hotelero, sino que proporcionan asistencia inteligente basada en datos.
              </p>
              <ul className="space-y-4">
                {[
                  "Analizar métricas operativas automáticamente",
                  "Detectar anomalías en tiempo real",
                  "Interpretar tendencias complejas",
                  "Sugerir posibles acciones preventivas"
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-300">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center">
                      <CheckCircle2 size={12} className="text-emerald-500" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Scalability & SaaS */}
      <section className="section-padding bg-slate-950/30">
        <div className="max-w-7xl mx-auto">
          <div className="glass-card p-12 border-white/[0.05] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[100px] rounded-full -z-10" />
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl md:text-4xl font-display font-bold mb-6">Arquitectura SaaS escalable</h2>
                <p className="text-slate-400 mb-8">
                  Debacu se desarrolla como una plataforma SaaS multiempresa diseñada para escalar a múltiples alojamientos con máxima eficiencia y seguridad.
                </p>
                <div className="grid grid-cols-2 gap-6">
                  {[
                    { icon: <Cloud size={20} />, label: "Cloud Native" },
                    { icon: <Lock size={20} />, label: "Multi-tenant Isolation" },
                    { icon: <Server size={20} />, label: "Efficient Processing" },
                    { icon: <Network size={20} />, label: "Continuous Updates" }
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="text-blue-500">{item.icon}</div>
                      <span className="text-sm font-medium text-slate-300">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-center">
                <div className="relative w-48 h-48">
                  <div className="absolute inset-0 border-2 border-dashed border-blue-500/20 rounded-full animate-[spin_20s_linear_infinite]" />
                  <div className="absolute inset-4 border-2 border-dashed border-violet-500/20 rounded-full animate-[spin_15s_linear_infinite_reverse]" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Cloud size={48} className="text-blue-500" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Innovation Section */}
      <section className="section-padding">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-display font-bold mb-8">Innovación tecnológica aplicada al sector hospitality</h2>
          <p className="text-slate-400 text-lg max-w-3xl mx-auto mb-12">
            Debacu introduce una aproximación innovadora al combinar análisis de datos operativos, evaluación estructurada de eventos e inteligencia artificial aplicada.
          </p>
          <button 
            onClick={() => setCurrentPage('docs')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-blue-600 text-white font-bold text-sm shadow-lg shadow-blue-600/20 cursor-pointer hover:bg-blue-500 transition-all"
          >
            Explorar Documentación Técnica <ArrowRight size={16} />
          </button>
        </div>
      </section>
    </div>
  );
};

const CheckCircle2 = ({ size, className }: { size: number, className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
