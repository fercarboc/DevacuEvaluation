// src/pages/pms/PmsConsultaView.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Zap,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  WifiOff,
  TrendingUp,
  Users,
  Calendar,
  BarChart3,
  ChevronDown,
} from "lucide-react";
import { callEvalFn } from "@/services/callEvalFn";

// ─── Tipos ─────────────────────────────────────────────────────────────────

interface InHouseGuest {
  stayId: string;
  roomId: string | null;
  arrivalScheduledAt: string | null;
  departureScheduledAt: string | null;
  nightsRemaining: number;
  adults: number | null;
  children: number | null;
  channelCode: string | null;
  nationalityCode: string | null;
  riskLevel: string;
  riskScore: number;
  incidentsTotal: number;
  alertPriority: string;
}

interface InHouseData {
  propertyName: string;
  date: string;
  totalInHouse: number;
  adultsTotal: number;
  riskSummary: { URGENT: number; HIGH: number; MEDIUM: number; LOW: number };
  guests: InHouseGuest[];
  syncedAt: string;
}

interface UpcomingAlert {
  reservationId: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number | null;
  channelCode: string | null;
  segmentCode: string | null;
  riskLevel: string;
  riskScore: number | null;
  incidentsTotal: number | null;
  totalAmount: number | null;
  alertType: string | null;
}

interface ChannelMixItem {
  channelCode: string;
  reservations: number;
  revenue: number;
  pct: number;
}

interface SegmentMixItem {
  segmentCode: string;
  reservations: number;
  revenue: number;
  pct: number;
}

interface FutureData {
  propertyName: string;
  connectionStatus: "NO_CONNECTION" | "CONNECTED";
  providerCode?: string;
  lastSyncAt?: string | null;
  period?: { from: string; to: string; days: number };
  totalReservations: number;
  totalRevenue: number;
  riskSummary: { HIGH: number; MEDIUM: number; LOW: number; NONE: number; UNKNOWN: number };
  upcomingAlerts: UpcomingAlert[];
  channelMix: ChannelMixItem[];
  segmentMix: SegmentMixItem[];
}

interface RevenueMetric {
  value: number;
  currency?: string;
  unit?: string;
  vs_prev: string | null;
}

interface PickupItem {
  date: string;
  newReservations: number;
  newRevenue: number;
}

interface RevChannelMix {
  channelCode: string;
  channelName: string;
  reservations: number;
  revenue: number;
  adr: number;
  pct: number;
  revenuePct: number;
}

interface RevSegmentMix {
  segmentCode: string;
  reservations: number;
  revenue: number;
  pct: number;
}

interface RevRatePlanMix {
  ratePlanCode: string;
  ratePlanName: string;
  reservations: number;
  revenue: number;
  pct: number;
}

interface RevenueData {
  propertyName: string;
  connectionStatus: "NO_CONNECTION" | "CONNECTED";
  providerCode?: string;
  lastSyncAt?: string | null;
  period?: { from: string; to: string; days: number };
  metrics?: {
    adr: RevenueMetric;
    revpar: RevenueMetric;
    occupancy: RevenueMetric;
    totalRevenue: RevenueMetric;
    totalReservations: { value: number; vs_prev: string | null };
  };
  pickup: PickupItem[];
  channelMix: RevChannelMix[];
  segmentMix: RevSegmentMix[];
  ratePlanMix: RevRatePlanMix[];
  currencyCode?: string;
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface Props {
  propertyId: string | null;
  propertyName: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function euro(v: number, currency = "EUR"): string {
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(v);
  } catch {
    return `${v.toFixed(2)} €`;
  }
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return v;
  return dt.toLocaleDateString("es-ES");
}

function timeSince(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "hace un momento";
  if (mins < 60) return `hace ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function endOfYearStr(): string {
  return `${new Date().getFullYear()}-12-31`;
}

function firstOfMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function lastOfMonthStr(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().split("T")[0];
}

// ─── Componentes base ────────────────────────────────────────────────────────

function DarkCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-900/50 p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent = "white",
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "white" | "blue" | "red" | "amber" | "emerald";
}) {
  const accentCls =
    accent === "red"
      ? "text-red-400"
      : accent === "amber"
      ? "text-amber-400"
      : accent === "emerald"
      ? "text-emerald-400"
      : accent === "blue"
      ? "text-blue-400"
      : "text-white";

  return (
    <DarkCard>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
      <div className={`mt-2 text-2xl font-bold ${accentCls}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </DarkCard>
  );
}

