import React from "react";
import { ShieldCheck, ClipboardList, Search, Lock, ArrowRight } from "lucide-react";
import LegalFooter from "./LegalFooter";

type Props = {
  onGoLogin: () => void;
};

const Pill = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur">
    {children}
  </span>
);

const Card = ({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="mt-1 text-sm leading-6 text-slate-600">{description}</div>
      </div>
    </div>
  </div>
);

const SectionTitle = ({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) => (
  <div className="mx-auto max-w-3xl text-center">
    {eyebrow && (
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {eyebrow}
      </div>
    )}
    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
      {title}
    </h2>
    {subtitle && (
      <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
        {subtitle}
      </p>
    )}
  </div>
);

const PublicLanding: React.FC<Props> = ({ onGoLogin }) => {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-gradient-to-b from-slate-50 to-white flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white text-sm font-semibold">
              D
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-slate-900">
                Debacu Evaluation360
              </div>
              <div className="text-xs text-slate-500">
                Uso profesional · Acceso restringido
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onGoLogin}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Entrar
            </button>
            <button
              onClick={() => scrollTo("access")}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
              title="Alta por invitación durante la fase piloto"
            >
              Solicitar acceso
            </button>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="grid items-start gap-10 lg:grid-cols-2">
            <div>
              <div className="flex flex-wrap gap-2">
                <Pill>Privado</Pill>
                <Pill>Trazabilidad</Pill>
                <Pill>Alojamiento</Pill>
                <Pill>No público</Pill>
              </div>

              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                Trazabilidad privada para decisiones operativas en alojamientos
              </h1>

              <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
                Plataforma profesional para <span className="font-medium text-slate-900">consultar</span> y{" "}
                <span className="font-medium text-slate-900">documentar incidencias</span> con contexto.
                Diseñada para auditoría interna y control de acceso. No para exposición pública.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  onClick={onGoLogin}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-black"
                >
                  Acceso profesional <ArrowRight className="h-4 w-4" />
                </button>

                <button
                  onClick={() => scrollTo("pricing")}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  Planes y precios
                </button>

                <button
                  onClick={() => scrollTo("legal")}
                  className="text-sm font-medium text-slate-600 hover:text-slate-900 text-left"
                >
                  Aviso legal
                </button>
              </div>

              {/* No es (UNA sola vez) */}
              <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">
                  Importante: lo que NO es
                </div>
                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                  <li className="flex gap-2">
                    <span className="mt-0.5 text-slate-400">•</span>
                    <span>No es una lista negra pública ni indexable.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 text-slate-400">•</span>
                    <span>No es un registro oficial ni una autoridad.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 text-slate-400">•</span>
                    <span>No reemplaza tus procesos: aporta contexto y trazabilidad interna.</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Right column */}
            <div className="grid gap-4">
              <Card
                icon={<Search className="h-5 w-5" />}
                title="Consulta rápida"
                description="Documento, email, teléfono o nombre. En segundos."
              />
              <Card
                icon={<ClipboardList className="h-5 w-5" />}
                title="Registro trazable"
                description="Incidencias estructuradas, auditables y con contexto."
              />
              <Card
                icon={<Lock className="h-5 w-5" />}
                title="Acceso restringido"
                description="Solo cuentas autorizadas. Alta por invitación en el piloto."
              />

              <div id="access" className="rounded-2xl border border-slate-900/10 bg-slate-900 p-6 text-white shadow-sm">
                <div className="text-sm font-semibold">Demos cerradas (piloto)</div>
                <div className="mt-2 text-sm text-white/80 leading-6">
                  Antes de enseñar datos reales: control de acceso, logging y mensajes de error mínimos.
                  Primero fiabilidad, luego ventas.
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={onGoLogin}
                    className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
                  >
                    Entrar
                  </button>
                  <button
                    onClick={onGoLogin}
                    className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    Solicitar acceso
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* How it works */}
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <Card
              icon={<Search className="h-5 w-5" />}
              title="1) Identifica"
              description="Documento, email, teléfono o nombre."
            />
            <Card
              icon={<ShieldCheck className="h-5 w-5" />}
              title="2) Evalúa con contexto"
              description="Histórico interno privado y trazable."
            />
            <Card
              icon={<ClipboardList className="h-5 w-5" />}
              title="3) Registra"
              description="Incidencias estructuradas para auditoría."
            />
          </div>
        </section>

        {/* Guarantees */}
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <SectionTitle
            eyebrow="Confianza"
            title="Diseñado para reducir riesgo sin convertirte en un problema legal"
            subtitle="El tono aquí importa. No te vendas como “controlador de huéspedes”. Véndete como trazabilidad operativa interna."
          />

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            <Card
              icon={<Lock className="h-5 w-5" />}
              title="Privado por diseño"
              description="No hay buscador público. No hay perfiles públicos. Acceso controlado."
            />
            <Card
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Trazabilidad"
              description="Registro interno auditable: quién consultó, cuándo y qué acción realizó (mínimo para demo)."
            />
            <Card
              icon={<ClipboardList className="h-5 w-5" />}
              title="Contexto y calidad"
              description="Incidencias estructuradas, con categoría y comentarios. Nada de “opiniones sueltas” sin soporte."
            />
          </div>

          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            Nota: en producción se añadirá política completa y proceso de rectificación/revisión.
          </div>
        </section>

        {/* Pricing placeholder (sin inventar features) */}
        <section id="pricing" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <SectionTitle
            eyebrow="Planes"
            title="Planes y precios"
            subtitle="Ahora mismo estás en piloto. Aquí puedes dejar un bloque simple y serio, sin prometer nada que no tengas implementado."
          />

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">Piloto (limitado)</div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">Gratis</div>
              <div className="mt-2 text-sm text-slate-600">
                Para los primeros alojamientos autorizados. Acceso por invitación.
              </div>
              <button
                onClick={onGoLogin}
                className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
              >
                Solicitar acceso
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">Profesional</div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">—</div>
              <div className="mt-2 text-sm text-slate-600">
                Disponible cuando el piloto esté validado (seguridad, legal y operativa).
              </div>
              <button
                onClick={() => scrollTo("legal")}
                className="mt-5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
              >
                Ver condiciones
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">Cadenas / Grupos</div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">A medida</div>
              <div className="mt-2 text-sm text-slate-600">
                Integración, soporte y políticas internas por organización.
              </div>
              <button
                onClick={() => scrollTo("legal")}
                className="mt-5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
              >
                Contacto
              </button>
            </div>
          </div>
        </section>

        {/* Legal anchor */}
        <div id="legal" />
      </main>

      <LegalFooter />
    </div>
  );
};

export default PublicLanding;
