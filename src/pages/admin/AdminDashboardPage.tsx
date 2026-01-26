import React, { useEffect, useState } from "react";
import { fetch_dashboard_metrics } from "@/services/adminService";
import { Link } from "react-router-dom";

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState({
    clientes_activos: 0,
    solicitudes_pendientes: 0,
    consultas_hoy: 0,
    alertas_activas: 0,
  });

  useEffect(() => {
    void (async () => {
      const data = await fetch_dashboard_metrics();
      setMetrics(data);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Clientes activos", value: metrics.clientes_activos },
          { label: "Solicitudes pendientes", value: metrics.solicitudes_pendientes },
          { label: "Consultas hoy", value: metrics.consultas_hoy },
          { label: "Alertas activas", value: metrics.alertas_activas },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-slate-900 hover:shadow-lg transition-shadow"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {card.label}
            </p>
            <p className="mt-1 text-3xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>

      {/* CTA a Auditoría */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Auditoría</h2>
            <p className="mt-1 text-[12px] text-slate-500">
              Eventos técnicos y trazabilidad (Stripe, cambios de suscripción, acciones del sistema).
            </p>
          </div>

          <Link
            to="/app/admin/auditoria"
            className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Ver auditoría
          </Link>
        </div>
      </section>
    </div>
  );
}
