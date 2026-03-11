import React, { useEffect, useRef } from "react";
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
        <main className="pb-0">
          {/* Hero Section */}
          <section className="relative overflow-hidden px-6 pb-24 pt-8">
            {/* Background glow */}
            <div className="absolute top-0 left-1/2 -z-10 h-[700px] w-full max-w-6xl -translate-x-1/2 select-none overflow-hidden opacity-20 blur-[120px] pointer-events-none">
              <div className="h-full w-full rounded-full bg-blue-600/20" />
            </div>

            <div className="relative z-10 mx-auto max-w-7xl text-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-blue-400">
                  <Zap size={12} />
                  Nueva Era Hospitality
                </div>

                <h1 className="text-gradient mx-auto mb-8 max-w-5xl font-display text-4xl font-bold leading-[1.1] tracking-tight md:text-6xl lg:text-7xl">
                  Inteligencia artificial para hoteles: riesgo, revenue y decisión
                  operativa
                </h1>

                <p className="mx-auto mb-12 max-w-3xl text-lg text-slate-400 md:text-xl">
                  Debacu es una plataforma SaaS que analiza datos operativos,
                  incidencias y comportamiento para ayudar a los hoteles a detectar
                  patrones, prevenir problemas y optimizar el revenue.
                </p>

                <div className="mb-20 flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <button
                    onClick={() => navigate("/solicitar-acceso")}
                    className="btn-primary w-full px-8 py-4 text-lg sm:w-auto"
                    type="button"
                  >
                    Solicitar acceso <ChevronRight size={20} />
                  </button>

                  <button
                    onClick={() => navigate("/tecnologia")}
                    className="btn-secondary w-full px-8 py-4 text-lg sm:w-auto"
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
                className="group relative mx-auto max-w-6xl"
              >
                <div className="absolute -inset-10 -z-10 rounded-full bg-blue-600/20 opacity-50 blur-[100px] transition-opacity group-hover:opacity-70" />

                <div className="glass-card border-white/[0.08] p-6 md:p-8 lg:p-10">
                  <div className="grid gap-6 lg:grid-cols-3">
                    <div className="glass-card border-white/[0.05] bg-white/[0.03] p-6 text-left">
                      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-600/10 text-blue-500">
                        <Zap size={20} />
                      </div>
                      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Riesgo operativo
                      </p>
                      <h3 className="mb-3 text-xl font-bold text-white">
                        Detecta señales antes de que escalen
                      </h3>
                      <p className="text-sm leading-relaxed text-slate-400">
                        Incidencias, patrones repetitivos y alertas para actuar con
                        más rapidez y menos improvisación.
                      </p>
                    </div>

                    <div className="glass-card border-white/[0.05] bg-white/[0.03] p-6 text-left">
                      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-600/10 text-emerald-500">
                        <Zap size={20} />
                      </div>
                      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Revenue intelligence
                      </p>
                      <h3 className="mb-3 text-xl font-bold text-white">
                        Visión comercial accionable
                      </h3>
                      <p className="text-sm leading-relaxed text-slate-400">
                        Producción, canales, segmentos y comportamiento de reserva
                        para entender dónde ganas y dónde pierdes margen.
                      </p>
                    </div>

                    <div className="glass-card border-white/[0.05] bg-white/[0.03] p-6 text-left">
                      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-500/20 bg-violet-600/10 text-violet-500">
                        <Zap size={20} />
                      </div>
                      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Decisión operativa
                      </p>
                      <h3 className="mb-3 text-xl font-bold text-white">
                        Menos intuición, más criterio
                      </h3>
                      <p className="text-sm leading-relaxed text-slate-400">
                        Una base más clara para dirección, operativa y revenue en
                        un único marco de análisis.
                      </p>
                    </div>
                  </div>

                  <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="glass-card border-white/[0.05] bg-white/[0.03] p-5 text-left">
                      <p className="mb-1 text-2xl font-bold text-white">1</p>
                      <p className="text-sm text-slate-400">
                        plataforma unificada
                      </p>
                    </div>

                    <div className="glass-card border-white/[0.05] bg-white/[0.03] p-5 text-left">
                      <p className="mb-1 text-2xl font-bold text-white">
                        CSV + API
                      </p>
                      <p className="text-sm text-slate-400">
                        según plan y madurez
                      </p>
                    </div>

                    <div className="glass-card border-white/[0.05] bg-white/[0.03] p-5 text-left">
                      <p className="mb-1 text-2xl font-bold text-white">
                        Hotel-first
                      </p>
                      <p className="text-sm text-slate-400">
                        pensado para operación real
                      </p>
                    </div>
                  </div>
                </div>

                <p className="mt-12 text-sm font-medium text-slate-500">
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
    </div>
  );
}