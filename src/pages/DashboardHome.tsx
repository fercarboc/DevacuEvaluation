// src/pages/DashboardHome.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  CreditCard,
  Activity,
  TrendingDown,
  BarChart3,
  AlertTriangle,
  ArrowRight,
  Building2,
  AlertCircle,
} from "lucide-react";

import {
  getClientDashboardV2,
  type ClientDashboardV2,
  type PropertyComparisonRow,
  type UpcomingRiskAlert,
} from "@/services/clientService";
import { getRevenueMonthSummary, type RevenueMonthSummary } from "@/services/revenueService";

// ─── Helpers de formato ────────────────────────────────────────────────────

function fmtBillingFrequency(v?: string | null): string {
  const x = (v ?? "").toUpperCase();
  if (x === "MONTHLY") return "Mensual";
  if (x === "YEARLY" || x === "ANNUAL" || x === "ANNUALLY") return "Anual";
  return v || "—";
}

function fmtNextBilling(status?: string | null, v?: string | null): string {
  const s = (status ?? "").toUpperCase();
  if (s === "PENDING_PAYMENT") return "Pendiente";
  if (s === "SUSPENDED") return "Bloqueado";
  if (!v) return "—";
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("es-ES");
}

function fmtDate(v: string): string {
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return v;
  return dt.toLocaleDateString("es-ES");
}

function euro(v: number): string {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
    }).format(v);
  } catch {
    return `${v.toFixed(2)} €`;
  }
}

function impactTone(net: number) {
  if (net <= 0)
    return {
      label: "Riesgo controlado",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-100",
      icon: ShieldCheck,
    };
  if (net < 250)
    return {
      label: "Margen afectado",
      cls: "bg-amber-50 text-amber-700 border-amber-100",
      icon: AlertTriangle,
    };
  return {
    label: "Impacto relevante",
    cls: "bg-red-50 text-red-700 border-red-100",
    icon: TrendingDown,
  };
}

// ─── Sub-componentes presentacionales ─────────────────────────────────────

function SectionTitle({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-slate-400">{icon}</span>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{label}</h3>
      <div className="flex-1 h-px bg-slate-100" />
    </div>
  );
}

function StatusBadge({ status }: { status?: string | null }) {
  const s = (status ?? "UNKNOWN").toUpperCase();
  const base = "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold";
  if (s === "ACTIVE" || s === "TRIALING")
    return <span className={`${base} bg-emerald-50 text-emerald-700`}>{s}</span>;
  if (s === "PENDING_PAYMENT")
    return <span className={`${base} bg-amber-50 text-amber-700`}>{s}</span>;
  if (s === "SUSPENDED")
    return <span className={`${base} bg-red-50 text-red-700`}>{s}</span>;
  return <span className={`${base} bg-slate-100 text-slate-700`}>{s}</span>;
}

function RiskBadge({ band }: { band: string }) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold";
  if (band === "HIGH") return <span className={`${base} bg-red-100 text-red-700`}>ALTO</span>;
  if (band === "MEDIUM")
    return <span className={`${base} bg-amber-100 text-amber-700`}>MEDIO</span>;
  return <span className={`${base} bg-emerald-100 text-emerald-700`}>BAJO</span>;
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
    </section>
  );
}

// ─── Bloque comparativa ────────────────────────────────────────────────────

