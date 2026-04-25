import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Search,
  PlusCircle,
  CreditCard,
  LogOut,
  Menu,
  BarChart3,
  ShieldAlert,
  TrendingDown,
  FileText,
  Shield,
  Activity,
  Clock,
  Download,
  Settings,
  Lock,
  Building2,
  BedDouble,
  CalendarRange,
  CalendarDays,
  LineChart,
  CalendarClock,
  Layers3,
  Upload,
  Bell,
} from "lucide-react";

export type AuthedView =
  | "dashboard"
  | "alarmas"
  | "search"
  | "add"
  | "account"
  | "admin"
  | "rev_channels"
  | "rev_risk"
  | "rev_leakage"
  | "rev_import"
  | "rev_day_by_day"
  | "rev_monthly"
  | "rev_channels_segments"
  | "rev_pickup_advanced"
  | "rev_properties"
  | "rev_room_types"
  | "rev_price_calendar"
  | "rev_events_seasons"
  | "aud_summary"
  | "aud_risk"
  | "aud_stats"
  | "aud_history"
  | "aud_exports"
  | "aud_config"
  | "aud_screening_csv"
  | "pms_wizard"
  | "pms_consulta"
  | "pms_historial";

export type NavItem = {
  view: AuthedView;
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  locked?: boolean;
  section?: "OPERATIVA" | "ALARMAS" | "CONSULTAS" | "REVENUE_RIESGO" | "REVENUE" | "AUDITORIA" | "CUENTA" | "INTEGRACIONES";
};

type Props = {
  userEmail?: string;
  userName?: string;
  onLogout: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  navItems?: NavItem[];
  showAccountActions?: boolean;
  currentPlanCode?: string;
  headerLeft?: React.ReactNode;
  notificationCount?: number;
  onClearNotifications?: () => void;
};

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const SectionHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-4 pt-4 pb-2 text-[10px] font-medium text-slate-400 uppercase tracking-wide">
    {children}
  </div>
);

