// src/pages/DashboardHome.tsx
import React, { useEffect, useMemo, useState } from "react";
import EmptyState from "@/components/ui/EmptyState";
import { DataTable, Td, Th, Tr } from "@/components/ui/DataTable";
import { getClientDashboard, type ClientDashboardData } from "@/services/clientService";

function format_billing_frequency(v?: string | null) {
  const x = (v ?? "").toUpperCase();
  if (x === "MONTHLY") return "MONTHLY";
  if (x === "YEARLY" || x === "ANNUAL" || x === "ANNUALLY") return "YEARLY";
  return v || "—";
}

/**
 * Regla correcta:
 * - "Pendiente" SOLO si status === PENDING_PAYMENT
 * - ACTIVE sin fecha => "—" (no inventar "Pendiente")
 * - SUSPENDED => "Bloqueado"
 */
function format_next_billing(status?: string | null, v?: string | null) {
  const s = (status ?? "").toUpperCase();

  if (s === "PENDING_PAYMENT") return "Pendiente";
  if (s === "SUSPENDED") return "Bloqueado";

  if (!v) return "—";
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString();
}

function status_badge(status?: string | null) {
  const s = (status ?? "UNKNOWN").toUpperCase();
  const base = "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold";
  if (s === "ACTIVE" || s === "TRIALING") {
    return <span className={`${base} bg-green-50 text-green-700`}>{s}</span>;
  }
  if (s === "PENDING_PAYMENT") {
    return <span className={`${base} bg-amber-50 text-amber-700`}>{s}</span>;
  }
  if (s === "SUSPENDED") {
    return <span className={`${base} bg-red-50 text-red-700`}>{s}</span>;
  }
  return <span className={`${base} bg-slate-100 text-slate-700`}>{s}</span>;
}

export default function DashboardHome() {
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);
  const [dash, set_dash] = useState<ClientDashboardData | null>(null);

  const usage_percent = useMemo(() => {
    const limit = dash?.plan_card?.limit ?? 0;
    const used = dash?.query_count ?? 0;
    if (!limit) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  }, [dash]);

  const activity = useMemo(() => {
    return Array.isArray(dash?.activity) ? dash!.activity : [];
  }, [dash]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      set_loading(true);
      set_error(null);

      try {
        const data = await getClientDashboard();
        if (!cancelled) set_dash(data);
      } catch (e) {
        console.error(e);
        if (!cancelled) set_error("No ha sido posible cargar el dashboard.");
      } finally {
        if (!cancelled) set_loading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-sm text-slate-500">Cargando dashboard...</div>
      </div>
    );
  }

  if (error || !dash) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-sm text-red-600">{error ?? "Dashboard no disponible."}</div>
      </div>
    );
  }

  const plan_card = dash.plan_card;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Plan activo
              </p>
              <div className="mt-3 text-xl font-semibold text-slate-900">
                {plan_card?.name ?? "—"}
              </div>
            </div>
            {status_badge(plan_card?.status)}
          </div>

          {plan_card ? (
            <>
              <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
                <span>Facturación</span>
                <span className="font-semibold text-slate-900">
                  {format_billing_frequency(plan_card.billing_frequency)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                <span>Próx. cobro</span>
                <span className="font-semibold text-slate-900">
                  {format_next_billing(plan_card?.status, plan_card?.next_billing)}
                </span>
              </div>
            </>
          ) : (
            <div className="mt-3 text-sm text-slate-500">No hay plan activo registrado.</div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Consultas este mes
          </p>
          <div className="mt-3 text-3xl font-semibold text-slate-900">{dash.query_count}</div>

          <div className="text-sm text-slate-600">
            Límite:{" "}
            {plan_card?.limit != null && plan_card.limit > 0 ? (
              <span className="font-semibold text-slate-900">{plan_card.limit}</span>
            ) : (
              "Sin límite"
            )}{" "}
            consultas
          </div>

          <div className="mt-4 h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-indigo-600 transition-all"
              style={{ width: `${usage_percent}%` }}
            />
          </div>
          <div className="mt-2 text-sm text-slate-500">{usage_percent}% del plan utilizado</div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Registros añadidos este mes
          </p>
          <div className="mt-3 text-3xl font-semibold text-slate-900">
            {dash.created_this_month}
          </div>
          <div className="text-sm text-slate-600">Evaluaciones recientes ingresadas manualmente</div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <div className="text-sm font-semibold text-slate-900">Actividad reciente</div>
          <div className="mt-1 text-sm text-slate-600">Últimos eventos (sin PII).</div>
        </div>

        <div className="mt-4">
          {activity.length === 0 ? (
            <EmptyState
              title="Sin actividad"
              description="Cuando el sistema registre la primera consulta, aparecerá aquí."
            />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Actividad</Th>
                  <Th>Detalle</Th>
                  <Th>Contacto</Th>
                  <Th>Valoración</Th>
                </tr>
              </thead>
              <tbody>
                {activity.map((row) => (
                  <Tr key={row.id}>
                    <Td className="text-xs text-slate-500">{row.date}</Td>
                    <Td>{row.type}</Td>
                    <Td>{row.label}</Td>
                    <Td>{row.contact || "-"}</Td>
                    <Td>
                      {row.rating != null && !Number.isNaN(row.rating) ? (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          {row.rating}/5
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
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
