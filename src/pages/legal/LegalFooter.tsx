import React, { useMemo, useState } from "react";
import LegalModal from "./LegalModal";   // ✅ el nuevo
import ContactDialog from "./ContactDialog";

type TabKey =
  | "aviso"
  | "privacidad"
  | "cookies"
  | "terminos"
  | "uso"
  | "seguridad"
  | "disclaimer";

export default function LegalFooter() {
  const [openLegal, setOpenLegal] = useState(false);
  const [openContact, setOpenContact] = useState(false);

  const items = useMemo(
    () =>
      [
        { key: "aviso" as const, label: "Aviso legal" },
        { key: "privacidad" as const, label: "Privacidad" },
        { key: "cookies" as const, label: "Cookies" },
        { key: "terminos" as const, label: "Términos" },
        { key: "uso" as const, label: "Uso profesional" },
        { key: "seguridad" as const, label: "Seguridad" },
        { key: "disclaimer" as const, label: "Disclaimer" },
      ] satisfies Array<{ key: TabKey; label: string }>,
    []
  );

  // ✅ ahora solo abre el centro legal (sin tab)
  const openTab = (_tab: TabKey) => {
    setOpenLegal(true);
  };

  return (
    <>
      <footer className="mt-10 border-t border-white/10 bg-[#0b2d4d]">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <div className="text-sm font-semibold text-white">
                Debacu Evaluation360
              </div>
              <p className="mt-2 max-w-xs text-xs leading-relaxed text-white/70">
                Plataforma profesional para trazabilidad interna y gestión de
                incidencias en alojamientos. Uso restringido · No público.
              </p>
              <div className="mt-3 text-xs text-white/50">
                Acceso restringido · Uso profesional
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-white/80">
                Contacto
              </div>

              <div className="mt-2 space-y-2 text-xs text-white/70">
                <button
                  onClick={() => setOpenContact(true)}
                  className="inline-flex items-center gap-2 text-left hover:text-white hover:underline"
                  title="Abrir formulario de contacto"
                >
                  ✉️ informacion@debacu.com
                </button>

                <div>📞 +34 672 336 572</div>

                <div className="opacity-50">LinkedIn · Próximamente</div>
                <div className="opacity-50">X / Twitter · Próximamente</div>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-white/80">
                Legal
              </div>

              <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {items.map((it) => (
                  <li key={it.key}>
                    <button
                      onClick={() => openTab(it.key)}
                      className="text-left text-white/70 hover:text-white hover:underline"
                    >
                      {it.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-white/10 pt-4 text-xs text-white/50 sm:flex-row">
            <span>
              © {new Date().getFullYear()} Debacu Evaluation360 · Uso profesional ·
              Acceso restringido
            </span>
            <span>Documentación informativa · No servicio público</span>
          </div>
        </div>
      </footer>

      <ContactDialog open={openContact} onClose={() => setOpenContact(false)} />

      {/* ✅ Centro legal NUEVO */}
      <LegalModal open={openLegal} onClose={() => setOpenLegal(false)} />
    </>
  );
}
