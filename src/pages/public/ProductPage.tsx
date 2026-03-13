import React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
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
  AlertCircle,
  Layers,
} from "lucide-react";

import WebNavbar from "@/pages/public/WebNavbar";
import WebFooter from "@/pages/public/WebFooter";
import { DashboardMockup } from "@/pages/public/DashboardMockup";
import panelDebacu from "@/img/paneldebacu.png";

const FeatureCard = ({
  title,
  description,
  functions,
  icon,
}: {
  title: string;
  description: string;
  functions: string[];
  icon: React.ReactNode;
}) => (
  <div className="group flex h-full flex-col rounded-2xl border border-white/[0.05] bg-slate-950/50 p-6 backdrop-blur-sm transition-all hover:border-blue-500/30 md:p-7">
    <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600/10 text-blue-500 transition-transform group-hover:scale-110">
      {icon}
    </div>

    <h3 className="mb-3 text-lg font-bold text-white md:text-xl">{title}</h3>
    <p className="mb-6 text-sm leading-relaxed text-slate-400">{description}</p>

    <div className="mt-auto space-y-2.5">
      {functions.map((f, i) => (
        <div key={i} className="flex items-center gap-3 text-xs text-slate-500">
          <div className="h-1 w-1 rounded-full bg-blue-500" />
          {f}
        </div>
      ))}
    </div>
  </div>
);

