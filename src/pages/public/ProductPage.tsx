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
  <div className="rounded-2xl border border-white/[0.05] bg-slate-950/50 p-6 md:p-7 flex flex-col h-full group hover:border-blue-500/30 transition-all backdrop-blur-sm">
    <div className="w-11 h-11 rounded-xl bg-blue-600/10 flex items-center justify-center mb-5 text-blue-500 group-hover:scale-110 transition-transform">
      {icon}
    </div>

    <h3 className="text-lg md:text-xl font-bold mb-3 text-white">{title}</h3>
    <p className="text-sm text-slate-400 mb-6 leading-relaxed">{description}</p>

    <div className="mt-auto space-y-2.5">
      {functions.map((f, i) => (
        <div key={i} className="flex items-center gap-3 text-xs text-slate-500">
          <div className="w-1 h-1 rounded-full bg-blue-500" />
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
  <div className="relative flex flex-col items-center text-center group">
    <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-white/10 flex items-center justify-center mb-5 text-blue-500 relative z-10 group-hover:border-blue-500/50 transition-all">
      {icon}
      <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-blue-600 text-[10px] font-bold text-white flex items-center justify-center border-2 border-[#020617]">
        {number}
      </div>
    </div>

    <h4 className="text-base md:text-lg font-bold mb-2 text-white">{title}</h4>
    <p className="text-sm text-slate-500 max-w-[220px] leading-relaxed">
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
      <div className="min-h-full flex flex-col">
        <WebNavbar />

        <main className="pt-20 flex-grow">
          {/* Hero Section */}
          <section className="pt-16 pb-24 px-6 relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-600/10 via-transparent to-transparent -z-10" />

            <div className="max-w-7xl mx-auto text-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 max-w-4xl mx-auto leading-[1.1] text-white">
                  La plataforma de inteligencia operativa para hoteles
                </h1>

                <p className="text-base md:text-lg text-slate-400 max-w-3xl mx-auto mb-10 leading-relaxed">
                  Debacu analiza datos operativos y comerciales del hotel para
                  detectar patrones, generar alertas y ayudar a tomar decisiones
                  más inteligentes.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
                  <button
                    onClick={() => navigate("/solicitar-acceso")}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-base px-7 py-3.5 w-full sm:w-auto transition-colors"
                  >
                    Solicitar acceso <ChevronRight size={18} />
                  </button>

                  <button
                    onClick={() => navigate("/tecnologia")}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-semibold text-base px-7 py-3.5 w-full sm:w-auto transition-colors"
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
                <div className="absolute -inset-10 bg-blue-600/20 blur-[100px] rounded-full opacity-30 -z-10" />
                <DashboardMockup />
              </motion.div>
            </div>
          </section>

          {/* Sector Problem */}
          <section className="px-6 py-16 md:py-20 bg-slate-950/50 border-y border-white/[0.05]">
            <div className="max-w-7xl mx-auto">
              <div className="grid lg:grid-cols-2 gap-12 md:gap-16 items-center">
                <div>
                  <h2 className="text-2xl md:text-4xl font-bold mb-6 leading-tight text-white max-w-3xl">
                    Los hoteles generan datos constantemente, pero rara vez los
                    utilizan para tomar mejores decisiones
                  </h2>

                  <p className="text-slate-400 text-base md:text-lg mb-8 leading-relaxed max-w-2xl">
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
                      <div key={i} className="flex items-center gap-3 text-slate-300 text-sm md:text-base">
                        <AlertCircle size={18} className="text-blue-500 shrink-0" />
                        <span>{p}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6 md:p-8 backdrop-blur-sm">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center text-blue-500">
                        <Zap size={20} />
                      </div>
                      <h4 className="font-bold text-white">Solución Debacu</h4>
                    </div>

                    <p className="text-slate-400 text-sm leading-relaxed mb-6">
                      Nuestra plataforma centraliza, normaliza y analiza cada señal
                      operativa para que el equipo de gestión pueda actuar de forma
                      proactiva en lugar de reactiva.
                    </p>

                    <div className="h-32 bg-slate-900/50 rounded-lg border border-white/5 flex items-center justify-center overflow-hidden">
                      <div className="flex gap-2">
                        {[40, 70, 45, 90, 65, 80].map((h, i) => (
                          <motion.div
                            key={i}
                            initial={{ height: 0 }}
                            whileInView={{ height: h }}
                            viewport={{ once: true }}
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
          <section className="px-6 py-16 md:py-20">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-14 md:mb-16">
                <h2 className="text-2xl md:text-4xl font-bold mb-4 text-white max-w-4xl mx-auto">
                  Una plataforma diseñada para entender lo que ocurre en tu hotel
                </h2>
                <p className="text-slate-400 max-w-2xl mx-auto text-sm md:text-base">
                  Cuatro pilares fundamentales para profesionalizar la gestión de
                  tu alojamiento.
                </p>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
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
          <section className="px-6 py-16 md:py-20 bg-slate-950/30">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-14 md:mb-16">
                <h2 className="text-2xl md:text-4xl font-bold mb-4 text-white">
                  Cómo funciona Debacu
                </h2>
                <p className="text-slate-500 text-sm md:text-base">
                  Un proceso fluido desde la captura hasta la decisión.
                </p>
              </div>

              <div className="grid md:grid-cols-4 gap-10 md:gap-12 relative">
                <div className="hidden md:block absolute top-8 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/20 to-transparent -z-0" />

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
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-14 md:mb-16">
                <h2 className="text-2xl md:text-4xl font-bold mb-4 text-white">
                  Módulos de la plataforma
                </h2>
                <p className="text-slate-500 text-sm md:text-base">
                  Herramientas especializadas para cada área de gestión.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6 md:gap-8">
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
                    className="p-6 md:p-8 bg-white/[0.02] border border-white/[0.05] rounded-2xl flex gap-5 md:gap-6 group hover:bg-white/[0.04] transition-all"
                  >
                    <div className="w-11 h-11 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center shrink-0">
                      {module.icon}
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-white mb-2">
                        {module.title}
                      </h4>
                      <p className="text-sm text-slate-500 leading-relaxed">
                        {module.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Dashboard Section */}
          <section className="px-6 py-16 md:py-20 bg-slate-950/50">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-12 md:mb-14">
                <h2 className="text-2xl md:text-4xl font-bold mb-4 text-white">
                  Panel de inteligencia del hotel
                </h2>
                <p className="text-slate-400 max-w-2xl mx-auto text-sm md:text-base leading-relaxed">
                  Una visión clara y en tiempo real de lo que está ocurriendo en tu
                  hotel para una gestión sin sorpresas.
                </p>
              </div>

              <div className="mx-auto max-w-5xl rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3 overflow-hidden backdrop-blur-sm">
                    <div className="aspect-[16/8] md:aspect-[16/7] bg-slate-900 rounded-lg overflow-hidden relative group">
                   <img
                    src={panelDebacu}
                    alt="Panel Debacu"
                    className="w-full h-full object-cover object-top opacity-80 group-hover:scale-[1.02] transition-transform duration-700"
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-[#020617]/20 via-transparent to-transparent" />
                </div>
              </div>
            </div>
          </section>

          {/* For Whom */}
          <section className="px-6 py-16 md:py-20">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-14 md:mb-16">
                <h2 className="text-2xl md:text-4xl font-bold mb-4 text-white max-w-4xl mx-auto">
                  Diseñado para hoteles que quieren operar con más inteligencia
                </h2>
                <p className="text-slate-500 text-sm md:text-base">
                  Soluciones adaptadas a cada tipo de alojamiento.
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-5 md:gap-6">
                {[
                  { name: "Hoteles independientes", icon: <Hotel size={22} /> },
                  { name: "Cadenas pequeñas", icon: <Building2 size={22} /> },
                  { name: "Apartamentos turísticos", icon: <Home size={22} /> },
                  { name: "Alojamientos rurales", icon: <Trees size={22} /> },
                  { name: "Grupos hoteleros", icon: <Users size={22} /> },
                ].map((segment, i) => (
                  <div
                    key={i}
                    className="p-5 md:p-6 bg-white/[0.02] border border-white/[0.05] rounded-xl text-center flex flex-col items-center gap-4 hover:bg-white/[0.05] transition-all cursor-default"
                  >
                    <div className="text-blue-500">{segment.icon}</div>
                    <span className="text-xs font-bold text-slate-400 leading-tight">
                      {segment.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Benefits */}
          <section className="px-6 py-16 md:py-20 bg-blue-600/5">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-14 md:mb-16">
                <h2 className="text-2xl md:text-4xl font-bold mb-4 text-white">
                  Beneficios de utilizar Debacu
                </h2>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
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
                    <CheckCircle2 className="text-blue-500 shrink-0" size={22} />
                    <div>
                      <h4 className="font-bold text-white mb-2 text-base">
                        {benefit.title}
                      </h4>
                      <p className="text-sm text-slate-500 leading-relaxed">
                        {benefit.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Final CTA */}
          <section className="px-6 py-16 md:py-20 bg-gradient-to-b from-transparent to-blue-600/10">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-3xl md:text-5xl font-bold mb-6 text-white leading-tight">
                Convierte los datos de tu hotel en decisiones inteligentes
              </h2>
              <p className="text-base md:text-lg text-slate-400 mb-10 leading-relaxed">
                Únete a los hoteles que ya están profesionalizando su operativa
                con inteligencia artificial.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={() => navigate("/solicitar-acceso")}
                  className="inline-flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-base px-8 py-4 w-full sm:w-auto transition-colors"
                >
                  Solicitar acceso
                </button>

                <button
                  onClick={() => navigate("/tecnologia")}
                  className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-semibold text-base px-8 py-4 w-full sm:w-auto transition-colors"
                >
                  Explorar tecnología
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