import React, { useEffect, useState } from "react";
import { fetch_dashboard_metrics, list_audit_events } from "@/services/adminService";
import { DataTable, Th, Tr, Td } from "@/components/ui/DataTable";

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState({
    clientes_activos: 0,
    solicitudes_pendientes: 0,
    consultas_hoy: 0,
    alertas_activas: 0,
  });
  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => {
    void (async () => {
      const data = await fetch_dashboard_metrics();
      setMetrics(data);
      const audit = await list_audit_events();
      setActivities(audit.slice(0, 10));
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
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{card.label}</p>
            <p className="mt-1 text-3xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Actividad reciente</h2>
            <p className="text-[11px] text-slate-500">
              Eventos recientes de auditoría. Mensajes compactos para facilitar la lectura.
            </p>
          </div>
        </div>
        <div className="mt-4 overflow-auto max-h-[360px] text-[12px] leading-relaxed text-slate-600">
          <DataTable>
            <thead>
              <tr className="text-left">
                <Th className="text-[11px] uppercase tracking-wider text-slate-500">Fecha</Th>
                <Th className="text-[11px] uppercase tracking-wider text-slate-500">Tipo</Th>
                <Th className="text-[11px] uppercase tracking-wider text-slate-500">Cliente</Th>
                <Th className="text-[11px] uppercase tracking-wider text-slate-500">Detalle</Th>
              </tr>
            </thead>
            <tbody>
              {activities.map((event) => (
                <Tr key={event.id}>
                  <Td className="text-xs text-slate-500">{new Date(event.created_at).toLocaleString()}</Td>
                  <Td className="text-sm text-slate-600">{event.type}</Td>
                  <Td className="text-sm text-slate-700">{event.customer_id}</Td>
                  <Td className="text-xs text-slate-500">
                    {event.payload ? JSON.stringify(event.payload) : "-"}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      </section>
    </div>
  );
}