function ComparisonBlock({
  rows,
  onNavigate,
}: {
  rows: PropertyComparisonRow[];
  onNavigate: () => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-500">
        Sin datos comparativos disponibles.{" "}
        <span className="text-slate-400 text-xs">(Requiere backend: client_dashboard_v2)</span>
      </div>
    );
  }

  const sorted = [...rows].sort((a, b) => b.net_loss - a.net_loss);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Propiedad
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Incidencias
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Pérdida bruta
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Recuperado
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Impacto neto
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Riesgo alto
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Revenue impactado
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((row) => (
              <tr key={row.property_id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-800">{row.property_name}</td>
                <td className="px-4 py-3 text-right text-slate-700">{row.incidents_count}</td>
                <td className="px-4 py-3 text-right text-slate-700">{euro(row.gross_loss)}</td>
                <td className="px-4 py-3 text-right text-emerald-700">{euro(row.recovered)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">
                  {euro(row.net_loss)}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-red-50 text-red-700">
                    {row.risk_high_count}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-slate-700">
                  {euro(row.revenue_impacted)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 border-t border-slate-100 flex justify-between items-center">
        <span className="text-[11px] text-slate-400">
          Mes actual. Ordenado por impacto neto descendente.
        </span>
        <button
          type="button"
          onClick={onNavigate}
          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900"
        >
          Ver fugas de revenue <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Bloque próximas alarmas ───────────────────────────────────────────────

function AlertsBlock({
  alerts,
  onViewGuest,
}: {
  alerts: UpcomingRiskAlert[];
  onViewGuest: (identityKey: string) => void;
}) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-500">
        Sin alarmas próximas. Las reservas futuras procesadas con riesgo alto o medio aparecerán
        aquí.{" "}
        <span className="text-slate-400 text-xs">(Requiere backend: client_dashboard_v2)</span>
      </div>
    );
  }

  const sorted = [...alerts].sort(
    (a, b) => new Date(a.checkin_date).getTime() - new Date(b.checkin_date).getTime()
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Check-in
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Propiedad
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Nivel de riesgo
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Lote CSV
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Incidencias
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Impacto acum.
              </th>
              <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Acción
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((alert) => (
              <tr
                key={alert.id}
                className={`hover:bg-slate-50 transition-colors ${
                  alert.risk_band === "HIGH" ? "bg-red-50/30" : ""
                }`}
              >
                <td className="px-4 py-3 font-medium text-slate-800">
                  {fmtDate(alert.checkin_date)}
                </td>
                <td className="px-4 py-3 text-slate-700">{alert.property_name}</td>
                <td className="px-4 py-3">
                  <RiskBadge band={alert.risk_band} />
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs font-mono">
                  {alert.batch_ref ?? "—"}
                </td>
                <td className="px-4 py-3 text-right text-slate-700">
                  {alert.incidents_count ?? "—"}
                </td>
                <td className="px-4 py-3 text-right text-slate-700">
                  {alert.total_net_loss != null ? euro(alert.total_net_loss) : "—"}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    type="button"
                    onClick={() => onViewGuest(alert.identity_key)}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                    title="Ver historial agregado del cliente (sin PII)"
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
  );
}

// ─── Componente principal ──────────────────────────────────────────────────

export default function DashboardHome() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dash, setDash] = useState<ClientDashboardV2 | null>(null);

  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [rev, setRev] = useState<RevenueMonthSummary | null>(null);
  const [revLoading, setRevLoading] = useState(false);

  // ── Carga inicial: org + propiedades + comparativa + alarmas ──────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const d = await getClientDashboardV2();
        if (cancelled) return;
        setDash(d);
        if (d.properties.length > 0) {
          setSelectedPropertyId(d.properties[0].id);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("No ha sido posible cargar el dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Carga de revenue al cambiar propiedad ─────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setRevLoading(true);
      setRev(null);

      try {
        const r = await getRevenueMonthSummary(selectedPropertyId ?? null);
        if (!cancelled) setRev(r);
      } catch (e) {
        console.error(e);
        if (!cancelled) setRev(null);
      } finally {
        if (!cancelled) setRevLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedPropertyId]);

  // ── Datos derivados ───────────────────────────────────────────────────
  const properties = dash?.properties ?? [];
  const selectedProperty = properties.find((p) => p.id === selectedPropertyId) ?? null;

  const planCard = dash?.org_summary?.plan_card ?? null;
  const usage = dash?.usage_summary ?? null;
  const planLimit = planCard?.limit ?? 0;

  const usagePercent = useMemo(() => {
    if (!planLimit || !usage) return 0;
    return Math.min(100, Math.round((usage.plan_query_total / planLimit) * 100));
  }, [usage, planLimit]);

  const trend = rev?.trends?.last_6_months ?? [];
  const maxTrend = useMemo(() => {
    const m = trend.reduce((acc, x) => Math.max(acc, Math.abs(x.net_loss || 0)), 0);
    return m || 1;
  }, [trend]);

  const tone = impactTone(rev?.impact?.net_loss ?? 0);
  const ToneIcon = tone.icon;

  // ── Estados de carga/error ────────────────────────────────────────────
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

  // ── Render principal ──────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* ─── HEADER + SELECTOR DE PROPIEDAD ─────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Dashboard</h2>
          <p className="text-slate-500 text-sm">
            Resumen ejecutivo de organización y operativa por propiedad.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Selector de propiedad */}
          {properties.length > 0 && (
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-400" />
              {properties.length === 1 ? (
                <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm">
                  {properties[0].name}
                </span>
              ) : (
                <select
                  value={selectedPropertyId ?? ""}
                  onChange={(e) => setSelectedPropertyId(e.target.value || null)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Indicador tonal del mes */}
          {rev && (
            <div
              className={`flex items-center gap-2 border px-4 py-2 rounded-xl text-sm font-medium ${tone.cls}`}
              title="Indicador agregado del mes (sin PII)."
            >
              <ToneIcon size={18} />
              <span>
                {selectedProperty?.name ?? "Organización"}:{" "}
                <span className="font-bold">{tone.label}</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ─── BLOQUE 1: ORGANIZACIÓN — Plan y consumo ─────────────────── */}
      <div>
        <SectionTitle
          icon={<CreditCard className="w-4 h-4" />}
          label="Organización — Plan y consumo"
        />
        <div className="grid gap-4 md:grid-cols-3">
          {/* Plan activo */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Plan activo
                </p>
                <div className="mt-3 text-xl font-semibold text-slate-900">
                  {planCard?.name ?? "—"}
                </div>
              </div>
              <StatusBadge status={planCard?.status} />
            </div>

            {planCard ? (
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between text-slate-600">
                  <span className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-slate-400" />
                    Facturación
                  </span>
                  <span className="font-semibold text-slate-900">
                    {fmtBillingFrequency(planCard.billing_frequency)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Próx. cobro</span>
                  <span className="font-semibold text-slate-900">
                    {fmtNextBilling(planCard.status, planCard.next_billing)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-3 text-sm text-slate-500">Sin plan activo registrado.</div>
            )}
          </section>

          {/* Consumo del plan */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Consultas de plan (mes actual)
            </p>

            <div className="mt-3 flex items-end justify-between">
              <div className="text-3xl font-semibold text-slate-900">
                {usage?.plan_query_total ?? 0}
              </div>
              <div className="text-xs text-slate-500">
                {planLimit > 0 ? (
                  <>
                    Límite: <span className="font-semibold text-slate-900">{planLimit}</span>
                  </>
                ) : (
                  "Sin límite"
                )}
              </div>
            </div>

            <div className="mt-4 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-2 rounded-full bg-indigo-600 transition-all"
                style={{ width: `${usagePercent}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-slate-500">{usagePercent}% del plan utilizado</div>

            {usage && (
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Consultas manuales</span>
                  <span className="font-medium text-slate-700">{usage.manual_query_count}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Lotes CSV screening</span>
                  <span className="font-medium text-slate-700">{usage.csv_screening_count}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">CSV revenue (no computa)</span>
                  <span className="font-medium text-slate-400">{usage.csv_revenue_count}</span>
                </div>
              </div>
            )}
          </section>

          {/* Registros y propiedades */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Registros añadidos este mes
            </p>
            <div className="mt-3 text-3xl font-semibold text-slate-900">
              {usage?.created_this_month ?? 0}
            </div>
            <div className="mt-2 text-sm text-slate-600 flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-400" />
              Evaluaciones ingresadas
            </div>

            {properties.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Propiedades activas
                </p>
                <div className="space-y-1">
                  {properties.slice(0, 4).map((p) => (
                    <div key={p.id} className="flex items-center gap-2 text-xs text-slate-600">
                      <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">{p.name}</span>
                      {p.location && (
                        <span className="text-slate-400 shrink-0">{p.location}</span>
                      )}
                    </div>
                  ))}
                  {properties.length > 4 && (
                    <div className="text-xs text-slate-400">+{properties.length - 4} más</div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ─── BLOQUE 2: PROPIEDAD SELECCIONADA ────────────────────────── */}
      <div>
        <SectionTitle
          icon={<Building2 className="w-4 h-4" />}
          label={
            selectedProperty ? `Propiedad: ${selectedProperty.name}` : "Propiedad"
          }
        />

        {!selectedPropertyId && properties.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-500">
            Sin propiedades configuradas en esta organización.
          </div>
        ) : revLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-500">
            Cargando datos de la propiedad...
          </div>
        ) : !rev ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-500">
            Sin datos de revenue para esta propiedad este mes.
          </div>
        ) : (
          <div className="space-y-4">
            {/* KPIs de impacto económico */}
            <div className="grid gap-4 md:grid-cols-4">
              <KpiCard
                label="Incidencias"
                value={String(rev.impact.incidents_count)}
                sub="Mes actual"
              />
              <KpiCard
                label="Pérdida bruta"
                value={euro(rev.impact.gross_loss)}
                sub="Roturas, compensaciones, no-shows…"
              />
              <KpiCard
                label="Recuperado"
                value={euro(rev.impact.recovered)}
                sub="Cargos, fianzas, cobros posteriores"
              />
              {/* Impacto neto → navega a detalle */}
              <button
                type="button"
                onClick={() => navigate("/app/revenue/fugas")}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-left hover:bg-slate-50 transition-colors"
                title="Abrir detalle en Fugas de Revenue"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Impacto neto
                    </p>
                    <div className="mt-2 text-2xl font-semibold text-slate-900">
                      {euro(rev.impact.net_loss)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">Bruto − Recuperado</div>
                  </div>
                  <div className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700">
                    Ver detalle <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </button>
            </div>

            {/* Tendencia + Top plataformas */}
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Tendencia 6 meses */}
              <section className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Tendencia (últimos 6 meses)
                    </h3>
                    <p className="text-xs text-slate-500">Impacto neto agregado por mes</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <BarChart3 className="w-4 h-4 text-slate-400" />
                    {rev.month}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-6 gap-3 items-end">
                  {trend.map((m) => {
                    const h = Math.round((Math.abs(m.net_loss) / maxTrend) * 100);
                    return (
                      <div key={m.month} className="flex flex-col items-center gap-2">
                        <div className="w-full h-24 bg-slate-50 rounded-xl border border-slate-100 flex items-end p-1">
                          <div
                            className="w-full rounded-lg bg-indigo-600/80"
                            style={{ height: `${Math.max(6, h)}%` }}
                            title={`${m.month}: ${euro(m.net_loss)}`}
                          />
                        </div>
                        <span className="text-[10px] font-medium text-slate-500">
                          {m.month.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 text-[11px] text-slate-500">
                  Vista agregada (sin PII). Útil para control de margen y operativa.
                </div>
              </section>

              {/* Top plataformas */}
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">Top plataformas (mes)</h3>
                <p className="text-xs text-slate-500">Ordenado por impacto neto</p>

                <div className="mt-4 space-y-3">
                  {rev.by_platform.length === 0 ? (
                    <div className="text-sm text-slate-500">Sin datos este mes.</div>
                  ) : (
                    rev.by_platform.slice(0, 6).map((p) => (
                      <div
                        key={p.platform}
                        className="flex items-center justify-between border-b border-slate-100 pb-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-800 truncate">
                            {p.platform}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {p.incidents} incidencias
                          </div>
                        </div>
                        <div className="text-xs font-bold text-slate-900">{euro(p.net_loss)}</div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-4 text-[11px] text-slate-500">
                  Si una plataforma concentra el net loss, revisa políticas y depósitos.
                </div>
              </section>
            </div>
          </div>
        )}
      </div>

      {/* ─── BLOQUE 3: COMPARATIVA ENTRE PROPIEDADES ─────────────────── */}
      <div>
        <SectionTitle
          icon={<BarChart3 className="w-4 h-4" />}
          label="Comparativa entre propiedades"
        />
        <ComparisonBlock
          rows={dash.property_comparison}
          onNavigate={() => navigate("/app/revenue/fugas")}
        />
      </div>

      {/* ─── BLOQUE 4: PRÓXIMAS ALARMAS DE RIESGO ────────────────────── */}
      <div>
        <SectionTitle
          icon={<AlertCircle className="w-4 h-4" />}
          label="Próximas alarmas de riesgo"
        />
        <AlertsBlock
          alerts={dash.upcoming_risk_alerts}
          onViewGuest={(key) =>
            navigate(`/app/riesgo/cliente?identity_key=${encodeURIComponent(key)}`)
          }
        />
      </div>
    </div>
  );
}