function RiskBadge({ level }: { level: string }) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border";
  const l = (level ?? "").toUpperCase();
  if (l === "URGENT" || l === "HIGH")
    return <span className={`${base} bg-red-500/10 text-red-400 border-red-500/20`}>{l}</span>;
  if (l === "MEDIUM")
    return <span className={`${base} bg-amber-500/10 text-amber-400 border-amber-500/20`}>{l}</span>;
  if (l === "LOW" || l === "NONE")
    return <span className={`${base} bg-emerald-500/10 text-emerald-400 border-emerald-500/20`}>{l}</span>;
  return <span className={`${base} bg-slate-700 text-slate-400 border-slate-600`}>{l || "—"}</span>;
}

function ChannelBadge({ code }: { code: string | null }) {
  if (!code) return <span className="text-slate-600">—</span>;
  return (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">
      {code}
    </span>
  );
}

function VsPrev({ vs }: { vs: string | null | undefined }) {
  if (!vs) return null;
  const n = parseFloat(vs);
  if (Number.isNaN(n)) return null;
  const up = n >= 0;
  return (
    <span className={`text-[10px] font-bold ${up ? "text-emerald-400" : "text-red-400"}`}>
      {up ? "▲" : "▼"} {Math.abs(n).toFixed(1)}%
    </span>
  );
}

function EmptyState({
  title,
  sub,
  onGoWizard,
}: {
  title: string;
  sub?: string;
  onGoWizard?: () => void;
}) {
  return (
    <DarkCard className="flex flex-col items-center justify-center py-14 text-center">
      <WifiOff className="w-8 h-8 text-slate-600 mb-3" />
      <p className="text-white font-semibold mb-1">{title}</p>
      {sub && <p className="text-sm text-slate-500 max-w-xs mb-4">{sub}</p>}
      {onGoWizard && (
        <button
          type="button"
          onClick={onGoWizard}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
        >
          <Zap className="w-3.5 h-3.5" />
          Conectar PMS
        </button>
      )}
    </DarkCard>
  );
}

// ─── TAB 1: IN-HOUSE ─────────────────────────────────────────────────────────

