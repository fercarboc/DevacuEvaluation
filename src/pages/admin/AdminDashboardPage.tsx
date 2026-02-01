import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetch_dashboard_overview, type DashboardOverview } from "@/services/adminService";

// Recharts
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";

type Range = "7d" | "30d";

function fmtDateShort(iso: string) {
  // iso: YYYY-MM-DD
  try {
    const [y, m, d] = iso.split("-").map(Number);
    return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function severityBadge(sev: string) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold";
  if (sev === "CRITICAL") return `${base} border-red-200 bg-red-50 text-red-700`;
  if (sev === "HIGH") return `${base} border-amber-200 bg-amber-50 text-amber-700`;
  if (sev === "MEDIUM") return `${base} border-slate-200 bg-slate-50 text-slate-700`;
  return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
}

function statusBadge(st: string) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold";
  if (st === "OPEN") return `${base} border-red-200 bg-red-50 text-red-700`;
  if (st === "ACKNOWLEDGED") return `${base} border-amber-200 bg-amber-50 text-amber-700`;
  return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
}

export default function AdminDashboardPage() {
  const [range, setRange] = useState<Range>("30d");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<DashboardOverview | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);

    void (async () => {
      try {
        const r = await fetch_dashboard_overview(range);
        if (!cancelled) setData(r);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [range]);

  const metrics = data?.metrics ?? {
    clientes_activos: 0,
    solicitudes_pendientes: 0,
    consultas_hoy: 0,
    alertas_activas: 0,
  };

  const lineSeries = useMemo(() => {
    const s = data?.series ?? [];
    return s.map((p) => ({ ...p, label: fmtDateShort(p.ts) }));
  }, [data]);

  const barSeries = lineSeries; // mismo dataset, distinta vista

  return (
    <div className="space-y-6">
      {/* Header acciones */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Panel de administración</h1>
          <p className="text-[12px] text-slate-500">Visión general de actividad, alertas y trazabilidad.</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-slate-200 bg-white p-1">
            <button
              onClick={() => setRange("7d")}
              className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg ${
                range === "7d" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              7 días
            </button>
            <button
              onClick={() => setRange("30d")}
              className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg ${
                range === "30d" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              30 días
            </button>
          </div>

          <Link
            to="/app/admin/auditoria"
            className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Ver auditoría
          </Link>
        </div>
      </div>

      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 text-sm">
          Error cargando dashboard: <span className="font-semibold">{err}</span>
        </div>
      )}

      {/* Cards métricas */}
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
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {card.label}
            </p>
            <p className="mt-1 text-3xl font-bold">{loading ? "…" : card.value}</p>
          </div>
        ))}
      </div>

      {/* Gráficas */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Line */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Consultas (serie)</h2>
              <p className="mt-1 text-[12px] text-slate-500">Conteo diario de búsquedas/consultas registradas.</p>
            </div>
          </div>

          <div className="mt-4 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="value" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Bar */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Consultas (barras)</h2>
            <p className="mt-1 text-[12px] text-slate-500">Distribución rápida por día (misma serie).</p>
          </div>

          <div className="mt-4 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Alertas + actividad */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Alertas recientes */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Alertas recientes</h2>
              <p className="mt-1 text-[12px] text-slate-500">Últimas alertas del motor de uso y abuso.</p>
            </div>
            <Link to="/app/admin/uso-y-abuso" className="text-xs font-semibold text-slate-900 hover:underline">
              Ver todo
            </Link>
          </div>

          <div className="mt-4 space-y-2">
            {(data?.recent_alerts ?? []).length === 0 && (
              <div className="text-[12px] text-slate-500">
                {loading ? "Cargando…" : "No hay alertas recientes."}
              </div>
            )}

            {(data?.recent_alerts ?? []).map((a) => (
              <div key={a.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-slate-900 truncate">
                      {a.alert_type} — {a.customer_name ?? a.customer_id ?? "Cliente"}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {a.reason ?? "Sin motivo"} · {fmtDateTime(a.detected_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={severityBadge(a.severity)}>{a.severity}</span>
                    <span className={statusBadge(a.status)}>{a.status}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Actividad reciente */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Actividad reciente</h2>
              <p className="mt-1 text-[12px] text-slate-500">Stripe, exportaciones y cambios de configuración.</p>
            </div>
            <Link to="/app/admin/auditoria" className="text-xs font-semibold text-slate-900 hover:underline">
              Abrir auditoría
            </Link>
          </div>

          <div className="mt-4 space-y-2">
            {(data?.recent_activity ?? []).length === 0 && (
              <div className="text-[12px] text-slate-500">
                {loading ? "Cargando…" : "No hay actividad reciente."}
              </div>
            )}

            {(data?.recent_activity ?? []).map((ev) => (
              <div key={ev.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-slate-900 truncate">
                      {ev.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500 truncate">
                      {ev.detail ?? ""} {ev.detail ? "·" : ""} {fmtDateTime(ev.created_at)}
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    {ev.kind}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* CTA a Auditoría (la tuya original) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Auditoría</h2>
            <p className="mt-1 text-[12px] text-slate-500">
              Eventos técnicos y trazabilidad (Stripe, cambios de suscripción, acciones del sistema).
            </p>
          </div>

          <Link
            to="/app/admin/auditoria"
            className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Ver auditoría
          </Link>
        </div>
      </section>
    </div>
  );
}
