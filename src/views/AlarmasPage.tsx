// src/views/AlarmasPage.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, Bell } from "lucide-react";
import {
  getClientDashboardV2,
  type UpcomingRiskAlert,
} from "@/services/clientService";
import { markNotificationsRead } from "@/services/notificationsService";

function fmtDate(v: string): string {
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return v;
  return dt.toLocaleDateString("es-ES");
}

function RiskBadge({ band }: { band: string }) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold";
  if (band === "HIGH") return <span className={`${base} bg-red-100 text-red-700`}>ALTO</span>;
  if (band === "MEDIUM") return <span className={`${base} bg-amber-100 text-amber-700`}>MEDIO</span>;
  return <span className={`${base} bg-emerald-100 text-emerald-700`}>BAJO</span>;
}

export default function AlarmasPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<UpcomingRiskAlert[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Mark all unread alerts as read when the user opens this page
    markNotificationsRead().catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const dash = await getClientDashboardV2();
        if (!cancelled) setAlerts(dash.upcoming_risk_alerts ?? []);
      } catch {
        if (!cancelled) setError("No se han podido cargar las alarmas.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const sorted = [...alerts].sort(
    (a, b) => new Date(a.checkin_date).getTime() - new Date(b.checkin_date).getTime()
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Bell className="w-5 h-5 text-slate-500" />
        <div>
          <h2 className="text-xl font-bold text-slate-800">Alarmas Detectadas</h2>
          <p className="text-sm text-slate-500">
            Reservas futuras con riesgo alto o medio detectadas por el agente nocturno.
          </p>
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-500">
          Cargando alarmas…
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm text-sm text-red-600">
          {error}
        </div>
      )}

      {!loading && !error && sorted.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600">Sin alarmas activas</p>
          <p className="text-xs text-slate-400 mt-1">
            Las reservas futuras procesadas con riesgo alto o medio aparecerán aquí.
          </p>
        </div>
      )}

      {!loading && sorted.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Check-in</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Propiedad</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Nivel de riesgo</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Lote CSV</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Incidencias</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Impacto acum.</th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((alert) => (
                  <tr
                    key={alert.id}
                    className={`hover:bg-slate-50 transition-colors ${alert.risk_band === "HIGH" ? "bg-red-50/30" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">{fmtDate(alert.checkin_date)}</td>
                    <td className="px-4 py-3 text-slate-700">{alert.property_name}</td>
                    <td className="px-4 py-3"><RiskBadge band={alert.risk_band} /></td>
                    <td className="px-4 py-3 text-slate-500 text-xs font-mono">{alert.batch_ref ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{alert.incidents_count ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {alert.total_net_loss != null
                        ? new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(alert.total_net_loss)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => navigate(`/app/riesgo/cliente?identity_key=${encodeURIComponent(alert.identity_key)}`)}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                      >
                        Ver riesgo <ArrowRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-slate-100">
            <span className="text-[11px] text-slate-400">
              Solo reservas futuras ya procesadas por screening. Sin datos de identificación directa.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
