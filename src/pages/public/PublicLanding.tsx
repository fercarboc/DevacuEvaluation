import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Zap } from "lucide-react";

import "@/styles/public.css";
import WebNavbar from "@/pages/public/WebNavbar";
import WebFooter from "@/pages/public/WebFooter";
import fondoPantalla from "@/assets/fondopantalla.png";

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
  const nextSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "auto" });
    }
  }, []);

  const handleScrollToNextSection = () => {
    if (nextSectionRef.current) {
      nextSectionRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  return (
    <div className="public-page h-screen overflow-hidden bg-[#020617] text-white">
      <WebNavbar />

      <div
        id="public-page-scroll"
        ref={scrollRef}
        className="h-[calc(100vh-96px)] overflow-y-auto overflow-x-hidden"
      >
        <main className="pb-0">
          {/* HERO */}
          <section className="relative overflow-hidden px-6 pb-10 pt-8">
            <div className="mx-auto max-w-7xl">
              <div className="grid items-center gap-12 lg:grid-cols-2">
                {/* TEXTO */}
                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                  className="relative z-10 text-left"
                >
                  <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-blue-400">
                    <Zap size={12} />
                    Nueva era hospitality
                  </div>

                  <h1 className="text-gradient mb-5 max-w-2xl font-display text-3xl font-bold leading-[1.2] tracking-tight md:text-4xl lg:text-5xl">
                    Inteligencia artificial para hoteles: riesgo, revenue y decisión operativa
                  </h1>

                  <p className="mb-8 max-w-lg text-sm leading-relaxed text-slate-300 md:text-base">
                    Debacu es una plataforma SaaS que analiza datos operativos,
                    incidencias y comportamiento para ayudar a los hoteles a
                    detectar patrones, prevenir problemas y optimizar el revenue.
                  </p>

                  <div className="flex flex-row items-center gap-4">
                    <button
                      onClick={() => navigate("/solicitar-acceso")}
                      className="btn-primary px-6 py-2.5 text-sm font-medium"
                      type="button"
                    >
                      Solicitar acceso
                    </button>

                    <button
                      onClick={() => navigate("/tecnologia")}
                      className="btn-secondary px-6 py-2.5 text-sm font-medium"
                      type="button"
                    >
                      Ver cómo funciona
                    </button>
                  </div>

                  <p className="mt-6 text-xs text-slate-500">
                    Plataforma de análisis para hoteles basada en datos operativos y comportamiento de huéspedes.
                  </p>

                  <button
                    type="button"
                    onClick={handleScrollToNextSection}
                    className="mt-8 inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-blue-400"
                  >
                    <span>Descubre qué hace Debacu</span>
                    <span className="text-slate-700">|</span>
                    <span>↓</span>
                  </button>
                </motion.div>

                {/* IMAGEN SaaS */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, x: 40 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    x: 0,
                    y: [0, -12, 0],
                  }}
                  transition={{
                    opacity: { duration: 0.8, delay: 0.15 },
                    scale: { duration: 0.8, delay: 0.15 },
                    x: { duration: 0.8, delay: 0.15 },
                    y: {
                      duration: 6,
                      repeat: Infinity,
                      ease: "easeInOut",
                    },
                  }}
                  className="relative hidden lg:flex items-center justify-end"
                >
                  <div className="absolute right-12 top-1/2 h-[420px] w-[420px] -translate-y-1/2 rounded-full bg-blue-500/30 blur-[140px]" />

                  <div className="relative">
                    <img
                      src={fondoPantalla}
                      alt="Debacu SaaS"
                      className="w-[720px] max-w-none opacity-80 blur-[1px]"
                    />

                    <div className="absolute inset-0 bg-gradient-to-l from-transparent via-transparent to-[#020617]" />
                  </div>
                </motion.div>
              </div>
            </div>
          </section>

          {/* SIGUIENTE SECCIÓN CON REF */}
          <div ref={nextSectionRef}>
            <ProblemSection />
          </div>

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