import React from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  BarChart3,
  Zap,
  Database,
  Cpu,
  CheckCircle2,
  ShieldAlert,
  TrendingUp,
  Activity,
  Layers,
  FileSpreadsheet,
  BrainCircuit,
  Hotel,
  Building2,
  Home,
  Landmark,
} from "lucide-react";

export const ProblemSection = () => (
  <section className="bg-slate-950/50 py-20">
    <div className="mx-auto max-w-7xl px-6">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="mb-6 text-2xl font-display font-bold leading-tight text-white md:text-4xl">
            Los hoteles disponen de datos operativos, pero rara vez los convierten en{" "}
            <span className="text-blue-500">criterios de decisión.</span>
          </h2>

          <p className="mb-6 max-w-xl text-base text-slate-400 md:text-lg">
            Debacu estructura esos datos y los convierte en análisis útil para
            mejorar prevención, control operativo y decisiones de revenue.
          </p>

          <div className="space-y-3">
            {[
              "Información dispersa entre PMS, Excel y procesos internos",
              "Incidencias operativas sin trazabilidad analítica",
              "Decisiones de revenue sin correlación con riesgo operativo",
              "Escasa visibilidad sobre patrones de comportamiento de huéspedes",
              "Falta de herramientas accesibles para análisis predictivo aplicado al hotel",
            ].map((text, i) => (
              <div key={i} className="flex items-start gap-3">
                <AlertTriangle className="mt-1 shrink-0 text-amber-500" size={18} />
                <span className="text-sm text-slate-300 md:text-base">{text}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="relative"
        >
          <div className="absolute -inset-4 rounded-full bg-blue-500/10 blur-3xl" />

          <div className="glass-card relative overflow-hidden border-white/[0.05] p-6 md:p-8">
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10">
                <FileSpreadsheet className="text-rose-500" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">Datos fragmentados</h4>
                <p className="text-xs text-slate-500">
                  Menor capacidad de análisis y control
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                <div className="h-full w-3/4 bg-rose-500/50" />
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                <div className="h-full w-1/2 bg-amber-500/50" />
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                <div className="h-full w-2/3 bg-slate-500/50" />
              </div>
            </div>

            <div className="mt-6 flex justify-center border-t border-white/5 pt-6">
              <div className="flex items-center gap-2 text-sm font-bold text-blue-400">
                <Zap size={16} />
                <span>Estructurar, analizar y decidir</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  </section>
);

export const FeaturesSection = () => (
  <section className="py-20">
    <div className="mx-auto max-w-7xl px-6">
      <div className="mb-12 text-center">
        <h2 className="mb-4 text-2xl font-display font-bold text-white md:text-4xl">
          Qué hace Debacu
        </h2>
        <p className="mx-auto max-w-2xl text-sm text-slate-400 md:text-base">
          Una plataforma orientada a convertir datos operativos en prevención,
          control y capacidad de decisión para el hotel.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {[
          {
            icon: <ShieldAlert className="text-blue-500" />,
            title: "Risk Intelligence",
            desc:
              "Registro y evaluación estructurada de señales operativas e incidencias que permiten detectar patrones de riesgo asociados a huéspedes o reservas.",
          },
          {
            icon: <Activity className="text-emerald-500" />,
            title: "Operational Intelligence",
            desc:
              "Conversión de datos operativos dispersos en indicadores comparables para mejorar control, trazabilidad y capacidad de respuesta.",
          },
          {
            icon: <TrendingUp className="text-violet-500" />,
            title: "Revenue Intelligence",
            desc:
              "Análisis de producción, canal, segmento y comportamiento para identificar desviaciones, fugas de ingreso y señales relevantes para la toma de decisiones.",
          },
        ].map((feature, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="glass-card glass-card-hover p-6 md:p-8"
          >
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.05] bg-white/[0.03]">
              {feature.icon}
            </div>

            <h3 className="mb-3 text-lg font-bold text-white md:text-xl">
              {feature.title}
            </h3>
            <p className="text-sm leading-relaxed text-slate-400">{feature.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

export const HowItWorks = () => (
  <section className="bg-slate-950/30 py-20">
    <div className="mx-auto max-w-7xl px-6">
      <div className="mb-12 text-center">
        <h2 className="mb-4 text-2xl font-display font-bold text-white md:text-4xl">
          Cómo funciona
        </h2>
        <p className="mx-auto max-w-2xl text-sm text-slate-400 md:text-base">
          Un flujo estructurado para transformar datos operativos en indicadores y
          señales útiles para el hotel.
        </p>
      </div>

      <div className="relative grid gap-8 md:grid-cols-4">
        <div className="absolute left-0 right-0 top-12 hidden h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent md:block" />

        {[
          {
            step: "01",
            title: "Incorporación de datos",
            desc: "El hotel incorpora datos operativos, reservas e incidencias mediante importación estructurada o integración gradual.",
            icon: <Database size={20} />,
          },
          {
            step: "02",
            title: "Normalización",
            desc: "Normalizamos la información para unificar estructuras, criterios y señales analíticas.",
            icon: <Layers size={20} />,
          },
          {
            step: "03",
            title: "Motor analítico",
            desc: "Aplicamos reglas analíticas, scoring y modelos de detección de patrones sobre la información procesada.",
            icon: <Cpu size={20} />,
          },
          {
            step: "04",
            title: "Cuadro de decisión",
            desc: "El hotel accede a alertas, indicadores y cuadros de decisión orientados a operativa y revenue.",
            icon: <LayoutDashboard size={20} />,
          },
        ].map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="relative z-10 text-center"
          >
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border-4 border-[#020617] bg-blue-600 text-white shadow-lg shadow-blue-600/20">
              {item.icon}
            </div>
            <h4 className="mb-2 text-sm font-bold text-white md:text-base">
              {item.title}
            </h4>
            <p className="text-xs leading-relaxed text-slate-500">{item.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

const LayoutDashboard = ({ size }: { size: number }) => <BarChart3 size={size} />;

export const TechSection = () => (
  <section className="py-20">
    <div className="mx-auto max-w-7xl px-6">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="glass-card border-blue-500/20 bg-blue-600/5 p-6 md:p-8"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="glass-card bg-white/5 p-4">
              <Activity className="mb-2 text-blue-500" size={20} />
              <p className="text-[10px] font-bold uppercase text-slate-500">
                Data analysis
              </p>
              <div className="mt-2 flex h-12 items-end gap-1">
                {[40, 70, 45, 90, 60].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm bg-blue-500/50"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>

            <div className="glass-card bg-white/5 p-4">
              <BrainCircuit className="mb-2 text-violet-500" size={20} />
              <p className="text-[10px] font-bold uppercase text-slate-500">
                Pattern engine
              </p>
              <div className="mt-2 space-y-2">
                <div className="h-1.5 w-full rounded-full bg-violet-500/20" />
                <div className="h-1.5 w-2/3 rounded-full bg-violet-500/20" />
              </div>
            </div>
          </div>

          <div className="glass-card mt-4 bg-white/5 p-4">
            <p className="mb-2 text-xs font-bold text-white">Señales detectadas</p>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Consistencia analítica</span>
                <span className="text-emerald-400">Alta</span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
                <div className="h-full w-[82%] bg-emerald-500" />
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="mb-6 text-2xl font-display font-bold text-white md:text-4xl">
            Tecnología desarrollada específicamente para hospitality
          </h2>

          <p className="mb-6 text-base text-slate-400 md:text-lg">
            Debacu se apoya en una arquitectura SaaS multi-tenant diseñada para
            procesar datos operativos hoteleros, estructurar señales de riesgo y
            generar análisis comparables a nivel de establecimiento o grupo.
          </p>

          <ul className="space-y-4">
            {[
              "Arquitectura SaaS multi-tenant para entornos hoteleros",
              "Normalización y procesamiento de datos operativos",
              "Evaluación de riesgo basada en señales e incidencias",
              "Capa analítica para comportamiento, operativa y revenue",
            ].map((item, i) => (
              <li
                key={i}
                className="flex items-center gap-3 text-sm text-slate-300 md:text-base"
              >
                <CheckCircle2 className="text-blue-500" size={18} />
                {item}
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </div>
  </section>
);

export const UseCases = () => (
  <section className="bg-slate-950/50 py-20">
    <div className="mx-auto max-w-7xl px-6">
      <div className="mb-12 text-center">
        <h2 className="mb-4 text-2xl font-display font-bold text-white md:text-4xl">
          Casos de uso
        </h2>
        <p className="mx-auto max-w-2xl text-sm text-slate-400 md:text-base">
          Aplicaciones concretas para problemas operativos y económicos reales del
          hotel.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: "Prevención de incidencias repetitivas",
            desc: "Detección de patrones asociados a huéspedes, reservas o situaciones operativas recurrentes.",
          },
          {
            title: "Detección de pérdidas ocultas de revenue",
            desc: "Identificación de desviaciones y señales que afectan al ingreso más allá del precio medio o la ocupación.",
          },
          {
            title: "Análisis de comportamiento",
            desc: "Comprensión de perfiles, hábitos y señales operativas relevantes para la prevención y el control.",
          },
          {
            title: "Soporte a la dirección",
            desc: "Información estructurada para tomar decisiones con mayor criterio operativo y económico.",
          },
        ].map((item, i) => (
          <div
            key={i}
            className="glass-card group border-white/[0.05] p-6 transition-all hover:border-blue-500/30"
          >
            <h4 className="mb-3 text-base font-bold text-white transition-colors group-hover:text-blue-400">
              {item.title}
            </h4>
            <p className="text-sm leading-relaxed text-slate-500">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export const TargetAudience = () => {
  const audience = [
    {
      title: "Hoteles independientes",
      desc: "Mayor control operativo y más capacidad de análisis sin añadir complejidad innecesaria.",
      icon: Hotel,
    },
    {
      title: "Cadenas medianas",
      desc: "Criterios homogéneos entre propiedades y visión consolidada del riesgo y la operativa.",
      icon: Building2,
    },
    {
      title: "Hoteles boutique",
      desc: "Más control sobre huéspedes, incidencias y decisiones sensibles en operaciones de menor escala.",
      icon: Building2,
    },
    {
      title: "Alojamientos rurales profesionalizados",
      desc: "Tecnología útil para equipos reducidos que necesitan ordenar datos y decidir mejor.",
      icon: Home,
    },
    {
      title: "Grupos hoteleros",
      desc: "Escalabilidad, trazabilidad y análisis por activo, propiedad o conjunto de establecimientos.",
      icon: Landmark,
    },
  ];

  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="relative overflow-hidden rounded-[32px] border border-white/[0.06] bg-gradient-to-br from-blue-600/10 via-slate-950/70 to-violet-600/10 p-8 md:p-12">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-0 h-40 w-40 -translate-x-1/2 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="absolute bottom-0 right-0 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl" />
          </div>

          <div className="relative z-10 mb-10 text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-400">
              <Zap size={12} />
              Clientes objetivo
            </div>

            <h2 className="mb-4 text-2xl font-display font-bold text-white md:text-3xl">
              Diseñado para hoteles con necesidad real de control y análisis
            </h2>

            <p className="mx-auto max-w-2xl text-sm text-slate-400 md:text-base">
              Debacu se adapta a distintos modelos de alojamiento, pero mantiene una
              lógica común: convertir datos operativos en criterio de decisión.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {audience.map((item, i) => {
              const Icon = item.icon;

              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06 }}
                  className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 text-left transition-all duration-300 hover:-translate-y-1 hover:border-blue-500/30 hover:bg-white/[0.05]"
                >
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-blue-400 transition-transform duration-300 group-hover:scale-105">
                    <Icon size={22} />
                  </div>

                  <h3 className="mb-3 text-sm font-semibold leading-snug text-white">
                    {item.title}
                  </h3>

                  <p className="text-xs leading-relaxed text-slate-400">
                    {item.desc}
                  </p>

                  <div className="mt-5 h-px w-full bg-gradient-to-r from-blue-500/20 via-white/5 to-transparent" />
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export const InnovationSection = () => (
  <section className="bg-slate-950/30 py-20">
    <div className="mx-auto max-w-7xl px-6 text-center">
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-400">
        <Zap size={12} />
        I+D aplicada
      </div>

      <h2 className="mx-auto mb-6 max-w-4xl text-2xl font-display font-bold text-white md:text-4xl">
        Debacu desarrolla tecnología orientada a riesgo, comportamiento y revenue en entornos hoteleros reales
      </h2>

      <p className="mx-auto mb-10 max-w-2xl text-base text-slate-400 md:text-lg">
        El proyecto combina arquitectura SaaS, normalización de datos, evaluación
        de señales operativas y modelos analíticos con aplicación directa en la
        gestión hotelera.
      </p>

      <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-3">
        <div className="text-center">
          <div className="mb-2 text-2xl font-bold text-white md:text-3xl">
            Multi-tenant
          </div>
          <p className="text-sm text-slate-500">
            Arquitectura cloud para múltiples hoteles y grupos
          </p>
        </div>

        <div className="text-center">
          <div className="mb-2 text-2xl font-bold text-white md:text-3xl">
            Data Processing
          </div>
          <p className="text-sm text-slate-500">
            Procesamiento estructurado de datos operativos
          </p>
        </div>

        <div className="text-center">
          <div className="mb-2 text-2xl font-bold text-white md:text-3xl">
            Applied Analytics
          </div>
          <p className="text-sm text-slate-500">
            Modelos analíticos orientados a decisión y prevención
          </p>
        </div>
      </div>
    </div>
  </section>
);
