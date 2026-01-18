import React from "react";
import { AlertTriangle, ClipboardList, Lock, TrendingUp } from "lucide-react";

import EmptyState from "@/components/ui/EmptyState";
import { DataTable, Th, Tr, Td } from "@/components/ui/DataTable";
import { Chip } from "@/components/ui/Chip";



export default function DashboardHome() {
  const sample = [
    { id: "INC-1042", type: "Daños", severity: "Alta", date: "2026-01-10", status: "Revisar" },
    { id: "INC-1038", type: "Impago", severity: "Media", date: "2026-01-08", status: "Abierto" },
    { id: "INC-1031", type: "Conflicto", severity: "Baja", date: "2026-01-02", status: "Cerrado" },
  ];

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi title="Consultas (30d)" value="—" hint="Activar cuando haya logging" icon={<TrendingUp className="h-5 w-5" />} />
        <Kpi title="Incidencias registradas" value="—" hint="Total (filtrable por categoría)" icon={<ClipboardList className="h-5 w-5" />} />
        <Kpi title="Acceso restringido" value="OK" hint="Solo cuentas autorizadas" icon={<Lock className="h-5 w-5" />} />
        <Kpi title="Pendientes de revisión" value="—" hint="Flujo interno de validación" icon={<AlertTriangle className="h-5 w-5" />} />
      </div>

      {/* Recent */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Actividad reciente</div>
            <div className="mt-1 text-sm text-slate-600">Últimas incidencias (vista interna).</div>
          </div>
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black">
            Nueva incidencia
          </button>
        </div>

        <div className="mt-4">
          {sample.length === 0 ? (
            <EmptyState
              title="Sin incidencias todavía"
              description="Cuando registres la primera incidencia aparecerá aquí. Mantén el formato estructurado: categoría, severidad, contexto."
              ctaLabel="Registrar incidencia"
              onCta={() => {}}
            />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <Th>ID</Th>
                  <Th>Tipo</Th>
                  <Th>Severidad</Th>
                  <Th>Fecha</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {sample.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-medium text-slate-900">{r.id}</Td>
                    <Td>{r.type}</Td>
                    <Td>
                      <Chip tone={r.severity === "Alta" ? "danger" : r.severity === "Media" ? "warning" : "neutral"}>
                        {r.severity}
                      </Chip>
                    </Td>
                    <Td>{r.date}</Td>
                    <Td>
                      <Chip tone={r.status === "Cerrado" ? "success" : r.status === "Revisar" ? "warning" : "neutral"}>
                        {r.status}
                      </Chip>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </div>
      </section>
    </div>
  );
}

function Kpi({
  title,
  value,
  hint,
  icon,
}: {
  title: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">{value}</div>
          <div className="mt-2 text-sm text-slate-600">{hint}</div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          {icon}
        </div>
      </div>
    </div>
  );
}
