import React, { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";

/**
 * ✅ Views de la app.
 * - Operativa: dashboard/search/add/account/admin
 * - Revenue Intelligence: rev_channels/rev_risk/rev_leakage/rev_properties
 * - Auditoría: aud_summary/aud_risk/aud_stats/aud_history/aud_exports/aud_config/aud_screening_csv
 */
export type AuthedView =
  | "dashboard"
  | "search"
  | "add"
  | "account"
  | "admin"
  | "rev_channels"
  | "rev_risk"
  | "rev_leakage"
  | "rev_properties"
  | "aud_summary"
  | "aud_risk"
  | "aud_stats"
  | "aud_history"
  | "aud_exports"
  | "aud_config"
  | "aud_screening_csv";

export type NavItem = {
  view: AuthedView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  locked?: boolean;
  section?: "OPERATIVA" | "REVENUE" | "AUDITORIA" | "CUENTA";
};

type Props = {
  userEmail?: string;
  userName?: string;
  activeView: AuthedView;
  onNavigate: (view: AuthedView) => void;
  onLogout: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  navItems?: NavItem[];
  showAccountActions?: boolean;
  currentPlanCode?: string;
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
  onClick: () => void;
}> = React.memo(({ view, label, icon: Icon, disabled, locked, active, onClick }) => {
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
      title={isLocked ? "Disponible en MEDIUM / PREMIUM" : undefined}
    >
      <Icon
        className={classNames(
          "w-4 h-4",
          disabled
            ? "text-slate-300"
            : active
            ? "text-blue-600"
            : isLocked
            ? "text-slate-400"
            : "text-slate-400"
        )}
      />
      <span className="font-medium tracking-tight">{label}</span>

      {isLocked ? <Lock className="w-4 h-4 text-slate-400 ml-auto" /> : null}
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
  activeView,
  onNavigate,
  onLogout,
  title,
  subtitle,
  children,
  navItems,
  showAccountActions = true,
  currentPlanCode,
}: Props) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const plan = (currentPlanCode ?? "").toUpperCase();
  const canAccessRevenue = plan === "MEDIUM" || plan === "PREMIUM";

  const nav = useMemo<NavItem[]>(() => {
    const base: NavItem[] = [
      // Operativa
      { view: "dashboard", label: "Dashboard", icon: LayoutDashboard, section: "OPERATIVA" },
      { view: "search", label: "Consultar", icon: Search, section: "OPERATIVA" },
      { view: "add", label: "Registrar incidencia", icon: PlusCircle, section: "OPERATIVA" },

      // Revenue Intelligence
      { view: "rev_channels", label: "Análisis por Canal", icon: BarChart3, section: "REVENUE", locked: !canAccessRevenue },
      { view: "rev_risk", label: "Nivel de Riesgo", icon: ShieldAlert, section: "REVENUE", locked: !canAccessRevenue },
      { view: "rev_leakage", label: "Fugas de Revenue", icon: TrendingDown, section: "REVENUE", locked: !canAccessRevenue },
      { view: "rev_properties", label: "Propiedades", icon: Building2, section: "REVENUE", locked: !canAccessRevenue },

      // Auditoría
      { view: "aud_screening_csv", label: "Screening CSV", icon: FileText, section: "AUDITORIA" },
      { view: "aud_summary", label: "Resumen", icon: FileText, section: "AUDITORIA" },
      { view: "aud_risk", label: "Auditoría de riesgo", icon: Shield, section: "AUDITORIA" },
      { view: "aud_stats", label: "Estadísticas operativas", icon: Activity, section: "AUDITORIA" },
      { view: "aud_history", label: "Histórico", icon: Clock, section: "AUDITORIA" },
      { view: "aud_exports", label: "Exportaciones", icon: Download, section: "AUDITORIA" },
      { view: "aud_config", label: "Configuración-Avisos", icon: Settings, section: "AUDITORIA" },

      // Cuenta
      { view: "account", label: "Mi cuenta", icon: CreditCard, section: "CUENTA" },
    ];

    const src = navItems ?? base;

    return src.map((i) => {
      if (i.section === "REVENUE") return { ...i, locked: !canAccessRevenue };
      return i;
    });
  }, [navItems, canAccessRevenue]);

  const sections = useMemo(() => {
    const operativa = nav.filter((i) => (i.section ?? "OPERATIVA") === "OPERATIVA");
    const revenue = nav.filter((i) => i.section === "REVENUE");
    const auditoria = nav.filter((i) => i.section === "AUDITORIA");
    const cuenta = nav.filter((i) => i.section === "CUENTA");
    return { operativa, revenue, auditoria, cuenta };
  }, [nav]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileMenuOpen]);

  const handleNavigate = (view: AuthedView) => {
    onNavigate(view);
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
        active={activeView === i.view}
        onClick={() => {
          if (i.disabled) return;
          handleNavigate(i.view);
        }}
      />
    ));

  return (
    <div className="flex h-screen bg-slate-50">
      {/* SIDEBAR DESKTOP */}
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

        <div className="flex-1 overflow-y-auto p-4 pb-6 space-y-8">
          <SectionBlock title="Operativa">{renderItems(sections.operativa)}</SectionBlock>

          {sections.revenue.length > 0 && (
            <SectionBlock title="Revenue Intelligence">{renderItems(sections.revenue)}</SectionBlock>
          )}

          {sections.auditoria.length > 0 && (
            <SectionBlock title="Auditoría">{renderItems(sections.auditoria)}</SectionBlock>
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

      {/* MAIN */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* HEADER MOBILE */}
        <header className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex justify-between items-center">
          <button
            type="button"
            aria-label="Abrir menú"
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 text-slate-700 rounded-lg hover:bg-slate-50"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="text-sm font-semibold text-slate-900">Debacu Evaluation360</div>
          <div className="w-10" />
        </header>

        {/* MOBILE DRAWER */}
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

              <div className="space-y-8 overflow-y-auto h-[calc(100%-56px)] pr-1">
                <SectionBlock title="Operativa">{renderItems(sections.operativa)}</SectionBlock>

                {sections.revenue.length > 0 && (
                  <SectionBlock title="Revenue Intelligence">{renderItems(sections.revenue)}</SectionBlock>
                )}

                {sections.auditoria.length > 0 && (
                  <SectionBlock title="Auditoría">{renderItems(sections.auditoria)}</SectionBlock>
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

        {/* HEADER DESKTOP */}
        <div className="hidden md:block border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
              {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm text-slate-600 hidden lg:block">{userEmail || ""}</div>

              {showAccountActions && (
                <button
                  type="button"
                  onClick={() => onNavigate("account")}
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