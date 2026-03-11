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
} from "lucide-react";

export const ProblemSection = () => (
  <section className="section-padding bg-slate-950/50">
    <div className="max-w-7xl mx-auto">
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-5xl font-display font-bold mb-8 leading-tight">
            Los hoteles generan datos constantemente, pero rara vez los convierten en{" "}
            <span className="text-blue-500">inteligencia real.</span>
          </h2>

          <p className="text-slate-400 text-lg mb-8">
            Debacu transforma esos datos en inteligencia accionable para el hotel,
            resolviendo los problemas estructurales del sector.
          </p>

          <div className="space-y-4">
            {[
              "Información dispersa entre PMS, Excel y sistemas internos",
              "Incidencias operativas que no se analizan",
              "Decisiones de revenue sin análisis profundo",
              "Falta de herramientas predictivas accesibles",
              "Falta de visibilidad sobre patrones de comportamiento",
            ].map((text, i) => (
              <div key={i} className="flex items-start gap-3">
                <AlertTriangle className="text-amber-500 shrink-0 mt-1" size={18} />
                <span className="text-slate-300">{text}</span>
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
          <div className="absolute -inset-4 bg-blue-500/10 blur-3xl rounded-full" />

          <div className="glass-card p-8 border-white/[0.05] relative overflow-hidden">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center">
                <FileSpreadsheet className="text-rose-500" />
              </div>
              <div>
                <h4 className="font-bold text-white">Datos Fragmentados</h4>
                <p className="text-xs text-slate-500">
                  Pérdida de eficiencia operativa
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full w-3/4 bg-rose-500/50" />
              </div>
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full w-1/2 bg-amber-500/50" />
              </div>
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full w-2/3 bg-slate-500/50" />
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-white/5 flex justify-center">
              <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                <Zap size={16} />
                <span>Optimizar con Debacu</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  </section>
);

export const FeaturesSection = () => (
  <section className="section-padding">
    <div className="max-w-7xl mx-auto">
      <div className="text-center mb-16">
        <h2 className="text-3xl md:text-5xl font-display font-bold mb-4">
          Qué hace Debacu
        </h2>
        <p className="text-slate-400 max-w-2xl mx-auto">
          Una suite completa de herramientas diseñadas para la nueva era de la
          gestión hotelera.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {[
          {
            icon: <ShieldAlert className="text-blue-500" />,
            title: "Evaluación de riesgo operativo",
            desc:
              "Registro estructurado de incidencias y señales operativas para detectar patrones que afectan a la operativa del hotel.",
          },
          {
            icon: <TrendingUp className="text-emerald-500" />,
            title: "Revenue Intelligence",
            desc:
              "Análisis de producción por canal, segmento y comportamiento. Detecta desviaciones y posibles fugas de revenue.",
          },
          {
            icon: <BrainCircuit className="text-violet-500" />,
            title: "Inteligencia Artificial Aplicada",
            desc:
              "Modelos de análisis y agentes inteligentes que ayudan a detectar patrones, identificar anomalías y generar recomendaciones.",
          },
        ].map((feature, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="glass-card p-8 glass-card-hover"
          >
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] flex items-center justify-center mb-6 border border-white/[0.05]">
              {feature.icon}
            </div>

            <h3 className="text-xl font-bold mb-4 text-white">{feature.title}</h3>
            <p className="text-slate-400 text-sm leading-relaxed">{feature.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

export const HowItWorks = () => (
  <section className="section-padding bg-slate-950/30">
    <div className="max-w-7xl mx-auto">
      <div className="text-center mb-16">
        <h2 className="text-3xl md:text-5xl font-display font-bold mb-4">
          Cómo funciona
        </h2>
        <p className="text-slate-400 max-w-2xl mx-auto">
          Un flujo de datos optimizado para resultados inmediatos.
        </p>
      </div>

      <div className="grid md:grid-cols-4 gap-8 relative">
        <div className="hidden md:block absolute top-12 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />

        {[
          {
            step: "01",
            title: "Captura de datos",
            desc: "Incidencias, reservas, comportamiento y datos operativos vía CSV o API.",
            icon: <Database size={20} />,
          },
          {
            step: "02",
            title: "Normalización",
            desc: "Organizamos la información y la convertimos en métricas comparables.",
            icon: <Layers size={20} />,
          },
          {
            step: "03",
            title: "Motor de Inteligencia",
            desc: "Aplicamos reglas analíticas y modelos de IA para detectar señales.",
            icon: <Cpu size={20} />,
          },
          {
            step: "04",
            title: "Panel de Decisiones",
            desc: "Recibe alertas, métricas y recomendaciones accionables.",
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
            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-600/20 border-4 border-[#020617] text-white">
              {item.icon}
            </div>
            <h4 className="font-bold mb-2 text-white">{item.title}</h4>
            <p className="text-slate-500 text-xs leading-relaxed">{item.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

const LayoutDashboard = ({ size }: { size: number }) => <BarChart3 size={size} />;

export const TechSection = () => (
  <section className="section-padding">
    <div className="max-w-7xl mx-auto">
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="glass-card p-8 bg-blue-600/5 border-blue-500/20"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="glass-card p-4 bg-white/5">
              <Activity className="text-blue-500 mb-2" size={20} />
              <p className="text-[10px] text-slate-500 uppercase font-bold">
                Análisis Real
              </p>
              <div className="h-12 flex items-end gap-1 mt-2">
                {[40, 70, 45, 90, 60].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-blue-500/50 rounded-t-sm"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>

            <div className="glass-card p-4 bg-white/5">
              <BrainCircuit className="text-violet-500 mb-2" size={20} />
              <p className="text-[10px] text-slate-500 uppercase font-bold">
                IA Engine
              </p>
              <div className="mt-2 space-y-2">
                <div className="h-1.5 w-full bg-violet-500/20 rounded-full" />
                <div className="h-1.5 w-2/3 bg-violet-500/20 rounded-full" />
              </div>
            </div>
          </div>

          <div className="mt-4 glass-card p-4 bg-white/5">
            <p className="text-xs font-bold mb-2 text-white">Patrones Detectados</p>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Demanda Predictiva</span>
                <span className="text-emerald-400">98.2%</span>
              </div>
              <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full w-[98%] bg-emerald-500" />
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-5xl font-display font-bold mb-8">
            Tecnología desarrollada específicamente para hospitality
          </h2>

          <p className="text-slate-400 text-lg mb-8">
            Debacu combina análisis de datos operativos, evaluación de riesgo e
            inteligencia artificial en una arquitectura SaaS escalable.
          </p>

          <ul className="space-y-4">
            {[
              "Análisis de datos operativos en tiempo real",
              "Evaluación de riesgo multicapa",
              "Motor de análisis de comportamiento de reserva",
              "Arquitectura SaaS de alta disponibilidad",
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-3 text-slate-300">
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
  <section className="section-padding bg-slate-950/50">
    <div className="max-w-7xl mx-auto">
      <div className="text-center mb-16">
        <h2 className="text-3xl md:text-5xl font-display font-bold mb-4">
          Casos de Uso
        </h2>
        <p className="text-slate-400 max-w-2xl mx-auto">
          Soluciones reales para problemas cotidianos del sector.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          {
            title: "Control de riesgo operativo",
            desc: "Detectar patrones repetitivos que generan incidencias.",
          },
          {
            title: "Optimización del revenue",
            desc: "Detectar desviaciones entre demanda, canal y precio aplicado.",
          },
          {
            title: "Análisis de comportamiento",
            desc: "Entender mejor cómo se comportan distintos perfiles de huéspedes.",
          },
          {
            title: "Toma de decisiones",
            desc: "Ayudar a dirección y revenue managers a actuar antes.",
          },
        ].map((item, i) => (
          <div
            key={i}
            className="glass-card p-6 border-white/[0.05] hover:border-blue-500/30 transition-all group"
          >
            <h4 className="font-bold mb-3 text-white group-hover:text-blue-400 transition-colors">
              {item.title}
            </h4>
            <p className="text-slate-500 text-sm leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export const TargetAudience = () => (
  <section className="section-padding">
    <div className="max-w-7xl mx-auto">
      <div className="glass-card p-12 bg-gradient-to-br from-blue-600/10 to-violet-600/10 border-white/[0.05] text-center">
        <h2 className="text-3xl md:text-4xl font-display font-bold mb-8 text-white">
          Diseñado para todo el ecosistema hospitality
        </h2>

        <div className="flex flex-wrap justify-center gap-4">
          {[
            "Hoteles independientes",
            "Cadenas pequeñas",
            "Apartamentos turísticos",
            "Alojamientos rurales",
            "Grupos hoteleros",
          ].map((item, i) => (
            <span
              key={i}
              className="px-6 py-2 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-slate-300"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  </section>
);

export const InnovationSection = () => (
  <section className="section-padding bg-slate-950/30">
    <div className="max-w-7xl mx-auto text-center">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-widest mb-8">
        <Zap size={12} />
        Innovación Continua
      </div>

      <h2 className="text-3xl md:text-5xl font-display font-bold mb-8 max-w-4xl mx-auto text-white">
        Una plataforma tecnológica que integra el futuro del hospitality
      </h2>

      <p className="text-slate-400 text-lg max-w-2xl mx-auto mb-12">
        Debacu no es solo un software, es el motor de inteligencia que
        profesionaliza la toma de decisiones en tu alojamiento.
      </p>

      <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
        <div className="text-center">
          <div className="text-3xl font-bold text-white mb-2">100%</div>
          <p className="text-slate-500 text-sm">Cloud Native</p>
        </div>

        <div className="text-center">
          <div className="text-3xl font-bold text-white mb-2">Real-time</div>
          <p className="text-slate-500 text-sm">Data Processing</p>
        </div>

        <div className="text-center">
          <div className="text-3xl font-bold text-white mb-2">AI-First</div>
          <p className="text-slate-500 text-sm">Architecture</p>
        </div>
      </div>
    </div>
  </section>
);