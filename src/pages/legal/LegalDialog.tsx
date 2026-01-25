// src/pages/legal/LegalDialog.tsx
import React, { useEffect, useMemo, useState } from "react";

const cx = (...cls: Array<string | false | undefined | null>) =>
  cls.filter(Boolean).join(" ");

export type TabKey =
 
  | "terminos"
  

export interface LegalDialogProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: TabKey;

  // si lo pasas, mostramos el botón de aceptar
  onAccept?: () => void | Promise<void>;
  acceptLabel?: string;
  accepting?: boolean;
}

export default function LegalDialog({
  open,
  onClose,
  defaultTab = "terminos",
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
        { key: "terminos" as const, label: "Términos" },
        // Si luego vuelves a activar más tabs, añádelos aquí:
        // { key: "aviso" as const, label: "Aviso Legal" },
        // { key: "privacidad" as const, label: "Privacidad" },
        // { key: "cookies" as const, label: "Cookies" },
      ] as const,
    []
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-[#06213f] shadow-2xl">
          {/* Header */}
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

          {/* Body */}
          <div className="grid h-[75vh] grid-cols-1 md:grid-cols-[260px_1fr]">
            {/* Left */}
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
                <div className="font-semibold text-white/80">Nota</div>
                <div className="mt-1 leading-5">
                  Esta documentación describe el uso profesional y las reglas de
                  acceso. Queda prohibida la difusión pública de contenidos.
                </div>
              </div>
            </aside>

            {/* Right (SCROLL SOLO AQUÍ) */}
            <section className="bg-white p-6 overflow-hidden">
              <div className="h-full overflow-y-auto pr-2">
                {tab === "terminos" && <Terminos />}
              </div>
            </section>
          </div>

          {/* Footer */}
          <div className="border-t border-white/10 bg-white/5 px-5 py-3 text-xs text-white/60">
            Última actualización: 24-01-2026 · Contacto legal: legal@debacu.com
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===========================
   COMPONENTES TIPOGRÁFICOS
   =========================== */

function H1({ children }: { children: React.ReactNode }) {
  return <h1 className="text-xl font-semibold text-slate-900">{children}</h1>;
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-6 text-base font-semibold text-slate-900">{children}</h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-4 text-sm font-semibold text-slate-900">{children}</h3>
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

/* ===========================
   CONTENIDOS (TABS)
   =========================== */

function Terminos() {
  return (
    <div className="space-y-6 text-sm text-slate-800">
      <H1>Términos y condiciones · Debacu Evaluation360</H1>

      <p className="text-xs text-slate-500">Versión documentos: 2026-01-24 · V1.0</p>

      {/* ================= AVISO LEGAL ================= */}
      <H2>Aviso Legal</H2>

      <H3>1. Titularidad</H3>
      <UL>
        <li>
          <strong>Titular / Razón social:</strong> DEBACU HOTELS SL
        </li>
        <li>
          <strong>CIF/NIF:</strong> B-55381214
        </li>
        <li>
          <strong>Domicilio:</strong> C/CANTALEJO,13-1º A
        </li>
        <li>
          <strong>Email de contacto:</strong> informacion@debacu.com
        </li>
      </UL>

      <H3>2. Objeto y naturaleza del servicio</H3>
      <P>
        La Plataforma proporciona un entorno privado de uso profesional para
        alojamientos y equipos operativos, orientado a la gestión interna de
        incidencias y trazabilidad (consultas, registros y auditoría). No se trata
        de un servicio público ni de un registro accesible al público general.
      </P>

      <H3>3. Acceso y registro</H3>
      <UL>
        <li>El acceso puede requerir alta controlada, creación de cuenta y autenticación.</li>
        <li>El usuario se compromete a facilitar información veraz y mantenerla actualizada.</li>
        <li>El usuario debe custodiar sus credenciales y evitar el uso compartido no autorizado.</li>
      </UL>

      <H3>4. Normas de uso</H3>
      <UL>
        <li>Uso diligente, lícito y conforme a la finalidad profesional descrita.</li>
        <li>Prohibida la difusión pública de información obtenida en la Plataforma.</li>
        <li>Prohibida la recolección automatizada no autorizada.</li>
        <li>Prohibido cualquier uso difamatorio, discriminatorio o contrario a la buena fe.</li>
      </UL>

      <H3>5. Propiedad intelectual e industrial</H3>
      <P>
        Los contenidos, marcas, diseños, software y elementos de la Plataforma están protegidos
        por derechos de propiedad intelectual e industrial. Queda prohibida su reproducción,
        distribución o explotación no autorizada.
      </P>

      <H3>6. Responsabilidad</H3>
      <P>
        La Plataforma se ofrece “tal cual”, con esfuerzos razonables de disponibilidad y seguridad.
        El titular no garantiza la inexistencia absoluta de interrupciones o errores, aunque adoptará
        medidas para su corrección. El usuario es responsable del uso que haga de la información
        en su propia operativa.
      </P>

      <H3>7. Enlaces y terceros</H3>
      <P>
        Pueden existir enlaces a sitios de terceros. El titular no se responsabiliza de sus contenidos,
        disponibilidad o políticas.
      </P>

      <H3>8. Legislación y jurisdicción</H3>
      <P>
        Este Aviso Legal se rige por la legislación española. Para cualquier controversia,
        las partes se someterán a los juzgados y tribunales competentes conforme a la normativa aplicable.
      </P>

      {/* ================= TÉRMINOS Y CONDICIONES ================= */}
      <H2>Documento 2 · Términos y Condiciones</H2>

      <H3>1. Definiciones</H3>
      <UL>
        <li>
          <strong>Plataforma:</strong> software y servicios Debacu Evaluation360, de acceso privado y uso profesional.
        </li>
        <li>
          <strong>Cliente / Organización:</strong> entidad (p. ej., hotel o alojamiento) que solicita acceso y contrata (si aplica) planes de suscripción.
        </li>
        <li>
          <strong>Usuario:</strong> persona física autorizada por la Organización para acceder.
        </li>
      </UL>

      <H3>2. Cuenta, acceso y seguridad</H3>
      <UL>
        <li>El usuario es responsable de mantener la confidencialidad de sus credenciales y del uso bajo su cuenta.</li>
        <li>La Organización deberá asegurar que solo personal autorizado accede a la Plataforma.</li>
        <li>
          Podemos suspender accesos ante indicios razonables de abuso, fraude, incidentes de seguridad o incumplimiento.
        </li>
      </UL>

      <H3>3. Uso profesional y limitaciones</H3>
      <P>
        La Plataforma es privada y de uso profesional. Queda prohibida la difusión pública de información,
        la extracción masiva o automatizada no autorizada y cualquier uso contrario a la finalidad operativa interna.
      </P>

      <H3>4. Planes, suscripción y facturación (si aplica)</H3>
      <UL>
        <li>La Plataforma puede ofrecer planes (incluyendo un plan inicial gratuito limitado) y planes de pago.</li>
        <li>La facturación y cobros pueden gestionarse mediante proveedores como Stripe u otros equivalentes.</li>
        <li>No almacenamos datos completos de tarjeta; el pago se procesa por el proveedor de pagos.</li>
        <li>Las condiciones económicas, límites de uso y prestaciones se detallan en la configuración del plan vigente.</li>
      </UL>

      <H3>5. Renovación, cambios y cancelación (si aplica)</H3>
      <UL>
        <li>Las suscripciones pueden renovarse automáticamente según el plan y la periodicidad contratada.</li>
        <li>El usuario/cliente puede solicitar cambios de plan según disponibilidad y reglas internas de la Plataforma.</li>
        <li>La cancelación puede realizarse desde el área de cuenta o el portal del proveedor de pagos si está habilitado.</li>
      </UL>

      <H3>6. Contenidos y responsabilidad del Cliente</H3>
      <P>
        El Cliente es responsable de los datos y contenidos que registra en la Plataforma, incluyendo su exactitud,
        pertinencia y adecuación legal. Se recomienda evitar datos excesivos o no pertinentes, así como expresiones
        ofensivas o valoraciones discriminatorias.
      </P>

      <H3>7. Limitación de responsabilidad</H3>
      <P>
        La Plataforma ofrece herramientas de apoyo a procesos internos. Las decisiones que el Cliente adopte basadas
        en la información o en su uso operativo son responsabilidad del Cliente. No se garantiza ausencia total de errores,
        interrupciones o indisponibilidades, sin perjuicio de los esfuerzos razonables de continuidad y seguridad.
      </P>

      <H3>8. Soporte</H3>
      <P>
        El soporte puede variar según el plan. El alcance y tiempos de respuesta podrán definirse en el plan contratado
        o en acuerdos de nivel de servicio (SLA) cuando existan.
      </P>

      <H3>9. Modificaciones</H3>
      <P>
        Podemos actualizar estas condiciones por cambios legales o del servicio. La versión vigente estará publicada
        y se identificará por su versión/fecha.
      </P>

      {/* ================= USO PROFESIONAL ================= */}
      <H2>Documento 3 · Política de Acceso y Uso Profesional</H2>

      <H3>1. Acceso restringido</H3>
      <P>
        Debacu Evaluation360 es una plataforma privada destinada a profesionales del sector alojamiento.
        El acceso se concede de forma controlada a organizaciones verificadas y usuarios autorizados.
      </P>

      <H3>2. Uso interno y no público</H3>
      <UL>
        <li>No es un registro público, no es indexable y no está pensado para difusión externa.</li>
        <li>La información está orientada a protocolos internos y mejora operativa.</li>
        <li>Se prohíbe publicar, compartir o redistribuir contenidos fuera de la organización o sin base legal.</li>
      </UL>

      <H3>3. Criterios estructurados y minimización</H3>
      <P>
        El sistema fomenta el registro estructurado (motivos, tipologías, severidad, fechas y evidencias internas),
        minimizando opiniones y evitando datos excesivos. El Cliente se compromete a registrar solo información pertinente,
        verificable y relacionada con su operativa.
      </P>

      <H3>4. Auditoría y trazabilidad</H3>
      <P>
        Para control interno y seguridad, se registran acciones relevantes (consultas, altas, modificaciones, cambios de permisos,
        exportaciones cuando existan) asociadas a la cuenta. Estos registros se usan para prevenir abuso, investigar incidencias
        y reforzar la trazabilidad.
      </P>

      <H3>5. Prohibiciones específicas</H3>
      <UL>
        <li>Uso discriminatorio o contrario a derechos fundamentales.</li>
        <li>Uso como “lista pública” o exposición de terceros.</li>
        <li>Extracción masiva o automatizada no autorizada.</li>
        <li>Introducir datos sensibles innecesarios o no pertinentes (salvo estricta necesidad y base legal).</li>
      </UL>

      <H3>6. Medidas ante abuso</H3>
      <P>
        En caso de uso indebido, el titular podrá suspender o cancelar accesos y/o limitar funcionalidades para proteger la Plataforma,
        sin perjuicio de las acciones legales que procedan.
      </P>

      {/* ================= RGPD (DPA) ================= */}
      <H2>Documento 4 · Encargo de Tratamiento (DPA) · RGPD</H2>

      <P>
        Este documento regula el encargo de tratamiento cuando el Cliente incorpora datos personales a la Plataforma.
        En un entorno B2B, normalmente el Cliente (hotel/alojamiento) actúa como Responsable del tratamiento y el proveedor
        de la Plataforma como Encargado del tratamiento, en los términos del art. 28 RGPD.
      </P>

      <H3>1. Partes</H3>
      <UL>
        <li>
          <strong>Encargado (Proveedor):</strong> DEBACU HOTELS SL · CIF B-55381214 · C/CANTALEJO,13-1º A · informacion@debacu.com
        </li>
        <li>
          <strong>Responsable (Cliente):</strong> la organización que solicita acceso y usa la Plataforma.
        </li>
      </UL>

      <H3>2. Objeto del encargo</H3>
      <P>
        Prestación del servicio de plataforma privada para gestión operativa con trazabilidad, conforme a instrucciones documentadas del Responsable,
        incluyendo: almacenamiento, consulta, registro, modificación, auditoría y soporte.
      </P>

      <H3>3. Duración</H3>
      <P>
        Durante la vigencia de la relación contractual o de acceso autorizado al servicio, y mientras sea necesario para la prestación del mismo,
        sin perjuicio de obligaciones legales de conservación.
      </P>

      <H3>4. Naturaleza, finalidad y categorías</H3>
      <UL>
        <li><strong>Finalidad:</strong> apoyo a la gestión interna y trazabilidad operativa del Responsable.</li>
        <li><strong>Naturaleza:</strong> recogida por el Responsable, almacenamiento, estructuración, consulta y auditoría.</li>
        <li><strong>Interesados:</strong> clientes/huéspedes u otras personas relacionadas con la operativa del Responsable, según su uso.</li>
      </UL>

      <H3>5. Tipos de datos</H3>
      <P>
        Según el uso del Responsable. Se recomienda minimización. El Responsable se compromete a evitar el registro de datos excesivos,
        especialmente categorías especiales (art. 9 RGPD) salvo estricta necesidad, base jurídica y garantías adecuadas.
      </P>

      <H3>6. Obligaciones del Encargado (art. 28 RGPD)</H3>
      <UL>
        <li>Tratar los datos personales únicamente siguiendo instrucciones documentadas del Responsable, salvo obligación legal aplicable.</li>
        <li>Garantizar confidencialidad del personal autorizado.</li>
        <li>Adoptar medidas técnicas y organizativas apropiadas (art. 32 RGPD).</li>
        <li>Asistir al Responsable en solicitudes de derechos (arts. 12–22 RGPD), cuando proceda.</li>
        <li>Asistir en gestión de violaciones de seguridad (arts. 33–34 RGPD), sin dilación indebida.</li>
        <li>Facilitar información necesaria para demostrar cumplimiento y permitir auditorías razonables (con preaviso).</li>
      </UL>

      <H3>7. Obligaciones del Responsable</H3>
      <UL>
        <li>Garantizar base jurídica y deber de información cuando proceda.</li>
        <li>Usar la Plataforma conforme a minimización y finalidad operativa.</li>
        <li>Gestionar permisos/roles y accesos de sus usuarios autorizados.</li>
        <li>Atender solicitudes de derechos y reclamaciones, con apoyo del Encargado cuando aplique.</li>
      </UL>

      <H3>8. Subencargados</H3>
      <P>
        El Encargado podrá utilizar subencargados necesarios para prestar el servicio (infraestructura/hosting, correo transaccional, pasarela de pagos),
        garantizando obligaciones equivalentes mediante acuerdos adecuados.
      </P>
      <UL>
        <li>Infraestructura/hosting (p. ej., Supabase/Cloud, según configuración).</li>
        <li>Correo transaccional (p. ej., Brevo), si se utiliza.</li>
        <li>Pagos/suscripciones (p. ej., Stripe), si aplica.</li>
      </UL>

      <H3>9. Transferencias internacionales</H3>
      <P>
        Si algún proveedor tratase datos fuera del EEE, se aplicarán garantías adecuadas (p. ej., Cláusulas Contractuales Tipo)
        y/o decisiones de adecuación, según corresponda.
      </P>

      <H3>10. Finalización: devolución o supresión</H3>
      <P>
        Al finalizar el servicio, el Encargado suprimirá o devolverá los datos personales, según instrucciones del Responsable,
        salvo obligación legal de conservación. Podrán mantenerse copias residuales en sistemas de respaldo por periodos limitados
        y bajo controles de seguridad.
      </P>

      <H2>Anexo II · Medidas Técnicas y Organizativas (art. 32 RGPD)</H2>

      <H3>A. Control de acceso y autenticación</H3>
      <UL>
        <li>Principio de mínimos privilegios según rol.</li>
        <li>Gestión de sesiones con expiración y revocación.</li>
        <li>Recomendación de contraseñas robustas y, cuando aplique, MFA.</li>
      </UL>

      <H3>B. Trazabilidad, auditoría y registros</H3>
      <UL>
        <li>Registro de eventos relevantes (accesos, operaciones sensibles, cambios de permisos).</li>
        <li>Protección razonable de logs y acceso restringido.</li>
        <li>Retención limitada conforme a necesidad operativa y seguridad.</li>
      </UL>

      <H3>C. Cifrado y comunicaciones</H3>
      <UL>
        <li>Cifrado en tránsito mediante HTTPS/TLS.</li>
        <li>Uso de canales seguros para comunicaciones operativas y administrativas.</li>
      </UL>

      <H3>D. Segregación y aislamiento</H3>
      <UL>
        <li>Separación lógica por organización cuando aplica.</li>
        <li>Limitaciones de acceso a datos entre organizaciones y roles.</li>
      </UL>

      <H3>E. Disponibilidad y resiliencia</H3>
      <UL>
        <li>Infraestructura en la nube con redundancia (según proveedor/configuración).</li>
        <li>Copias de seguridad y mecanismos de recuperación (según configuración).</li>
      </UL>

      <H3>F. Gestión de vulnerabilidades e incidentes</H3>
      <UL>
        <li>Procedimientos para identificar, contener y corregir incidentes.</li>
        <li>Notificación al Responsable sin dilación indebida cuando proceda.</li>
      </UL>

      <H3>G. Confidencialidad y formación</H3>
      <UL>
        <li>Compromisos de confidencialidad del personal con acceso a sistemas.</li>
        <li>Controles organizativos razonables para limitar accesos.</li>
      </UL>

      <H3>H. Minimización y buenas prácticas del Cliente</H3>
      <UL>
        <li>Evitar registrar datos excesivos o no pertinentes.</li>
        <li>Evitar categorías especiales salvo estricta necesidad y base legal.</li>
        <li>Revisar periódicamente usuarios, roles y accesos.</li>
      </UL>

      <H2>Contacto y ejercicio de derechos (cuando proceda)</H2>
      <UL>
        <li>Privacidad y seguridad: privacidad@debacu.com</li>
        <li>Cuestiones contractuales/servicio: informacion@debacu.com</li>
      </UL>
    </div>
  );
}
