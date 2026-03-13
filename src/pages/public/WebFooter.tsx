import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import LegalModal from "@/pages/legal/LegalModal";

type TabKey =
  | "aviso"
  | "privacidad"
  | "cookies"
  | "terminos"
  | "uso"
  | "seguridad"
  | "disclaimer"
  | "interes_legitimo";

export default function WebFooter() {
  const navigate = useNavigate();
  const [openLegal, setOpenLegal] = useState(false);

  const legalItems = useMemo(
    () =>
      [
        { key: "aviso" as const, label: "Aviso legal" },
        { key: "privacidad" as const, label: "Privacidad" },
        { key: "cookies" as const, label: "Cookies" },
        { key: "terminos" as const, label: "Términos" },
        { key: "uso" as const, label: "Uso profesional" },
        { key: "interes_legitimo" as const, label: "Interés legítimo (RGPD)" },
        { key: "seguridad" as const, label: "Seguridad" },
        { key: "disclaimer" as const, label: "Disclaimer" },
      ] satisfies Array<{ key: TabKey; label: string }>,
    []
  );

  const navigationItems = useMemo(
    () => [
      { label: "Producto", path: "/producto" },
      { label: "Tecnología", path: "/tecnologia" },
      { label: "Arquitectura", path: "/arquitectura" },
      { label: "Documentación", path: "/documentacion" },
      { label: "Planes", path: "/planes" },
      { label: "Contacto", path: "/contacto" },
    ],
    []
  );

  const openTab = (_tab: TabKey) => {
    setOpenLegal(true);
  };

  return (
    <>
      <footer className="mt-20 border-t border-white/10 bg-slate-950/70">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="grid gap-12 md:grid-cols-2 xl:grid-cols-4">
            {/* Marca */}
            <div>
              <button
                onClick={() => navigate("/")}
                type="button"
                className="mb-5 flex items-center gap-3 text-left text-white"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-600/20">
                  <span className="text-sm font-bold text-white">D</span>
                </div>

                <div>
                  <div className="text-lg font-bold text-white">Debacu</div>
                  <div className="text-xs tracking-wide text-slate-400">
                    Evaluation360
                  </div>
                </div>
              </button>

              <p className="max-w-sm text-sm leading-relaxed text-slate-400">
                Plataforma SaaS para hoteles orientada a análisis operativo,
                evaluación de riesgo e inteligencia de revenue.
              </p>

              <p className="mt-4 max-w-sm text-xs leading-relaxed text-slate-500">
                Tecnología diseñada para transformar datos del hotel en señales,
                alertas y criterios de decisión útiles para dirección y operativa.
              </p>
            </div>

            {/* Navegación */}
            <div>
              <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-300">
                Navegación
              </div>

              <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {navigationItems.map((item) => (
                  <li key={item.path}>
                    <button
                      type="button"
                      onClick={() => navigate(item.path)}
                      className="text-left text-slate-400 transition hover:text-white hover:underline"
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contacto */}
            <div>
              <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-300">
                Contacto
              </div>

              <div className="space-y-2 text-sm text-slate-400">
                <button
                  onClick={() => navigate("/contacto")}
                  className="block text-left transition hover:text-white hover:underline"
                  title="Abrir formulario de contacto"
                  type="button"
                >
                  Formulario de contacto
                </button>

                <div>contacto@debacu.com</div>
                <div>+34 672 336 572</div>
                <div className="text-slate-500">
                  Información comercial y técnica bajo solicitud
                </div>
              </div>
            </div>

            {/* Legal */}
            <div>
              <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-300">
                Legal
              </div>

              <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                {legalItems.map((it) => (
                  <li key={it.key}>
                    <button
                      type="button"
                      onClick={() => openTab(it.key)}
                      className="text-left text-slate-500 transition hover:text-white hover:underline"
                    >
                      {it.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs text-slate-500 sm:flex-row">
            <span>
              © {new Date().getFullYear()} Debacu Evaluation360 · Uso profesional ·
              Acceso sujeto a validación
            </span>

            <span>Información corporativa, técnica y comercial</span>
          </div>
        </div>
      </footer>

      <LegalModal open={openLegal} onClose={() => setOpenLegal(false)} />
    </>
  );
}
