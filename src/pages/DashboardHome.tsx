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
  TrendingUp,
  Wifi,
  WifiOff,
  Zap,
  RefreshCw,
  Settings,
} from "lucide-react";
import { HotelProfileWizardDialog } from "@/components/HotelProfileWizardDialog";
import { getHotelProfile } from "@/services/debacu_eval_hotel_profile.service";

import {
  getClientDashboardV2,
  type ClientDashboardV2,
  type PropertyComparisonRow,
  type UpcomingRiskAlert,
} from "@/services/clientService";
import { getRevenueMonthSummary, type RevenueMonthSummary } from "@/services/revenueService";
import { supabase } from "@/services/supabaseClient";

// ─── Tipos ─────────────────────────────────────────────────────────────────

interface PmsConnection {
  id: string;
  provider_code: string;
  status: string;
  last_sync_at: string | null;
}

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

function timeSince(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "hace un momento";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

function impactTone(net: number) {
  if (net <= 0)
    return {
      label: "Riesgo controlado",
      cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      icon: ShieldCheck,
    };
  if (net < 250)
    return {
      label: "Margen afectado",
      cls: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      icon: AlertTriangle,
    };
  return {
    label: "Impacto relevante",
    cls: "bg-red-500/10 text-red-400 border-red-500/20",
    icon: TrendingDown,
  };
}

// ─── Sub-componentes dark ──────────────────────────────────────────────────

function AreaHeader({
  icon,
  label,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-bold text-white uppercase tracking-widest">{label}</h3>
        {sub && <p className="text-[10px] text-slate-500">{sub}</p>}
      </div>
      <div className="flex-1 h-px bg-slate-800" />
    </div>
  );
}

function StatusBadge({ status }: { status?: string | null }) {
  const s = (status ?? "UNKNOWN").toUpperCase();
  const base =
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border";
  if (s === "ACTIVE" || s === "TRIALING")
    return <span className={`${base} bg-emerald-500/10 text-emerald-400 border-emerald-500/20`}>{s}</span>;
  if (s === "PENDING_PAYMENT")
    return <span className={`${base} bg-amber-500/10 text-amber-400 border-amber-500/20`}>{s}</span>;
  if (s === "SUSPENDED")
    return <span className={`${base} bg-red-500/10 text-red-400 border-red-500/20`}>{s}</span>;
  return <span className={`${base} bg-slate-700 text-slate-400 border-slate-600`}>{s}</span>;
}

function RiskBadge({ band }: { band: string }) {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border";
  if (band === "HIGH")
    return <span className={`${base} bg-red-500/10 text-red-400 border-red-500/20`}>ALTO</span>;
  if (band === "MEDIUM")
    return <span className={`${base} bg-amber-500/10 text-amber-400 border-amber-500/20`}>MEDIO</span>;
  return (
    <span className={`${base} bg-emerald-500/10 text-emerald-400 border-emerald-500/20`}>BAJO</span>
  );
}

function DarkCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-slate-800 bg-slate-900/50 p-5 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

function KpiCard({
  label,
  value,
  sub,
  onClick,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  onClick?: () => void;
  accent?: "blue" | "emerald" | "red" | "amber";
}) {
  const accentCls =
    accent === "emerald"
      ? "text-emerald-400"
      : accent === "red"
      ? "text-red-400"
      : accent === "amber"
      ? "text-amber-400"
      : "text-white";

  const inner = (
    <DarkCard className={onClick ? "cursor-pointer hover:border-slate-700 transition-colors" : ""}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
      <div className={`mt-2 text-2xl font-bold ${accentCls}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
      {onClick && (
        <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-blue-400">
          Ver detalle <ArrowRight className="w-3 h-3" />
        </div>
      )}
    </DarkCard>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="text-left w-full">
        {inner}
      </button>
    );
  }
  return inner;
}

// ─── Card de conexión PMS ──────────────────────────────────────────────────

function PmsConnectionCard({
  pmsConn,
  pmsLoading,
  onGoToWizard,
}: {
  pmsConn: PmsConnection | null;
  pmsLoading: boolean;
  onGoToWizard: () => void;
}) {
  return (
    <DarkCard>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Conexión PMS</p>
      {pmsLoading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <RefreshCw className="w-3 h-3 animate-spin" />
          Verificando...
        </div>
      ) : pmsConn ? (
        <>
          <div className="mt-3 flex items-center gap-2">
            <Wifi className="w-5 h-5 text-emerald-400" />
            <span className="text-lg font-bold text-emerald-400">CONECTADO</span>
          </div>
          <div className="mt-2 space-y-1">
            <div className="text-sm font-semibold text-white">{pmsConn.provider_code}</div>
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <RefreshCw className="w-3 h-3" />
              Último sync: {timeSince(pmsConn.last_sync_at)}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2">
            <WifiOff className="w-5 h-5 text-red-400" />
            <span className="text-lg font-bold text-red-400">SIN CONECTAR</span>
          </div>
          <button
            type="button"
            onClick={onGoToWizard}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
          >
            <Zap className="w-3 h-3" />
            Conectar PMS
          </button>
        </>
      )}
    </DarkCard>
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
      <DarkCard>
        <p className="text-sm text-slate-500">Sin datos comparativos disponibles.</p>
        <p className="text-xs text-slate-600 mt-1">(Requiere backend: client_dashboard_v2)</p>
      </DarkCard>
    );
  }

  const sorted = [...rows].sort((a, b) => b.net_loss - a.net_loss);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/80">
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Propiedad
              </th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Incidencias
              </th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Pérdida bruta
              </th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Recuperado
              </th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Impacto neto
              </th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Riesgo alto
              </th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Revenue impactado
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {sorted.map((row) => (
              <tr key={row.property_id} className="hover:bg-slate-800/40 transition-colors">
                <td className="px-4 py-3 font-semibold text-white">{row.property_name}</td>
                <td className="px-4 py-3 text-right text-slate-300">{row.incidents_count}</td>
                <td className="px-4 py-3 text-right text-slate-300">{euro(row.gross_loss)}</td>
                <td className="px-4 py-3 text-right text-emerald-400">{euro(row.recovered)}</td>
                <td className="px-4 py-3 text-right font-bold text-white">{euro(row.net_loss)}</td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                    {row.risk_high_count}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-slate-300">{euro(row.revenue_impacted)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 border-t border-slate-800 flex justify-between items-center">
        <span className="text-[10px] text-slate-600">
          Mes actual · Ordenado por impacto neto descendente.
        </span>
        <button
          type="button"
          onClick={onNavigate}
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-400 hover:text-blue-300"
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
      <DarkCard>
        <p className="text-sm text-slate-500">
          Sin alarmas próximas. Las reservas futuras procesadas con riesgo alto o medio aparecerán
          aquí.
        </p>
        <p className="text-xs text-slate-600 mt-1">(Requiere backend: client_dashboard_v2)</p>
      </DarkCard>
    );
  }

  const sorted = [...alerts].sort(
    (a, b) => new Date(a.checkin_date).getTime() - new Date(b.checkin_date).getTime()
  );

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/80">
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Check-in
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Propiedad
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Riesgo
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Lote CSV
              </th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Incidencias
              </th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Impacto acum.
              </th>
              <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Acción
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {sorted.map((alert) => (
              <tr
                key={alert.id}
                className={`hover:bg-slate-800/40 transition-colors ${
                  alert.risk_band === "HIGH" ? "bg-red-500/5" : ""
                }`}
              >
                <td className="px-4 py-3 font-semibold text-white">
                  {fmtDate(alert.checkin_date)}
                </td>
                <td className="px-4 py-3 text-slate-300">{alert.property_name}</td>
                <td className="px-4 py-3">
                  <RiskBadge band={alert.risk_band} />
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs font-mono">
                  {alert.batch_ref ?? "—"}
                </td>
                <td className="px-4 py-3 text-right text-slate-300">
                  {alert.incidents_count ?? "—"}
                </td>
                <td className="px-4 py-3 text-right text-slate-300">
                  {alert.total_net_loss != null ? euro(alert.total_net_loss) : "—"}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    type="button"
                    onClick={() => onViewGuest(alert.identity_key)}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
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
      <div className="px-4 py-3 border-t border-slate-800">
        <span className="text-[10px] text-slate-600">
          Solo reservas futuras ya procesadas por screening · Sin datos de identificación directa.
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

  const [pmsConn, setPmsConn] = useState<PmsConnection | null>(null);
  const [pmsLoading, setPmsLoading] = useState(false);
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  // ── Carga inicial ─────────────────────────────────────────────────────
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

  // ── Carga de conexión PMS al cambiar propiedad ────────────────────────
  useEffect(() => {
    if (!selectedPropertyId) {
      setPmsConn(null);
      return;
    }

    let cancelled = false;
    setPmsLoading(true);
    setPmsConn(null);

    (async () => {
      try {
        // pms_connections no está en el schema tipado generado aún
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any)
          .from("pms_connections")
          .select("id, provider_code, status, last_sync_at")
          .eq("property_id", selectedPropertyId)
          .eq("status", "ACTIVE")
          .limit(1)
          .single();

        if (!cancelled) setPmsConn((data ?? null) as PmsConnection | null);
      } catch {
        if (!cancelled) setPmsConn(null);
      } finally {
        if (!cancelled) setPmsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedPropertyId]);

  // Check if hotel profile exists but is incomplete (banner reminder, not auto-wizard)
  useEffect(() => {
    let cancelled = false;
    getHotelProfile()
      .then((res) => {
        if (!cancelled && res.ok && res.profile !== null && !res.profile.is_complete) {
          setProfileIncomplete(true);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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
      <div className="flex items-center justify-center py-20">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8">
          <div className="flex items-center gap-3 text-slate-400">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-sm">Cargando dashboard...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !dash) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8">
          <div className="text-sm text-red-400">{error ?? "Dashboard no disponible."}</div>
        </div>
      </div>
    );
  }

  // ── Render principal ──────────────────────────────────────────────────
  return (
    <div className="-mx-4 md:-mx-6 -mt-6 -mb-6 px-4 md:px-6 pt-6 pb-10 bg-[#0f172a] min-h-screen">

      {profileIncomplete && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 mb-6 -mx-0">
          <Settings className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <p className="flex-1 text-sm text-amber-300">
            <span className="font-semibold">Configuración incompleta</span> — Completa el perfil de tu establecimiento para activar cálculos de riesgo ajustados y revenue intelligence.
          </p>
          <button
            onClick={() => setShowWizard(true)}
            className="text-xs font-semibold text-amber-300 border border-amber-500/40 rounded-lg px-3 py-1.5 hover:bg-amber-500/20 transition-colors whitespace-nowrap"
          >
            Configurar ahora
          </button>
        </div>
      )}

      <HotelProfileWizardDialog
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onCompleted={() => { setShowWizard(false); setProfileIncomplete(false); }}
      />

    <div className="space-y-10">

      {/* ─── HEADER ─────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Dashboard</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            Resumen ejecutivo de organización y operativa por propiedad.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {properties.length > 0 && (
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-500" />
              {properties.length === 1 ? (
                <span className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-white shadow-sm">
                  {properties[0].name}
                </span>
              ) : (
                <select
                  value={selectedPropertyId ?? ""}
                  onChange={(e) => setSelectedPropertyId(e.target.value || null)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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

          {rev && (
            <div
              className={`flex items-center gap-2 border px-4 py-2 rounded-xl text-sm font-semibold ${tone.cls}`}
              title="Indicador agregado del mes (sin PII)."
            >
              <ToneIcon size={16} />
              <span>
                {selectedProperty?.name ?? "Organización"}:{" "}
                <span className="font-bold">{tone.label}</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ÁREA 1: CONTROL OPERATIVO                                      */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div>
        <AreaHeader
          icon={<ShieldCheck className="w-4 h-4" />}
          label="Control Operativo"
          sub="Plan, consumo y estado de integración"
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {/* Plan activo */}
          <DarkCard>
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Plan activo
              </p>
              <StatusBadge status={planCard?.status} />
            </div>
            <div className="mt-3 text-xl font-bold text-white">{planCard?.name ?? "—"}</div>
            {planCard ? (
              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <CreditCard className="w-3 h-3" />
                    Facturación
                  </span>
                  <span className="font-semibold text-slate-200">
                    {fmtBillingFrequency(planCard.billing_frequency)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Próx. cobro</span>
                  <span className="font-semibold text-slate-200">
                    {fmtNextBilling(planCard.status, planCard.next_billing)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-2 text-xs text-slate-500">Sin plan activo.</div>
            )}
          </DarkCard>

          {/* Consultas del mes */}
          <DarkCard>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Consultas este mes
            </p>
            <div className="mt-3 flex items-end justify-between">
              <div className="text-3xl font-bold text-white">{usage?.plan_query_total ?? 0}</div>
              <div className="text-xs text-slate-500">
                {planLimit > 0 ? (
                  <>
                    Límite: <span className="font-bold text-slate-300">{planLimit}</span>
                  </>
                ) : (
                  "Sin límite"
                )}
              </div>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-1.5 rounded-full bg-blue-500 transition-all"
                style={{ width: `${usagePercent}%` }}
              />
            </div>
            <div className="mt-1.5 text-[10px] text-slate-500">{usagePercent}% del plan utilizado</div>
            {usage && (
              <div className="mt-3 pt-3 border-t border-slate-800 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Manuales</span>
                  <span className="font-semibold text-slate-300">{usage.manual_query_count}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">CSV screening</span>
                  <span className="font-semibold text-slate-300">{usage.csv_screening_count}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">CSV revenue</span>
                  <span className="font-semibold text-slate-600">{usage.csv_revenue_count}</span>
                </div>
              </div>
            )}
          </DarkCard>

          {/* Propiedades activas */}
          <DarkCard>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Propiedades activas
            </p>
            <div className="mt-3 text-3xl font-bold text-white">{properties.length}</div>
            <div className="mt-3 space-y-1.5">
              {properties.slice(0, 4).map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span className="truncate font-medium text-slate-300">{p.name}</span>
                  {p.location && <span className="text-slate-600 shrink-0">{p.location}</span>}
                </div>
              ))}
              {properties.length > 4 && (
                <div className="text-xs text-slate-600">+{properties.length - 4} más</div>
              )}
            </div>
          </DarkCard>

          {/* Conexión PMS */}
          <PmsConnectionCard
            pmsConn={pmsConn}
            pmsLoading={pmsLoading}
            onGoToWizard={() => navigate("/app/integraciones/pms")}
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ÁREA 2: INTELIGENCIA DE RIESGO                                 */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div>
        <AreaHeader
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Inteligencia de Riesgo"
          sub={selectedProperty ? `Propiedad: ${selectedProperty.name}` : "Organización"}
        />

        {!selectedPropertyId && properties.length === 0 ? (
          <DarkCard>
            <p className="text-sm text-slate-500">Sin propiedades configuradas.</p>
          </DarkCard>
        ) : revLoading ? (
          <DarkCard>
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Cargando datos de la propiedad...
            </div>
          </DarkCard>
        ) : !rev ? (
          <DarkCard>
            <p className="text-sm text-slate-500">
              Sin datos de revenue para esta propiedad este mes.
            </p>
          </DarkCard>
        ) : (
          <div className="space-y-4">
            {/* KPIs de riesgo */}
            <div className="grid gap-4 md:grid-cols-3">
              <KpiCard
                label="Incidencias activas"
                value={String(rev.impact.incidents_count)}
                sub="Mes actual"
                accent="blue"
              />
              <KpiCard
                label="Pérdida bruta"
                value={euro(rev.impact.gross_loss)}
                sub="Roturas, compensaciones, no-shows…"
                accent="amber"
              />
              <KpiCard
                label="Impacto neto"
                value={euro(rev.impact.net_loss)}
                sub="Bruto − Recuperado"
                accent={rev.impact.net_loss > 0 ? "red" : "emerald"}
                onClick={() => navigate("/app/revenue/fugas")}
              />
            </div>

            {/* Comparativa entre propiedades */}
            {dash.property_comparison.length > 0 && (
              <ComparisonBlock
                rows={dash.property_comparison}
                onNavigate={() => navigate("/app/revenue/fugas")}
              />
            )}
          </div>
        )}

        {/* Próximas alarmas */}
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Próximas alarmas de riesgo
            </span>
          </div>
          <AlertsBlock
            alerts={dash.upcoming_risk_alerts}
            onViewGuest={(key) =>
              navigate(`/app/riesgo/cliente?identity_key=${encodeURIComponent(key)}`)
            }
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ÁREA 3: REVENUE INTELLIGENCE                                   */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div>
        <AreaHeader
          icon={<TrendingUp className="w-4 h-4" />}
          label="Revenue Intelligence"
          sub="Análisis de ingresos y tendencias"
        />

        {!pmsConn && !pmsLoading ? (
          /* Estado vacío sin PMS */
          <DarkCard className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
              <TrendingUp className="w-6 h-6 text-slate-600" />
            </div>
            <p className="text-white font-semibold mb-1">
              Conecta tu PMS para activar Revenue Intelligence
            </p>
            <p className="text-sm text-slate-500 mb-5 max-w-xs">
              Accede a métricas de ADR, RevPAR, ocupación y revenue en tiempo real desde tu PMS.
            </p>
            <button
              type="button"
              onClick={() => navigate("/app/integraciones/pms")}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold bg-blue-500 text-white hover:bg-blue-400 transition-colors shadow-[0_0_15px_rgba(59,130,246,0.3)]"
            >
              <Zap className="w-4 h-4" />
              Conectar PMS
            </button>
          </DarkCard>
        ) : rev ? (
          <div className="space-y-4">
            {/* KPIs de Revenue — placeholders hasta PMS activo */}
            <div className="grid gap-4 md:grid-cols-4">
              {(["ADR", "RevPAR", "Ocupación", "Total Revenue"] as const).map((label) => (
                <DarkCard key={label}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    {label}
                  </p>
                  <div className="mt-2 text-2xl font-bold text-slate-600">—</div>
                  <div className="mt-1 text-xs text-slate-600">Disponible con PMS conectado</div>
                </DarkCard>
              ))}
            </div>

            {/* Tendencia 6 meses + top plataformas */}
            <div className="grid gap-4 lg:grid-cols-3">
              <section className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-sm font-bold text-white">Tendencia (últimos 6 meses)</h3>
                    <p className="text-xs text-slate-500">Impacto neto agregado por mes</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <BarChart3 className="w-4 h-4 text-slate-600" />
                    {rev.month}
                  </div>
                </div>

                <div className="grid grid-cols-6 gap-3 items-end">
                  {trend.map((m) => {
                    const h = Math.round((Math.abs(m.net_loss) / maxTrend) * 100);
                    return (
                      <div key={m.month} className="flex flex-col items-center gap-2">
                        <div className="w-full h-24 bg-slate-800/50 rounded-xl border border-slate-800 flex items-end p-1">
                          <div
                            className="w-full rounded-lg bg-blue-500/70"
                            style={{ height: `${Math.max(6, h)}%` }}
                            title={`${m.month}: ${euro(m.net_loss)}`}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-slate-500">
                          {m.month.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 text-[10px] text-slate-600">
                  Vista agregada (sin PII) · Útil para control de margen y operativa.
                </div>
              </section>

              <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm">
                <h3 className="text-sm font-bold text-white">Top plataformas</h3>
                <p className="text-xs text-slate-500 mb-4">Ordenado por impacto neto</p>

                <div className="space-y-3">
                  {rev.by_platform.length === 0 ? (
                    <div className="text-sm text-slate-500">Sin datos este mes.</div>
                  ) : (
                    rev.by_platform.slice(0, 6).map((p) => (
                      <div
                        key={p.platform}
                        className="flex items-center justify-between border-b border-slate-800 pb-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{p.platform}</div>
                          <div className="text-[10px] text-slate-500">{p.incidents} incidencias</div>
                        </div>
                        <div className="text-xs font-bold text-slate-200">{euro(p.net_loss)}</div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-4 text-[10px] text-slate-600">
                  Si una plataforma concentra el net loss, revisa políticas y depósitos.
                </div>
              </section>
            </div>

            {/* Recuperado + Actividad */}
            <div className="grid gap-4 md:grid-cols-2">
              <KpiCard
                label="Recuperado"
                value={euro(rev.impact.recovered)}
                sub="Cargos, fianzas, cobros posteriores"
                accent="emerald"
              />
              <DarkCard>
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="w-4 h-4 text-slate-500" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Registros añadidos este mes
                  </p>
                </div>
                <div className="text-2xl font-bold text-white">{usage?.created_this_month ?? 0}</div>
                <div className="mt-1 text-xs text-slate-500">Evaluaciones ingresadas</div>
              </DarkCard>
            </div>
          </div>
        ) : null}
      </div>

    </div>
    </div>
  );
}
