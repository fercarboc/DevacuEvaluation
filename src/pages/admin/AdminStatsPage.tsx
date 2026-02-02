import React, { useEffect, useMemo, useState } from "react";
import { admin_stats_overview, type AdminStatsOverview } from "@/services/adminService";

function pct(n: number | null) {
  if (n === null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}%`;
}

export default function AdminStatsPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [data, setData] = useState<AdminStatsOverview | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const d = await admin_stats_overview();
      setData(d);
    } catch (e: any) {
      setError(e?.message ?? "Error cargando estadísticas");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const cards = useMemo(() => {
    const t = data?.tendencia_consultas;
    return [
      {
        label: "Tendencia consultas (30 días)",
        value: t ? pct(t.pct_change) : "—",
        hint: t ? `last_30=${t.last_30 ?? "—"} · prev_30=${t.prev_30 ?? "—"}` : "Sin datos",
      },
      {
        label: "Clientes activos",
        value: String(data?.customers_activos ?? "—"),
        hint: "customers.is_active = true",
      },
      {
        label: "Nuevos clientes (30 días)",
        value: String(data?.nuevos_clientes_30d ?? "—"),
        hint: "customers.created_at >= now-30d",
      },
      {
        label: "Tokens activos",
        value: String(data?.tokens_activos ?? "—"),
        hint: "sessions no revocados y no expirados",
      },
      {
        label: "Tokens (30 días)",
        value: String(data?.tokens_30d ?? "—"),
        hint: "sessions creados en 30d",
      },
      {
        label: "Solicitudes últimas 24h",
        value: String(data?.solicitudes_ultimas_24h ?? "—"),
        hint: "access_requests en 24h",
      },
    ];
  }, [data]);

  const maxDaily = useMemo(() => {
    const arr = data?.consultas_diarias_30d ?? [];
    return arr.reduce((m, x) => Math.max(m, x.total), 0);
  }, [data]);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Estadísticas</h1>
          <p className="text-sm text-slate-500">Visión global del estado y uso del sistema</p>
        </div>

        <button
          onClick={load}
          disabled={loading}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
        >
          {loading ? "Cargando…" : "Refrescar"}
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{card.value}</p>
            {card.hint ? <p className="mt-1 text-xs text-slate-400">{card.hint}</p> : null}
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Consultas diarias */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Consultas diarias (30d)</p>
          <p className="text-xs text-slate-500">Basado en debacu_eval_sessions.created_at</p>

          <div className="mt-4 space-y-2">
            {(data?.consultas_diarias_30d ?? []).slice(-14).map((d) => {
              const w = maxDaily > 0 ? Math.round((d.total / maxDaily) * 100) : 0;
              return (
                <div key={d.day} className="flex items-center gap-3">
                  <div className="w-24 text-xs text-slate-500">{d.day}</div>
                  <div className="h-2 flex-1 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-slate-900" style={{ width: `${w}%` }} />
                  </div>
                  <div className="w-10 text-right text-xs text-slate-600">{d.total}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Distribución severidad */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Alertas por severidad (30d)</p>
          <p className="text-xs text-slate-500">debacu_eval_usage_alerts.detected_at</p>

          <div className="mt-4 space-y-2">
            {(data?.alertas_por_severidad_30d ?? []).length === 0 ? (
              <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400">
                Sin datos
              </div>
            ) : (
              (data?.alertas_por_severidad_30d ?? []).map((r) => (
                <div key={r.severity} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                  <span className="text-sm text-slate-700">{r.severity}</span>
                  <span className="text-sm font-semibold text-slate-900">{r.total}</span>
                </div>
              ))
            )}
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold text-slate-900">Solicitudes por estado (30d)</p>
            <p className="text-xs text-slate-500">debacu_eval_access_requests.created_at</p>

            <div className="mt-3 space-y-2">
              {(data?.solicitudes_por_estado_30d ?? []).length === 0 ? (
                <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400">
                  Sin datos
                </div>
              ) : (
                (data?.solicitudes_por_estado_30d ?? []).map((r) => (
                  <div key={r.status} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <span className="text-sm text-slate-700">{r.status}</span>
                    <span className="text-sm font-semibold text-slate-900">{r.total}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="text-xs text-slate-400">
        Las métricas se calculan en UTC en servidor (si quieres Europe/Madrid “perfecto”, lo afinamos).
      </div>
    </div>
  );
}
