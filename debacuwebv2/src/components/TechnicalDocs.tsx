import React from 'react';
import { motion } from 'motion/react';
import { 
  Book, 
  Server, 
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
  Zap,
  CheckCircle2,
  Network,
  Lock,
  Search,
  Bot,
  FileText,
  Code,
  Terminal,
  Share2
} from 'lucide-react';
import { cn } from '../lib/utils';

const DocSection = ({ title, children, id }: { title: string, children: React.ReactNode, id?: string }) => (
  <section id={id} className="mb-24 scroll-mt-32">
    <h2 className="text-2xl md:text-3xl font-display font-bold mb-8 flex items-center gap-3">
      <div className="w-1 h-8 bg-blue-600 rounded-full" />
      {title}
    </h2>
    <div className="text-slate-400 leading-relaxed space-y-6">
      {children}
    </div>
  </section>
);

const TechBlock = ({ title, children, icon }: { title: string, children: React.ReactNode, icon: React.ReactNode }) => (
  <div className="glass-card p-6 border-white/[0.05] bg-slate-950/50 relative group">
    <div className="w-10 h-10 rounded-lg bg-blue-600/10 flex items-center justify-center mb-6 text-blue-500">
      {icon}
    </div>
    <h3 className="text-lg font-bold mb-4 text-white">{title}</h3>
    <div className="text-sm text-slate-500 leading-relaxed">
      {children}
    </div>
  </div>
);

