// src/pages/legal/LegalDialog.tsx
import React, { useEffect, useMemo, useState } from "react";

const cx = (...cls: Array<string | false | undefined | null>) =>
  cls.filter(Boolean).join(" ");

export type TabKey =
  | "aviso"
  | "privacidad"
  | "cookies"
  | "terminos"
  | "uso"
  | "seguridad"
  | "disclaimer";

export interface LegalDialogProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: TabKey;

  // NUEVO: si lo pasas, mostramos el botón de aceptar
  onAccept?: () => void | Promise<void>;
  acceptLabel?: string;
  accepting?: boolean;
}

export default function LegalDialog({
  open,
  onClose,
  defaultTab = "aviso",
  onAccept,
  acceptLabel = "Aceptar términos",
  accepting = false,
}: LegalDialogProps) {
  const [tab, setTab] = useState<TabKey>(defaultTab);

  useEffect(() => {
    if (open) setTab(defaultTab);
  }, [open, defaultTab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const tabs = useMemo(
    () =>
      [
        { key: "aviso" as const, label: "Aviso legal" },
        { key: "privacidad" as const, label: "Privacidad" },
        { key: "cookies" as const, label: "Cookies" },
        { key: "terminos" as const, label: "Términos" },
        { key: "uso" as const, label: "Uso profesional" },
        { key: "seguridad" as const, label: "Seguridad" },
        { key: "disclaimer" as const, label: "Disclaimer" },
      ] as const,
    []
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-[#06213f] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-5 py-4">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">
                Centro legal · Debacu Evaluation360
              </div>
              <div className="mt-0.5 text-xs text-white/65">
                Acceso restringido · Uso profesional · Documentación informativa
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onAccept && (
                <button
                  onClick={onAccept}
                  disabled={accepting}
                  className={cx(
                    "rounded-xl px-3 py-2 text-sm font-semibold",
                    accepting
                      ? "bg-white/20 text-white/60"
                      : "bg-white text-slate-900 hover:bg-white/90"
                  )}
                >
                  {accepting ? "Generando justificante..." : acceptLabel}
                </button>
              )}

              <button
                onClick={onClose}
                className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15"
              >
                Cerrar
              </button>
            </div>
          </div>

          <div className="grid h-[75vh] grid-cols-1 md:grid-cols-[260px_1fr]">
            <aside className="border-b border-white/10 bg-white/5 p-3 md:border-b-0 md:border-r md:border-white/10">
              <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-white/60">
                Documentos
              </div>

              <div className="flex flex-row gap-2 overflow-x-auto md:flex-col md:overflow-visible">
                {tabs.map((t) => {
                  const active = tab === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={cx(
                        "whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm transition-colors",
                        active
                          ? "bg-white text-slate-900"
                          : "border border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                      )}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                <div className="font-semibold text-white">Rellena tus datos</div>
                <div className="mt-1">
                  Cambia <span className="font-semibold">[ ... ]</span> por razón
                  social, CIF, dirección y email.
                </div>
              </div>
            </aside>

            <section className="bg-white p-6">
              <div className="h-full overflow-y-auto pr-2">
                {tab === "aviso" && <AvisoLegal />}
                {tab === "privacidad" && <Privacidad />}
                {tab === "cookies" && <Cookies />}
                {tab === "terminos" && <Terminos />}
                {tab === "uso" && <UsoProfesional />}
                {tab === "seguridad" && <Seguridad />}
                {tab === "disclaimer" && <Disclaimer />}
              </div>
            </section>
          </div>

          <div className="border-t border-white/10 bg-white/5 px-5 py-3 text-xs text-white/60">
            Última actualización: 24-01-2026 · Contacto legal: legal@debacu.com
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===========================
   CONTENIDOS (TABS)
   =========================== */

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-6 text-base font-semibold text-slate-900">{children}</h2>
  );
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-sm leading-6 text-slate-700">{children}</p>;
}
function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="mt-3 list-disc pl-6 text-sm leading-6 text-slate-700">
      {children}
    </ul>
  );
}

function AvisoLegal() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Aviso legal</h1>
      <P>Este sitio y la Plataforma “Debacu Evaluation360” es titularidad de:</P>
      <UL>
        <li>
          <b>Titular / Razón social:</b> Debacu Hotels S.L.
        </li>
        <li>
          <b>CIF/NIF:</b> B-55381412
        </li>
        <li>
          <b>Domicilio:</b> c/cantalejo,13-1º A
        </li>
        <li>
          <b>Email:</b> informacion@debacu.com
        </li>
      </UL>

      <H2>Objeto</H2>
      <P>
        Plataforma privada de uso profesional orientada a trazabilidad interna y
        registro estructurado de incidencias. No es pública ni indexable.
      </P>

      <H2>Uso adecuado</H2>
      <UL>
        <li>Prohibida la difusión pública de contenidos o datos.</li>
        <li>Prohibida la extracción automatizada no autorizada.</li>
        <li>Prohibido el uso discriminatorio, difamatorio u ofensivo.</li>
      </UL>
    </div>
  );
}

function Privacidad() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">
        Política de privacidad
      </h1>

      <H2>Responsable</H2>
      <UL>
        <li>
          <b>Responsable:</b> Debacu Hotels S.L.
        </li>
        <li>
          <b>CIF:</b> B-55381412
        </li>
        <li>
          <b>Email:</b> privacidad@debacu.com
        </li>
      </UL>

      <H2>Finalidades</H2>
      <UL>
        <li>Gestión de cuenta, autenticación y control de acceso.</li>
        <li>Consulta/registro de incidencias y trazabilidad (auditoría interna).</li>
        <li>Soporte y comunicaciones operativas.</li>
        <li>Suscripción y facturación (Stripe u otros) cuando aplique.</li>
      </UL>

      <H2>Derechos</H2>
      <P>
        Acceso, rectificación, supresión, oposición, limitación y portabilidad:
        escribe a <b>privacidad@debacu.com</b>.
      </P>
    </div>
  );
}

function Cookies() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">
        Política de cookies
      </h1>
      <H2>Tipos</H2>
      <UL>
        <li>
          <b>Técnicas:</b> sesión, autenticación, seguridad (necesarias).
        </li>
        <li>
          <b>Analíticas:</b> medición (solo con consentimiento si aplica).
        </li>
      </UL>
    </div>
  );
}

function Terminos() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">
        Términos y condiciones
      </h1>
      <H2>Planes y pagos</H2>
      <UL>
        <li>Planes FREE de inicio y planes de pago según condiciones.</li>
        <li>Pagos gestionados por proveedor (p.ej. Stripe). No guardamos la tarjeta.</li>
      </UL>
    </div>
  );
}

function UsoProfesional() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">
        Política de uso profesional
      </h1>
      <UL>
        <li>No es registro público, no indexable, ni “lista negra”.</li>
        <li>Orientado a mejora operativa y trazabilidad interna.</li>
        <li>Prohibido compartir fuera de la organización.</li>
      </UL>
    </div>
  );
}

function Seguridad() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">
        Seguridad y auditoría
      </h1>
      <UL>
        <li>Mínimos privilegios y control de roles.</li>
        <li>Cifrado en tránsito (HTTPS).</li>
        <li>Logs de acceso/acciones para seguridad y trazabilidad.</li>
      </UL>
    </div>
  );
}

function Disclaimer() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Disclaimer</h1>
      <UL>
        <li>Herramienta privada de uso profesional.</li>
        <li>No es autoridad ni base oficial.</li>
        <li>Recomendado registrar hechos, evitando opiniones ofensivas.</li>
      </UL>
    </div>
  );
}
