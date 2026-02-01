import React from "react";

type StatCard = {
  label: string;
  value: string;
  hint?: string;
};

const statsCards: StatCard[] = [
  {
    label: "Tendencia de consultas (30 días)",
    value: "+12%",
    hint: "Comparado con los 30 días anteriores",
  },
  {
    label: "Clientes activos por plan",
    value: "3 planes activos",
    hint: "Solo suscripciones en estado ACTIVE",
  },
  {
    label: "Disponibilidad API",
    value: "99.98%",
    hint: "Estimado según respuestas correctas",
  },
  {
    label: "Latencia API (p50)",
    value: "210 ms",
    hint: "Mediana de respuesta",
  },
  {
    label: "Nuevos clientes (30 días)",
    value: "8",
    hint: "Altas recientes en el sistema",
  },
];

export default function AdminStatsPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Estadísticas</h1>
        <p className="text-sm text-slate-500">
          Visión global del estado y uso del sistema
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statsCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {card.label}
            </p>

            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {card.value}
            </p>

            {card.hint && (
              <p className="mt-1 text-xs text-slate-400">{card.hint}</p>
            )}
          </div>
        ))}
      </div>

      {/* Charts section */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Chart 1 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">
            Consultas diarias
          </p>
          <p className="text-xs text-slate-500">
            Volumen de consultas en los últimos 30 días
          </p>

          <div className="mt-4 flex h-40 items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400">
            Gráfico de serie temporal
          </div>
        </div>

        {/* Chart 2 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">
            Distribución por severidad
          </p>
          <p className="text-xs text-slate-500">
            Consultas agrupadas por nivel de riesgo
          </p>

          <div className="mt-4 flex h-40 items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400">
            Gráfico de distribución
          </div>
        </div>
      </div>

      {/* Footer note */}
      <div className="text-xs text-slate-400">
        Las métricas se calculan en la zona horaria Europe/Madrid.
      </div>
    </div>
  );
}