function InHouseTab({ propertyId }: { propertyId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InHouseData | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    callEvalFn<{ ok: boolean; data: InHouseData }>(
      "pms-query-inhouse-risk",
      { property_id: propertyId }
    )
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) throw new Error("Error al consultar riesgo in-house");
        setData(res.data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error desconocido");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [propertyId, retryKey]);

  if (loading) {
    return (
      <DarkCard>
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Consultando huéspedes in-house...
        </div>
      </DarkCard>
    );
  }

  if (error) {
    return (
      <DarkCard>
        <p className="text-sm text-red-400">{error}</p>
        <button onClick={() => setRetryKey((k) => k + 1)} className="mt-2 text-xs text-blue-400 hover:underline">Reintentar</button>
      </DarkCard>
    );
  }

  if (!data) return null;

  const { riskSummary, guests, syncedAt } = data;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard label="Total In-House" value={data.totalInHouse} sub="huéspedes activos" />
        <KpiCard
          label="Alertas Urgentes"
          value={riskSummary.URGENT}
          sub="requieren acción inmediata"
          accent={riskSummary.URGENT > 0 ? "red" : "white"}
        />
        <KpiCard
          label="Riesgo Alto"
          value={riskSummary.HIGH}
          sub="nivel HIGH detectado"
          accent={riskSummary.HIGH > 0 ? "amber" : "white"}
        />
        <KpiCard
          label="Con señales de riesgo"
          value={riskSummary.URGENT + riskSummary.HIGH + riskSummary.MEDIUM}
          sub="URGENT + HIGH + MEDIUM"
          accent="blue"
        />
      </div>

      {/* Tabla */}
      {guests.length === 0 ? (
        <DarkCard className="text-center py-10">
          <Users className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-white font-semibold">No hay huéspedes in-house en este momento</p>
          <p className="text-xs text-slate-500 mt-1">Último sync: {timeSince(syncedAt)}</p>
        </DarkCard>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80">
                  {["HABITACIÓN", "LLEGADA / SALIDA", "NOCHES REST.", "PERSONAS", "CANAL", "NACION.", "RIESGO", "INCID.", "PRIORIDAD"].map((h) => (
                    <th key={h} className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {guests.map((g) => (
                  <tr
                    key={g.stayId}
                    className={`hover:bg-slate-800/40 transition-colors ${
                      g.alertPriority === "URGENT" || g.alertPriority === "HIGH" ? "bg-red-500/5" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-300">{g.roomId ?? "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                      {fmtDate(g.arrivalScheduledAt)} → {fmtDate(g.departureScheduledAt)}
                    </td>
                    <td className={`px-3 py-2.5 font-bold text-sm text-center ${g.nightsRemaining <= 1 ? "text-red-400" : "text-slate-300"}`}>
                      {g.nightsRemaining}
                    </td>
                    <td className="px-3 py-2.5 text-slate-300 text-center text-xs">
                      {g.adults ?? 0} + {g.children ?? 0}
                    </td>
                    <td className="px-3 py-2.5">
                      <ChannelBadge code={g.channelCode} />
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-400 uppercase">
                      {g.nationalityCode ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <RiskBadge level={g.riskLevel} />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {g.incidentsTotal > 0 ? (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                          {g.incidentsTotal}
                        </span>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <RiskBadge level={g.alertPriority} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-slate-800">
            <span className="text-[10px] text-slate-600">
              {guests.length} huéspedes · Ordenado por prioridad · Sync: {timeSince(syncedAt)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TAB 2: RESERVAS FUTURAS ─────────────────────────────────────────────────

function FutureTab({ propertyId }: { propertyId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FutureData | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    callEvalFn<{ ok: boolean; data: FutureData }>(
      "pms-query-future-reservations",
      { property_id: propertyId, date_from: todayStr(), date_to: endOfYearStr() }
    )
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) throw new Error("Error al consultar reservas futuras");
        setData(res.data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error desconocido");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [propertyId, retryKey]);

  if (loading) {
    return (
      <DarkCard>
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Consultando reservas futuras...
        </div>
      </DarkCard>
    );
  }

  if (error) {
    return (
      <DarkCard>
        <p className="text-sm text-red-400">{error}</p>
        <button onClick={() => setRetryKey((k) => k + 1)} className="mt-2 text-xs text-blue-400 hover:underline">Reintentar</button>
      </DarkCard>
    );
  }

  if (!data) return null;

  if (data.connectionStatus === "NO_CONNECTION") {
    return (
      <EmptyState
        title="Sin conexión PMS activa"
        sub="Conecta tu PMS para consultar reservas futuras con análisis de riesgo."
        onGoWizard={() => navigate("/app/integraciones/pms")}
      />
    );
  }

  const { riskSummary, upcomingAlerts, channelMix, segmentMix } = data;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-5">
        <KpiCard label="Total reservas" value={data.totalReservations} sub={`${fmtDate(data.period?.from)} → ${fmtDate(data.period?.to)}`} />
        <KpiCard label="Riesgo Alto" value={riskSummary.HIGH} accent={riskSummary.HIGH > 0 ? "red" : "white"} sub="HIGH risk" />
        <KpiCard label="Riesgo Medio" value={riskSummary.MEDIUM} accent={riskSummary.MEDIUM > 0 ? "amber" : "white"} sub="MEDIUM risk" />
        <KpiCard label="Revenue Total" value={euro(data.totalRevenue)} accent="emerald" sub="reservas del período" />
        <DarkCard>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Período</p>
          <div className="mt-2 text-sm font-bold text-white">{fmtDate(data.period?.from)}</div>
          <div className="text-xs text-slate-500">→ {fmtDate(data.period?.to)}</div>
          <div className="mt-1 text-[10px] text-slate-600">{data.period?.days ?? 0} días</div>
        </DarkCard>
      </div>

      {/* Alertas de riesgo */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Alertas de riesgo ({upcomingAlerts.length})
          </span>
        </div>
        {upcomingAlerts.length === 0 ? (
          <DarkCard>
            <p className="text-sm text-emerald-400 font-semibold">Sin alertas de riesgo en el período</p>
            <p className="text-xs text-slate-500 mt-1">No se detectaron reservas con riesgo HIGH o MEDIUM.</p>
          </DarkCard>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80">
                    {["CHECK-IN", "NOCHES", "CANAL", "SEGMENTO", "RIESGO", "SCORE", "INCID.", "REVENUE", "TIPO ALERTA"].map((h) => (
                      <th key={h} className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {upcomingAlerts.map((a, i) => (
                    <tr key={a.reservationId ?? i} className={`hover:bg-slate-800/40 transition-colors ${a.riskLevel === "HIGH" ? "bg-red-500/5" : ""}`}>
                      <td className="px-3 py-2.5 font-semibold text-white text-xs whitespace-nowrap">{fmtDate(a.checkInDate)}</td>
                      <td className="px-3 py-2.5 text-slate-300 text-center text-xs">{a.nights ?? "—"}</td>
                      <td className="px-3 py-2.5"><ChannelBadge code={a.channelCode} /></td>
                      <td className="px-3 py-2.5 text-xs text-slate-400 uppercase">{a.segmentCode ?? "—"}</td>
                      <td className="px-3 py-2.5"><RiskBadge level={a.riskLevel} /></td>
                      <td className="px-3 py-2.5 text-slate-300 text-xs text-right">{a.riskScore ?? "—"}</td>
                      <td className="px-3 py-2.5 text-center">
                        {a.incidentsTotal ? (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                            {a.incidentsTotal}
                          </span>
                        ) : <span className="text-slate-600 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-300 text-xs text-right">
                        {a.totalAmount != null ? euro(a.totalAmount) : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        {a.alertType ? (
                          <span className="inline-flex items-center rounded px-2 py-0.5 text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase">
                            {a.alertType.replace(/_/g, " ")}
                          </span>
                        ) : <span className="text-slate-600 text-xs">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Mix de canales + segmentos */}
      <div className="grid gap-4 md:grid-cols-2">
        <DarkCard>
          <h3 className="text-sm font-bold text-white mb-3">Mix de Canales</h3>
          <div className="space-y-2">
            {channelMix.length === 0 ? (
              <p className="text-xs text-slate-500">Sin datos</p>
            ) : (
              channelMix.slice(0, 8).map((c) => (
                <div key={c.channelCode} className="flex items-center justify-between text-xs border-b border-slate-800 pb-1.5">
                  <div>
                    <span className="font-bold text-slate-200 uppercase">{c.channelCode}</span>
                    <span className="text-slate-500 ml-2">{c.reservations} reservas</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-white">{euro(c.revenue)}</div>
                    <div className="text-slate-500">{c.pct.toFixed(1)}%</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </DarkCard>

        <DarkCard>
          <h3 className="text-sm font-bold text-white mb-3">Mix de Segmentos</h3>
          <div className="space-y-2">
            {segmentMix.length === 0 ? (
              <p className="text-xs text-slate-500">Sin datos</p>
            ) : (
              segmentMix.slice(0, 8).map((s) => (
                <div key={s.segmentCode} className="flex items-center justify-between text-xs border-b border-slate-800 pb-1.5">
                  <div>
                    <span className="font-bold text-slate-200 uppercase">{s.segmentCode}</span>
                    <span className="text-slate-500 ml-2">{s.reservations} reservas</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-white">{euro(s.revenue)}</div>
                    <div className="text-slate-500">{s.pct.toFixed(1)}%</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </DarkCard>
      </div>
    </div>
  );
}

// ─── TAB 3: REVENUE ──────────────────────────────────────────────────────────

function RevenueTab({ propertyId }: { propertyId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RevenueData | null>(null);
  const [dateFrom, setDateFrom] = useState(firstOfMonthStr());
  const [dateTo, setDateTo] = useState(lastOfMonthStr());
  const navigate = useNavigate();

  // Resetear datos cuando cambia la propiedad activa
  useEffect(() => {
    setData(null);
    setError(null);
  }, [propertyId]);

  const handleLoad = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await callEvalFn<{ ok: boolean; data: RevenueData }>(
        "pms-query-revenue",
        { property_id: propertyId, date_from: dateFrom, date_to: dateTo }
      );
      if (!res.ok) throw new Error("Error al consultar revenue");
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  // No auto-load: el usuario lanza la consulta con el botón
  const maxPickup = data?.pickup?.reduce((a, x) => Math.max(a, x.newReservations), 0) || 1;

  if (!data && !loading && !error) {
    return (
      <div className="space-y-4">
        <DarkCard>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Desde</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Hasta</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={handleLoad}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold bg-blue-500 text-white hover:bg-blue-400 transition-colors shadow-[0_0_15px_rgba(59,130,246,0.2)]"
            >
              <BarChart3 className="w-4 h-4" />
              Consultar
            </button>
          </div>
        </DarkCard>
        <DarkCard className="text-center py-10">
          <TrendingUp className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Selecciona un período y pulsa "Consultar" para ver los datos de revenue</p>
        </DarkCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Selector de período siempre visible */}
      <DarkCard>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={handleLoad}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold bg-blue-500 text-white hover:bg-blue-400 transition-colors disabled:opacity-50 shadow-[0_0_15px_rgba(59,130,246,0.2)]"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
            {loading ? "Consultando..." : "Consultar"}
          </button>
        </div>
      </DarkCard>

      {error && (
        <DarkCard>
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={handleLoad} className="mt-2 text-xs text-blue-400 hover:underline">Reintentar</button>
        </DarkCard>
      )}

      {loading && (
        <DarkCard>
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Calculando métricas de revenue...
          </div>
        </DarkCard>
      )}

      {data && !loading && (
        <>
          {data.connectionStatus === "NO_CONNECTION" ? (
            <EmptyState
              title="Sin conexión PMS activa"
              sub="Conecta tu PMS para acceder a las métricas de revenue."
              onGoWizard={() => navigate("/app/integraciones/pms")}
            />
          ) : (
            <>
              {/* KPIs con variación */}
              <div className="grid gap-4 md:grid-cols-4">
                {data.metrics && (
                  <>
                    <DarkCard>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">ADR</p>
                      <div className="mt-2 text-2xl font-bold text-white">{euro(data.metrics.adr.value, data.currencyCode)}</div>
                      <div className="mt-1"><VsPrev vs={data.metrics.adr.vs_prev} /></div>
                    </DarkCard>
                    <DarkCard>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">RevPAR</p>
                      <div className="mt-2 text-2xl font-bold text-white">{euro(data.metrics.revpar.value, data.currencyCode)}</div>
                      <div className="mt-1"><VsPrev vs={data.metrics.revpar.vs_prev} /></div>
                    </DarkCard>
                    <DarkCard>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Ocupación</p>
                      <div className="mt-2 text-2xl font-bold text-white">{data.metrics.occupancy.value.toFixed(1)}%</div>
                      <div className="mt-1"><VsPrev vs={data.metrics.occupancy.vs_prev} /></div>
                    </DarkCard>
                    <DarkCard>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Revenue Total</p>
                      <div className="mt-2 text-2xl font-bold text-white">{euro(data.metrics.totalRevenue.value, data.currencyCode)}</div>
                      <div className="mt-1"><VsPrev vs={data.metrics.totalRevenue.vs_prev} /></div>
                    </DarkCard>
                  </>
                )}
              </div>

              {/* Gráfico Pickup */}
              {data.pickup && data.pickup.length > 0 && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
                  <h3 className="text-sm font-bold text-white mb-1">Pickup — Reservas nuevas por día</h3>
                  <p className="text-xs text-slate-500 mb-4">Nuevas reservas captadas en el período</p>
                  <div className="flex items-end gap-1" style={{ height: 100 }}>
                    {data.pickup.slice(0, 60).map((p) => {
                      const h = Math.round((p.newReservations / maxPickup) * 100);
                      return (
                        <div
                          key={p.date}
                          className="flex-1 bg-blue-500/60 rounded-t hover:bg-blue-400/80 transition-colors cursor-default"
                          style={{ height: `${Math.max(2, h)}%` }}
                          title={`${p.date}: ${p.newReservations} reservas · ${euro(p.newRevenue)}`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-slate-600">{data.period?.from}</span>
                    <span className="text-[10px] text-slate-600">{data.period?.to}</span>
                  </div>
                </div>
              )}

              {/* Tres tablas de mix */}
              <div className="grid gap-4 lg:grid-cols-3">
                {/* Mix Canales */}
                <DarkCard>
                  <h3 className="text-sm font-bold text-white mb-3">Mix de Canales</h3>
                  <div className="space-y-2">
                    {(data.channelMix ?? []).slice(0, 8).map((c) => (
                      <div key={c.channelCode} className="flex items-start justify-between text-xs border-b border-slate-800 pb-1.5">
                        <div>
                          <div className="font-bold text-slate-200 uppercase">{c.channelCode || "—"}</div>
                          <div className="text-slate-500">{c.reservations} res · ADR {euro(c.adr ?? 0)}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-white">{euro(c.revenue)}</div>
                          <div className="text-slate-500">{(c.pct ?? 0).toFixed(1)}%</div>
                        </div>
                      </div>
                    ))}
                    {(data.channelMix ?? []).length === 0 && <p className="text-xs text-slate-500">Sin datos</p>}
                  </div>
                </DarkCard>

                {/* Mix Segmentos */}
                <DarkCard>
                  <h3 className="text-sm font-bold text-white mb-3">Mix de Segmentos</h3>
                  <div className="space-y-2">
                    {(data.segmentMix ?? []).slice(0, 8).map((s) => (
                      <div key={s.segmentCode} className="flex items-start justify-between text-xs border-b border-slate-800 pb-1.5">
                        <div>
                          <div className="font-bold text-slate-200 uppercase">{s.segmentCode || "—"}</div>
                          <div className="text-slate-500">{s.reservations} reservas</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-white">{euro(s.revenue)}</div>
                          <div className="text-slate-500">{(s.pct ?? 0).toFixed(1)}%</div>
                        </div>
                      </div>
                    ))}
                    {(data.segmentMix ?? []).length === 0 && <p className="text-xs text-slate-500">Sin datos</p>}
                  </div>
                </DarkCard>

                {/* Mix Rate Plans */}
                <DarkCard>
                  <h3 className="text-sm font-bold text-white mb-3">Mix de Rate Plans</h3>
                  <div className="space-y-2">
                    {(data.ratePlanMix ?? []).slice(0, 8).map((r) => (
                      <div key={r.ratePlanCode} className="flex items-start justify-between text-xs border-b border-slate-800 pb-1.5">
                        <div>
                          <div className="font-bold text-slate-200 uppercase">{r.ratePlanCode || "—"}</div>
                          <div className="text-slate-500">{r.reservations} reservas</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-white">{euro(r.revenue)}</div>
                          <div className="text-slate-500">{(r.pct ?? 0).toFixed(1)}%</div>
                        </div>
                      </div>
                    ))}
                    {(data.ratePlanMix ?? []).length === 0 && <p className="text-xs text-slate-500">Sin datos</p>}
                  </div>
                </DarkCard>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

type Tab = "inhouse" | "future" | "revenue";

export default function PmsConsultaView({ propertyId, propertyName }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("inhouse");
  const [syncing, setSyncing] = useState(false);
  const navigate = useNavigate();

  if (!propertyId) {
    return (
      <div className="-mx-4 md:-mx-6 -mt-6 -mb-6 px-4 md:px-6 pt-6 pb-10 bg-[#0f172a] min-h-screen">
        <DarkCard className="text-center py-14">
          <p className="text-white font-semibold">Selecciona una propiedad para continuar</p>
          <p className="text-sm text-slate-500 mt-1">Usa el selector de propiedad en la barra superior.</p>
        </DarkCard>
      </div>
    );
  }

  const handleSync = async () => {
    setSyncing(true);
    try {
      await callEvalFn("pms-sync-orchestrator", { property_id: propertyId, triggered_by: "manual" });
    } catch {
      // sync puede tardar, ignorar error y recargar el tab
    } finally {
      setSyncing(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "inhouse", label: "Riesgo In-House", icon: <Users className="w-3.5 h-3.5" /> },
    { id: "future", label: "Reservas Futuras", icon: <Calendar className="w-3.5 h-3.5" /> },
    { id: "revenue", label: "Revenue", icon: <TrendingUp className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="-mx-4 md:-mx-6 -mt-6 -mb-6 px-4 md:px-6 pt-6 pb-10 bg-[#0f172a] min-h-screen">
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-white tracking-tight">Consulta API PMS</h2>
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">
                {propertyName ?? "Propiedad"}
              </span>
            </div>
            <p className="text-slate-500 text-sm mt-1">
              Datos en tiempo real desde las tablas canónicas del PMS.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Sincronizar ahora"}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-800">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Contenido del tab activo */}
        {activeTab === "inhouse" && <InHouseTab propertyId={propertyId} />}
        {activeTab === "future" && <FutureTab propertyId={propertyId} />}
        {activeTab === "revenue" && <RevenueTab propertyId={propertyId} />}

      </div>
    </div>
  );
}
