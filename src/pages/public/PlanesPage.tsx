import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { Check, X } from "lucide-react";

import "@/styles/public.css";
import WebNavbar from "@/pages/public/WebNavbar";
import WebFooter from "@/pages/public/WebFooter";

type Plan = {
  name: string;
  price: string;
  description: string;
  features: string[];
  isPopular?: boolean;
  cta: string;
};

type ComparisonRow = {
  name: string;
  free: boolean | string;
  basic: boolean | string;
  medium: boolean | string;
  premium: boolean | string;
  enterprise: boolean | string;
};

const plans: Plan[] = [
  {
    name: "FREE",
    price: "0€",
    description: "Para pruebas y validación inicial del producto.",
    features: [
      "1 propiedad",
      "Acceso funcional limitado",
      "Base operativa inicial",
      "Validación de encaje",
    ],
    cta: "Empezar",
  },
  {
    name: "BASIC",
    price: "55€",
    description: "Para hoteles independientes que empiezan a estructurar su operativa.",
    features: [
      "1 propiedad",
      "Registro de incidencias",
      "Base de análisis",
      "Importación CSV",
      "Soporte estándar",
    ],
    cta: "Elegir Basic",
  },
  {
    name: "MEDIUM",
    price: "95€",
    description: "La opción más equilibrada para hoteles activos con foco operativo y comercial.",
    features: [
      "2 propiedades",
      "Revenue Intelligence",
      "Análisis por canal y segmento",
      "Alertas operativas",
      "Mayor profundidad analítica",
    ],
    isPopular: true,
    cta: "Elegir Medium",
  },
  {
    name: "PREMIUM",
    price: "145€",
    description: "Para uso intensivo con más profundidad analítica y visión avanzada.",
    features: [
      "Hasta 4 propiedades",
      "Más análisis y reporting",
      "Mayor capacidad operativa",
      "Exportaciones avanzadas",
      "Prioridad superior",
    ],
    cta: "Elegir Premium",
  },
  {
    name: "ENTERPRISE",
    price: "Consultar",
    description: "Para cadenas, grupos hoteleros y proyectos con necesidades a medida.",
    features: [
      "Multi-property",
      "Integraciones específicas",
      "Conectividad avanzada",
      "Despliegue adaptado",
      "Soporte dedicado",
    ],
    cta: "Contactar",
  },
];

const comparisonFeatures: ComparisonRow[] = [
  { name: "Propiedades", free: "1", basic: "1", medium: "2", premium: "4", enterprise: "Ilimitadas" },
  { name: "Registro de incidencias", free: "Básico", basic: "Estructurado", medium: "Avanzado", premium: "Completo", enterprise: "Personalizado" },
  { name: "Importación CSV", free: false, basic: true, medium: true, premium: true, enterprise: true },
  { name: "Dashboard analítico", free: "Limitado", basic: true, medium: true, premium: true, enterprise: true },
  { name: "Evaluación de riesgo", free: false, basic: true, medium: true, premium: true, enterprise: true },
  { name: "Revenue Intelligence", free: false, basic: false, medium: true, premium: true, enterprise: true },
  { name: "Canales y segmentos", free: false, basic: false, medium: true, premium: true, enterprise: true },
  { name: "Alertas operativas", free: false, basic: true, medium: true, premium: true, enterprise: true },
  { name: "Exportaciones avanzadas", free: false, basic: false, medium: false, premium: true, enterprise: true },
  { name: "Integración PMS / API", free: false, basic: false, medium: false, premium: false, enterprise: true },
  { name: "Soporte", free: "Email", basic: "Estándar", medium: "Prioritario", premium: "Avanzado", enterprise: "Dedicado" },
];

function CellValue({ value, highlight = false }: { value: boolean | string; highlight?: boolean }) {
  if (typeof value === "boolean") {
    return value ? (
      <Check size={16} className="text-blue-500 mx-auto" />
    ) : (
      <X size={16} className="text-slate-700 mx-auto" />
    );
  }

  return (
    <span className={highlight ? "text-blue-400 font-bold" : "text-slate-400"}>
      {value}
    </span>
  );
}

