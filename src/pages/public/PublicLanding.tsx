import React from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  ClipboardList,
  Search,
  Lock,
  ArrowRight,
  Building2,
  Home,
  Hotel,
  BadgeCheck,
  TrendingUp,
  Users,
  Sparkles,
} from "lucide-react";
 
 
import LegalFooter from "../legal/LegalFooter";
 

const cx = (...cls: Array<string | false | undefined | null>) =>
  cls.filter(Boolean).join(" ");

const Pill = ({ children }: { children: React.ReactNode }) => (
  <span
    className={cx(
      "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
      "border border-white/15 bg-white/10 text-white/90",
      "shadow-sm backdrop-blur hover:bg-white/15 transition-colors"
    )}
  >
    {children}
  </span>
);

const InfoCard = ({
  icon,
  title,
  description,
  tone = "blue",
  imageSrc,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  tone?: "blue" | "indigo" | "emerald";
  imageSrc?: string;
}) => {
  const toneBorder =
    tone === "emerald"
      ? "border-emerald-200/40"
      : tone === "indigo"
        ? "border-indigo-200/40"
        : "border-sky-200/40";

  return (
    <div
      className={cx(
        "group overflow-hidden rounded-2xl border bg-white/90 p-0 shadow-sm backdrop-blur",
        "hover:shadow-md hover:-translate-y-0.5 transition-all",
        toneBorder
      )}
    >
      {imageSrc && (
        <div className="relative h-36 w-full">
          <img
            src={imageSrc}
            alt={title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-white/70 via-white/10 to-transparent" />
        </div>
      )}

      <div
        className="p-5"
        style={{
          backgroundImage:
            tone === "emerald"
              ? "radial-gradient(circle at top, rgba(16,185,129,0.10), transparent 55%)"
              : tone === "indigo"
                ? "radial-gradient(circle at top, rgba(99,102,241,0.10), transparent 55%)"
                : "radial-gradient(circle at top, rgba(59,130,246,0.10), transparent 55%)",
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className={cx(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              "bg-slate-900 text-white shadow-sm",
              "group-hover:scale-[1.03] transition-transform"
            )}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            <div className="mt-1 text-sm leading-6 text-slate-600">{description}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SectionTitle = ({
  eyebrow,
  title,
  subtitle,
  inverted,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  inverted?: boolean;
}) => (
  <div className="mx-auto max-w-3xl text-center">
    {eyebrow && (
      <div
        className={cx(
          "text-xs font-semibold uppercase tracking-wider",
          inverted ? "text-white/70" : "text-slate-500"
        )}
      >
        {eyebrow}
      </div>
    )}
    <h2
      className={cx(
        "mt-2 text-2xl font-semibold tracking-tight sm:text-3xl",
        inverted ? "text-white" : "text-slate-900"
      )}
    >
      {title}
    </h2>
    {subtitle && (
      <p
        className={cx(
          "mt-3 text-sm leading-6 sm:text-base",
          inverted ? "text-white/75" : "text-slate-600"
        )}
      >
        {subtitle}
      </p>
    )}
  </div>
);

type PlanTone = "free" | "basic" | "medium" | "premium";

const planToneStyles: Record<
  PlanTone,
  { border: string; ring: string; bg: string; badgeBg: string; badgeText: string }
> = {
  free: {
    border: "border-sky-200/70",
    ring: "ring-sky-200/70",
    bg: "bg-gradient-to-b from-sky-50/95 to-white",
    badgeBg: "bg-sky-900",
    badgeText: "text-white",
  },
  basic: {
    border: "border-emerald-200/70",
    ring: "ring-emerald-200/70",
    bg: "bg-gradient-to-b from-emerald-50/95 to-white",
    badgeBg: "bg-emerald-900",
    badgeText: "text-white",
  },
  medium: {
    border: "border-indigo-200/70",
    ring: "ring-indigo-200/70",
    bg: "bg-gradient-to-b from-indigo-50/95 to-white",
    badgeBg: "bg-indigo-900",
    badgeText: "text-white",
  },
  premium: {
    border: "border-amber-200/80",
    ring: "ring-amber-200/70",
    bg: "bg-gradient-to-b from-amber-50/95 to-white",
    badgeBg: "bg-amber-900",
    badgeText: "text-white",
  },
};

const PlanCard = ({
  title,
  price,
  subtitle,
  bullets,
  highlight,
  ctaLabel,
  onCta,
  badge,
  tone = "basic",
}: {
  title: string;
  price: string;
  subtitle: string;
  bullets: string[];
  highlight?: boolean;
  ctaLabel: string;
  onCta: () => void;
  badge?: string;
  tone?: PlanTone;
}) => {
  const t = planToneStyles[tone];

  return (
    <div
      className={cx(
        "relative rounded-2xl border p-6 shadow-sm backdrop-blur",
        "transition-all hover:shadow-md hover:-translate-y-0.5",
        t.border,
        t.bg,
        highlight ? cx("ring-1", t.ring) : "ring-0"
      )}
    >
      {badge && (
        <div
          className={cx(
            "absolute right-5 top-5 rounded-full px-3 py-1 text-xs font-semibold shadow-sm",
            t.badgeBg,
            t.badgeText
          )}
        >
          {badge}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {highlight && (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
            <Sparkles className="h-3 w-3" /> recomendado
          </span>
        )}
      </div>

      <div className="mt-2 text-3xl font-semibold text-slate-900">{price}</div>
      <div className="mt-2 text-sm text-slate-600">{subtitle}</div>

      <ul className="mt-5 space-y-2 text-sm text-slate-700">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="mt-0.5 text-slate-400">•</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={onCta}
        className={cx(
          "mt-6 w-full rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
          highlight
            ? "bg-slate-900 text-white hover:bg-black"
            : "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
        )}
      >
        {ctaLabel}
      </button>
    </div>
  );
};

const TargetCard = ({
  icon,
  title,
  description,
  imageSrc,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  imageSrc?: string;
}) => (
  <div
    className={cx(
      "overflow-hidden rounded-2xl border border-white/10 bg-white/90 shadow-sm backdrop-blur",
      "hover:shadow-md hover:-translate-y-0.5 transition-all"
    )}
  >
    {imageSrc && (
      <div className="relative h-28 w-full">
        <img src={imageSrc} alt={title} className="h-full w-full object-cover" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-white/70 via-white/10 to-transparent" />
      </div>
    )}

    <div
      className="p-5"
      style={{
        backgroundImage:
          "radial-gradient(circle at top, rgba(59,130,246,0.10), transparent 55%)",
      }}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="mt-1 text-sm leading-6 text-slate-600">{description}</div>
        </div>
      </div>
    </div>
  </div>
);

const PublicLanding: React.FC = () => {
  const navigate = useNavigate();

  const goLogin = () => navigate("/login");
  const goRequestAccess = () => navigate("/solicitar-acceso");

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#123a63] flex flex-col">
      {/* BACKGROUND */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-[#06213f] via-[#0b3a6a] to-slate-50" />
      <div
        className="fixed inset-0 -z-10 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 10%, rgba(59,130,246,0.35), transparent 45%), radial-gradient(circle at 80% 20%, rgba(14,165,233,0.25), transparent 45%), radial-gradient(circle at 50% 70%, rgba(99,102,241,0.18), transparent 50%)",
        }}
      />

      {/* HEADER */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#06213f]/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-900 text-sm font-semibold shadow-sm">
              D
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-white">Debacu Evaluation360</div>
              <div className="text-xs text-white/70">Uso profesional · Acceso restringido</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => scrollTo("planes")}
              className="hidden rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15 sm:inline-flex"
            >
              Planes
            </button>
            <button
              onClick={goLogin}
              className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15"
            >
              Entrar
            </button>
            <button
              onClick={goRequestAccess}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
              title="Alta controlada durante la fase inicial"
            >
              Solicitar acceso
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* HERO */}
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <div className="flex flex-wrap gap-2">
                <Pill>Privado</Pill>
                <Pill>Trazabilidad</Pill>
                <Pill>Auditoría</Pill>
                <Pill>Control de acceso</Pill>
              </div>

              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Reduce incidencias. Aumenta control. Profesionaliza tu operación.
              </h1>

              <p className="mt-4 max-w-xl text-base leading-7 text-white/75 sm:text-lg">
                Trazabilidad privada para alojamientos y equipos operativos.
              </p>

              <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">
                Consulta y registra incidencias con criterios estructurados, control de acceso y auditoría interna.
                Diseñado para uso profesional. No es un servicio público.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  onClick={goLogin}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-100"
                >
                  Acceso profesional <ArrowRight className="h-4 w-4" />
                </button>

                <button
                  onClick={() => scrollTo("planes")}
                  className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15"
                >
                  Ver planes
                </button>

                <button
                  onClick={() => scrollTo("legal")}
                  className="text-sm font-medium text-white/75 hover:text-white text-left"
                >
                  Aviso legal
                </button>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-white/80 backdrop-blur">
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
                    Seguridad
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white">Acceso restringido</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-white/80 backdrop-blur">
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
                    Auditoría
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white">Trazabilidad de acciones</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-white/80 backdrop-blur">
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
                    Operativa
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white">Consulta y registro</div>
                </div>
              </div>
            </div>

            {/* Imagen hero */}
            <div className="relative">
              <div className="absolute -inset-6 rounded-[32px] bg-gradient-to-tr from-sky-500/30 via-indigo-500/20 to-transparent blur-2xl" />
              <div className="relative rounded-3xl border border-white/10 bg-white/10 p-3 shadow-sm backdrop-blur">
                <img
                  src="/src/public/img/debacuevaluation.png"
                  alt="Debacu Evaluation360"
                  className="w-full rounded-2xl object-cover"
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Pill>
                  <Lock className="h-4 w-4" /> Acceso restringido
                </Pill>
                <Pill>
                  <ShieldCheck className="h-4 w-4" /> Auditoría
                </Pill>
                <Pill>
                  <Search className="h-4 w-4" /> Consulta rápida
                </Pill>
              </div>
            </div>
          </div>
        </section>

        {/* QUÉ ES / QUÉ NO ES */}
        <section id="que-es" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <SectionTitle
            inverted
            eyebrow="Producto"
            title="Qué es y qué no es Debacu Evaluation360"
            subtitle="Mensajes claros y profesionales, sin exposición pública."
          />

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <BadgeCheck className="h-5 w-5 text-slate-700" />
                Qué es
              </div>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                <li className="flex gap-2">
                  <span className="mt-0.5 text-slate-400">•</span>
                  <span>Un sistema privado para registrar incidencias operativas con trazabilidad.</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 text-slate-400">•</span>
                  <span>Herramienta de apoyo a decisiones internas (no pública).</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 text-slate-400">•</span>
                  <span>Control de acceso + auditoría + minimización de datos sensibles.</span>
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Lock className="h-5 w-5 text-slate-700" />
                Qué no es
              </div>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                <li className="flex gap-2">
                  <span className="mt-0.5 text-slate-400">•</span>
                  <span>No es un registro público, ni indexable, ni “lista negra”.</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 text-slate-400">•</span>
                  <span>No es una autoridad ni una base oficial.</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 text-slate-400">•</span>
                  <span>Evita “opiniones”: fomenta hechos verificables y motivos estructurados.</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* A QUIÉN VA DIRIGIDO */}
        <section id="dirigido" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <SectionTitle
            inverted
            eyebrow="Industria"
            title="A quién va dirigido"
            subtitle="Pensado para operaciones de alojamiento con rotación y necesidad de control."
          />

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TargetCard
              imageSrc="/src/public/img/cards/hotel.png"
              icon={<Hotel className="h-5 w-5" />}
              title="Hoteles"
              description="Recepción, pisos, incidencias y trazabilidad operativa."
            />
            <TargetCard
              imageSrc="/src/public/img/cards/rural.png"
              icon={<Home className="h-5 w-5" />}
              title="Turismo rural"
              description="Gestión de estancias e incidencias sin ruido."
            />
            <TargetCard
              imageSrc="/src/public/img/cards/apartments.png"
              icon={<Building2 className="h-5 w-5" />}
              title="Pisos turísticos"
              description="Procesos claros, registros estructurados y auditoría."
            />
            <TargetCard
              imageSrc="/src/public/img/cards/hostel.png"
              icon={<Users className="h-5 w-5" />}
              title="Hospederías"
              description="Equipos pequeños con necesidad de orden y trazabilidad."
            />
          </div>

          <div className="mt-3 text-xs text-white/80">
            * Imágenes opcionales: coloca los ficheros en{" "}
            <span className="font-semibold text-white">public/img/cards/</span> (ej: hotel.jpg, rural.jpg…)
          </div>
        </section>

        {/* CÓMO FUNCIONA */}
        <section id="como-funciona" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <SectionTitle
            inverted
            eyebrow="Flujo"
            title="Cómo funciona"
            subtitle="Tres pasos simples: identificar, evaluar con contexto y registrar incidencias."
          />

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <InfoCard
              tone="blue"
              imageSrc="/src/public/img/cards/reception.png"
              icon={<Search className="h-5 w-5" />}
              title="1) Consulta rápida"
              description="Documento, email, teléfono o nombre. Resultados en segundos."
            />
            <InfoCard
              tone="indigo"
              imageSrc="/src/public/img/cards/director.png"
              icon={<ShieldCheck className="h-5 w-5" />}
              title="2) Evalúa con contexto"
              description="Histórico interno privado, orientado a decisiones operativas."
            />
            <InfoCard
              tone="emerald"
              imageSrc="/src/public/img/cards/operations.png"
              icon={<ClipboardList className="h-5 w-5" />}
              title="3) Registra"
              description="Incidencias estructuradas, auditables y trazables."
            />
          </div>
        </section>

        {/* CASOS DE USO */}
        <section id="casos" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <SectionTitle
            inverted
            eyebrow="Resultados"
            title="Casos de uso"
            subtitle="Ejemplos de mejora operativa (sin datos personales, sin exposición pública)."
          />

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            <InfoCard
              tone="blue"
              imageSrc="/src/public/img/cards/frontdesk.png"
              icon={<TrendingUp className="h-5 w-5" />}
              title="Menos incidencias repetidas"
              description="Estandariza motivos y severidad para que el equipo actúe con un criterio único."
            />
            <InfoCard
              tone="indigo"
              imageSrc="/src/public/img/cards/audit.png"
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Más trazabilidad"
              description="Auditoría de acciones: quién consultó, cuándo y por qué (sin PII por defecto)."
            />
            <InfoCard
              tone="emerald"
              imageSrc="/src/public/img/cards/sales.png"
              icon={<ClipboardList className="h-5 w-5" />}
              title="Decisiones con contexto"
              description="Histórico interno para apoyar protocolos operativos y prevención de incidencias."
            />
          </div>
        </section>

        {/* PLANES */}
        <section id="planes" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <SectionTitle
            inverted
            eyebrow="Planes"
            title="Planes y acceso"
            subtitle="Alta controlada. El plan FREE incluye 90 días para validar la operativa. Después, puedes continuar con un plan de pago."
          />

          <div className="mt-8 grid gap-4 lg:grid-cols-4">
            <PlanCard
              tone="free"
              title="FREE (90 días)"
              price="0 €"
              subtitle="Acceso inicial para validar operativa."
              bullets={[
                "90 días incluidos desde el alta",
                "Consultas limitadas según política",
                "Registro de incidencias estructurado",
                "Auditoría básica",
              ]}
              highlight
              badge="Inicio"
              ctaLabel="Solicitar acceso"
              onCta={goRequestAccess}
            />

            <PlanCard
              tone="basic"
              title="Básico"
              price="29,90 € / mes"
              subtitle="Para equipos pequeños."
              bullets={[
                "Límite superior de consultas",
                "Histórico y auditoría",
                "Soporte estándar",
                "Facturación Stripe",
              ]}
              ctaLabel="Ver condiciones"
              onCta={() => scrollTo("legal")}
            />

            <PlanCard
              tone="medium"
              title="Medio"
              price="49,90 € / mes"
              subtitle="Para equipos en crecimiento."
              bullets={[
                "Más consultas/mes",
                "Soporte prioritario",
                "Control de acceso avanzado",
                "Facturas descargables",
              ]}
              ctaLabel="Ver condiciones"
              onCta={() => scrollTo("legal")}
            />

            <PlanCard
              tone="premium"
              title="Premium"
              price="A medida"
              subtitle="Grandes cadenas y grupos · Conexión API"
              bullets={[
                "Integración por API (PMS / CRM / BI)",
                "Políticas avanzadas por organización",
                "Auditoría y reporting extendido",
                "Soporte y SLA según alcance",
              ]}
              ctaLabel="Contactar"
              onCta={() => scrollTo("legal")}
              badge="Enterprise"
            />
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
            <span className="font-semibold text-slate-900">Nota:</span> acceso restringido y uso profesional.
            Las condiciones definitivas y privacidad se detallan en el bloque legal.
          </div>
        </section>

        <div id="legal" />
      </main>

      <LegalFooter />
    </div>
  );
};

export default PublicLanding;
