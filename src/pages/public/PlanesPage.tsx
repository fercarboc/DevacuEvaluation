import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

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
  ctaPath: string;
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
    name: "FREE TRIAL",
    price: "0€",
    description:
      "Para validación inicial del producto y primeros pasos en el uso de la plataforma.",
    features: [
      "1 propiedad",
      "Acceso funcional limitado",
      "Base operativa inicial",
      "Validación de encaje",
    ],
    cta: "Solicitar prueba",
    ctaPath: "/solicitar-acceso",
  },
  {
    name: "BASIC",
    price: "55€",
    description:
      "Para hoteles independientes que necesitan empezar a estructurar su operativa con una base analítica sencilla.",
    features: [
      "1 propiedad",
      "Registro de incidencias",
      "Base de análisis",
      "Importación CSV",
      "Soporte estándar",
    ],
    cta: "Solicitar Basic",
    ctaPath: "/solicitar-acceso",
  },
  {
    name: "MEDIUM",
    price: "95€",
    description:
      "La opción más equilibrada para hoteles activos que necesitan mayor visibilidad operativa y comercial.",
    features: [
      "2 propiedades",
      "Revenue Intelligence",
      "Análisis por canal y segmento",
      "Alertas operativas",
      "Mayor profundidad analítica",
    ],
    isPopular: true,
    cta: "Solicitar Medium",
    ctaPath: "/solicitar-acceso",
  },
  {
    name: "PREMIUM",
    price: "145€",
    description:
      "Para hoteles o grupos con mayor necesidad de análisis, reporting y capacidad operativa avanzada.",
    features: [
      "Hasta 4 propiedades",
      "Más análisis y reporting",
      "Mayor capacidad operativa",
      "Exportaciones avanzadas",
      "Prioridad superior",
    ],
    cta: "Solicitar Premium",
    ctaPath: "/solicitar-acceso",
  },
  {
    name: "ENTERPRISE",
    price: "A medida",
    description:
      "Para cadenas, grupos hoteleros y proyectos con necesidades específicas de integración, despliegue y soporte.",
    features: [
      "Multi-property",
      "Integraciones específicas",
      "Conectividad avanzada",
      "Despliegue adaptado",
      "Soporte dedicado",
    ],
    cta: "Hablar con nosotros",
    ctaPath: "/contacto",
  },
];

const comparisonFeatures: ComparisonRow[] = [
  {
    name: "Propiedades",
    free: "1",
    basic: "1",
    medium: "2",
    premium: "4",
    enterprise: "Ilimitadas",
  },
  {
    name: "Registro de incidencias",
    free: "Básico",
    basic: "Estructurado",
    medium: "Avanzado",
    premium: "Completo",
    enterprise: "Personalizado",
  },
  {
    name: "Importación CSV",
    free: false,
    basic: true,
    medium: true,
    premium: true,
    enterprise: true,
  },
  {
    name: "Dashboard analítico",
    free: "Limitado",
    basic: true,
    medium: true,
    premium: true,
    enterprise: true,
  },
  {
    name: "Evaluación de riesgo",
    free: false,
    basic: true,
    medium: true,
    premium: true,
    enterprise: true,
  },
  {
    name: "Revenue Intelligence",
    free: false,
    basic: false,
    medium: true,
    premium: true,
    enterprise: true,
  },
  {
    name: "Canales y segmentos",
    free: false,
    basic: false,
    medium: true,
    premium: true,
    enterprise: true,
  },
  {
    name: "Alertas operativas",
    free: false,
    basic: true,
    medium: true,
    premium: true,
    enterprise: true,
  },
  {
    name: "Exportaciones avanzadas",
    free: false,
    basic: false,
    medium: false,
    premium: true,
    enterprise: true,
  },
  {
    name: "Integración PMS / API",
    free: false,
    basic: false,
    medium: false,
    premium: false,
    enterprise: true,
  },
  {
    name: "Soporte",
    free: "Email",
    basic: "Estándar",
    medium: "Prioritario",
    premium: "Avanzado",
    enterprise: "Dedicado",
  },
];

function CellValue({
  value,
  highlight = false,
}: {
  value: boolean | string;
  highlight?: boolean;
}) {
  if (typeof value === "boolean") {
    return value ? (
      <Check size={16} className="mx-auto text-blue-500" />
    ) : (
      <X size={16} className="mx-auto text-slate-700" />
    );
  }

  return (
    <span className={highlight ? "font-bold text-blue-400" : "text-slate-400"}>
      {value}
    </span>
  );
}

