import React, { useEffect, useState } from "react";
import { list_invoices } from "@/services/adminService";
import { DataTable, Th, Tr, Td } from "@/components/ui/DataTable";

export default function AdminBillingPage() {
  const [invoices, setInvoices] = useState<any[]>([]);

  useEffect(() => {
    void (async () => {
      const data = await list_invoices();
      setInvoices(data);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Facturación</h1>
        <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
          Sincronizar Stripe
        </button>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <DataTable>
          <thead>
            <tr>
              <Th>Invoice ID</Th>
              <Th>Cliente</Th>
              <Th>Fecha</Th>
              <Th>Estatus</Th>
              <Th>Monto</Th>
              <Th>Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <Tr key={invoice.id}>
                <Td>{invoice.stripe_invoice_id ?? invoice.invoice_number ?? invoice.id}</Td>
                <Td>{invoice.customer_id}</Td>
                <Td>{new Date(invoice.invoice_created_at).toLocaleDateString()}</Td>
                <Td>{invoice.status}</Td>
                <Td>{invoice.amount_total} {invoice.currency}</Td>
                <Td className="flex gap-2">
                  {invoice.hosted_invoice_url && (
                    <a className="text-indigo-600" target="_blank" rel="noreferrer" href={invoice.hosted_invoice_url}>
                      Ver
                    </a>
                  )}
                  {invoice.invoice_pdf && (
                    <a className="text-indigo-600" target="_blank" rel="noreferrer" href={invoice.invoice_pdf}>
                      PDF
                    </a>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      </section>
    </div>
  );
}
