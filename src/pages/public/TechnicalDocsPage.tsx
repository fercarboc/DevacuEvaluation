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
                  Technical Documentation
                </div>

                <h1 className="mb-8 text-4xl font-bold text-white md:text-6xl">
                  Documentación técnica de Debacu AI
                </h1>

                <p className="mb-12 max-w-3xl text-lg text-slate-400 md:text-xl">
                  Descripción detallada de la arquitectura tecnológica, motores
                  analíticos y sistema de inteligencia artificial de la plataforma
                  Debacu.
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
                    { label: "Visión General", id: "overview" },
                    { label: "Ingesta de Datos", id: "ingestion" },
                    { label: "Modelo de Datos", id: "model" },
                    { label: "Procesamiento", id: "processing" },
                    { label: "Motores Analíticos", id: "engines" },
                    { label: "Debacu AI", id: "ai" },
                    { label: "Agentes Inteligentes", id: "agents" },
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
                    Debacu está diseñado como una plataforma de inteligencia
                    operativa de extremo a extremo. El sistema procesa flujos de
                    datos complejos para convertirlos en señales accionables
                    mediante una arquitectura desacoplada y escalable.
                  </p>

                  <p>
                    La plataforma está compuesta por cuatro capas principales que
                    garantizan la integridad y el valor de la información:
                  </p>

                  <div className="my-12 grid grid-cols-1 gap-4 md:grid-cols-4">
                    {[
                      { step: "1", label: "Captura", icon: <Database size={16} /> },
                      { step: "2", label: "Procesamiento", icon: <Cpu size={16} /> },
                      { step: "3", label: "Inteligencia", icon: <BrainCircuit size={16} /> },
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
{`sources: [PMS, CSV, IoT, OPS]
pipeline:
  - normalization_layer
  - classification_engine
  - intelligence_core: [Risk, Revenue, Behaviour]
  - output: [Dashboard, Webhook, Alert]`}
                    </pre>
                  </div>
                </DocSection>

                <DocSection title="Ingesta de datos" id="ingestion">
                  <p>
                    Debacu puede capturar datos desde múltiples fuentes del hotel,
                    permitiendo una visión unificada de la operativa.
                  </p>

                  <div className="my-8 grid gap-6 md:grid-cols-2">
                    <TechBlock title="Fuentes Soportadas" icon={<Share2 size={20} />}>
                      <ul className="space-y-2">
                        <li className="flex items-center gap-2">
                          <CheckCircle2 size={12} className="text-emerald-500" />
                          PMS del hotel
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 size={12} className="text-emerald-500" />
                          Exportaciones CSV/Excel
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 size={12} className="text-emerald-500" />
                          Registros operativos
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 size={12} className="text-emerald-500" />
                          Información de reservas
                        </li>
                      </ul>
                    </TechBlock>

                    <TechBlock title="Data Platform" icon={<Database size={20} />}>
                      Todos los datos se almacenan en un modelo estructurado para
                      garantizar consistencia analítica.
                    </TechBlock>
                  </div>
                </DocSection>

                <DocSection title="Modelo de datos" id="model">
                  <p>
                    El modelo de datos está orientado a hospitality y busca unir
                    operativa, riesgo y revenue dentro de una base analítica común.
                  </p>

                  <div className="my-8 grid gap-6 md:grid-cols-2">
                    <TechBlock title="Modelo unificado" icon={<Layers size={20} />}>
                      Propiedades, reservas, incidencias, eventos y señales
                      analíticas se relacionan dentro de una estructura preparada
                      para explotación operativa y comercial.
                    </TechBlock>

                    <TechBlock title="Escalabilidad" icon={<Cloud size={20} />}>
                      El diseño permite crecimiento progresivo por módulos, por
                      propiedad y por volumen de datos sin rehacer la base del sistema.
                    </TechBlock>
                  </div>
                </DocSection>

                <DocSection title="Procesamiento" id="processing">
                  <p>
                    El procesamiento transforma datos heterogéneos en señales
                    comparables y útiles para el análisis posterior.
                  </p>

                  <div className="my-8 grid gap-6 md:grid-cols-2">
                    <TechBlock title="Normalización" icon={<Cpu size={20} />}>
                      Limpieza, homogeneización y validación de los datos entrantes.
                    </TechBlock>

                    <TechBlock title="Clasificación" icon={<Zap size={20} />}>
                      Reglas y lógica analítica para asignar categorías, estados,
                      patrones y contexto operativo.
                    </TechBlock>
                  </div>
                </DocSection>

                <DocSection title="Motores analíticos de Debacu" id="engines">
                  <div className="my-8 grid gap-6 md:grid-cols-2">
                    <TechBlock title="Risk Intelligence" icon={<ShieldAlert size={20} />}>
                      Detección de patrones de riesgo operativo.
                    </TechBlock>

                    <TechBlock title="Revenue Intelligence" icon={<TrendingUp size={20} />}>
                      Análisis de producción por canal y evolución del revenue.
                    </TechBlock>

                    <TechBlock title="Behaviour Analysis" icon={<Activity size={20} />}>
                      Identificación de patrones de comportamiento.
                    </TechBlock>

                    <TechBlock title="Data Intelligence" icon={<Layers size={20} />}>
                      Procesamiento estructurado de datos.
                    </TechBlock>
                  </div>
                </DocSection>

                <DocSection title="Debacu AI" id="ai">
                  <p>
                    Debacu AI coordina capas analíticas, reglas y lógica avanzada
                    para convertir datos del hotel en señales accionables.
                  </p>

                  <div className="my-8 grid gap-6 md:grid-cols-2">
                    <TechBlock title="Capa de inteligencia" icon={<BrainCircuit size={20} />}>
                      Integra reglas, patrones y lógica analítica para generar una
                      lectura más profunda que un dashboard estático.
                    </TechBlock>

                    <TechBlock title="Objetivo" icon={<Zap size={20} />}>
                      Ayudar a detectar anomalías, oportunidades y riesgos antes de
                      que se conviertan en un problema operativo o comercial.
                    </TechBlock>
                  </div>
                </DocSection>

                <DocSection title="Agentes Inteligentes" id="agents">
                  <p>
                    Los agentes inteligentes actúan como una capa de asistencia
                    analítica para interpretar señales complejas.
                  </p>

                  <div className="my-8 grid gap-6 md:grid-cols-2">
                    <TechBlock title="Risk Agent" icon={<Bot size={20} />}>
                      Interpretación de patrones operativos y eventos asociados a riesgo.
                    </TechBlock>

                    <TechBlock title="Revenue Agent" icon={<Bot size={20} />}>
                      Ayuda a identificar desviaciones, oportunidades y cambios en
                      el comportamiento comercial.
                    </TechBlock>
                  </div>
                </DocSection>

                <DocSection title="Visualización" id="viz">
                  <p>
                    Toda la información analizada se traduce en paneles, alertas y
                    vistas orientadas a la toma de decisiones.
                  </p>

                  <div className="my-8 grid gap-6 md:grid-cols-2">
                    <TechBlock title="Dashboards" icon={<LayoutDashboard size={20} />}>
                      Vistas claras y operativas para dirección, revenue y gestión.
                    </TechBlock>

                    <TechBlock title="Alertas" icon={<ShieldAlert size={20} />}>
                      Señales accionables para no depender solo de revisión manual.
                    </TechBlock>
                  </div>
                </DocSection>

                <DocSection title="Arquitectura SaaS" id="saas">
                  <p>
                    Debacu está planteado como un SaaS multiempresa con separación
                    lógica de datos, escalabilidad y control de acceso.
                  </p>

                  <div className="my-8 grid gap-6 md:grid-cols-2">
                    <TechBlock title="Seguridad" icon={<Lock size={20} />}>
                      Separación por organización, control de acceso y base para
                      trazabilidad completa.
                    </TechBlock>

                    <TechBlock title="Cloud readiness" icon={<Cloud size={20} />}>
                      Diseño orientado a crecer sin rehacer la plataforma.
                    </TechBlock>
                  </div>
                </DocSection>

                <DocSection title="Innovación tecnológica" id="innovation">
                  <div className="rounded-2xl bg-blue-600 p-8 text-white">
                    <h4 className="mb-6 text-2xl font-bold">
                      Liderando la transformación del sector
                    </h4>

                    <p className="mb-8 leading-relaxed text-blue-100">
                      Debacu introduce una aproximación innovadora al combinar
                      análisis de datos operativos e inteligencia artificial.
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-xl border border-white/10 bg-white/10 p-4">
                        <p className="mb-2 text-xs font-bold uppercase tracking-widest">
                          Impacto
                        </p>
                        <p className="text-sm">+30% Eficiencia Operativa</p>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-white/10 p-4">
                        <p className="mb-2 text-xs font-bold uppercase tracking-widest">
                          Precisión
                        </p>
                        <p className="text-sm">99.2% Detección de Patrones</p>
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