const Step = ({
  number,
  title,
  description,
  icon,
}: {
  number: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) => (
  <div className="group relative flex flex-col items-center text-center">
    <div className="relative z-10 mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-blue-500 transition-all group-hover:border-blue-500/50">
      {icon}
      <div className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#020617] bg-blue-600 text-[10px] font-bold text-white">
        {number}
      </div>
    </div>

    <h4 className="mb-2 text-base font-bold text-white md:text-lg">{title}</h4>
    <p className="max-w-[220px] text-sm leading-relaxed text-slate-500">
      {description}
    </p>
  </div>
);

export default function ProductPage() {
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
          <section className="relative overflow-hidden px-6 pb-24 pt-16">
            <div className="absolute left-1/2 top-0 -z-10 h-full w-full -translate-x-1/2 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-600/10 via-transparent to-transparent" />

            <div className="mx-auto max-w-7xl text-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <h1 className="mx-auto mb-6 max-w-4xl text-3xl font-bold leading-[1.1] tracking-tight text-white md:text-5xl lg:text-6xl">
                  La plataforma de inteligencia operativa para hoteles
                </h1>

                <p className="mx-auto mb-10 max-w-3xl text-base leading-relaxed text-slate-400 md:text-lg">
                  Debacu analiza datos operativos y comerciales del hotel para
                  detectar patrones, generar alertas y ayudar a tomar decisiones
                  más inteligentes.
                </p>

                <div className="mb-16 flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <button
                    onClick={() => navigate("/solicitar-acceso")}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-blue-500 sm:w-auto"
                  >
                    Solicitar acceso <ChevronRight size={18} />
                  </button>

                  <button
                    onClick={() => navigate("/tecnologia")}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/10 sm:w-auto"
                  >
                    Ver tecnología <ChevronRight size={18} />
                  </button>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 40 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="relative"
              >
                <div className="absolute -inset-10 -z-10 rounded-full bg-blue-600/20 opacity-30 blur-[100px]" />
                <DashboardMockup />
              </motion.div>
            </div>
          </section>

          {/* Sector Problem */}
          <section className="border-y border-white/[0.05] bg-slate-950/50 px-6 py-16 md:py-20">
            <div className="mx-auto max-w-7xl">
              <div className="grid items-center gap-12 md:gap-16 lg:grid-cols-2">
                <div>
                  <h2 className="max-w-3xl mb-6 text-2xl font-bold leading-tight text-white md:text-4xl">
                    Los hoteles generan datos constantemente, pero rara vez los
                    utilizan para tomar mejores decisiones
                  </h2>

                  <p className="mb-8 max-w-2xl text-base leading-relaxed text-slate-400 md:text-lg">
                    Debacu transforma estos datos en inteligencia accionable,
                    resolviendo los problemas estructurales de visibilidad en el
                    sector hospitality.
                  </p>

                  <div className="space-y-4">
                    {[
                      "Incidencias operativas que no se analizan",
                      "Falta de visibilidad sobre patrones de comportamiento",
                      "Fugas de revenue difíciles de detectar",
                      "Información dispersa entre sistemas",
                    ].map((p, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 text-sm text-slate-300 md:text-base"
                      >
                        <AlertCircle
                          size={18}
                          className="shrink-0 text-blue-500"
                        />
                        <span>{p}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6 backdrop-blur-sm md:p-8">
                    <div className="mb-6 flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/20 text-blue-500">
                        <Zap size={20} />
                      </div>
                      <h4 className="font-bold text-white">Solución Debacu</h4>
                    </div>

                    <p className="mb-6 text-sm leading-relaxed text-slate-400">
                      Nuestra plataforma centraliza, normaliza y analiza cada señal
                      operativa para que el equipo de gestión pueda actuar de forma
                      proactiva en lugar de reactiva.
                    </p>

                    <div className="flex h-32 items-center justify-center overflow-hidden rounded-lg border border-white/5 bg-slate-900/50">
                      <div className="flex gap-2">
                        {[40, 70, 45, 90, 65, 80].map((h, i) => (
                          <motion.div
                            key={i}
                            initial={{ height: 0 }}
                            whileInView={{ height: h }}
                            viewport={{ once: true }}
                            className="w-4 rounded-t-sm bg-blue-600/40"
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
          <section className="px-6 py-16 md:py-20">
            <div className="mx-auto max-w-7xl">
              <div className="mb-14 text-center md:mb-16">
                <h2 className="mx-auto mb-4 max-w-4xl text-2xl font-bold text-white md:text-4xl">
                  Una plataforma diseñada para entender lo que ocurre en tu hotel
                </h2>
                <p className="mx-auto max-w-2xl text-sm text-slate-400 md:text-base">
                  Cuatro pilares fundamentales para profesionalizar la gestión de
                  tu alojamiento.
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <FeatureCard
                  title="Evaluación de riesgo operativo"
                  description="Debacu analiza incidencias y señales operativas para detectar patrones que afectan al funcionamiento del hotel."
                  icon={<ShieldAlert size={22} />}
                  functions={[
                    "Registro estructurado de incidencias",
                    "Detección de patrones repetitivos",
                    "Indicadores de riesgo operativo",
                  ]}
                />

                <FeatureCard
                  title="Revenue Intelligence"
                  description="Debacu analiza datos comerciales del hotel para entender cómo se genera el revenue y detectar fugas."
                  icon={<TrendingUp size={22} />}
                  functions={[
                    "Producción por canal",
                    "Comportamiento de reserva",
                    "Evolución de ingresos",
                  ]}
                />

                <FeatureCard
                  title="Análisis de comportamiento"
                  description="Debacu permite detectar patrones de comportamiento en los datos del hotel para anticipar necesidades."
                  icon={<Activity size={22} />}
                  functions={[
                    "Identificación de tendencias",
                    "Detección de anomalías",
                    "Análisis de actividad histórica",
                  ]}
                />

                <FeatureCard
                  title="Inteligencia artificial aplicada"
                  description="La plataforma utiliza motores analíticos y agentes inteligentes para interpretar los datos del hotel automáticamente."
                  icon={<BrainCircuit size={22} />}
                  functions={[
                    "Detección automática de patrones",
                    "Interpretación de tendencias",
                    "Recomendaciones operativas",
                  ]}
                />
              </div>
            </div>
          </section>

          {/* How it Works */}
          <section className="bg-slate-950/30 px-6 py-16 md:py-20">
            <div className="mx-auto max-w-7xl">
              <div className="mb-14 text-center md:mb-16">
                <h2 className="mb-4 text-2xl font-bold text-white md:text-4xl">
                  Cómo funciona Debacu
                </h2>
                <p className="text-sm text-slate-500 md:text-base">
                  Un proceso fluido desde la captura hasta la decisión.
                </p>
              </div>

              <div className="relative grid gap-10 md:grid-cols-4 md:gap-12">
                <div className="absolute top-8 -z-0 hidden h-[1px] w-full bg-gradient-to-r from-transparent via-blue-500/20 to-transparent md:block" />

                <Step
                  number="1"
                  title="Captura de datos"
                  description="El sistema recibe información desde PMS, exportaciones CSV y registros operativos."
                  icon={<Database size={22} />}
                />
                <Step
                  number="2"
                  title="Procesamiento"
                  description="Los datos se normalizan y se estructuran en un modelo analítico coherente."
                  icon={<Cpu size={22} />}
                />
                <Step
                  number="3"
                  title="Análisis inteligente"
                  description="Los motores analíticos detectan patrones y generan señales de valor."
                  icon={<Zap size={22} />}
                />
                <Step
                  number="4"
                  title="Visualización"
                  description="El hotel visualiza dashboards, alertas y métricas clave para actuar."
                  icon={<LayoutDashboard size={22} />}
                />
              </div>
            </div>
          </section>

          {/* Product Modules */}
          <section className="px-6 py-16 md:py-20">
            <div className="mx-auto max-w-7xl">
              <div className="mb-14 text-center md:mb-16">
                <h2 className="mb-4 text-2xl font-bold text-white md:text-4xl">
                  Módulos de la plataforma
                </h2>
                <p className="text-sm text-slate-500 md:text-base">
                  Herramientas especializadas para cada área de gestión.
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2 md:gap-8">
                {[
                  {
                    title: "Risk Intelligence",
                    desc: "Sistema de análisis de señales operativas que permite detectar patrones de riesgo en la actividad del hotel.",
                    icon: <ShieldAlert className="text-blue-500" />,
                  },
                  {
                    title: "Revenue Intelligence",
                    desc: "Panel analítico que permite entender la evolución del revenue del hotel y optimizar la distribución.",
                    icon: <TrendingUp className="text-emerald-500" />,
                  },
                  {
                    title: "Behaviour Analysis",
                    desc: "Herramienta de análisis de comportamiento basada en datos históricos para predecir tendencias.",
                    icon: <Activity className="text-violet-500" />,
                  },
                  {
                    title: "Data Intelligence",
                    desc: "Sistema encargado de procesar y estructurar los datos antes del análisis profundo.",
                    icon: <Layers className="text-blue-400" />,
                  },
                ].map((module, i) => (
                  <div
                    key={i}
                    className="group flex gap-5 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6 transition-all hover:bg-white/[0.04] md:gap-6 md:p-8"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-900">
                      {module.icon}
                    </div>
                    <div>
                      <h4 className="mb-2 text-lg font-bold text-white">
                        {module.title}
                      </h4>
                      <p className="text-sm leading-relaxed text-slate-500">
                        {module.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Dashboard Section */}
          <section className="bg-slate-950/50 px-6 py-16 md:py-20">
            <div className="mx-auto max-w-7xl">
              <div className="mb-12 text-center md:mb-14">
                <h2 className="mb-4 text-2xl font-bold text-white md:text-4xl">
                  Panel de inteligencia del hotel
                </h2>
                <p className="mx-auto max-w-2xl text-sm leading-relaxed text-slate-400 md:text-base">
                  Una visión clara y en tiempo real de lo que está ocurriendo en tu
                  hotel para una gestión sin sorpresas.
                </p>
              </div>

              <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3 backdrop-blur-sm">
                <div className="group relative aspect-[16/8] overflow-hidden rounded-lg bg-slate-900 md:aspect-[16/7]">
                  <img
                    src={panelDebacu}
                    alt="Panel Debacu"
                    className="h-full w-full object-cover object-top opacity-80 transition-transform duration-700 group-hover:scale-[1.02]"
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-[#020617]/20 via-transparent to-transparent" />
                </div>
              </div>
            </div>
          </section>

          {/* For Whom */}
          <section className="px-6 py-16 md:py-20">
            <div className="mx-auto max-w-7xl">
              <div className="mb-14 text-center md:mb-16">
                <h2 className="mx-auto mb-4 max-w-4xl text-2xl font-bold text-white md:text-4xl">
                  Diseñado para hoteles que quieren operar con más inteligencia
                </h2>
                <p className="text-sm text-slate-500 md:text-base">
                  Soluciones adaptadas a cada tipo de alojamiento.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-5 md:grid-cols-5 md:gap-6">
                {[
                  { name: "Hoteles independientes", icon: <Hotel size={22} /> },
                  { name: "Cadenas pequeñas", icon: <Building2 size={22} /> },
                  { name: "Apartamentos turísticos", icon: <Home size={22} /> },
                  { name: "Alojamientos rurales", icon: <Trees size={22} /> },
                  { name: "Grupos hoteleros", icon: <Users size={22} /> },
                ].map((segment, i) => (
                  <div
                    key={i}
                    className="flex cursor-default flex-col items-center gap-4 rounded-xl border border-white/[0.05] bg-white/[0.02] p-5 text-center transition-all hover:bg-white/[0.05] md:p-6"
                  >
                    <div className="text-blue-500">{segment.icon}</div>
                    <span className="text-xs font-bold leading-tight text-slate-400">
                      {segment.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Benefits */}
          <section className="bg-blue-600/5 px-6 py-16 md:py-20">
            <div className="mx-auto max-w-7xl">
              <div className="mb-14 text-center md:mb-16">
                <h2 className="text-2xl font-bold text-white md:text-4xl">
                  Beneficios de utilizar Debacu
                </h2>
              </div>

              <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    title: "Mejor control operativo",
                    desc: "Visibilidad total sobre incidencias y procesos internos.",
                  },
                  {
                    title: "Detección temprana",
                    desc: "Identifica problemas antes de que afecten a la experiencia del huésped.",
                  },
                  {
                    title: "Comprensión del revenue",
                    desc: "Análisis profundo de canales y comportamiento de reserva.",
                  },
                  {
                    title: "Decisiones con datos",
                    desc: "Elimina la intuición y basa tu estrategia en información real.",
                  },
                ].map((benefit, i) => (
                  <div key={i} className="flex gap-4">
                    <CheckCircle2 className="shrink-0 text-blue-500" size={22} />
                    <div>
                      <h4 className="mb-2 text-base font-bold text-white">
                        {benefit.title}
                      </h4>
                      <p className="text-sm leading-relaxed text-slate-500">
                        {benefit.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Plans Preview */}
          <section className="border-t border-white/[0.05] px-6 py-16 md:py-20">
            <div className="mx-auto max-w-5xl">
              <div className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-8 backdrop-blur-sm md:p-12">
                <div className="grid gap-8 lg:grid-cols-[1.4fr_0.9fr] lg:items-center">
                  <div>
                    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-400">
                      <Zap size={12} />
                      Planes y acceso
                    </div>

                    <h2 className="mb-4 text-2xl font-bold leading-tight text-white md:text-4xl">
                      Elige la modalidad que mejor encaja con tu hotel
                    </h2>

                    <p className="max-w-2xl text-sm leading-relaxed text-slate-400 md:text-base">
                      Debacu se adapta a distintos niveles de adopción, desde
                      hoteles que empiezan con análisis operativo hasta grupos que
                      necesitan una capa más avanzada de inteligencia y revenue.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => navigate("/planes")}
                      className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-blue-500"
                    >
                      Ver planes
                    </button>

                    <button
                      onClick={() => navigate("/solicitar-acceso")}
                      className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/10"
                    >
                      Solicitar acceso
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Final CTA */}
          <section className="bg-gradient-to-b from-transparent to-blue-600/10 px-6 py-16 md:py-20">
            <div className="mx-auto max-w-4xl text-center">
              <h2 className="mb-6 text-3xl font-bold leading-tight text-white md:text-5xl">
                Convierte los datos de tu hotel en decisiones inteligentes
              </h2>
              <p className="mb-10 text-base leading-relaxed text-slate-400 md:text-lg">
                Únete a los hoteles que ya están profesionalizando su operativa
                con inteligencia artificial.
              </p>

              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <button
                  onClick={() => navigate("/solicitar-acceso")}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-blue-500 sm:w-auto"
                >
                  Solicitar acceso
                </button>

                <button
                  onClick={() => navigate("/planes")}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-white/10 sm:w-auto"
                >
                  Ver planes
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
