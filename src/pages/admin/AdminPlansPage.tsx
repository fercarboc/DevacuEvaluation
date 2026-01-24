import React, { useEffect, useState } from "react";
import { list_plans } from "@/services/adminService";

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<any[]>([]);

  useEffect(() => {
    void (async () => {
      const data = await list_plans();
      setPlans(data);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Planes</h1>
        <button className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
          Nuevo plan
        </button>
      </div>
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        {plans.map((plan) => (
          <div key={plan.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-wide text-slate-500">Código</p>
                <p className="text-lg font-semibold text-slate-900">{plan.code}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Precio mensual</p>
                <p className="text-lg font-bold text-slate-900">{plan.price_monthly ?? "—"}€</p>
              </div>
            </div>
            <div className="mt-4 text-sm text-slate-600">
              <p>{plan.name}</p>
              <p>Límites: {plan.max_queries_per_month ?? "—"} consultas/mes</p>
            </div>
            <div className="mt-4 flex gap-2">
              <button className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                Editar parámetros
              </button>
              <button className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600">
                Suspender plan
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
