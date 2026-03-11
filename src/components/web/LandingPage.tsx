import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Zap } from "lucide-react";

import "@/styles/public.css";
import WebNavbar from "@/pages/public/WebNavbar";
import WebFooter from "@/pages/public/WebFooter";
import {
  ProblemSection,
  FeaturesSection,
  HowItWorks,
  TechSection,
  UseCases,
  TargetAudience,
  InnovationSection,
} from "@/pages/public/LandingSections";

export default function PublicLanding() {
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="public-page min-h-screen bg-[#020617] text-white">
      <WebNavbar />

      <main className="pt-32 pb-0">
        {/* Hero Section */}
        <section className="pb-24 px-6 relative overflow-hidden">
          {/* Background glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-6xl h-[700px] opacity-20 blur-[120px] pointer-events-none -z-10 select-none overflow-hidden">
            <div className="w-full h-full rounded-full bg-blue-600/20" />
          </div>

          <div className="max-w-7xl mx-auto text-center relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-widest mb-8">
                <Zap size={12} />
                Nueva Era Hospitality
              </div>

              <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-bold tracking-tight mb-8 max-w-5xl mx-auto leading-[1.1] text-gradient">
                Inteligencia artificial para hoteles: riesgo, revenue y decisión
                operativa
              </h1>

              <p className="text-lg md:text-xl text-slate-400 max-w-3xl mx-auto mb-12">
                Debacu es una plataforma SaaS que analiza datos operativos,
                incidencias y comportamiento para ayudar a los hoteles a detectar
                patrones, prevenir problemas y optimizar el revenue.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
                <button
                  onClick={() => navigate("/solicitar-acceso")}
                  className="btn-primary text-lg px-8 py-4 w-full sm:w-auto"
                  type="button"
                >
                  Solicitar acceso <ChevronRight size={20} />
                </button>

                <button
                  onClick={() => navigate("/tecnologia")}
                  className="btn-secondary text-lg px-8 py-4 w-full sm:w-auto"
                  type="button"
                >
                  Ver cómo funciona <ChevronRight size={20} />
                </button>
              </div>
            </motion.div>

            {/* Hero visual sin dashboard */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative group max-w-6xl mx-auto"
            >
              <div className="absolute -inset-10 bg-blue-600/20 blur-[100px] rounded-full opacity-50 -z-10 group-hover:opacity-70 transition-opacity" />

              <div className="glass-card p-6 md:p-8 lg:p-10 border-white/[0.08]">
                <div className="grid lg:grid-cols-3 gap-6">
                  <div className="glass-card p-6 bg-white/[0.03] border-white/[0.05] text-left">
                    <div className="w-12 h-12 rounded-2xl bg-blue-600/10 flex items-center justify-center mb-5 border border-blue-500/20 text-blue-500">
                      <Zap size={20} />
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                      Riesgo operativo
                    </p>
                    <h3 className="text-xl font-bold text-white mb-3">
                      Detecta señales antes de que escalen
                    </h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      Incidencias, patrones repetitivos y alertas para actuar con
                      más rapidez y menos improvisación.
                    </p>
                  </div>

                  <div className="glass-card p-6 bg-white/[0.03] border-white/[0.05] text-left">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-600/10 flex items-center justify-center mb-5 border border-emerald-500/20 text-emerald-500">
                      <Zap size={20} />
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                      Revenue intelligence
                    </p>
                    <h3 className="text-xl font-bold text-white mb-3">
                      Visión comercial accionable
                    </h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      Producción, canales, segmentos y comportamiento de reserva
                      para entender dónde ganas y dónde pierdes margen.
                    </p>
                  </div>

                  <div className="glass-card p-6 bg-white/[0.03] border-white/[0.05] text-left">
                    <div className="w-12 h-12 rounded-2xl bg-violet-600/10 flex items-center justify-center mb-5 border border-violet-500/20 text-violet-500">
                      <Zap size={20} />
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                      Decisión operativa
                    </p>
                    <h3 className="text-xl font-bold text-white mb-3">
                      Menos intuición, más criterio
                    </h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      Una base más clara para dirección, operativa y revenue en
                      un único marco de análisis.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
                  <div className="glass-card p-5 bg-white/[0.03] border-white/[0.05] text-left">
                    <p className="text-2xl font-bold text-white mb-1">1</p>
                    <p className="text-sm text-slate-400">
                      plataforma unificada
                    </p>
                  </div>

                  <div className="glass-card p-5 bg-white/[0.03] border-white/[0.05] text-left">
                    <p className="text-2xl font-bold text-white mb-1">
                      CSV + API
                    </p>
                    <p className="text-sm text-slate-400">
                      según plan y madurez
                    </p>
                  </div>

                  <div className="glass-card p-5 bg-white/[0.03] border-white/[0.05] text-left">
                    <p className="text-2xl font-bold text-white mb-1">
                      Hotel-first
                    </p>
                    <p className="text-sm text-slate-400">
                      pensado para operación real
                    </p>
                  </div>
                </div>
              </div>

              <p className="mt-12 text-slate-500 text-sm font-medium">
                Para hoteles, apartamentos y alojamientos que buscan más control
                y mayor rentabilidad.
              </p>
            </motion.div>
          </div>
        </section>

        <ProblemSection />
        <FeaturesSection />
        <HowItWorks />
        <TechSection />
        <UseCases />
        <TargetAudience />
        <InnovationSection />
      </main>

      <WebFooter />
    </div>
  );
}