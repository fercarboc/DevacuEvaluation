import React, { useMemo, useState } from "react";

type LegalDocKey = "legal" | "privacy" | "cookies";

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cerrar
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto px-5 py-5 text-sm leading-6 text-slate-700">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function LegalFooter({
  contactEmail = "informacion@debacu.com",
  companyName = "Debacu Evaluation360",
}: {
  contactEmail?: string;
  companyName?: string;
}) {
  const [open, setOpen] = useState<LegalDocKey | null>(null);

  const docs = useMemo(() => {
    return {
      legal: {
        title: "Aviso legal (resumen)",
        body: (
          <>
            <p className="font-semibold text-slate-900">
              Uso profesional y acceso restringido
            </p>
            <p className="mt-2">
              {companyName} es una herramienta privada para profesionales del
              alojamiento orientada a la trazabilidad interna de incidencias y
              apoyo a decisiones operativas.
            </p>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-medium text-slate-900">No es:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Una lista negra pública ni un servicio indexable.</li>
                <li>Un registro oficial ni una autoridad.</li>
                <li>Una garantía de “verdad absoluta” sin contexto.</li>
              </ul>
            </div>

            <p className="mt-4">
              El acceso está limitado a cuentas autorizadas. El contenido se basa
              en información aportada por usuarios profesionales y se utiliza
              únicamente en el marco de gestión interna.
            </p>

            <div className="mt-4">
              <p className="font-medium text-slate-900">Contacto</p>
              <p className="mt-1">
                <a className="text-slate-900 underline decoration-slate-300 hover:decoration-slate-900" href={`mailto:${contactEmail}`}>
                  {contactEmail}
                </a>
              </p>
            </div>
          </>
        ),
      },
      privacy: {
        title: "Privacidad (MVP / piloto)",
        body: (
          <>
            <p>
              Esta es una versión breve para fase piloto. Antes de producción,
              se adaptará a los tratamientos reales (base jurídica, encargados,
              plazos, etc.).
            </p>

            <hr className="my-4" />

            <p className="font-medium text-slate-900">Datos tratados</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Datos de cuenta (email, nombre, etc.).</li>
              <li>Auditoría mínima (accesos/acciones) para control interno.</li>
              <li>Datos introducidos en incidencias según uso profesional.</li>
            </ul>

            <p className="mt-4 font-medium text-slate-900">Finalidad</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Permitir acceso a usuarios autorizados.</li>
              <li>Operación del servicio, soporte y seguridad.</li>
              <li>Prevención de abuso y trazabilidad.</li>
            </ul>

            <p className="mt-4 font-medium text-slate-900">Derechos</p>
            <p className="mt-2">
              Solicitudes a{" "}
              <a className="text-slate-900 underline decoration-slate-300 hover:decoration-slate-900" href={`mailto:${contactEmail}`}>
                {contactEmail}
              </a>
              .
            </p>
          </>
        ),
      },
      cookies: {
        title: "Cookies y almacenamiento (MVP)",
        body: (
          <>
            <p>
              En el piloto se utiliza almacenamiento local del navegador para
              sesión (token y usuario). Cookies técnicas pueden aplicarse por el
              navegador o proveedores.
            </p>

            <hr className="my-4" />

            <p className="font-medium text-slate-900">Técnicas</p>
            <p className="mt-2">
              Necesarias para funcionamiento y seguridad. No publicitarias.
            </p>

            <p className="mt-4 font-medium text-slate-900">Gestión</p>
            <p className="mt-2">
              Puedes borrar cookies/almacenamiento desde la configuración de tu
              navegador.
            </p>
          </>
        ),
      },
    } as const;
  }, [companyName, contactEmail]);

  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">{companyName}</div>
            <div className="mt-1 text-xs text-slate-500">
              Acceso restringido · Uso profesional · No público
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => setOpen("legal")}
            >
              Aviso legal
            </button>
            <button
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => setOpen("privacy")}
            >
              Privacidad
            </button>
            <button
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => setOpen("cookies")}
            >
              Cookies
            </button>
            <a
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              href={`mailto:${contactEmail}`}
            >
              Contacto
            </a>
          </div>
        </div>
      </div>

      <Modal
        open={open !== null}
        title={open ? docs[open].title : ""}
        onClose={() => setOpen(null)}
      >
        {open ? docs[open].body : null}
      </Modal>
    </footer>
  );
}