export const TechnicalDocs = ({ setCurrentPage }: { setCurrentPage: (p: any) => void }) => {
  return (
    <div className="pt-20 min-h-screen bg-[#020617]">
      {/* Hero Section */}
      <section className="py-20 border-b border-white/[0.05] bg-gradient-to-b from-blue-600/5 to-transparent">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-widest mb-8">
              <Book size={12} />
              Technical Documentation
            </div>
            <h1 className="text-4xl md:text-6xl font-display font-bold mb-8">
              Documentación técnica de Debacu AI
            </h1>
            <p className="text-lg md:text-xl text-slate-400 max-w-3xl mb-12">
              Descripción detallada de la arquitectura tecnológica, motores analíticos y sistema de inteligencia artificial de la plataforma Debacu.
            </p>
            <button 
              onClick={() => setCurrentPage('architecture')}
              className="btn-primary inline-flex items-center gap-2"
            >
              Explorar arquitectura <ArrowRight size={18} />
            </button>
          </motion.div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-6 py-20 flex flex-col lg:flex-row gap-16">
        {/* Sidebar Navigation */}
        <aside className="hidden lg:block w-64 shrink-0 sticky top-32 h-fit">
          <nav className="space-y-1">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-4 px-3">Contenido</p>
            {[
              { label: 'Visión General', id: 'overview' },
              { label: 'Ingesta de Datos', id: 'ingestion' },
              { label: 'Modelo de Datos', id: 'model' },
              { label: 'Procesamiento', id: 'processing' },
              { label: 'Motores Analíticos', id: 'engines' },
              { label: 'Debacu AI', id: 'ai' },
              { label: 'Agentes Inteligentes', id: 'agents' },
              { label: 'Visualización', id: 'viz' },
              { label: 'Arquitectura SaaS', id: 'saas' },
              { label: 'Innovación', id: 'innovation' },
            ].map((item) => (
              <a 
                key={item.id}
                href={`#${item.id}`}
                className="block px-3 py-2 text-sm text-slate-500 hover:text-blue-400 hover:bg-white/[0.02] rounded-lg transition-all"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-grow max-w-4xl">
          {/* System Overview */}
          <DocSection title="Arquitectura general del sistema" id="overview">
            <p>
              Debacu está diseñado como una plataforma de inteligencia operativa de extremo a extremo. El sistema procesa flujos de datos complejos para convertirlos en señales accionables mediante una arquitectura desacoplada y escalable.
            </p>
            <p>
              La plataforma está compuesta por cuatro capas principales que garantizan la integridad y el valor de la información:
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 my-12">
              {[
                { step: '1', label: 'Captura', icon: <Database size={16} /> },
                { step: '2', label: 'Procesamiento', icon: <Cpu size={16} /> },
                { step: '3', label: 'Inteligencia', icon: <BrainCircuit size={16} /> },
                { step: '4', label: 'Decisión', icon: <LayoutDashboard size={16} /> }
              ].map((item, i) => (
                <div key={i} className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-500 font-bold">
                    {item.step}
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{item.label}</span>
                  {i < 3 && <ArrowRight className="hidden md:block absolute translate-x-20 text-slate-800" size={14} />}
                </div>
              ))}
            </div>

            <div className="glass-card p-6 border-white/[0.05] bg-slate-900/30 font-mono text-xs text-blue-400/80">
              <div className="flex items-center gap-2 mb-4">
                <Terminal size={14} />
                <span>system_architecture_flow.yaml</span>
              </div>
              <pre className="space-y-1">
                <div>sources: [PMS, CSV, IoT, OPS]</div>
                <div>pipeline:</div>
                <div>  - normalization_layer</div>
                <div>  - classification_engine</div>
                <div>  - intelligence_core: [Risk, Revenue, Behaviour]</div>
                <div>  - output: [Dashboard, Webhook, Alert]</div>
              </pre>
            </div>
          </DocSection>

          {/* Data Ingestion */}
          <DocSection title="Ingesta de datos" id="ingestion">
            <p>
              Debacu puede capturar datos desde múltiples fuentes del hotel, permitiendo una visión unificada de la operativa. La capa de ingesta es agnóstica a la fuente y altamente flexible.
            </p>
            <div className="grid md:grid-cols-2 gap-6 my-8">
              <TechBlock title="Fuentes Soportadas" icon={<Share2 size={20} />}>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-500" /> PMS del hotel</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-500" /> Exportaciones CSV/Excel</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-500" /> Registros operativos</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-500" /> Información de reservas</li>
                </ul>
              </TechBlock>
              <TechBlock title="Data Platform" icon={<Database size={20} />}>
                <p>Todos los datos se almacenan en un modelo estructurado diseñado específicamente para el sector hospitality, garantizando la consistencia analítica.</p>
              </TechBlock>
            </div>
            <div className="flex items-center justify-center p-12 bg-white/[0.02] rounded-2xl border border-white/[0.05]">
              <div className="flex flex-col items-center gap-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="px-4 py-2 bg-slate-900 border border-white/10 rounded text-[10px] font-mono">PMS_DATA</div>
                  <div className="px-4 py-2 bg-slate-900 border border-white/10 rounded text-[10px] font-mono">CSV_IMPORTS</div>
                </div>
                <ArrowRight className="rotate-90 text-slate-700" />
                <div className="px-8 py-4 bg-blue-600/20 border border-blue-500/30 rounded-xl text-sm font-bold text-blue-400">
                  Debacu Data Platform
                </div>
              </div>
            </div>
          </DocSection>

          {/* Data Model */}
          <DocSection title="Modelo analítico de datos" id="model">
            <p>
              A diferencia de las herramientas genéricas de BI, Debacu utiliza un modelo de datos diseñado específicamente para analizar la actividad del hotel. Este modelo permite correlacionar eventos operativos con información comercial.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 my-8">
              {['Propiedades', 'Habitaciones', 'Reservas', 'Incidencias', 'Eventos Ops', 'Señales IA'].map((item) => (
                <div key={item} className="p-4 bg-white/[0.03] border border-white/[0.05] rounded-lg text-center">
                  <span className="text-xs font-bold text-slate-300">{item}</span>
                </div>
              ))}
            </div>
          </DocSection>

          {/* Processing */}
          <DocSection title="Procesamiento y normalización" id="processing">
            <p>
              El sistema realiza varias etapas de procesamiento crítico para convertir datos brutos en información analítica de alta fidelidad.
            </p>
            <div className="space-y-4 my-8">
              {[
                { title: 'Normalización', desc: 'Estandarización de formatos, monedas y unidades métricas.' },
                { title: 'Clasificación', desc: 'Categorización automática de eventos mediante modelos de NLP y reglas de negocio.' },
                { title: 'Generación de Métricas', desc: 'Cálculo de KPIs operativos y comerciales en tiempo real.' },
                { title: 'Correlación', desc: 'Vinculación de incidencias operativas con el impacto en revenue.' }
              ].map((step, i) => (
                <div key={i} className="flex gap-6 p-6 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                  <div className="text-blue-500 font-mono text-lg">0{i+1}</div>
                  <div>
                    <h4 className="font-bold text-white mb-1">{step.title}</h4>
                    <p className="text-sm text-slate-500">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </DocSection>

          {/* Intelligence Engines */}
          <DocSection title="Motores analíticos de Debacu" id="engines">
            <p>
              El núcleo de Debacu reside en sus motores analíticos especializados que trabajan de forma asíncrona y paralela para procesar la información.
            </p>
            <div className="grid md:grid-cols-2 gap-6 my-8">
              <TechBlock title="Risk Intelligence" icon={<ShieldAlert size={20} />}>
                Análisis de señales operativas, detección de patrones repetitivos y generación de indicadores de riesgo preventivos.
              </TechBlock>
              <TechBlock title="Revenue Intelligence" icon={<TrendingUp size={20} />}>
                Especializado en análisis comercial: producción por canal, comportamiento de reserva y evolución de ingresos.
              </TechBlock>
              <TechBlock title="Behaviour Analysis" icon={<Activity size={20} />}>
                Motor de análisis de comportamiento que permite detectar tendencias recurrentes en los datos operativos históricos.
              </TechBlock>
              <TechBlock title="Data Intelligence" icon={<Layers size={20} />}>
                Motor encargado de procesar y estructurar los datos antes del análisis profundo de las capas superiores.
              </TechBlock>
            </div>
          </DocSection>

          {/* Debacu AI */}
          <DocSection title="Debacu AI" id="ai">
            <p>
              Debacu AI es la capa de inteligencia superior que orquestra el análisis estadístico, las reglas de clasificación y los motores analíticos.
            </p>
            <div className="p-8 bg-gradient-to-br from-blue-600/10 to-violet-600/10 border border-blue-500/20 rounded-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4">
                <Zap className="text-blue-500 animate-pulse" size={24} />
              </div>
              <h4 className="text-xl font-bold text-white mb-4">Intelligence Core</h4>
              <p className="text-sm text-slate-400 mb-6">
                Su objetivo es detectar patrones complejos que pasan desapercibidos para el análisis humano, generando señales operativas útiles para el hotel.
              </p>
              <div className="flex flex-wrap gap-3">
                {['Statistical Models', 'Classification Rules', 'Neural Layers', 'Predictive Logic'].map((tag) => (
                  <span key={tag} className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </DocSection>

          {/* Intelligent Agents */}
          <DocSection title="Agentes inteligentes" id="agents">
            <p>
              Debacu utiliza agentes analíticos autónomos que ayudan a interpretar la información y proporcionan una capa de asistencia proactiva.
            </p>
            <div className="grid grid-cols-1 gap-4 my-8">
              {[
                { name: 'Risk Analysis Agent', desc: 'Monitorización continua de señales de riesgo operativo.' },
                { name: 'Revenue Analysis Agent', desc: 'Detección de desviaciones en el rendimiento comercial.' },
                { name: 'Operational Insight Agent', desc: 'Identificación de cuellos de botella en procesos internos.' }
              ].map((agent, i) => (
                <div key={i} className="p-6 bg-white/[0.02] border border-white/[0.05] rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                      <Bot size={20} />
                    </div>
                    <div>
                      <h5 className="font-bold text-white text-sm">{agent.name}</h5>
                      <p className="text-xs text-slate-500">{agent.desc}</p>
                    </div>
                  </div>
                  <div className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded uppercase">Active</div>
                </div>
              ))}
            </div>
          </DocSection>

          {/* Visualization */}
          <DocSection title="Visualización y toma de decisiones" id="viz">
            <p>
              Los resultados del análisis se presentan de forma clara y estructurada para facilitar la toma de decisiones inmediata.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-8">
              {[
                { icon: <LayoutDashboard size={20} />, label: 'Dashboards' },
                { icon: <ShieldAlert size={20} />, label: 'Alertas Ops' },
                { icon: <BrainCircuit size={20} />, label: 'Paneles IA' },
                { icon: <Activity size={20} />, label: 'KPIs Clave' }
              ].map((item, i) => (
                <div key={i} className="p-6 bg-white/[0.03] border border-white/[0.05] rounded-xl text-center flex flex-col items-center gap-4">
                  <div className="text-blue-500">{item.icon}</div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{item.label}</span>
                </div>
              ))}
            </div>
          </DocSection>

          {/* SaaS Architecture */}
          <DocSection title="Arquitectura SaaS escalable" id="saas">
            <p>
              Debacu está diseñado como una plataforma cloud multiempresa de alto rendimiento, garantizando la seguridad y el aislamiento de los datos.
            </p>
            <div className="grid md:grid-cols-2 gap-6 my-8">
              <TechBlock title="Multi-tenant Isolation" icon={<Lock size={20} />}>
                Cada hotel dispone de su propio entorno analítico lógico, garantizando que los datos nunca se mezclen entre organizaciones.
              </TechBlock>
              <TechBlock title="Horizontal Scalability" icon={<Cloud size={20} />}>
                Arquitectura basada en microservicios que permite escalar recursos de forma dinámica según la carga de procesamiento.
              </TechBlock>
            </div>
          </DocSection>

          {/* Innovation */}
          <DocSection title="Innovación tecnológica" id="innovation">
            <div className="p-8 bg-blue-600 rounded-2xl text-white">
              <h4 className="text-2xl font-bold mb-6">Liderando la transformación del sector</h4>
              <p className="text-blue-100 mb-8 leading-relaxed">
                Debacu introduce una aproximación innovadora al combinar análisis de datos operativos, evaluación estructurada de eventos e inteligencia artificial aplicada. Esta capa de inteligencia tradicionalmente no existe en los sistemas hoteleros actuales (PMS/ERP).
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white/10 rounded-xl border border-white/10">
                  <p className="text-xs font-bold uppercase tracking-widest mb-2">Impacto</p>
                  <p className="text-sm">+30% Eficiencia Operativa</p>
                </div>
                <div className="p-4 bg-white/10 rounded-xl border border-white/10">
                  <p className="text-xs font-bold uppercase tracking-widest mb-2">Precisión</p>
                  <p className="text-sm">99.2% Detección de Patrones</p>
                </div>
              </div>
            </div>
          </DocSection>
        </main>
      </div>
    </div>
  );
};
