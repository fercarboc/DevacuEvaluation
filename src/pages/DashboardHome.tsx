import React, { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  CreditCard,
  Activity,
  TrendingDown,
  BarChart3,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";

import { getClientDashboard, type ClientDashboardData } from "@/services/clientService";
import { getRevenueMonthSummary, type RevenueMonthSummary } from "@/services/revenueService";

type AuthedView = "rev_leakage";

type Props = {
  onNavigate?: (view: AuthedView) => void;
};

function format_billing_frequency(v?: string | null) {
  const x = (v ?? "").toUpperCase();
  if (x === "MONTHLY") return "Mensual";
  if (x === "YEARLY" || x === "ANNUAL" || x === "ANNUALLY") return "Anual";
  return v || "—";
}

/**
 * Regla correcta:
 * - "Pendiente" SOLO si status === PENDING_PAYMENT
 * - ACTIVE sin fecha => "—"
 * - SUSPENDED => "Bloqueado"
 */
function format_next_billing(status?: string | null, v?: string | null) {
  const s = (status ?? "").toUpperCase();
  if (s === "PENDING_PAYMENT") return "Pendiente";
  if (s === "SUSPENDED") return "Bloqueado";

  if (!v) return "—";
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("es-ES");
}

function status_badge(status?: string | null) {
  const s = (status ?? "UNKNOWN").toUpperCase();
  const base = "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold";
  if (s === "ACTIVE" || s === "TRIALING") {
    return <span className={`${base} bg-emerald-50 text-emerald-700`}>{s}</span>;
  }
  if (s === "PENDING_PAYMENT") {
    return <span className={`${base} bg-amber-50 text-amber-700`}>{s}</span>;
  }
  if (s === "SUSPENDED") {
    return <span className={`${base} bg-red-50 text-red-700`}>{s}</span>;
  }
  return <span className={`${base} bg-slate-100 text-slate-700`}>{s}</span>;
}

function euro(v: number) {
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v);
  } catch {
    return `${v.toFixed(2)} €`;
  }
}

function impactTone(net: number) {
  // ✅ no alarmista: rangos suaves
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

export default function DashboardHome({ onNavigate }: Props) {
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);

  const [dash, set_dash] = useState<ClientDashboardData | null>(null);
  const [rev, set_rev] = useState<RevenueMonthSummary | null>(null);

  const plan_card = dash?.plan_card ?? null;

  // ✅ compat: algunos backends devuelven camelCase
  const plan_limit =
    (plan_card as any)?.limit ??
    (plan_card as any)?.queryLimit ??
    0;

  const billing_frequency =
    (plan_card as any)?.billing_frequency ??
    (plan_card as any)?.billingFrequency ??
    null;

  const next_billing =
    (plan_card as any)?.next_billing ??
    (plan_card as any)?.nextBilling ??
    null;

  const usage_percent = useMemo(() => {
    const limit = plan_limit ?? 0;
    const used = dash?.query_count ?? 0;
    if (!limit) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  }, [dash, plan_limit]);

  const trend = rev?.trends?.last_6_months ?? [];

  const maxTrend = useMemo(() => {
    const m = trend.reduce((acc, x) => Math.max(acc, Math.abs(x.net_loss || 0)), 0);
    return m || 1;
  }, [trend]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      set_loading(true);
      set_error(null);

      try {
        const [d, r] = await Promise.all([getClientDashboard(), getRevenueMonthSummary()]);
        if (!cancelled) {
          set_dash(d);
          set_rev(r);
        }
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

  if (error || !dash || !rev) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-sm text-red-600">{error ?? "Dashboard no disponible."}</div>
      </div>
    );
  }

  const tone = impactTone(rev.impact.net_loss);
  const ToneIcon = tone.icon;

  const goLeakage = () => onNavigate?.("rev_leakage");

  return (
    <div className="space-y-8">
      {/* Header ejecutivo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Dashboard</h2>
          <p className="text-slate-500 text-sm">
            Resumen ejecutivo del uso del plan y del impacto económico (mes actual).
          </p>
        </div>

        <div
          className={`flex items-center gap-2 border px-4 py-2 rounded-xl text-sm font-medium ${tone.cls}`}
          title="Indicador agregado del mes (no incluye PII)."
        >
          <ToneIcon size={18} />
          <span>
            Indicador del mes: <span className="font-bold">{tone.label}</span>
          </span>
        </div>
      </div>

      {/* Row 1: Plan / Consultas / Registros */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Plan */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Plan activo
              </p>
              <div className="mt-3 text-xl font-semibold text-slate-900">
                {plan_card?.name ?? "—"}
              </div>
            </div>
            {status_badge((plan_card as any)?.status)}
          </div>

          {plan_card ? (
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-slate-400" />
                  Facturación
                </span>
                <span className="font-semibold text-slate-900">
                  {format_billing_frequency(billing_frequency)}
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-600">
                <span>Próx. cobro</span>
                <span className="font-semibold text-slate-900">
                  {format_next_billing((plan_card as any)?.status ?? null, next_billing)}
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-sm text-slate-500">No hay plan activo registrado.</div>
          )}
        </section>

        {/* Consultas */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Consultas este mes
          </p>

          <div className="mt-3 flex items-end justify-between">
            <div className="text-3xl font-semibold text-slate-900">{dash.query_count}</div>
            <div className="text-xs text-slate-500">
              {plan_limit && plan_limit > 0 ? (
                <>
                  Límite: <span className="font-semibold text-slate-900">{plan_limit}</span>
                </>
              ) : (
                "Sin límite"
              )}
            </div>
          </div>

          <div className="mt-4 h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-2 rounded-full bg-indigo-600 transition-all"
              style={{ width: `${usage_percent}%` }}
            />
          </div>

          <div className="mt-2 text-xs text-slate-500">{usage_percent}% del plan utilizado</div>
        </section>

        {/* Registros */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Registros añadidos este mes
          </p>
          <div className="mt-3 text-3xl font-semibold text-slate-900">
            {dash.created_this_month}
          </div>
          <div className="mt-2 text-sm text-slate-600 flex items-center gap-2">
            <Activity className="w-4 h-4 text-slate-400" />
            Evaluaciones ingresadas manualmente
          </div>
        </section>
      </div>

      {/* Row 2: Impacto económico del mes */}
      <div className="grid gap-4 md:grid-cols-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Incidencias
          </p>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {rev.impact.incidents_count}
          </div>
          <div className="mt-1 text-xs text-slate-500">Mes actual</div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Pérdida bruta
          </p>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {euro(rev.impact.gross_loss)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Roturas, compensaciones, no-shows…</div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Recuperado
          </p>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {euro(rev.impact.recovered)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Cargos, fianzas, cobros posteriores</div>
        </section>

        {/* ✅ CLIC => Fugas de Revenue */}
        <button
          type="button"
          onClick={goLeakage}
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

      {/* Row 3: Tendencia + plataformas */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Tendencia */}
        <section className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Tendencia (últimos 6 meses)</h3>
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
                    <div className="text-[11px] text-slate-500">{p.incidents} incidencias</div>
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
  );
}
