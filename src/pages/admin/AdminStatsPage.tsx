import React from "react";

const statsCards = [
  { label: "Tendencia consultas 30 días", value: "+12%" },
  { label: "Distribución por planes", value: "3 planes activos" },
  { label: "Uptime promedio", value: "99.98%" },
  { label: "Latencia media API", value: "210 ms" },
  { label: "Nuevos clientes Q", value: "8 nuevos" },
];

export default function AdminStatsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Estadísticas</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statsCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{card.value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">Gráficas placeholder</p>
        <p className="text-xs text-slate-500">Aquí irían gráficos de tendencias.</p>
      </div>
    </div>
  );
}
