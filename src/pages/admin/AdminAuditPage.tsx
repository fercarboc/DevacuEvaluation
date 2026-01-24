import React, { useEffect, useState } from "react";
import { list_audit_events } from "@/services/adminService";
import { DataTable, Th, Tr, Td } from "@/components/ui/DataTable";

export default function AdminAuditPage() {
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    void (async () => {
      const data = await list_audit_events();
      setEvents(data);
    })();
  }, []);

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Auditoría</h1>
      </div>
      <DataTable>
        <thead>
          <tr>
            <Th>Fecha</Th>
            <Th>Tipo</Th>
            <Th>Cliente</Th>
            <Th>Plan</Th>
            <Th>Stripe</Th>
            <Th>Payload</Th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <Tr key={event.id}>
              <Td>{new Date(event.created_at).toLocaleString()}</Td>
              <Td>{event.type}</Td>
              <Td>{event.customer_id}</Td>
              <Td>{event.app_id}</Td>
              <Td>{event.stripe_subscription_id ?? "-"}</Td>
              <Td className="text-xs text-slate-500">{JSON.stringify(event.payload)}</Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>
    </section>
  );
}