const NavItemButton: React.FC<{
  view: AuthedView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  locked?: boolean;
  active: boolean;
  badge?: number;
  onClick: () => void;
}> = React.memo(({ view, label, icon: Icon, disabled, locked, active, badge, onClick }) => {
  const isLocked = !!locked && !disabled;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={classNames(
        "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30",
        disabled
          ? "text-slate-400 border border-dashed border-slate-200 bg-slate-50 cursor-not-allowed"
          : active
          ? "bg-blue-50 text-blue-700 border border-blue-100 shadow-sm"
          : isLocked
          ? "text-slate-500 hover:bg-slate-50 border border-slate-100"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      )}
      aria-current={active ? "page" : undefined}
      data-view={view}
      title={isLocked ? "Función de Revenue Intelligence — disponible en plan PROFESSIONAL o ENTERPRISE. Actualiza en Mi cuenta." : undefined}
    >
      <Icon
        className={classNames(
          "w-4 h-4",
          disabled ? "text-slate-300" : active ? "text-blue-600" : "text-slate-400"
        )}
      />
      <span className="font-medium tracking-tight flex-1 text-left">{label}</span>
      {badge != null && badge > 0 && (
        <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      {isLocked && !badge ? <Lock className="w-4 h-4 text-slate-400 ml-auto" /> : null}
    </button>
  );
});
NavItemButton.displayName = "NavItemButton";

const SectionBlock: React.FC<{
  title: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <div className="space-y-2">
    <SectionHeader>{title}</SectionHeader>
    <div className="space-y-1">{children}</div>
  </div>
);

export default function AppShell({
  userEmail,
  userName,
  onLogout,
  title,
  subtitle,
  children,
  navItems,
  showAccountActions = true,
  currentPlanCode,
  headerLeft,
  notificationCount = 0,
  onClearNotifications,
}: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const plan = (currentPlanCode ?? "").toUpperCase();
  const canAccessRevenue = plan === "MEDIUM" || plan === "PREMIUM";

  const nav = useMemo<NavItem[]>(() => {
    const base: NavItem[] = [
      { view: "dashboard",  path: "/app",        label: "Dashboard",   icon: LayoutDashboard, section: "OPERATIVA" },
      { view: "alarmas",    path: "/app/alarmas", label: "Alarmas Detectadas", icon: Bell, section: "ALARMAS" },

      { view: "aud_screening_csv", path: "/app/screening",  label: "Consulta automática (CSV)", icon: FileText,   section: "CONSULTAS" },
      { view: "search",            path: "/app/buscar",     label: "Consulta manual",           icon: Search,     section: "CONSULTAS" },
      { view: "add",               path: "/app/registrar",  label: "Registrar incidencia",      icon: PlusCircle, section: "CONSULTAS" },

      { view: "rev_channels", path: "/app/revenue/canales", label: "Análisis por Canal", icon: BarChart3,   section: "REVENUE_RIESGO", locked: !canAccessRevenue },
      { view: "rev_risk",     path: "/app/revenue/riesgo",  label: "Nivel de Riesgo",    icon: ShieldAlert, section: "REVENUE_RIESGO", locked: !canAccessRevenue },
      { view: "rev_leakage",  path: "/app/revenue/fugas",   label: "Fugas de Revenue",   icon: TrendingDown, section: "REVENUE_RIESGO", locked: !canAccessRevenue },

      { view: "rev_import",            path: "/app/revenue/importar",          label: "Importación Revenue",   icon: Upload,       section: "REVENUE", locked: !canAccessRevenue },
      { view: "rev_day_by_day",        path: "/app/revenue/dia-x-dia",         label: "Día x Día",             icon: CalendarClock, section: "REVENUE", locked: !canAccessRevenue },
      { view: "rev_monthly",           path: "/app/revenue/mensual",           label: "Mensual",               icon: LineChart,    section: "REVENUE", locked: !canAccessRevenue },
      { view: "rev_channels_segments", path: "/app/revenue/canales-segmentos", label: "Canales & Segmentos",   icon: Layers3,      section: "REVENUE", locked: !canAccessRevenue },
      { view: "rev_properties",        path: "/app/revenue/propiedades",       label: "Propiedades",           icon: Building2,    section: "REVENUE", locked: !canAccessRevenue },
      { view: "rev_room_types",        path: "/app/revenue/tipos-habitacion",  label: "Tipos de habitación",   icon: BedDouble,    section: "REVENUE", locked: !canAccessRevenue },
      { view: "rev_price_calendar",    path: "/app/revenue/calendario-precios",label: "Calendario de precios", icon: CalendarRange, section: "REVENUE", locked: !canAccessRevenue },
      { view: "rev_events_seasons",    path: "/app/revenue/eventos-temporadas",label: "Eventos y temporadas",  icon: CalendarDays, section: "REVENUE", locked: !canAccessRevenue },

      { view: "aud_summary",  path: "/app/auditoria/resumen",       label: "Resumen",                icon: FileText, section: "AUDITORIA" },
      { view: "aud_risk",     path: "/app/auditoria/riesgo",        label: "Auditoría de riesgo",    icon: Shield,   section: "AUDITORIA" },
      { view: "aud_stats",    path: "/app/auditoria/estadisticas",  label: "Estadísticas operativas",icon: Activity, section: "AUDITORIA" },
      { view: "aud_history",  path: "/app/auditoria/historico",     label: "Histórico",              icon: Clock,    section: "AUDITORIA" },
      { view: "aud_exports",  path: "/app/auditoria/exportaciones", label: "Exportaciones",          icon: Download, section: "AUDITORIA" },
      { view: "aud_config",   path: "/app/auditoria/configuracion", label: "Configuración-Avisos",   icon: Settings, section: "AUDITORIA" },

      { view: "account", path: "/app/cuenta", label: "Mi cuenta", icon: CreditCard, section: "CUENTA" },
    ];

    const src = navItems ?? base;

    return src.map((i) => {
      if (i.section === "REVENUE" || i.section === "REVENUE_RIESGO") return { ...i, locked: !canAccessRevenue };
      return i;
    });
  }, [navItems, canAccessRevenue]);

  const sections = useMemo(() => {
    const dashboard      = nav.filter((i) => i.section === "OPERATIVA");
    const alarmas        = nav.filter((i) => i.section === "ALARMAS");
    const consultas      = nav.filter((i) => i.section === "CONSULTAS");
    const revenueRiesgo  = nav.filter((i) => i.section === "REVENUE_RIESGO");
    const revenue        = nav.filter((i) => i.section === "REVENUE");
    const auditoria      = nav.filter((i) => i.section === "AUDITORIA");
    const integraciones  = nav.filter((i) => i.section === "INTEGRACIONES");
    const cuenta         = nav.filter((i) => i.section === "CUENTA");
    return { dashboard, alarmas, consultas, revenueRiesgo, revenue, auditoria, integraciones, cuenta };
  }, [nav]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileMenuOpen]);

  const handleNavigate = (item: NavItem) => {
    navigate(item.path);
    setMobileMenuOpen(false);
  };

  const renderItems = (items: NavItem[]) =>
    items.map((i) => (
      <NavItemButton
        key={i.view}
        view={i.view}
        label={i.label}
        icon={i.icon}
        disabled={i.disabled}
        locked={i.locked}
        active={location.pathname === i.path}
        badge={i.view === "alarmas" && notificationCount > 0 ? notificationCount : undefined}
        onClick={() => {
          if (i.disabled) return;
          if (i.view === "alarmas") onClearNotifications?.();
          handleNavigate(i);
        }}
      />
    ));

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="hidden md:flex flex-col w-72 bg-white border-r border-slate-200">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-bold">
              D
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-slate-900">Debacu Evaluation360</div>
              <div className="text-xs text-slate-500">Uso profesional · Acceso restringido</div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-6 space-y-4">
          <div className="space-y-1">{renderItems(sections.dashboard)}</div>

          {sections.alarmas.length > 0 && (
            <div className="space-y-1">{renderItems(sections.alarmas)}</div>
          )}

          {sections.consultas.length > 0 && (
            <SectionBlock title="Consultas y Registros">{renderItems(sections.consultas)}</SectionBlock>
          )}

          {sections.revenueRiesgo.length > 0 && (
            <SectionBlock title="Revenue Riesgo">{renderItems(sections.revenueRiesgo)}</SectionBlock>
          )}

          {sections.revenue.length > 0 && (
            <SectionBlock title="Revenue Intelligence">{renderItems(sections.revenue)}</SectionBlock>
          )}

          {sections.auditoria.length > 0 && (
            <SectionBlock title="Auditoría">{renderItems(sections.auditoria)}</SectionBlock>
          )}

          {sections.integraciones.length > 0 && (
            <SectionBlock title="Integraciones PMS">{renderItems(sections.integraciones)}</SectionBlock>
          )}

          {showAccountActions && sections.cuenta.length > 0 && (
            <SectionBlock title="Cuenta">{renderItems(sections.cuenta)}</SectionBlock>
          )}
        </div>

        <div className="px-4 py-5 border-t border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-9 h-9 rounded-2xl bg-slate-200 flex items-center justify-center text-slate-700 font-bold">
              {(userName?.[0] || userEmail?.[0] || "U").toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold text-slate-900 truncate">{userName || "Usuario"}</p>
              <p className="text-xs text-slate-500 truncate">{userEmail || ""}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Salir
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex justify-between items-center">
          <button
            type="button"
            aria-label="Abrir menú"
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 text-slate-700 rounded-lg hover:bg-slate-50"
          >
            <Menu className="w-6 h-6" />
          </button>

          <div className="text-sm font-semibold text-slate-900 truncate max-w-[55%]">
            {title || "Debacu Evaluation360"}
          </div>

          <div className="w-10" />
        </header>

        {mobileMenuOpen && (
          <div
            className="md:hidden fixed inset-0 z-50 bg-black/30"
            onClick={() => setMobileMenuOpen(false)}
            role="presentation"
          >
            <div
              className="absolute left-0 top-0 h-full w-[85%] max-w-sm bg-white border-r border-slate-200 px-4 py-4"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Menú de navegación"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-slate-900">Menú</div>
                <button
                  type="button"
                  aria-label="Cerrar menú"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-100"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4 overflow-y-auto h-[calc(100%-56px)] pr-1">
                <div className="space-y-1">{renderItems(sections.dashboard)}</div>

                {sections.alarmas.length > 0 && (
                  <div className="space-y-1">{renderItems(sections.alarmas)}</div>
                )}

                {sections.consultas.length > 0 && (
                  <SectionBlock title="Consultas y Registros">{renderItems(sections.consultas)}</SectionBlock>
                )}

                {sections.revenueRiesgo.length > 0 && (
                  <SectionBlock title="Revenue Riesgo">{renderItems(sections.revenueRiesgo)}</SectionBlock>
                )}

                {sections.revenue.length > 0 && (
                  <SectionBlock title="Revenue Intelligence">{renderItems(sections.revenue)}</SectionBlock>
                )}

                {sections.auditoria.length > 0 && (
                  <SectionBlock title="Auditoría">{renderItems(sections.auditoria)}</SectionBlock>
                )}

                {sections.integraciones.length > 0 && (
                  <SectionBlock title="Integraciones PMS">{renderItems(sections.integraciones)}</SectionBlock>
                )}

                {showAccountActions && sections.cuenta.length > 0 && (
                  <SectionBlock title="Cuenta">{renderItems(sections.cuenta)}</SectionBlock>
                )}

                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-red-600 hover:bg-slate-50"
                >
                  <LogOut className="w-4 h-4" />
                  Salir
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="hidden md:block border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              {headerLeft ? (
                headerLeft
              ) : (
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
                  {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="text-sm text-slate-600 hidden lg:block">{userEmail || ""}</div>

              <button
                type="button"
                onClick={() => {
                  onClearNotifications?.();
                  navigate("/app/alarmas");
                }}
                className="relative rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 transition-colors"
                title="Alarmas de riesgo"
                aria-label={notificationCount > 0 ? `${notificationCount} alarmas sin leer` : "Sin alarmas pendientes"}
              >
                <Bell className="w-5 h-5" />
                {notificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[9px] font-bold px-1 ring-2 ring-white">
                    {notificationCount > 99 ? "99+" : notificationCount}
                  </span>
                )}
              </button>

              {showAccountActions && (
                <button
                  type="button"
                  onClick={() => navigate("/app/cuenta")}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Mi cuenta
                </button>
              )}
            </div>
          </div>
        </div>

        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">{children}</div>
        </main>
      </div>
    </div>
  );
}