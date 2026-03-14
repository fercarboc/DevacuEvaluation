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
  <div className="relative mx-auto w-full max-w-[1180px] overflow-visible py-12 md:py-20">
    <div className="relative z-10 flex flex-col items-center justify-center gap-8 md:flex-row md:flex-nowrap md:gap-5 lg:gap-6">
      {/* 1. Fuentes */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        className="flex shrink-0 flex-col items-center gap-4"
      >
        <div className="w-32 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 text-center shadow-lg shadow-blue-500/5 backdrop-blur-sm">
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

      {/* Flecha 1 */}
      <div className="hidden shrink-0 flex-col items-center gap-2 text-slate-700 md:flex">
        <div className="h-[1px] w-8 lg:w-10 bg-gradient-to-r from-blue-500/50 to-transparent" />
        <ArrowRight size={16} />
      </div>

      {/* 2. Procesamiento */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="relative w-44 shrink-0 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5 text-center backdrop-blur-sm lg:w-48"
      >
        <div className="absolute -right-3 -top-3 flex h-8 w-8 animate-pulse items-center justify-center rounded-full bg-violet-600 shadow-lg shadow-violet-600/40">
          <Zap size={14} className="text-white" />
        </div>

        <Cpu className="mx-auto mb-3 text-violet-400" size={34} />
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

      {/* Flecha 2 */}
      <div className="hidden shrink-0 flex-col items-center gap-2 text-slate-700 md:flex">
        <div className="h-[1px] w-8 lg:w-10 bg-gradient-to-r from-violet-500/50 to-transparent" />
        <ArrowRight size={16} />
      </div>

      {/* 3. Analítica */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="flex shrink-0 flex-col items-center gap-4"
      >
        <div className="group relative w-44 overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-center backdrop-blur-sm lg:w-48">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          <BrainCircuit className="mx-auto mb-3 text-emerald-400" size={34} />
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

      {/* Flecha 3 */}
      <div className="hidden shrink-0 flex-col items-center gap-2 text-slate-700 md:flex">
        <div className="h-[1px] w-8 lg:w-10 bg-gradient-to-r from-emerald-500/50 to-transparent" />
        <ArrowRight size={16} />
      </div>

      {/* 4. Dashboards */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        className="w-28 shrink-0 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-3 text-center backdrop-blur-sm lg:w-32"
      >
        <LayoutDashboard className="mx-auto mb-2 text-blue-400" size={20} />
        <span className="text-[9px] font-bold uppercase tracking-wider text-blue-300">
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
        d="M 120 150 L 1030 150"
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
                  Engineering & AI
                </div>

                <h1 className="mb-8 text-4xl font-bold text-white md:text-6xl">
                  Debacu AI — Inteligencia aplicada a la operativa hotelera
                </h1>

                <p className="mx-auto mb-12 max-w-3xl text-lg text-slate-400 md:text-xl">
                  Debacu integra análisis de datos, motores analíticos y agentes
                  inteligentes para transformar información operativa en
                  decisiones accionables para el hotel.
                </p>
              </motion.div>

              <TechDiagram />
            </div>
          </section>

          {/* Architecture Section */}
          <section className="bg-slate-950/50 px-6 py-20">
            <div className="mx-auto max-w-7xl">
             <div className="mb-16 text-center">
              <h2 className="mb-6 text-3xl font-bold text-white md:text-5xl">
                Arquitectura tecnológica de Debacu
              </h2>

              <p className="mx-auto max-w-2xl text-slate-400">
                Diseñada para la escalabilidad, precisión y procesamiento en
                tiempo real de datos complejos del sector hospitality.
              </p>
            </div>


              <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    icon: <Database className="text-blue-500" />,
                    title: "Data ingestion layer",
                    desc: "Captura de datos desde sistemas PMS, exportaciones CSV, incidencias operativas y datos de reservas. Los datos se normalizan y se almacenan en un modelo analítico diseñado para hospitality.",
                  },
                  {
                    icon: <Cpu className="text-violet-500" />,
                    title: "Data processing layer",
                    desc: "Procesamiento mediante normalización de datos, clasificación de eventos y generación de métricas operativas. Correlación entre diferentes fuentes para crear una base de conocimiento estructurada.",
                  },
                  {
                    icon: <BrainCircuit className="text-emerald-500" />,
                    title: "Intelligence layer",
                    desc: "Motores analíticos para detección de patrones, clasificación de señales, análisis de comportamiento y revenue. Generación automática de indicadores y alertas operativas críticas.",
                  },
                  {
                    icon: <LayoutDashboard className="text-blue-400" />,
                    title: "Visualization layer",
                    desc: "Presentación de resultados en dashboards interactivos, alertas en tiempo real, paneles de inteligencia y recomendaciones operativas basadas en datos.",
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

          {/* Debacu AI Section */}
          <section className="px-6 py-20">
  <div className="mx-auto max-w-7xl">
    <div className="mb-16 text-center">
      <h2 className="mb-6 text-3xl font-bold leading-tight text-white md:text-5xl">
        Debacu AI — Motor de inteligencia de la plataforma
      </h2>

      <p className="mx-auto max-w-3xl text-lg text-slate-400">
        Debacu AI es la capa de inteligencia que analiza datos operativos y
        comerciales del hotel para detectar patrones, identificar anomalías y
        generar recomendaciones.
      </p>
    </div>

    <div className="grid items-center gap-16 lg:grid-cols-2 lg:gap-20">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        className="mx-auto w-full max-w-xl"
      >
        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: <Activity size={16} />, label: "Modelos analíticos" },
            { icon: <Lock size={16} />, label: "Reglas de clasificación" },
            { icon: <TrendingUp size={16} />, label: "Análisis estadístico" },
            { icon: <Users size={16} />, label: "Asistentes inteligentes" },
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
          El objetivo es convertir datos dispersos en señales operativas útiles
          para la toma de decisiones estratégicas.
        </p>
      </motion.div>

      <div className="relative mx-auto w-full max-w-xl">
        <div className="absolute -inset-4 rounded-full bg-blue-600/10 blur-3xl" />
        <div className="relative rounded-2xl border border-white/[0.05] bg-slate-950/50 p-8 backdrop-blur-sm">
          <div className="mb-8 flex items-center justify-between">
            <div className="flex gap-1.5">
              <div className="h-2 w-2 rounded-full bg-red-500" />
              <div className="h-2 w-2 rounded-full bg-yellow-500" />
              <div className="h-2 w-2 rounded-full bg-green-500" />
            </div>
            <span className="font-mono text-[10px] text-slate-600">
              AI_ENGINE_CORE_V2.4
            </span>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3 font-mono text-xs text-blue-400">
              <span className="opacity-50">01</span>
              <span>INITIALIZING_NEURAL_LAYERS...</span>
            </div>

            <div className="flex items-center gap-3 font-mono text-xs text-emerald-400">
              <span className="opacity-50">02</span>
              <span>PATTERN_RECOGNITION_ACTIVE [98.4%]</span>
            </div>

            <div className="flex items-center gap-3 font-mono text-xs text-slate-400">
              <span className="opacity-50">03</span>
              <span>ANOMALY_DETECTION: NO_THREATS_FOUND</span>
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
  </div>
</section>


          {/* Intelligence Engines */}
          <section className="bg-slate-950/30 px-6 py-20">
            <div className="mx-auto max-w-7xl">
              <div className="mb-16 text-center">
                <h2 className="mb-4 text-3xl font-bold text-white md:text-5xl">
                  Motores de Inteligencia
                </h2>
                <p className="mx-auto max-w-2xl text-slate-400">
                  Cuatro motores especializados trabajando en paralelo para una
                  visión 360º de tu hotel.
                </p>
              </div>

              <div className="grid gap-8 md:grid-cols-2">
                {[
                  {
                    icon: <ShieldAlert className="text-rose-500" />,
                    title: "Risk Intelligence Engine",
                    desc: "Motor especializado en evaluar señales operativas relacionadas con la actividad del hotel. Análisis de incidencias, detección de patrones repetitivos y generación de indicadores de riesgo preventivos.",
                    features: [
                      "Prevención operativa",
                      "Control de calidad",
                      "Detección de fraude",
                    ],
                  },
                  {
                    icon: <TrendingUp className="text-blue-500" />,
                    title: "Revenue Intelligence Engine",
                    desc: "Motor analítico centrado en el rendimiento comercial. Analiza producción por canal, comportamiento de reserva y evolución de ingresos para detectar oportunidades de optimización.",
                    features: [
                      "Channel mix optimization",
                      "Booking behavior",
                      "Revenue leakage detection",
                    ],
                  },
                  {
                    icon: <Activity className="text-emerald-500" />,
                    title: "Behaviour Analysis Engine",
                    desc: "Motor de análisis de comportamiento basado en datos históricos. Permite identificar tendencias recurrentes y señales relevantes que ayudan a comprender el funcionamiento real del hotel.",
                    features: [
                      "Guest profiling",
                      "Seasonal trends",
                      "Pattern recognition",
                    ],
                  },
                  {
                    icon: <Layers className="text-violet-500" />,
                    title: "Data Intelligence Engine",
                    desc: "Motor encargado de procesar y estructurar los datos de entrada. Normalización de métricas, estructuración de información y preparación de datos para el análisis profundo.",
                    features: [
                      "Data cleansing",
                      "Metric normalization",
                      "API integration",
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

          {/* AI Agents Section */}
    <section className="px-6 py-20">
  <div className="mx-auto max-w-7xl">
    <div className="mb-14 text-center">
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-emerald-400">
        <Bot size={12} />
        AI Agents
      </div>

      <h2 className="mx-auto mb-6 max-w-4xl text-3xl font-bold text-white md:text-5xl">
        Agentes inteligentes de Debacu
      </h2>

      <p className="mx-auto max-w-3xl text-lg leading-relaxed text-slate-400">
        Debacu incorpora agentes inteligentes que ayudan a interpretar la
        información y generar análisis automatizados. No sustituyen al
        hotelero, sino que proporcionan asistencia inteligente basada en datos.
      </p>
    </div>

    <div className="grid items-start gap-10 lg:grid-cols-2">
      {/* Columna izquierda: tarjetas */}
      <div className="grid grid-cols-1 gap-4">
        {[
          {
            name: "Risk Analysis Agent",
            icon: <ShieldAlert size={18} />,
            desc: "Analiza señales operativas y patrones de incidencias.",
            status: "Active",
          },
          {
            name: "Revenue Analysis Agent",
            icon: <TrendingUp size={18} />,
            desc: "Evalúa tendencias de ingresos y desviaciones comerciales.",
            status: "Monitoring",
          },
          {
            name: "Operational Insight Agent",
            icon: <Zap size={18} />,
            desc: "Detecta mejoras posibles en procesos internos.",
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
                <h4 className="text-sm font-bold text-white">{agent.name}</h4>
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

      {/* Columna derecha: beneficios */}
      <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-8 backdrop-blur-sm">
        <h3 className="mb-6 text-xl font-bold text-white">
          Qué aportan estos agentes
        </h3>

        <ul className="space-y-4">
          {[
            "Analizar métricas operativas automáticamente",
            "Detectar anomalías en tiempo real",
            "Interpretar tendencias complejas",
            "Sugerir posibles acciones preventivas",
          ].map((item, i) => (
            <li key={i} className="flex items-center gap-3 text-slate-300">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 size={12} className="text-emerald-500" />
              </div>
              {item}
            </li>
          ))}
        </ul>

        <p className="mt-8 text-sm leading-relaxed text-slate-500">
          Su función es aportar una capa adicional de lectura, priorización y
          apoyo analítico sobre la base de datos operativa del hotel.
        </p>
      </div>
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
                      Debacu se desarrolla como una plataforma SaaS multiempresa
                      diseñada para escalar a múltiples alojamientos con máxima
                      eficiencia y seguridad.
                    </p>

                    <div className="grid grid-cols-2 gap-6">
                      {[
                        { icon: <Cloud size={20} />, label: "Cloud Native" },
                        {
                          icon: <Lock size={20} />,
                          label: "Multi-tenant Isolation",
                        },
                        {
                          icon: <Server size={20} />,
                          label: "Efficient Processing",
                        },
                        {
                          icon: <Network size={20} />,
                          label: "Continuous Updates",
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
                Innovación tecnológica aplicada al sector hospitality
              </h2>

              <p className="mx-auto mb-12 max-w-3xl text-lg text-slate-400">
                Debacu introduce una aproximación innovadora al combinar análisis
                de datos operativos, evaluación estructurada de eventos e
                inteligencia artificial aplicada.
              </p>

              <button
                onClick={() => navigate("/documentacion")}
                className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-500"
              >
                Explorar Documentación Técnica <ArrowRight size={16} />
              </button>
            </div>
          </section>
        </main>

        <WebFooter />
      </div>
    </div>
  );
}