export default function PlanesPage() {
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="public-page min-h-screen overflow-y-auto bg-[#020617] text-white">
      <WebNavbar />

      <main className="pb-24 pt-32">
        <section className="px-6">
          <div className="mx-auto max-w-7xl">
            <div className="mb-16 text-center">
              <h1 className="mb-6 text-4xl font-display font-bold text-white md:text-6xl">
                Planes adaptados a tu hotel
              </h1>
              <p className="mx-auto max-w-2xl text-lg text-slate-400">
                Elige el nivel de servicio que mejor encaja con el tamaño, la
                complejidad operativa y la madurez analítica de tu alojamiento.
              </p>
            </div>

            <div className="mb-24 grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {plans.map((plan, i) => (
                <motion.div
                  key={plan.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className={[
                    "glass-card relative flex flex-col p-6",
                    plan.isPopular
                      ? "border-blue-500/50 ring-1 ring-blue-500/50 bg-blue-500/[0.03]"
                      : "border-white/[0.08]",
                  ].join(" ")}
                >
                  {plan.isPopular ? (
                    <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                      Más recomendado
                    </div>
                  ) : null}

                  <h3 className="mb-2 text-lg font-bold text-white">{plan.name}</h3>

                  <div className="mb-4">
                    <span className="text-3xl font-bold text-white">{plan.price}</span>
                    {plan.name !== "ENTERPRISE" ? (
                      <span className="ml-1 text-sm text-slate-500">/mes</span>
                    ) : null}
                  </div>

                  <p className="mb-6 min-h-[60px] text-xs leading-relaxed text-slate-400">
                    {plan.description}
                  </p>

                  <div className="mb-6 flex-grow space-y-3">
                    {plan.features.map((feature) => (
                      <div
                        key={feature}
                        className="flex items-start gap-2 text-xs text-slate-300"
                      >
                        <Check
                          size={12}
                          className="mt-0.5 shrink-0 text-blue-500"
                        />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate(plan.ctaPath)}
                    className={
                      plan.isPopular
                        ? "w-full rounded-lg bg-blue-600 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-500"
                        : "w-full rounded-lg border border-white/10 bg-white/5 py-2.5 text-xs font-bold text-white transition-all hover:bg-white/10"
                    }
                  >
                    {plan.cta}
                  </button>
                </motion.div>
              ))}
            </div>

            <div className="mt-24">
              <div className="mb-12 text-center">
                <h2 className="mb-4 text-3xl font-display font-bold text-white">
                  Comparativa de funciones
                </h2>
                <p className="text-slate-500">
                  Vista rápida de lo que incluye cada nivel.
                </p>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                <table className="min-w-[980px] w-full border-collapse">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="px-4 py-6 text-left text-xs font-bold uppercase tracking-widest text-slate-500">
                        Función
                      </th>
                      <th className="px-4 py-6 text-center text-xs font-bold uppercase tracking-widest text-slate-500">
                        Free Trial
                      </th>
                      <th className="px-4 py-6 text-center text-xs font-bold uppercase tracking-widest text-slate-500">
                        Basic
                      </th>
                      <th className="px-4 py-6 text-center text-xs font-bold uppercase tracking-widest text-blue-400">
                        Medium
                      </th>
                      <th className="px-4 py-6 text-center text-xs font-bold uppercase tracking-widest text-slate-500">
                        Premium
                      </th>
                      <th className="px-4 py-6 text-center text-xs font-bold uppercase tracking-widest text-slate-500">
                        Enterprise
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {comparisonFeatures.map((feature) => (
                      <tr
                        key={feature.name}
                        className="border-b border-white/[0.05] transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-4 text-sm text-slate-300">
                          {feature.name}
                        </td>
                        <td className="px-4 py-4 text-center text-sm">
                          <CellValue value={feature.free} />
                        </td>
                        <td className="px-4 py-4 text-center text-sm">
                          <CellValue value={feature.basic} />
                        </td>
                        <td className="px-4 py-4 text-center text-sm">
                          <CellValue value={feature.medium} highlight />
                        </td>
                        <td className="px-4 py-4 text-center text-sm">
                          <CellValue value={feature.premium} />
                        </td>
                        <td className="px-4 py-4 text-center text-sm">
                          <CellValue value={feature.enterprise} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-8 text-center text-xs text-slate-600">
                Precios orientativos sin IVA. Las integraciones, conectividad con
                terceros y desarrollos específicos requieren validación previa y no
                deben asumirse como incluidos salvo acuerdo expreso.
              </p>
            </div>
          </div>
        </section>
      </main>

      <WebFooter />
    </div>
  );
}
