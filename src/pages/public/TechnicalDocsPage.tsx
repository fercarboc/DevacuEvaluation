import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Book,
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
  Lock,
  Bot,
  Terminal,
  Share2,
} from "lucide-react";

import "@/styles/public.css";
import WebNavbar from "@/pages/public/WebNavbar";
import WebFooter from "@/pages/public/WebFooter";

const DocSection = ({
  title,
  children,
  id,
}: {
  title: string;
  children: React.ReactNode;
  id?: string;
}) => (
  <section id={id} className="mb-24 scroll-mt-32">
    <h2 className="mb-8 flex items-center gap-3 text-2xl font-bold text-white md:text-3xl">
      <div className="h-8 w-1 rounded-full bg-blue-600" />
      {title}
    </h2>

    <div className="space-y-6 leading-relaxed text-slate-400">{children}</div>
  </section>
);

const TechBlock = ({
  title,
  children,
  icon,
}: {
  title: string;
  children: React.ReactNode;
  icon: React.ReactNode;
}) => (
  <div className="rounded-2xl border border-white/[0.05] bg-slate-950/50 p-6 backdrop-blur-sm">
    <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/10 text-blue-500">
      {icon}
    </div>
    <h3 className="mb-4 text-lg font-bold text-white">{title}</h3>
    <div className="text-sm leading-relaxed text-slate-500">{children}</div>
  </div>
);

