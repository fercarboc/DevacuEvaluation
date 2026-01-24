import React, { useState } from "react";
import { list_abuse_alerts } from "@/services/adminService";
import { DataTable, Th, Tr, Td } from "@/components/ui/DataTable";

export default function AdminAbusePage() {
  const [alerts, setAlerts] = useState<any[]>([]);

  React.useEffect(() => {
    void (async () => {
      const data = await list_abuse_alerts();
      setAlerts(data);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Uso y abuso</h1>
        <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
          Refrescar alertas
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <DataTable>
          <thead>
            <tr>
              <Th>ID</Th>
              <Th>Cliente</Th>
              <Th>Razón</Th>
              <Th>Fecha</Th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <Tr key={alert.id}>
                <Td>{alert.id}</Td>
                <Td>{alert.customer_id}</Td>
                <Td>{alert.reason}</Td>
                <Td>{new Date(alert.created_at).toLocaleString()}</Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Configuración de protección</h2>
        <p className="text-xs text-slate-500">Rate limit y thresholds (mock)</p>
        <div className="mt-4 space-y-2">
          <p>rate_limit: 120 req/min</p>
          <p>abuse_threshold: 80%</p>
        </div>
        <button className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
          Ajustar umbrales
        </button>
      </section>
    </div>
  );
}
