import React, { useEffect, useMemo, useState } from "react";

import AvisoLegal from "./pages/AvisoLegal";
import Privacidad from "./pages/Privacidad";
import Cookies from "./pages/Cookies";
import Terminos from "./pages/Terminos";
import PoliticaAccesoUso from "./pages/PoliticaAccesoUso";
import Seguridad from "./pages/Seguridad";
import Disclaimer from "./pages/Disclaimer";

type DocKey =
  | "aviso"
  | "privacidad"
  | "cookies"
  | "terminos"
  | "uso"
  | "seguridad"
  | "disclaimer";

const DOCS: Array<{ key: DocKey; label: string }> = [
  { key: "aviso", label: "Aviso legal" },
  { key: "privacidad", label: "Privacidad" },
  { key: "cookies", label: "Cookies" },
  { key: "terminos", label: "Términos" },
  { key: "uso", label: "Uso profesional" },
  { key: "seguridad", label: "Seguridad" },
  { key: "disclaimer", label: "Disclaimer" },
];

export default function LegalModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [active, setActive] = useState<DocKey>("aviso");

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const Page = useMemo(() => {
    const map: Record<DocKey, React.FC> = {
      aviso: AvisoLegal,
      privacidad: Privacidad,
      cookies: Cookies,
      terminos: Terminos,
      uso: PoliticaAccesoUso,
      seguridad: Seguridad,
      disclaimer: Disclaimer,
    };
    return map[active];
  }, [active]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-5xl rounded-2xl overflow-hidden bg-white shadow-2xl">
          <div className="flex items-center justify-between px-6 py-4 bg-[#0b2a57] text-white">
            <div>
              <div className="font-semibold">
                Centro legal · Debacu Evaluation360
              </div>
              <div className="text-xs text-white/70">
                Acceso restringido · Uso profesional · Documentación informativa
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2 text-sm font-semibold"
            >
              Cerrar
            </button>
          </div>

          {/* ✅ clave: overflow-hidden aquí */}
         <div className="grid grid-cols-[260px_1fr] gap-0 h-[70vh] overflow-hidden min-h-0">

            <aside className="bg-[#0b2a57] text-white px-4 py-4">
              <div className="text-xs font-semibold text-white/70 mb-3">
                DOCUMENTOS
              </div>

              <div className="space-y-2">
                {DOCS.map((d) => {
                  const isActive = d.key === active;
                  return (
                    <button
                      key={d.key}
                      onClick={() => setActive(d.key)}
                      className={[
                        "w-full text-left rounded-xl px-4 py-2 text-sm border transition",
                        isActive
                          ? "bg-white text-[#0b2a57] border-white"
                          : "bg-white/5 hover:bg-white/10 border-white/10 text-white",
                      ].join(" ")}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>

             
            </aside>

            {/* ✅ un único scroller */}
         <main className="bg-white min-h-0 overflow-y-auto overscroll-contain legal-scroll">

          <div className="p-8">
            <Page />
          </div>
        </main>


          </div>

          <div className="px-6 py-3 bg-[#0b2a57] text-white/70 text-xs">
            Última actualización: 25-01-2026 · Contacto legal: legal@debacu.com
          </div>
        </div>
      </div>
    </div>
  );
}
