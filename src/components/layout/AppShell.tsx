import React, { useMemo, useState } from "react";
import { LayoutDashboard, Search, PlusCircle, CreditCard, LogOut, Menu } from "lucide-react";

export type AuthedView = "dashboard" | "search" | "add" | "subscription" | "admin";

export type NavItem = {
  view: AuthedView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
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
};

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
}: Props) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const nav = useMemo(
    () =>
      navItems ?? [
        { view: "dashboard", label: "Dashboard", icon: LayoutDashboard },
        { view: "search", label: "Consultar", icon: Search },
        { view: "add", label: "Registrar incidencia", icon: PlusCircle },
      ],
    [navItems]
  );

  const NavItemButton = ({
    view,
    label,
    icon: Icon,
  }: {
    view: AuthedView;
    label: string;
    icon: any;
  }) => {
    const active = activeView === view;
    return (
      <button
        onClick={() => {
          onNavigate(view);
          setMobileMenuOpen(false);
        }}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
          active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"
        }`}
      >
        <Icon className={`w-5 h-5 ${active ? "text-white" : "text-slate-400"}`} />
        <span className="text-sm font-medium">{label}</span>
      </button>
    );
  };

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
              <div className="text-xs text-slate-500">Uso profesional ú Acceso restringido</div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <div className="px-4 pt-2 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Operativa
          </div>
          {nav.map((i) => (
            <NavItemButton key={i.view} view={i.view} label={i.label} icon={i.icon} />
          ))}

          {showAccountActions && (
            <>
              <div className="mt-8 px-4 pt-2 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Cuenta
              </div>
              <button
                onClick={() => onNavigate("subscription")}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                  activeView === "subscription"
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <CreditCard
                  className={`w-5 h-5 ${
                    activeView === "subscription" ? "text-white" : "text-slate-400"
                  }`}
                />
                <span className="text-sm font-medium">Mi cuenta & plan</span>
              </button>
            </>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-9 h-9 rounded-2xl bg-slate-200 flex items-center justify-center text-slate-700 font-bold">
              {(userName?.[0] || userEmail?.[0] || "U").toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold text-slate-900 truncate">
                {userName || "Usuario"}
              </p>
              <p className="text-xs text-slate-500 truncate">{userEmail || ""}</p>
            </div>
          </div>

          <button
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
          <button onClick={() => setMobileMenuOpen(true)} className="p-2 text-slate-700">
            <Menu className="w-6 h-6" />
          </button>
          <div className="text-sm font-semibold text-slate-900">Debacu Evaluation360</div>
          {showAccountActions && (
            <button
              onClick={() => onNavigate("subscription")}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700"
            >
              Cuenta
            </button>
          )}
        </header>

        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 bg-black/30">
            <div className="absolute left-0 top-0 h-full w-[85%] max-w-sm bg-white border-r border-slate-200 p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-slate-900">Menú</div>
                <button onClick={() => setMobileMenuOpen(false)} className="text-slate-600">
                  ×
                </button>
              </div>
              <div className="space-y-2">
                {nav.map((i) => (
                  <NavItemButton key={i.view} view={i.view} label={i.label} icon={i.icon} />
                ))}
                {showAccountActions && (
                  <div className="pt-3 border-t border-slate-200">
                    <button
                      onClick={() => {
                        onNavigate("subscription");
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                        activeView === "subscription"
                          ? "bg-slate-900 text-white"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <CreditCard
                        className={`w-5 h-5 ${
                          activeView === "subscription" ? "text-white" : "text-slate-400"
                        }`}
                      />
                      <span className="text-sm font-medium">Mi cuenta & plan</span>
                    </button>
                  </div>
                )}
                <button
                  onClick={onLogout}
                  className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-red-600"
                >
                  <LogOut className="w-4 h-4" />
                  Salir
                </button>
              </div>
            </div>
          </div>
        )}

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
                  onClick={() => onNavigate("subscription")}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Mi cuenta
                </button>
              )}
              <button
                onClick={onLogout}
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black"
              >
                Salir
              </button>
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
