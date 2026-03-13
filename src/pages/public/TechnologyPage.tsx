import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
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
  Bot,
  CheckCircle2,
} from "lucide-react";

import "@/styles/public.css";
import WebNavbar from "@/pages/public/WebNavbar";
import WebFooter from "@/pages/public/WebFooter";

const TechDiagram = () => (
  <div className="relative mx-auto w-full max-w-5xl overflow-hidden py-12 md:py-20">
    <div className="relative z-10 flex flex-col items-center justify-between gap-12 md:flex-row">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        className="flex flex-col items-center gap-4"
      >
        <div className="w-36 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 text-center shadow-lg shadow-blue-500/5 backdrop-blur-sm">
          <Database className="mx-auto mb-2 text-blue-400" size={24} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300">
            Fuentes de datos
          </span>
        </div>

        <div className="flex w-full flex-col gap-2">
          {["PMS", "Exportaciones CSV", "Datos operativos"].map((s) => (
            <div
              key={s}
              className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-center font-mono text-[9px] text-slate-400"
            >
              {s}
            </div>
          ))}
        </div>
      </motion.div>

      <div className="hidden flex-col items-center gap-2 text-slate-700 md:flex">
        <div className="h-[1px] w-12 bg-gradient-to-r from-blue-500/50 to-transparent" />
        <ArrowRight size={16} />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="relative w-56 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6 text-center backdrop-blur-sm"
      >
        <div className="absolute -right-3 -top-3 flex h-8 w-8 animate-pulse items-center justify-center rounded-full bg-violet-600 shadow-lg shadow-violet-600/40">
          <Zap size={14} className="text-white" />
        </div>

        <Cpu className="mx-auto mb-3 text-violet-400" size={36} />
        <h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-violet-300">
          Capa de procesamiento
        </h4>

        <div className="space-y-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              className="h-full bg-gradient-to-r from-violet-600 to-fuchsia-500"
            />
          </div>

          <div className="flex justify-between font-mono text-[8px] text-slate-500">
            <span>NORMALIZANDO</span>
            <span>74%</span>
          </div>
        </div>
      </motion.div>

      <div className="hidden flex-col items-center gap-2 text-slate-700 md:flex">
        <div className="h-[1px] w-12 bg-gradient-to-r from-violet-500/50 to-transparent" />
        <ArrowRight size={16} />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="flex flex-col items-center gap-4"
      >
        <div className="group relative w-56 overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center backdrop-blur-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          <BrainCircuit className="mx-auto mb-3 text-emerald-400" size={36} />
          <h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-emerald-300">
            Capa analítica
          </h4>

          <div className="grid grid-cols-4 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <motion.div
                key={i}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, delay: i * 0.2, repeat: Infinity }}
                className="h-2 w-full rounded-sm bg-emerald-500/30"
              />
            ))}
          </div>
        </div>
      </motion.div>

      <div className="hidden flex-col items-center gap-2 text-slate-700 md:flex">
        <div className="h-[1px] w-12 bg-gradient-to-r from-emerald-500/50 to-transparent" />
        <ArrowRight size={16} />
      </div>

      <motion.div
        initial={{ opacity: 0, x: 20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        className="w-36 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 text-center backdrop-blur-sm"
      >
        <LayoutDashboard className="mx-auto mb-2 text-blue-400" size={24} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300">
          Dashboards
        </span>

        <div className="mt-3 flex justify-center gap-1">
          <div className="h-3 w-1 rounded-full bg-blue-500/40" />
          <div className="h-5 w-1 rounded-full bg-blue-500/60" />
          <div className="h-4 w-1 rounded-full bg-blue-500/40" />
        </div>
      </motion.div>
    </div>

    <svg
      className="absolute inset-0 -z-10 h-full w-full opacity-30"
      preserveAspectRatio="none"
    >
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

export default function TechnologyPage() {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "auto" });
    }
  }, []);

  return (
    <div className="public-page h-screen overflow-hidden bg-[#020617] text-white">
      <WebNavbar />

      <div
        id="public-page-scroll"
        ref={scrollRef}
        className="h-[calc(100vh-96px)] overflow-y-auto overflow-x-hidden"
      >
        <main>
          {/* Hero Section */}
          <section className="relative overflow-hidden px-6 py-20">
            <div className="relative z-10 mx-auto max-w-7xl text-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-blue-400">
                  <Cpu size={12} />
                  Tecnología y analítica
                </div>

                <h1 className="mb-8 text-4xl font-bold text-white md:text-6xl">
                  Arquitectura tecnológica aplicada a la operativa hotelera
                </h1>

                <p className="mx-auto mb-12 max-w-3xl text-lg text-slate-400 md:text-xl">
                  Debacu estructura datos operativos, señales de riesgo y métricas
                  de revenue para convertir información dispersa en análisis útil,
                  alertas y cuadros de decisión para el hotel.
                </p>
              </motion.div>

              <TechDiagram />
            </div>
          </section>

          {/* Architecture Section */}
          <section className="bg-slate-950/50 px-6 py-20">
            <div className="mx-auto max-w-7xl">
              <div className="mb-16">
                <h2 className="mb-6 text-3xl font-bold text-white md:text-5xl">
                  Arquitectura tecnológica de Debacu
                </h2>
                <p className="max-w-2xl text-slate-400">
                  Diseñada para procesar datos operativos hoteleros, estructurar
                  señales analíticas y escalar a múltiples establecimientos con
                  criterios homogéneos de análisis y seguridad.
                </p>
              </div>

              <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    icon: <Database className="text-blue-500" />,
                    title: "Capa de ingestión",
                    desc: "Captura de información desde PMS, exportaciones CSV, incidencias operativas y datos de reserva. Los datos se incorporan a un modelo analítico orientado al sector hotelero.",
                  },
                  {
                    icon: <Cpu className="text-violet-500" />,
                    title: "Capa de procesamiento",
                    desc: "Normalización, clasificación de eventos, estructuración de métricas y correlación entre distintas fuentes para construir una base de análisis consistente.",
                  },
                  {
                    icon: <BrainCircuit className="text-emerald-500" />,
                    title: "Capa analítica",
                    desc: "Motores especializados para detección de patrones, evaluación de señales, análisis de comportamiento y lectura operativa de indicadores relevantes.",
                  },
                  {
                    icon: <LayoutDashboard className="text-blue-400" />,
                    title: "Capa de visualización",
                    desc: "Presentación de resultados mediante dashboards, alertas, paneles de análisis y vistas orientadas a la toma de decisiones operativas y económicas.",
                  },
                ].map((layer, i) => (
                  <div
                    key={i}
                    className="group relative rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6 backdrop-blur-sm"
                  >
                    <div className="absolute left-0 top-0 h-0 w-1 bg-blue-600 transition-all duration-300 group-hover:h-full" />
                    <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.03]">
                      {layer.icon}
                    </div>
                    <h3 className="mb-4 text-lg font-bold text-white">
                      {layer.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-slate-500">
                      {layer.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Core Intelligence Section */}
          <section className="px-6 py-20">
            <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
              >
                <h2 className="mb-8 text-3xl font-bold text-white md:text-5xl">
                  Núcleo analítico de la plataforma
                </h2>

                <p className="mb-8 text-lg text-slate-400">
                  Debacu incorpora una capa analítica que procesa información
                  operativa y comercial del hotel para detectar patrones,
                  identificar desviaciones y generar señales útiles para la
                  gestión diaria y la lectura del negocio.
                </p>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    { icon: <Activity size={16} />, label: "Modelos analíticos" },
                    { icon: <Lock size={16} />, label: "Reglas de clasificación" },
                    { icon: <TrendingUp size={16} />, label: "Análisis estadístico" },
                    { icon: <Users size={16} />, label: "Asistencia analítica" },
                  ].map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-lg border border-white/[0.05] bg-white/[0.03] p-3"
                    >
                      <div className="text-blue-500">{item.icon}</div>
                      <span className="text-xs font-medium text-slate-300">
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>

                <p className="mt-8 text-sm italic text-slate-500">
                  El objetivo no es sustituir al hotel, sino aportar una capa de
                  análisis que ordene la información y mejore la capacidad de decisión.
                </p>
              </motion.div>

              <div className="relative">
                <div className="absolute -inset-4 rounded-full bg-blue-600/10 blur-3xl" />
                <div className="relative rounded-2xl border border-white/[0.05] bg-slate-950/50 p-8 backdrop-blur-sm">
                  <div className="mb-8 flex items-center justify-between">
                    <div className="flex gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-red-500" />
                      <div className="h-2 w-2 rounded-full bg-yellow-500" />
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                    </div>
                    <span className="font-mono text-[10px] text-slate-600">
                      ANALYTICS_CORE_V2.4
                    </span>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-3 font-mono text-xs text-blue-400">
                      <span className="opacity-50">01</span>
                      <span>INITIALIZING_PROCESSING_LAYERS...</span>
                    </div>

                    <div className="flex items-center gap-3 font-mono text-xs text-emerald-400">
                      <span className="opacity-50">02</span>
                      <span>PATTERN_ANALYSIS_ACTIVE [98.4%]</span>
                    </div>

                    <div className="flex items-center gap-3 font-mono text-xs text-slate-400">
                      <span className="opacity-50">03</span>
                      <span>SIGNAL_CLASSIFICATION_RUNNING</span>
                    </div>

                    <div className="flex h-24 w-full items-end gap-1 rounded border border-white/[0.05] bg-white/[0.02] p-2">
                      {[30, 60, 45, 80, 55, 90, 70, 40, 85].map((h, i) => (
                        <motion.div
                          key={i}
                          initial={{ height: 0 }}
                          animate={{ height: `${h}%` }}
                          transition={{
                            delay: i * 0.1,
                            repeat: Infinity,
                            repeatType: "reverse",
                            duration: 2,
                          }}
                          className="flex-1 rounded-t-[1px] bg-blue-500/30"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Intelligence Engines */}
          <section className="bg-slate-950/30 px-6 py-20">
            <div className="mx-auto max-w-7xl">
              <div className="mb-16 text-center">
                <h2 className="mb-4 text-3xl font-bold text-white md:text-5xl">
                  Motores analíticos de Debacu
                </h2>
                <p className="mx-auto max-w-2xl text-slate-400">
                  Distintas capas especializadas trabajan sobre la misma base de
                  datos para ofrecer una lectura más completa de la operativa y
                  del rendimiento del hotel.
                </p>
              </div>

              <div className="grid gap-8 md:grid-cols-2">
                {[
                  {
                    icon: <ShieldAlert className="text-rose-500" />,
                    title: "Risk Intelligence Engine",
                    desc: "Motor especializado en señales operativas, incidencias y patrones repetitivos que pueden afectar a la prevención, el control y la calidad operativa del establecimiento.",
                    features: [
                      "Prevención operativa",
                      "Control de incidencias",
                      "Señales de riesgo",
                    ],
                  },
                  {
                    icon: <TrendingUp className="text-blue-500" />,
                    title: "Revenue Intelligence Engine",
                    desc: "Motor analítico centrado en producción, canal, segmento y comportamiento de reserva para detectar desviaciones, oportunidades de mejora y fugas de ingreso.",
                    features: [
                      "Canal y segmento",
                      "Comportamiento de reserva",
                      "Fugas de revenue",
                    ],
                  },
                  {
                    icon: <Activity className="text-emerald-500" />,
                    title: "Behaviour Analysis Engine",
                    desc: "Motor orientado a identificar tendencias, repeticiones y patrones de comportamiento relevantes a partir del histórico operativo y comercial del hotel.",
                    features: [
                      "Patrones recurrentes",
                      "Tendencias temporales",
                      "Lectura de comportamiento",
                    ],
                  },
                  {
                    icon: <Layers className="text-violet-500" />,
                    title: "Data Intelligence Engine",
                    desc: "Motor responsable de estructurar la información de entrada, normalizar métricas y preparar la base de datos para análisis consistentes y comparables.",
                    features: [
                      "Normalización",
                      "Estructuración",
                      "Preparación analítica",
                    ],
                  },
                ].map((engine, i) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-8 backdrop-blur-sm"
                  >
                    <div className="flex items-start gap-6">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/[0.03]">
                        {engine.icon}
                      </div>

                      <div>
                        <h3 className="mb-4 text-xl font-bold text-white">
                          {engine.title}
                        </h3>
                        <p className="mb-6 text-sm leading-relaxed text-slate-400">
                          {engine.desc}
                        </p>

                        <div className="flex flex-wrap gap-2">
                          {engine.features.map((f) => (
                            <span
                              key={f}
                              className="rounded border border-white/[0.05] bg-white/[0.03] px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-500"
                            >
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

          {/* Assistants Section */}
          <section className="px-6 py-20">
            <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2">
              <div className="order-2 grid grid-cols-1 gap-4 lg:order-1">
                {[
                  {
                    name: "Risk Analysis Assistant",
                    icon: <ShieldAlert size={18} />,
                    desc: "Ayuda a interpretar señales operativas y patrones de incidencias.",
                    status: "Active",
                  },
                  {
                    name: "Revenue Analysis Assistant",
                    icon: <TrendingUp size={18} />,
                    desc: "Ayuda a leer tendencias de ingresos y desviaciones comerciales.",
                    status: "Monitoring",
                  },
                  {
                    name: "Operational Insight Assistant",
                    icon: <Zap size={18} />,
                    desc: "Apoya la identificación de mejoras operativas y señales internas.",
                    status: "Active",
                  },
                ].map((agent, i) => (
                  <div
                    key={i}
                    className="group flex items-center justify-between rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6 backdrop-blur-sm"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/10 text-blue-500">
                        {agent.icon}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">
                          {agent.name}
                        </h4>
                        <p className="text-xs text-slate-500">{agent.desc}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                      <span className="text-[10px] font-bold uppercase text-slate-500">
                        {agent.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="order-1 lg:order-2">
                <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-emerald-400">
                  <Bot size={12} />
                  Asistencia analítica
                </div>

                <h2 className="mb-8 text-3xl font-bold text-white md:text-5xl">
                  Asistentes analíticos de Debacu
                </h2>

                <p className="mb-8 text-lg text-slate-400">
                  Debacu incorpora asistentes orientados a facilitar la lectura de
                  la información y a generar análisis automatizados sobre la base
                  de datos disponible. Son una capa de apoyo, no un sustituto del
                  criterio del hotel.
                </p>

                <ul className="space-y-4">
                  {[
                    "Ayudar a interpretar métricas operativas",
                    "Detectar anomalías y señales relevantes",
                    "Resumir tendencias complejas",
                    "Sugerir posibles acciones de revisión o prevención",
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 text-slate-300">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10">
                        <CheckCircle2 size={12} className="text-emerald-500" />
                      </div>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* Scalability & SaaS */}
          <section className="bg-slate-950/30 px-6 py-20">
            <div className="mx-auto max-w-7xl">
              <div className="relative overflow-hidden rounded-2xl border border-white/[0.05] bg-white/[0.02] p-12 backdrop-blur-sm">
                <div className="absolute right-0 top-0 -z-10 h-64 w-64 rounded-full bg-blue-600/10 blur-[100px]" />

                <div className="grid items-center gap-12 lg:grid-cols-2">
                  <div>
                    <h2 className="mb-6 text-3xl font-bold text-white md:text-4xl">
                      Arquitectura SaaS escalable
                    </h2>
                    <p className="mb-8 text-slate-400">
                      Debacu se desarrolla como una plataforma SaaS multi-tenant
                      preparada para trabajar con múltiples hoteles o grupos,
                      manteniendo separación lógica, consistencia analítica y
                      capacidad de crecimiento.
                    </p>

                    <div className="grid grid-cols-2 gap-6">
                      {[
                        { icon: <Cloud size={20} />, label: "Cloud Native" },
                        {
                          icon: <Lock size={20} />,
                          label: "Multi-tenant isolation",
                        },
                        {
                          icon: <Server size={20} />,
                          label: "Procesamiento eficiente",
                        },
                        {
                          icon: <Network size={20} />,
                          label: "Actualización continua",
                        },
                      ].map((item, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className="text-blue-500">{item.icon}</div>
                          <span className="text-sm font-medium text-slate-300">
                            {item.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <div className="relative h-48 w-48">
                      <div className="absolute inset-0 animate-[spin_20s_linear_infinite] rounded-full border-2 border-dashed border-blue-500/20" />
                      <div className="absolute inset-4 animate-[spin_15s_linear_infinite_reverse] rounded-full border-2 border-dashed border-violet-500/20" />
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
          <section className="px-6 py-20">
            <div className="mx-auto max-w-7xl text-center">
              <h2 className="mb-8 text-3xl font-bold text-white md:text-5xl">
                Tecnología aplicada a riesgo, operativa y revenue hotelero
              </h2>

              <p className="mx-auto mb-12 max-w-3xl text-lg text-slate-400">
                Debacu combina arquitectura SaaS, normalización de datos y capas
                analíticas especializadas para crear una base tecnológica útil en
                gestión operativa, prevención y lectura económica del hotel.
              </p>

              <button
                onClick={() => navigate("/documentacion")}
                className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-500"
              >
                Explorar documentación técnica <ArrowRight size={16} />
              </button>
            </div>
          </section>
        </main>

        <WebFooter />
      </div>
    </div>
  );
}