export default function TechnicalDocsPage() {
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
          <section className="border-b border-white/[0.05] bg-gradient-to-b from-blue-600/5 to-transparent py-20">
            <div className="mx-auto max-w-7xl px-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-blue-400">
                  <Book size={12} />
                  Documentación técnica
                </div>

                <h1 className="mb-8 text-4xl font-bold text-white md:text-6xl">
                  Documentación técnica de la plataforma Debacu
                </h1>

                <p className="mb-12 max-w-3xl text-lg text-slate-400 md:text-xl">
                  Resumen de la arquitectura tecnológica, modelo de datos, capas
                  analíticas y enfoque SaaS de Debacu para el tratamiento de
                  información operativa, riesgo y revenue en entornos hoteleros.
                </p>

                <button
                  onClick={() => navigate("/arquitectura")}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-500"
                >
                  Explorar arquitectura <ArrowRight size={18} />
                </button>
              </motion.div>
            </div>
          </section>

          <section className="mx-auto max-w-7xl px-6 py-20">
            <div className="flex flex-col gap-16 lg:flex-row">
              {/* Sidebar */}
              <aside className="sticky top-8 hidden w-64 shrink-0 self-start lg:block">
                <nav className="space-y-1">
                  <p className="mb-4 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                    Contenido
                  </p>

                  {[
                    { label: "Visión general", id: "overview" },
                    { label: "Ingesta de datos", id: "ingestion" },
                    { label: "Modelo de datos", id: "model" },
                    { label: "Procesamiento", id: "processing" },
                    { label: "Motores analíticos", id: "engines" },
                    { label: "Capa analítica", id: "ai" },
                    { label: "Asistencia analítica", id: "agents" },
                    { label: "Visualización", id: "viz" },
                    { label: "Arquitectura SaaS", id: "saas" },
                    { label: "Innovación", id: "innovation" },
                  ].map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className="block rounded-lg px-3 py-2 text-sm text-slate-500 transition-all hover:bg-white/[0.02] hover:text-blue-400"
                    >
                      {item.label}
                    </a>
                  ))}
                </nav>
              </aside>

              {/* Main content */}
              <div className="max-w-4xl flex-1">
                <DocSection title="Arquitectura general del sistema" id="overview">
                  <p>
                    Debacu está concebido como una plataforma de análisis operativo
                    para hoteles. Su objetivo es transformar información dispersa en
                    una base estructurada de datos y señales útiles para prevención,
                    control operativo y lectura económica del establecimiento.
                  </p>

                  <p>
                    La plataforma se articula en cuatro capas funcionales que
                    permiten incorporar datos, procesarlos, analizarlos y presentar
                    resultados de forma útil para la toma de decisiones.
                  </p>

                  <div className="my-12 grid grid-cols-1 gap-4 md:grid-cols-4">
                    {[
                      { step: "1", label: "Captura", icon: <Database size={16} /> },
                      { step: "2", label: "Procesamiento", icon: <Cpu size={16} /> },
                      { step: "3", label: "Análisis", icon: <BrainCircuit size={16} /> },
                      { step: "4", label: "Decisión", icon: <LayoutDashboard size={16} /> },
                    ].map((item, i) => (
                      <div key={i} className="flex flex-col items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-blue-500/20 bg-blue-600/10 font-bold text-blue-500">
                          {item.step}
                        </div>
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-white/[0.05] bg-slate-900/30 p-6 font-mono text-xs text-blue-400/80">
                    <div className="mb-4 flex items-center gap-2">
                      <Terminal size={14} />
                      <span>system_architecture_flow.yaml</span>
                    </div>

                    <pre className="space-y-1 whitespace-pre-wrap">
{`sources: [PMS, CSV, operational_records]
pipeline:
  - ingestion_layer
  - normalization_layer
  - analytics_layer: [risk, revenue, behaviour]
  - outputs: [dashboards, alerts, decision_views]`}
                    </pre>
                  </div>
                </DocSection>

                <DocSection title="Ingesta de datos" id="ingestion">
                  <p>
                    Debacu puede incorporar información desde distintas fuentes del
                    hotel para construir una visión unificada de la operativa, las
                    reservas y determinadas señales relevantes para análisis.
                  </p>

                  <div className="my-8 grid gap-6 md:grid-cols-2">
                    <TechBlock title="Fuentes soportadas" icon={<Share2 size={20} />}>
                      <ul className="space-y-2">
                        <li className="flex items-center gap-2">
                          <CheckCircle2 size={12} className="text-emerald-500" />
                          Sistemas PMS
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 size={12} className="text-emerald-500" />
                          Exportaciones CSV o Excel estructurado
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 size={12} className="text-emerald-500" />
                          Registros operativos del establecimiento
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 size={12} className="text-emerald-500" />
                          Datos de reservas y producción
                        </li>
                      </ul>
                    </TechBlock>

                    <TechBlock title="Base de datos analítica" icon={<Database size={20} />}>
                      La información se incorpora a un modelo estructurado que busca
                      mantener consistencia analítica, trazabilidad y capacidad de
                      crecimiento por propiedad, módulo o volumen.
                    </TechBlock>
                  </div>
                </DocSection>

                <DocSection title="Modelo de datos" id="model">
                  <p>
                    El modelo de datos de Debacu está orientado al sector hospitality
                    y busca relacionar operativa, riesgo y revenue dentro de una base
                    analítica común.
                  </p>

                  <div className="my-8 grid gap-6 md:grid-cols-2">
                    <TechBlock title="Modelo unificado" icon={<Layers size={20} />}>
                      Propiedades, reservas, incidencias, eventos y señales analíticas
                      se relacionan dentro de una estructura preparada para
                      explotación operativa, comparativa y económica.
                    </TechBlock>

                    <TechBlock title="Escalabilidad del modelo" icon={<Cloud size={20} />}>
                      El diseño permite crecimiento progresivo por módulos, por hotel
                      o por grupo, sin necesidad de rehacer la base estructural del
                      sistema.
                    </TechBlock>
                  </div>
                </DocSection>

                <DocSection title="Procesamiento" id="processing">
                  <p>
                    El procesamiento transforma información heterogénea en señales
                    comparables y datos preparados para análisis posteriores.
                  </p>

                  <div className="my-8 grid gap-6 md:grid-cols-2">
                    <TechBlock title="Normalización" icon={<Cpu size={20} />}>
                      Limpieza, validación, homogeneización de estructuras y
                      preparación de los datos entrantes para mantener consistencia
                      entre distintas fuentes.
                    </TechBlock>

                    <TechBlock title="Clasificación analítica" icon={<Zap size={20} />}>
                      Aplicación de reglas y lógica analítica para asignar categorías,
                      estados, patrones y contexto operativo a la información
                      procesada.
                    </TechBlock>
                  </div>
                </DocSection>

                <DocSection title="Motores analíticos de Debacu" id="engines">
                  <div className="my-8 grid gap-6 md:grid-cols-2">
                    <TechBlock title="Risk Intelligence" icon={<ShieldAlert size={20} />}>
                      Motor orientado a detección de señales de riesgo operativo,
                      incidencias repetitivas y patrones relevantes para prevención y
                      control.
                    </TechBlock>

                    <TechBlock title="Revenue Intelligence" icon={<TrendingUp size={20} />}>
                      Motor analítico para lectura de producción, canal, segmento,
                      comportamiento de reserva y posibles desviaciones económicas.
                    </TechBlock>

                    <TechBlock title="Behaviour Analysis" icon={<Activity size={20} />}>
                      Capa de análisis orientada a identificar patrones de
                      comportamiento, repeticiones y tendencias útiles para el
                      entendimiento de la operativa real.
                    </TechBlock>

                    <TechBlock title="Data Intelligence" icon={<Layers size={20} />}>
                      Capa responsable de estructurar, preparar y estabilizar la base
                      de datos para análisis consistentes y comparables.
                    </TechBlock>
                  </div>
                </DocSection>

                <DocSection title="Capa analítica" id="ai">
                  <p>
                    Debacu incorpora una capa analítica que coordina reglas,
                    patrones, clasificación de señales y lógica de lectura de datos
                    para convertir información del hotel en indicadores útiles.
                  </p>

                  <div className="my-8 grid gap-6 md:grid-cols-2">
                    <TechBlock title="Lógica de análisis" icon={<BrainCircuit size={20} />}>
                      Integra reglas, patrones, correlaciones y criterios de lectura
                      analítica para aportar una interpretación más profunda que una
                      simple visualización estática.
                    </TechBlock>

                    <TechBlock title="Objetivo funcional" icon={<Zap size={20} />}>
                      Detectar anomalías, oportunidades y riesgos antes de que se
                      conviertan en un problema operativo, reputacional o económico.
                    </TechBlock>
                  </div>
                </DocSection>

                <DocSection title="Asistencia analítica" id="agents">
                  <p>
                    Debacu contempla asistentes analíticos orientados a facilitar la
                    interpretación de señales complejas y a resumir información
                    relevante para el usuario.
                  </p>

                  <div className="my-8 grid gap-6 md:grid-cols-2">
                    <TechBlock title="Risk Assistant" icon={<Bot size={20} />}>
                      Ayuda a interpretar señales operativas, incidencias y patrones
                      asociados a prevención y control interno.
                    </TechBlock>

                    <TechBlock title="Revenue Assistant" icon={<Bot size={20} />}>
                      Ayuda a identificar desviaciones, oportunidades y cambios en el
                      comportamiento comercial a partir de la información disponible.
                    </TechBlock>
                  </div>
                </DocSection>

                <DocSection title="Visualización" id="viz">
                  <p>
                    La información procesada y analizada se presenta mediante paneles,
                    alertas y vistas orientadas a facilitar la lectura de la situación
                    operativa y económica del hotel.
                  </p>

                  <div className="my-8 grid gap-6 md:grid-cols-2">
                    <TechBlock title="Dashboards" icon={<LayoutDashboard size={20} />}>
                      Vistas operativas para dirección, revenue, análisis interno y
                      seguimiento de señales relevantes.
                    </TechBlock>

                    <TechBlock title="Alertas" icon={<ShieldAlert size={20} />}>
                      Señales accionables para reducir dependencia de revisión manual
                      y mejorar capacidad de respuesta.
                    </TechBlock>
                  </div>
                </DocSection>

                <DocSection title="Arquitectura SaaS" id="saas">
                  <p>
                    Debacu está planteado como una plataforma SaaS multi-tenant con
                    separación lógica por organización, control de acceso y capacidad
                    de escalado progresivo.
                  </p>

                  <div className="my-8 grid gap-6 md:grid-cols-2">
                    <TechBlock title="Seguridad y control" icon={<Lock size={20} />}>
                      Separación por organización, trazabilidad, control de acceso y
                      base técnica para operación multiempresa.
                    </TechBlock>

                    <TechBlock title="Preparación para crecimiento" icon={<Cloud size={20} />}>
                      Diseño orientado a crecer por hoteles, módulos, usuarios y
                      volumen de datos sin rediseñar la plataforma.
                    </TechBlock>
                  </div>
                </DocSection>

                <DocSection title="Innovación tecnológica" id="innovation">
                  <div className="rounded-2xl border border-blue-500/20 bg-blue-600/10 p-8 text-white">
                    <h4 className="mb-6 text-2xl font-bold">
                      Innovación aplicada a la gestión hotelera
                    </h4>

                    <p className="mb-8 leading-relaxed text-blue-100">
                      Debacu combina arquitectura SaaS, normalización de datos y
                      capas analíticas especializadas para crear una base tecnológica
                      orientada a riesgo operativo, comportamiento y revenue.
                    </p>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="rounded-xl border border-white/10 bg-white/10 p-4">
                        <p className="mb-2 text-xs font-bold uppercase tracking-widest">
                          Enfoque
                        </p>
                        <p className="text-sm">
                          Integración de operativa, riesgo y revenue en una base
                          analítica común.
                        </p>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-white/10 p-4">
                        <p className="mb-2 text-xs font-bold uppercase tracking-widest">
                          Objetivo
                        </p>
                        <p className="text-sm">
                          Mejorar capacidad de análisis, prevención y decisión en
                          entornos hoteleros reales.
                        </p>
                      </div>
                    </div>
                  </div>
                </DocSection>
              </div>
            </div>
          </section>
        </main>

        <WebFooter />
      </div>
    </div>
  );
}