export default function PlanesPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="public-page min-h-screen bg-[#020617] text-white overflow-y-auto">
      <WebNavbar />

      <main className="pt-32 pb-24">
        <section className="px-6">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h1 className="text-4xl md:text-6xl font-display font-bold mb-6 text-white">
                Planes adaptados a tu negocio
              </h1>
              <p className="text-slate-400 max-w-2xl mx-auto text-lg">
                Elige el nivel de servicio que mejor encaja con el tamaño y la
                madurez operativa de tu alojamiento.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-24">
              {plans.map((plan, i) => (
                <motion.div
                  key={plan.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className={[
                    "glass-card p-6 flex flex-col relative",
                    plan.isPopular
                      ? "border-blue-500/50 ring-1 ring-blue-500/50 bg-blue-500/[0.03]"
                      : "border-white/[0.08]",
                  ].join(" ")}
                >
                  {plan.isPopular ? (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">
                      Más recomendado
                    </div>
                  ) : null}

                  <h3 className="text-lg font-bold mb-2 text-white">{plan.name}</h3>

                  <div className="mb-4">
                    <span className="text-3xl font-bold text-white">{plan.price}</span>
                    {plan.name !== "ENTERPRISE" ? (
                      <span className="text-slate-500 text-sm ml-1">/mes</span>
                    ) : null}
                  </div>

                  <p className="text-slate-400 text-xs mb-6 leading-relaxed min-h-[52px]">
                    {plan.description}
                  </p>

                  <div className="space-y-3 mb-6 flex-grow">
                    {plan.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-2 text-xs text-slate-300">
                        <Check size={12} className="text-blue-500 shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className={
                      plan.isPopular
                        ? "w-full py-2.5 rounded-lg font-bold text-xs transition-all bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20"
                        : "w-full py-2.5 rounded-lg font-bold text-xs transition-all bg-white/5 hover:bg-white/10 text-white border border-white/10"
                    }
                  >
                    {plan.cta}
                  </button>
                </motion.div>
              ))}
            </div>

            <div className="mt-24">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-display font-bold mb-4 text-white">
                  Comparativa de funciones
                </h2>
                <p className="text-slate-500">
                  Vista rápida de lo que incluye cada nivel.
                </p>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                <table className="w-full border-collapse min-w-[980px]">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="py-6 px-4 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">
                        Función
                      </th>
                      <th className="py-6 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-widest">
                        Free
                      </th>
                      <th className="py-6 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-widest">
                        Basic
                      </th>
                      <th className="py-6 px-4 text-center text-xs font-bold text-blue-400 uppercase tracking-widest">
                        Medium
                      </th>
                      <th className="py-6 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-widest">
                        Premium
                      </th>
                      <th className="py-6 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-widest">
                        Enterprise
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {comparisonFeatures.map((feature) => (
                      <tr
                        key={feature.name}
                        className="border-b border-white/[0.05] hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="py-4 px-4 text-sm text-slate-300">{feature.name}</td>
                        <td className="py-4 px-4 text-center text-sm">
                          <CellValue value={feature.free} />
                        </td>
                        <td className="py-4 px-4 text-center text-sm">
                          <CellValue value={feature.basic} />
                        </td>
                        <td className="py-4 px-4 text-center text-sm">
                          <CellValue value={feature.medium} highlight />
                        </td>
                        <td className="py-4 px-4 text-center text-sm">
                          <CellValue value={feature.premium} />
                        </td>
                        <td className="py-4 px-4 text-center text-sm">
                          <CellValue value={feature.enterprise} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-8 text-xs text-slate-600 text-center">
                Precios orientativos sin IVA. Las integraciones y desarrollos a medida
                no deben asumirse como incluidos salvo acuerdo específico.
              </p>
            </div>
          </div>
        </section>
      </main>

      <WebFooter />
    </div>
  );
}