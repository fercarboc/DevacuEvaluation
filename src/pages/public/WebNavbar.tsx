import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type NavItem = {
  label: string;
  path: string;
};

const navItems: NavItem[] = [
  { label: "Producto", path: "/producto" },
  { label: "Tecnología", path: "/tecnologia" },
  { label: "Arquitectura", path: "/arquitectura" },
  { label: "Documentación", path: "/documentacion" },
  { label: "Contacto", path: "/contacto" },
];

export default function WebNavbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const goToPath = (path: string) => {
    setMobileOpen(false);
    if (location.pathname === path) return;
    navigate(path);
  };

  const NavButton = ({
    label,
    onClick,
    active,
  }: {
    label: string;
    onClick: () => void;
    active?: boolean;
  }) => (
    <button
      onClick={onClick}
      type="button"
      className={classNames(
        "relative text-sm font-medium transition-colors",
        active ? "text-white" : "text-slate-400 hover:text-white"
      )}
    >
      <span>{label}</span>
      {active && (
        <span className="absolute -bottom-2 left-0 h-[2px] w-full rounded-full bg-blue-500" />
      )}
    </button>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#020617]/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-6">
        {/* Marca */}
        <button
          onClick={() => goToPath("/")}
          type="button"
          className="flex shrink-0 items-center gap-3 text-white"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-600/20">
            <span className="text-sm font-bold text-white">D</span>
          </div>

          <div className="text-left leading-tight">
            <div className="text-sm font-semibold tracking-tight text-white">
              Debacu
            </div>
            <div className="text-[11px] tracking-wide text-slate-400">
              Evaluation360
            </div>
          </div>
        </button>

        {/* Navegación desktop */}
        <nav className="hidden items-center gap-8 md:flex">
          {navItems.map((item) => (
            <NavButton
              key={item.path}
              label={item.label}
              onClick={() => goToPath(item.path)}
              active={location.pathname === item.path}
            />
          ))}
        </nav>

        {/* Acciones desktop */}
        <div className="hidden shrink-0 items-center gap-3 md:flex">
          <button
            onClick={() => goToPath("/login")}
            type="button"
            className="px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white"
          >
            Acceso
          </button>

          <button
            onClick={() => goToPath("/solicitar-acceso")}
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
          >
            Solicitar acceso
          </button>
        </div>

        {/* Botón mobile */}
        <button
          onClick={() => setMobileOpen((prev) => !prev)}
          className="text-white md:hidden"
          aria-label="Abrir menú"
          type="button"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Menú mobile */}
      {mobileOpen && (
        <div className="border-t border-white/10 bg-[#020617] px-6 py-5 md:hidden">
          <div className="flex flex-col gap-4">
            {navItems.map((item) => (
              <button
                key={item.path}
                onClick={() => goToPath(item.path)}
                type="button"
                className={classNames(
                  "text-left text-base font-medium transition-colors",
                  location.pathname === item.path
                    ? "text-white"
                    : "text-slate-300 hover:text-white"
                )}
              >
                {item.label}
              </button>
            ))}

            <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
              <button
                onClick={() => goToPath("/solicitar-acceso")}
                type="button"
                className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Solicitar acceso
              </button>

              <button
                onClick={() => goToPath("/login")}
                type="button"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-semibold text-white transition-colors hover:bg-white/10"
              >
                Acceso
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
