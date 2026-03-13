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
  <div className="mx-auto max-w-4xl py-20">
    <div className="flex flex-col items-center gap-8">
      {/* Layer 1: Data Sources */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="w-64 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6 text-center backdrop-blur-sm"
      >
        <Database className="mx-auto mb-3 text-blue-400" size={32} />
        <h4 className="text-sm font-bold uppercase tracking-widest text-white">
          Fuentes de datos
        </h4>
        <p className="mt-2 text-[10px] text-slate-400">
          PMS, CSV y registros operativos
        </p>
      </motion.div>

      <ArrowDown className="animate-bounce text-slate-700" />

      {/* Layer 2: Ingestion */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="w-64 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6 text-center backdrop-blur-sm"
      >
        <Network className="mx-auto mb-3 text-violet-400" size={32} />
        <h4 className="text-sm font-bold uppercase tracking-widest text-white">
          Capa de ingesta
        </h4>
        <p className="mt-2 text-[10px] text-slate-400">
          Validación y normalización inicial
        </p>
      </motion.div>

      <ArrowDown className="text-slate-700" />

      {/* Layer 3: Processing */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="w-64 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center backdrop-blur-sm"
      >
        <Cpu className="mx-auto mb-3 text-emerald-400" size={32} />
        <h4 className="text-sm font-bold uppercase tracking-widest text-white">
          Capa de procesamiento
        </h4>
        <p className="mt-2 text-[10px] text-slate-400">
          Estructuración, correlación y métricas
        </p>
      </motion.div>

      <ArrowDown className="text-slate-700" />

      {/* Layer 4: Intelligence Engines */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="w-64 rounded-2xl border border-blue-400/20 bg-blue-400/5 p-6 text-center backdrop-blur-sm"
      >
        <BrainCircuit className="mx-auto mb-3 text-blue-400" size={32} />
        <h4 className="text-sm font-bold uppercase tracking-widest text-white">
          Motores analíticos
        </h4>
        <p className="mt-2 text-[10px] text-slate-400">
          Riesgo, revenue y comportamiento
        </p>
      </motion.div>

      <ArrowDown className="text-slate-700" />

      {/* Layer 5: Analytical Assistance */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="w-64 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-6 text-center backdrop-blur-sm"
      >
        <Bot className="mx-auto mb-3 text-emerald-400" size={32} />
        <h4 className="text-sm font-bold uppercase tracking-widest text-white">
          Asistencia analítica
        </h4>
        <p className="mt-2 text-[10px] text-slate-400">
          Interpretación y apoyo a la decisión
        </p>
      </motion.div>

      <ArrowDown className="text-slate-700" />

      {/* Layer 6: Dashboards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="w-64 rounded-2xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-sm"
      >
        <LayoutDashboard className="mx-auto mb-3 text-white" size={32} />
        <h4 className="text-sm font-bold uppercase tracking-widest text-white">
          Dashboards y decisión
        </h4>
        <p className="mt-2 text-[10px] text-slate-400">
          Visión operativa y económica
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
    <div className="mb-8 flex items-center gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-600/10 text-blue-500">
        {icon}
      </div>
      <div>
        <h2 className="text-2xl font-bold text-white md:text-3xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
    </div>

    <div className="leading-relaxed text-slate-400">{children}</div>
  </div>
);

export default function ArchitecturePage() {
  const navigate = useNavigate();

  return (
    <div
      id="public-page-scroll"
      className="h-screen overflow-y-auto overflow-x-hidden bg-[#020617] text-white"
    >
      <div className="flex min-h-full flex-col">
        <WebNavbar />

        <main className="flex-grow pt-20">
          {/* Hero Section */}
          <section className="relative overflow-hidden border-b border-white/[0.05] px-6 py-20">
            <div className="absolute left-1/2 top-0 -z-10 h-full w-full -translate-x-1/2 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-600/10 via-transparent to-transparent" />

            <div className="mx-auto max-w-7xl text-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-blue-400">
                  <Server size={12} />
                  Arquitectura del sistema
                </div>

                <h1 className="mb-8 text-4xl font-bold text-white md:text-6xl">
                  Arquitectura de la plataforma Debacu
                </h1>

                <p className="mx-auto mb-12 max-w-3xl text-lg text-slate-400 md:text-xl">
                  Debacu está diseñado como una plataforma de análisis operativo
                  para hospitality que incorpora datos, los estructura, aplica
                  capas analíticas y los convierte en señales útiles para la
                  gestión del hotel.
                </p>
              </motion.div>
            </div>
          </section>

          {/* General Diagram */}
          <section className="bg-slate-950/30 px-6 py-20">
            <div className="mx-auto max-w-7xl">
              <div className="mb-16 text-center">
                <h2 className="mb-4 text-3xl font-bold text-white">
                  Flujo general de datos
                </h2>
                <p className="text-slate-500">
                  Desde la captura de información hasta la generación de vistas y señales de decisión.
                </p>
              </div>

              <ArchitectureFlow />
            </div>
          </section>

          {/* Detailed Layers */}
          <section className="px-6 py-20">
            <div className="mx-auto max-w-5xl">
              {/* Layer 1 */}
              <ArchitectureSection
                title="Capa 1 — Fuentes de datos"
                icon={<Database size={24} />}
              >
                <p className="mb-6">
                  Debacu puede recibir información desde diferentes sistemas y
                  procesos del hotel, integrando datos heterogéneos dentro de una
                  base analítica común.
                </p>

                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
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
                      className="flex items-center gap-3 rounded-lg border border-white/[0.05] bg-white/[0.02] p-4 text-xs font-medium text-slate-400"
                    >
                      <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                      {item}
                    </div>
                  ))}
                </div>
              </ArchitectureSection>

              {/* Layer 2 */}
              <ArchitectureSection
                title="Capa 2 — Ingesta de datos"
                icon={<Network size={24} />}
              >
                <p className="mb-6">
                  La capa de ingesta permite incorporar datos desde distintas
                  fuentes manteniendo consistencia estructural y sin afectar al
                  funcionamiento general de la plataforma.
                </p>

                <div className="rounded-2xl border border-white/[0.05] bg-slate-900/50 p-6">
                  <ul className="space-y-4">
                    {[
                      {
                        title: "Recepción de datos",
                        desc: "Entrada de información desde PMS, CSV y registros operativos.",
                      },
                      {
                        title: "Validación inicial",
                        desc: "Verificación básica de integridad, formato y consistencia.",
                      },
                      {
                        title: "Normalización de formatos",
                        desc: "Transformación a una estructura común preparada para análisis.",
                      },
                      {
                        title: "Persistencia analítica",
                        desc: "Almacenamiento orientado a consulta, trazabilidad y explotación posterior.",
                      },
                    ].map((item, i) => (
                      <li key={i} className="flex gap-4">
                        <div className="font-mono text-sm text-blue-500">
                          0{i + 1}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white">
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
                  estructurada, construyendo una base consistente para análisis
                  operativo, comparativo y económico.
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    "Normalización de datos",
                    "Clasificación de eventos",
                    "Generación de métricas operativas",
                    "Correlación entre señales operativas y comerciales",
                  ].map((item) => (
                    <div
                      key={item}
                      className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"
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
                title="Capa 4 — Motores analíticos"
                icon={<BrainCircuit size={24} />}
              >
                <p className="mb-8">
                  Debacu utiliza distintos motores especializados que trabajan
                  sobre una misma base de datos para ofrecer una lectura más
                  completa del funcionamiento del hotel.
                </p>

                <div className="grid gap-6 md:grid-cols-2">
                  {[
                    {
                      title: "Risk Intelligence Engine",
                      icon: <ShieldAlert size={20} />,
                      desc: "Analiza incidencias y señales operativas para detectar patrones de riesgo y generar indicadores preventivos.",
                    },
                    {
                      title: "Revenue Intelligence Engine",
                      icon: <TrendingUp size={20} />,
                      desc: "Analiza datos comerciales, producción por canal y comportamiento de reserva para detectar desviaciones y oportunidades.",
                    },
                    {
                      title: "Behaviour Analysis Engine",
                      icon: <Activity size={20} />,
                      desc: "Analiza patrones de comportamiento en históricos operativos y comerciales para identificar repeticiones y tendencias.",
                    },
                    {
                      title: "Data Intelligence Engine",
                      icon: <Layers size={20} />,
                      desc: "Se encarga de estructurar y enriquecer la base de datos antes del análisis de capas superiores.",
                    },
                  ].map((engine, i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6"
                    >
                      <div className="mb-4 flex items-center gap-3">
                        <div className="text-blue-500">{engine.icon}</div>
                        <h4 className="text-sm font-bold text-white">
                          {engine.title}
                        </h4>
                      </div>
                      <p className="text-xs leading-relaxed text-slate-500">
                        {engine.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </ArchitectureSection>

              {/* Layer 5 */}
              <ArchitectureSection
                title="Capa 5 — Capa analítica"
                icon={<Zap size={24} />}
              >
                <p className="mb-6">
                  Esta capa coordina motores analíticos, reglas de clasificación y
                  lógica de interpretación para detectar señales relevantes en la
                  información del hotel.
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
                      className="rounded-full border border-blue-500/20 bg-blue-600/10 px-4 py-2 text-xs font-bold text-blue-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </ArchitectureSection>

              {/* Layer 6 */}
              <ArchitectureSection
                title="Capa 6 — Asistencia analítica"
                icon={<Bot size={24} />}
              >
                <p className="mb-8">
                  Debacu incorpora asistentes analíticos orientados a interpretar
                  resultados, resumir señales relevantes y aportar apoyo a la toma
                  de decisiones.
                </p>

                <div className="space-y-4">
                  {[
                    {
                      name: "Risk Analysis Assistant",
                      desc: "Apoyo a la interpretación de señales críticas y patrones de riesgo.",
                    },
                    {
                      name: "Revenue Analysis Assistant",
                      desc: "Apoyo a la lectura del rendimiento comercial y sus desviaciones.",
                    },
                    {
                      name: "Operational Insight Assistant",
                      desc: "Ayuda a identificar mejoras en procesos y señales internas.",
                    },
                  ].map((agent, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] p-4"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                          <Bot size={16} />
                        </div>
                        <div>
                          <h5 className="text-xs font-bold text-white">
                            {agent.name}
                          </h5>
                          <p className="text-[10px] text-slate-500">
                            {agent.desc}
                          </p>
                        </div>
                      </div>

                      <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-500">
                        Support
                      </div>
                    </div>
                  ))}
                </div>
              </ArchitectureSection>

              {/* Layer 7 */}
              <ArchitectureSection
                title="Capa 7 — Visualización y decisión"
                icon={<LayoutDashboard size={24} />}
              >
                <p className="mb-6">
                  Los resultados se presentan mediante interfaces diseñadas para
                  facilitar lectura rápida, seguimiento de señales y comprensión de
                  datos complejos.
                </p>

                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  {[
                    "Dashboards interactivos",
                    "Alertas operativas",
                    "Paneles de análisis",
                    "Indicadores clave",
                  ].map((item) => (
                    <div
                      key={item}
                      className="rounded-lg border border-white/[0.05] bg-white/[0.03] p-4 text-center"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </ArchitectureSection>

              {/* SaaS Architecture */}
              <ArchitectureSection
                title="Arquitectura SaaS cloud"
                icon={<Cloud size={24} />}
              >
                <p className="mb-8">
                  Debacu está planteado como una plataforma cloud multi-tenant que
                  garantiza separación lógica, escalabilidad progresiva y control
                  de acceso por organización.
                </p>

                <div className="grid gap-6 md:grid-cols-2">
                  {[
                    {
                      title: "Multi-tenant isolation",
                      desc: "Separación lógica de datos por organización y entorno de trabajo.",
                    },
                    {
                      title: "Procesamiento distribuido",
                      desc: "Capacidad de repartir cargas para mejorar consistencia y eficiencia.",
                    },
                    {
                      title: "Escalabilidad horizontal",
                      desc: "Preparado para crecer con más hoteles, datos y usuarios.",
                    },
                    {
                      title: "Seguridad y control",
                      desc: "Control de acceso, separación por organización y base técnica para trazabilidad.",
                    },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600/10 text-blue-500">
                        <Lock size={16} />
                      </div>
                      <div>
                        <h5 className="text-sm font-bold text-white">
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
                <h2 className="mb-12 text-center text-3xl font-bold text-white">
                  Beneficios de la arquitectura
                </h2>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                  {[
                    {
                      title: "Mayor capacidad de análisis",
                      icon: <Activity className="text-blue-500" />,
                    },
                    {
                      title: "Detección estructurada de patrones",
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
                      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.03]">
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
          <section className="bg-blue-600 px-6 py-20">
            <div className="mx-auto max-w-7xl text-center">
              <h2 className="mb-8 text-3xl font-bold text-white md:text-5xl">
                ¿Listo para profesionalizar tu hotel?
              </h2>

              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <button
                  onClick={() => navigate("/solicitar-acceso")}
                  className="rounded-xl bg-white px-8 py-4 font-bold text-blue-600 shadow-xl transition-all hover:bg-slate-100"
                >
                  Solicitar acceso
                </button>

                <button
                  onClick={() => navigate("/login")}
                  className="rounded-xl border border-blue-500 bg-blue-700 px-8 py-4 font-bold text-white transition-all hover:bg-blue-800"
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
