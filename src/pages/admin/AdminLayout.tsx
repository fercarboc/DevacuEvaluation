import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  CreditCard,
  Database,
  Shield,
  Sliders,
  PieChart,
  AlertTriangle,
  FileText,
  Users,
  Activity,
  Download,
} from "lucide-react";

const ADMIN_TABS = [
  { key: "dashboard", label: "Dashboard", path: "/app/admin/dashboard", icon: PieChart },
  { key: "solicitudes", label: "Solicitudes", path: "/app/admin/solicitudes-acceso", icon: Activity },
  { key: "clientes", label: "Clientes", path: "/app/admin/clientes", icon: Users },
  { key: "planes", label: "Planes", path: "/app/admin/planes", icon: CreditCard },
  { key: "facturacion", label: "Facturación", path: "/app/admin/facturacion", icon: FileText },
  { key: "abusos", label: "Uso y abuso", path: "/app/admin/abusos", icon: AlertTriangle },
  { key: "estadisticas", label: "Estadísticas", path: "/app/admin/estadisticas", icon: Database },
  { key: "auditoria", label: "Auditoría", path: "/app/admin/auditoria", icon: Shield },
   { key: "exportaciones", label: "Exportaciones", path: "/app/admin/exportaciones", icon: Download },

  { key: "configuracion", label: "Configuración", path: "/app/admin/configuracion", icon: Sliders },
];

export default function AdminLayout() {
  const navigate = useNavigate();

  return (
    // ✅ blindaje total del viewport (evita que auditoría empuje todo)
    <div className="h-screen w-screen overflow-hidden bg-slate-50">
      <div className="flex h-full w-full min-w-0">
        <aside className="w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col">
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900">Admin Panel</h2>
            <p className="text-xs text-slate-500">SaaS Administrator</p>
          </div>

          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {ADMIN_TABS.map((tab) => (
              <NavLink
                key={tab.key}
                to={tab.path}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`
                }
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </NavLink>
            ))}
          </nav>

          <div className="p-4 border-t border-slate-100">
            <button
              onClick={() => navigate("/")}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-red-600"
            >
              Cerrar sesión
            </button>
          </div>
        </aside>

        {/* ✅ min-w-0 + overflow-hidden para que nada pueda empujar a la derecha */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="shrink-0 border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                Panel de administración
              </h1>
              <p className="text-xs uppercase tracking-wide text-slate-500">
                SaaS Administrator
              </p>
            </div>

            {/* ✅ evita que el email/usuario empuje el header */}
            <div className="flex min-w-0 items-center gap-3">
              <div className="w-10 h-10 shrink-0 rounded-full bg-slate-900 text-white flex items-center justify-center font-semibold">
                SA
              </div>
              <span className="min-w-0 truncate text-sm text-slate-600">
                admin@debacu.com
              </span>
            </div>
          </header>

          {/* ✅ scroll vertical aquí, PERO horizontal bloqueado */}
          <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-slate-50 p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
