import React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Database,
  Cpu,
  BrainCircuit,
  LayoutDashboard,
  ShieldAlert,
  TrendingUp,
  Activity,
  Layers,
  Cloud,
  Zap,
  Network,
  Lock,
  Bot,
  Server,
  ArrowDown,
  Search,
} from "lucide-react";

import WebNavbar from "@/pages/public/WebNavbar";
import WebFooter from "@/pages/public/WebFooter";

const ArchitectureFlow = () => (
  <div className="py-20 max-w-4xl mx-auto">
    <div className="flex flex-col items-center gap-8">
      {/* Layer 1: Data Sources */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6 w-64 text-center backdrop-blur-sm"
      >
        <Database className="mx-auto mb-3 text-blue-400" size={32} />
        <h4 className="text-sm font-bold uppercase tracking-widest text-white">
          Hotel Data Sources
        </h4>
        <p className="text-[10px] text-slate-400 mt-2">
          PMS, CSV, IoT, Operational Logs
        </p>
      </motion.div>

      <ArrowDown className="text-slate-700 animate-bounce" />

      {/* Layer 2: Ingestion */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6 w-64 text-center backdrop-blur-sm"
      >
        <Network className="mx-auto mb-3 text-violet-400" size={32} />
        <h4 className="text-sm font-bold uppercase tracking-widest text-white">
          Data Ingestion Layer
        </h4>
        <p className="text-[10px] text-slate-400 mt-2">
          Validation & Normalization
        </p>
      </motion.div>

      <ArrowDown className="text-slate-700" />

      {/* Layer 3: Processing */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 w-64 text-center backdrop-blur-sm"
      >
        <Cpu className="mx-auto mb-3 text-emerald-400" size={32} />
        <h4 className="text-sm font-bold uppercase tracking-widest text-white">
          Data Processing Layer
        </h4>
        <p className="text-[10px] text-slate-400 mt-2">
          Correlation & Metrics Generation
        </p>
      </motion.div>

      <ArrowDown className="text-slate-700" />

      {/* Layer 4: Intelligence Engines */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="rounded-2xl border border-blue-400/20 bg-blue-400/5 p-6 w-64 text-center backdrop-blur-sm"
      >
        <BrainCircuit className="mx-auto mb-3 text-blue-400" size={32} />
        <h4 className="text-sm font-bold uppercase tracking-widest text-white">
          Intelligence Engines
        </h4>
        <p className="text-[10px] text-slate-400 mt-2">
          Risk, Revenue, Behaviour
        </p>
      </motion.div>

      <ArrowDown className="text-slate-700" />

      {/* Layer 5: AI Agents */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-6 w-64 text-center backdrop-blur-sm"
      >
        <Bot className="mx-auto mb-3 text-emerald-400" size={32} />
        <h4 className="text-sm font-bold uppercase tracking-widest text-white">
          AI Agents
        </h4>
        <p className="text-[10px] text-slate-400 mt-2">
          Autonomous Insights & Actions
        </p>
      </motion.div>

      <ArrowDown className="text-slate-700" />

      {/* Layer 6: Dashboards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="rounded-2xl border border-white/10 bg-white/5 p-6 w-64 text-center backdrop-blur-sm"
      >
        <LayoutDashboard className="mx-auto mb-3 text-white" size={32} />
        <h4 className="text-sm font-bold uppercase tracking-widest text-white">
          Dashboards & Decisions
        </h4>
        <p className="text-[10px] text-slate-400 mt-2">
          Operational Visibility
        </p>
      </motion.div>
    </div>
  </div>
);

const ArchitectureSection = ({
  title,
  subtitle,
  children,
  icon,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  icon: React.ReactNode;
}) => (
  <div className="mb-24">
    <div className="flex items-center gap-4 mb-8">
      <div className="w-12 h-12 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
        {icon}
      </div>
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-white">{title}</h2>
        {subtitle && <p className="text-slate-500 text-sm mt-1">{subtitle}</p>}
      </div>
    </div>

    <div className="text-slate-400 leading-relaxed">{children}</div>
  </div>
);

export default function ArchitecturePage() {
  const navigate = useNavigate();

  return (
    <div
      id="public-page-scroll"
      className="h-screen overflow-y-auto overflow-x-hidden bg-[#020617] text-white"
    >
      <div className="min-h-full flex flex-col">
        <WebNavbar />

        <main className="pt-20 flex-grow">
          {/* Hero Section */}
          <section className="px-6 py-20 relative overflow-hidden border-b border-white/[0.05]">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-600/10 via-transparent to-transparent -z-10" />

            <div className="max-w-7xl mx-auto text-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-widest mb-8">
                  <Server size={12} />
                  System Architecture
                </div>

                <h1 className="text-4xl md:text-6xl font-bold mb-8 text-white">
                  Arquitectura de Debacu AI
                </h1>

                <p className="text-lg md:text-xl text-slate-400 max-w-3xl mx-auto mb-12">
                  Debacu está diseñado como una plataforma de inteligencia
                  operativa para hospitality que procesa grandes volúmenes de
                  datos y los transforma en señales accionables mediante motores
                  analíticos y agentes inteligentes.
                </p>
              </motion.div>
            </div>
          </section>

          {/* General Diagram */}
          <section className="px-6 py-20 bg-slate-950/30">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold mb-4 text-white">
                  Flujo General de Datos
                </h2>
                <p className="text-slate-500">
                  Del dato bruto a la decisión operativa en tiempo real.
                </p>
              </div>

              <ArchitectureFlow />
            </div>
          </section>

          {/* Detailed Layers */}
          <section className="px-6 py-20">
            <div className="max-w-5xl mx-auto">
              {/* Layer 1 */}
              <ArchitectureSection
                title="Capa 1 — Fuentes de datos"
                icon={<Database size={24} />}
              >
                <p className="mb-6">
                  Debacu puede recibir información desde múltiples sistemas del
                  hotel, integrando datos heterogéneos y unificándolos en una
                  plataforma analítica común.
                </p>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    "PMS del hotel",
                    "Exportaciones CSV",
                    "Registros operativos",
                    "Información de reservas",
                    "Datos de ocupación",
                    "Eventos operativos",
                  ].map((item) => (
                    <div
                      key={item}
                      className="p-4 bg-white/[0.02] border border-white/[0.05] rounded-lg text-xs font-medium text-slate-400 flex items-center gap-3"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      {item}
                    </div>
                  ))}
                </div>
              </ArchitectureSection>

              {/* Layer 2 */}
              <ArchitectureSection
                title="Capa 2 — Capa de ingesta de datos"
                icon={<Network size={24} />}
              >
                <p className="mb-6">
                  La capa de ingesta permite capturar datos desde diferentes
                  fuentes sin afectar al funcionamiento del sistema, soportando
                  múltiples flujos simultáneos.
                </p>

                <div className="rounded-2xl border border-white/[0.05] bg-slate-900/50 p-6">
                  <ul className="space-y-4">
                    {[
                      {
                        title: "Recepción de datos",
                        desc: "Endpoints seguros para la recepción de flujos asíncronos.",
                      },
                      {
                        title: "Validación inicial",
                        desc: "Verificación de integridad y esquema de datos entrantes.",
                      },
                      {
                        title: "Normalización de formatos",
                        desc: "Transformación a un esquema común unificado.",
                      },
                      {
                        title: "Almacenamiento analítico",
                        desc: "Persistencia optimizada para consultas de alta velocidad.",
                      },
                    ].map((item, i) => (
                      <li key={i} className="flex gap-4">
                        <div className="text-blue-500 font-mono text-sm">
                          0{i + 1}
                        </div>
                        <div>
                          <h4 className="text-white font-bold text-sm">
                            {item.title}
                          </h4>
                          <p className="text-xs text-slate-500">{item.desc}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </ArchitectureSection>

              {/* Layer 3 */}
              <ArchitectureSection
                title="Capa 3 — Procesamiento de datos"
                icon={<Cpu size={24} />}
              >
                <p className="mb-6">
                  El motor de procesamiento convierte datos brutos en información
                  analítica consistente, construyendo la base de conocimiento del
                  hotel.
                </p>

                <div className="grid md:grid-cols-2 gap-4">
                  {[
                    "Normalización de datos",
                    "Clasificación de eventos",
                    "Generación de métricas operativas",
                    "Correlación eventos ops/comerciales",
                  ].map((item) => (
                    <div
                      key={item}
                      className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex items-center gap-3"
                    >
                      <Zap size={16} className="text-emerald-500" />
                      <span className="text-sm font-bold text-emerald-400/80">
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </ArchitectureSection>

              {/* Layer 4 */}
              <ArchitectureSection
                title="Capa 4 — Motores de inteligencia"
                icon={<BrainCircuit size={24} />}
              >
                <p className="mb-8">
                  Debacu utiliza varios motores analíticos especializados que
                  trabajan en paralelo para una visión multidimensional.
                </p>

                <div className="grid md:grid-cols-2 gap-6">
                  {[
                    {
                      title: "Risk Intelligence Engine",
                      icon: <ShieldAlert size={20} />,
                      desc: "Analiza incidencias y señales operativas para detectar patrones de riesgo y generar indicadores preventivos.",
                    },
                    {
                      title: "Revenue Intelligence Engine",
                      icon: <TrendingUp size={20} />,
                      desc: "Analiza datos comerciales: producción por canal, comportamiento de reserva y detección de oportunidades.",
                    },
                    {
                      title: "Behaviour Analysis Engine",
                      icon: <Activity size={20} />,
                      desc: "Analiza patrones de comportamiento en los datos históricos para detectar tendencias recurrentes.",
                    },
                    {
                      title: "Data Intelligence Engine",
                      icon: <Layers size={20} />,
                      desc: "Motor encargado de estructurar y enriquecer los datos antes de su análisis por las capas superiores.",
                    },
                  ].map((engine, i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6"
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <div className="text-blue-500">{engine.icon}</div>
                        <h4 className="font-bold text-white text-sm">
                          {engine.title}
                        </h4>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {engine.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </ArchitectureSection>

              {/* Layer 5 */}
              <ArchitectureSection
                title="Capa 5 — Debacu AI"
                icon={<Zap size={24} />}
              >
                <p className="mb-6">
                  Debacu AI es la capa que coordina los motores analíticos y
                  aplica modelos avanzados de análisis para detectar señales
                  relevantes.
                </p>

                <div className="flex flex-wrap gap-3">
                  {[
                    "Modelos estadísticos",
                    "Reglas de clasificación",
                    "Lógica predictiva",
                    "Análisis de patrones",
                  ].map((tag) => (
                    <span
                      key={tag}
                      className="px-4 py-2 bg-blue-600/10 border border-blue-500/20 rounded-full text-xs font-bold text-blue-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </ArchitectureSection>

              {/* Layer 6 */}
              <ArchitectureSection
                title="Capa 6 — Agentes inteligentes"
                icon={<Bot size={24} />}
              >
                <p className="mb-8">
                  Debacu incorpora agentes analíticos que interpretan los
                  resultados de los motores analíticos para generar recomendaciones
                  accionables.
                </p>

                <div className="space-y-4">
                  {[
                    {
                      name: "Risk Analysis Agent",
                      desc: "Monitorización de señales críticas y patrones de riesgo.",
                    },
                    {
                      name: "Revenue Analysis Agent",
                      desc: "Evaluación de rendimiento comercial y desviaciones.",
                    },
                    {
                      name: "Operational Insight Agent",
                      desc: "Identificación de mejoras en procesos internos.",
                    },
                  ].map((agent, i) => (
                    <div
                      key={i}
                      className="p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                          <Bot size={16} />
                        </div>
                        <div>
                          <h5 className="font-bold text-white text-xs">
                            {agent.name}
                          </h5>
                          <p className="text-[10px] text-slate-500">
                            {agent.desc}
                          </p>
                        </div>
                      </div>

                      <div className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">
                        Autonomous
                      </div>
                    </div>
                  ))}
                </div>
              </ArchitectureSection>

              {/* Layer 7 */}
              <ArchitectureSection
                title="Capa 7 — Visualización y toma de decisiones"
                icon={<LayoutDashboard size={24} />}
              >
                <p className="mb-6">
                  Los resultados se presentan mediante interfaces diseñadas para
                  la acción rápida y la comprensión intuitiva de datos complejos.
                </p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    "Dashboards interactivos",
                    "Alertas operativas",
                    "Paneles de inteligencia",
                    "Indicadores clave",
                  ].map((item) => (
                    <div
                      key={item}
                      className="p-4 bg-white/[0.03] border border-white/[0.05] rounded-lg text-center"
                    >
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </ArchitectureSection>

              {/* SaaS Architecture */}
              <ArchitectureSection
                title="Arquitectura SaaS Cloud"
                icon={<Cloud size={24} />}
              >
                <p className="mb-8">
                  Debacu está diseñado como una plataforma cloud multiempresa que
                  garantiza seguridad, aislamiento y escalabilidad.
                </p>

                <div className="grid md:grid-cols-2 gap-6">
                  {[
                    {
                      title: "Multi-tenant Isolation",
                      desc: "Aislamiento lógico de datos por organización.",
                    },
                    {
                      title: "Distributed Processing",
                      desc: "Cargas de trabajo repartidas para máxima eficiencia.",
                    },
                    {
                      title: "Horizontal Scalability",
                      desc: "Capacidad de crecer según la demanda de datos.",
                    },
                    {
                      title: "Enterprise Security",
                      desc: "Cifrado y protocolos de seguridad de nivel bancario.",
                    },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-lg bg-blue-600/10 flex items-center justify-center text-blue-500 shrink-0">
                        <Lock size={16} />
                      </div>
                      <div>
                        <h5 className="font-bold text-white text-sm">
                          {item.title}
                        </h5>
                        <p className="text-xs text-slate-500">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ArchitectureSection>

              {/* Benefits */}
              <div className="mt-32">
                <h2 className="text-3xl font-bold mb-12 text-center text-white">
                  Beneficios de la Arquitectura
                </h2>

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[
                    {
                      title: "Mayor capacidad de análisis",
                      icon: <Activity className="text-blue-500" />,
                    },
                    {
                      title: "Detección automática de patrones",
                      icon: <Search className="text-violet-500" />,
                    },
                    {
                      title: "Escalabilidad cloud",
                      icon: <Cloud className="text-emerald-500" />,
                    },
                    {
                      title: "Visión unificada del hotel",
                      icon: <LayoutDashboard className="text-blue-400" />,
                    },
                  ].map((benefit, i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6 text-center"
                    >
                      <div className="w-12 h-12 rounded-xl bg-white/[0.03] flex items-center justify-center mx-auto mb-4">
                        {benefit.icon}
                      </div>
                      <h4 className="text-sm font-bold text-white">
                        {benefit.title}
                      </h4>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="px-6 py-20 bg-blue-600">
            <div className="max-w-7xl mx-auto text-center">
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-8">
                ¿Listo para profesionalizar tu hotel?
              </h2>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={() => navigate("/solicitar-acceso")}
                  className="px-8 py-4 bg-white text-blue-600 font-bold rounded-xl shadow-xl hover:bg-slate-100 transition-all"
                >
                  Solicitar acceso
                </button>

                <button
                  onClick={() => navigate("/login")}
                  className="px-8 py-4 bg-blue-700 text-white font-bold rounded-xl border border-blue-500 hover:bg-blue-800 transition-all"
                >
                  Acceso
                </button>
              </div>
            </div>
          </section>
        </main>

        <WebFooter />
      </div>
    </div>
  );
}