// src/pages/pms/PmsSyncHistorialView.tsx
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  RefreshCw,
  Clock,
  Wifi,
  WifiOff,
  Zap,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { callEvalFn } from "@/services/callEvalFn";

// ─── Tipos ─────────────────────────────────────────────────────────────────

interface EntitySyncInfo {
  lastSuccessAt: string | null;
  lastStatus: string | null;
  lastRecordsRead: number | null;
  timeSince: string | null;
}

interface SyncJob {
  id: string;
  connection_id: string;
  entity_type: string;
  sync_mode: string;
  status: string;
  records_read: number | null;
  records_created: number | null;
  records_updated: number | null;
  records_error: number | null;
  duration_ms: number | null;
  error_code: string | null;
  error_message: string | null;
  triggered_by: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string | null;
  providerCode: string | null;
  environment: string | null;
  durationSeconds: number | null;
  timeSinceCreated: string | null;
}

interface Connection {
  id: string;
  provider_code: string;
  status: string;
  environment: string;
  last_sync_at: string | null;
  lastSyncTimeSince: string | null;
  lastSuccessTimeSince: string | null;
}

interface SyncStatusData {
  propertyId: string;
  propertyName: string;
  connections: Connection[];
  lastSyncByEntity: Record<string, EntitySyncInfo>;
  recentJobs: SyncJob[];
  summary: {
    totalJobs: number;
    successJobs: number;
    failedJobs: number;
    warningJobs: number;
    runningJobs: number;
  };
  queriedAt: string;
}

interface Props {
  propertyId: string | null;
  propertyName: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return v;
  return dt.toLocaleString("es-ES", { dateStyle: "short", timeStyle: "medium" });
}

// ─── Componentes base ─────────────────────────────────────────────────────────

function DarkCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-900/50 p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const s = (status ?? "").toUpperCase();
  const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border";
  if (s === "SUCCESS" || s === "CONNECTED" || s === "ACTIVE")
    return <span className={`${base} bg-emerald-500/10 text-emerald-400 border-emerald-500/20`}>{s === "CONNECTED" || s === "ACTIVE" ? "CONECTADO" : s}</span>;
  if (s === "FAILED" || s === "NO_CONNECTION" || s === "ERROR")
    return <span className={`${base} bg-red-500/10 text-red-400 border-red-500/20`}>{s === "NO_CONNECTION" ? "SIN CONEXIÓN" : s}</span>;
  if (s === "WARNING")
    return <span className={`${base} bg-amber-500/10 text-amber-400 border-amber-500/20`}>{s}</span>;
  if (s === "RUNNING")
    return <span className={`${base} bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse`}>{s}</span>;
  return <span className={`${base} bg-slate-700 text-slate-400 border-slate-600`}>{s || "—"}</span>;
}

function EntityBadge({ entity }: { entity: string }) {
  const colorMap: Record<string, string> = {
    ROOM_TYPE:   "bg-purple-500/10 text-purple-400 border-purple-500/20",
    ROOM:        "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    GUEST:       "bg-blue-500/10 text-blue-400 border-blue-500/20",
    RESERVATION: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    STAY:        "bg-teal-500/10 text-teal-400 border-teal-500/20",
  };
  const cls = colorMap[entity] ?? "bg-slate-700 text-slate-400 border-slate-600";
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${cls}`}>
      {entity}
    </span>
  );
}

function SyncModeBadge({ mode }: { mode: string | null }) {
  if (!mode) return <span className="text-slate-600 text-xs">—</span>;
  const isFull = mode.toUpperCase() === "FULL";
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[9px] font-bold uppercase border ${
      isFull
        ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
        : "bg-slate-700/50 text-slate-400 border-slate-600"
    }`}>
      {mode}
    </span>
  );
}

function TimeSinceColor({ timeSince }: { timeSince: string | null }) {
  if (!timeSince) return <span className="text-slate-600 text-xs">—</span>;
  // Detect approximation
  const isRecent = timeSince.includes("momento") || timeSince.includes("min") && !timeSince.includes("60");
  const isOld = timeSince.includes("d");
  const cls = isOld ? "text-red-400" : isRecent ? "text-emerald-400" : "text-amber-400";
  return <span className={`text-xs font-semibold ${cls}`}>{timeSince}</span>;
}

const ENTITY_LABELS: Record<string, string> = {
  ROOM_TYPE:   "Tipos de hab.",
  ROOM:        "Habitaciones",
  GUEST:       "Huéspedes",
  RESERVATION: "Reservas",
  STAY:        "Estancias",
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PmsSyncHistorialView({ propertyId, propertyName }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SyncStatusData | null>(null);
  const [filterEntity, setFilterEntity] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const navigate = useNavigate();

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await callEvalFn<{ ok: boolean; data: SyncStatusData }>(
        "pms-sync-status",
        { property_id: propertyId, limit: 100 }
      );
      if (!res.ok) throw new Error("Error al cargar el historial de sync");
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);

  if (!propertyId) {
    return (
      <div className="-mx-4 md:-mx-6 -mt-6 -mb-6 px-4 md:px-6 pt-6 pb-10 bg-[#0f172a] min-h-screen">
        <DarkCard className="text-center py-14">
          <p className="text-white font-semibold">Selecciona una propiedad para continuar</p>
        </DarkCard>
      </div>
    );
  }

  const activeConnection = data?.connections.find((c) => c.status === "ACTIVE") ?? null;
  const isConnected = !!activeConnection;

  const filteredJobs = (data?.recentJobs ?? []).filter((j) => {
    if (filterEntity && j.entity_type !== filterEntity) return false;
    if (filterStatus && j.status !== filterStatus) return false;
    return true;
  });

  const ENTITY_TYPES = ["ROOM_TYPE", "ROOM", "GUEST", "RESERVATION", "STAY"];

  return (
    <div className="-mx-4 md:-mx-6 -mt-6 -mb-6 px-4 md:px-6 pt-6 pb-10 bg-[#0f172a] min-h-screen">
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-bold text-white tracking-tight">Historial de Sincronización</h2>
              {data && (
                <>
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">
                    {activeConnection?.provider_code ?? "—"}
                  </span>
                  <StatusBadge status={isConnected ? "CONNECTED" : "NO_CONNECTION"} />
                </>
              )}
            </div>
            <p className="text-slate-500 text-sm mt-1">
              Registro de jobs de sincronización por entidad y estado.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>

        {loading && (
          <DarkCard>
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Cargando historial de sincronización...
            </div>
          </DarkCard>
        )}

        {error && !loading && (
          <DarkCard>
            <p className="text-sm text-red-400">{error}</p>
            <button onClick={load} className="mt-2 text-xs text-blue-400 hover:underline">Reintentar</button>
          </DarkCard>
        )}

        {!loading && data && data.connections.length === 0 && (
          <DarkCard className="flex flex-col items-center justify-center py-14 text-center">
            <WifiOff className="w-8 h-8 text-slate-600 mb-3" />
            <p className="text-white font-semibold mb-1">Sin conexión PMS configurada</p>
            <p className="text-sm text-slate-500 mb-4 max-w-xs">
              Conecta tu PMS para habilitar la sincronización de datos.
            </p>
            <button
              type="button"
              onClick={() => navigate("/app/integraciones/pms")}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              Conectar PMS
            </button>
          </DarkCard>
        )}

        {!loading && data && data.connections.length > 0 && (
          <>
            {/* Último sync por entidad */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Último sync por entidad
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-5">
                {ENTITY_TYPES.map((entityType) => {
                  const info = data.lastSyncByEntity[entityType];
                  const statusOk = info?.lastStatus === "SUCCESS";
                  const statusFail = info?.lastStatus === "FAILED";
                  return (
                    <DarkCard key={entityType} className="!p-4">
                      <EntityBadge entity={entityType} />
                      <div className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                        {ENTITY_LABELS[entityType] ?? entityType}
                      </div>
                      <div className="mt-2">
                        <TimeSinceColor timeSince={info?.timeSince ?? null} />
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        {info?.lastStatus ? (
                          <>
                            {statusOk && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                            {statusFail && <XCircle className="w-3 h-3 text-red-400" />}
                            {!statusOk && !statusFail && <AlertTriangle className="w-3 h-3 text-amber-400" />}
                            <span className={`text-[10px] font-bold uppercase ${statusOk ? "text-emerald-400" : statusFail ? "text-red-400" : "text-amber-400"}`}>
                              {info.lastStatus}
                            </span>
                          </>
                        ) : (
                          <span className="text-[10px] text-slate-600">Sin datos</span>
                        )}
                      </div>
                      {info?.lastRecordsRead != null && (
                        <div className="mt-1 text-[10px] text-slate-600">
                          {info.lastRecordsRead} registros
                        </div>
                      )}
                    </DarkCard>
                  );
                })}
              </div>
            </div>

            {/* KPIs del summary */}
            <div className="grid gap-4 md:grid-cols-4">
              <DarkCard>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Total jobs</p>
                <div className="mt-2 text-2xl font-bold text-white">{data.summary.totalJobs}</div>
              </DarkCard>
              <DarkCard>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Exitosos</p>
                <div className="mt-2 text-2xl font-bold text-emerald-400">{data.summary.successJobs}</div>
              </DarkCard>
              <DarkCard>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Fallidos</p>
                <div className={`mt-2 text-2xl font-bold ${data.summary.failedJobs > 0 ? "text-red-400" : "text-slate-500"}`}>
                  {data.summary.failedJobs}
                </div>
              </DarkCard>
              <DarkCard>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Warnings</p>
                <div className={`mt-2 text-2xl font-bold ${data.summary.warningJobs > 0 ? "text-amber-400" : "text-slate-500"}`}>
                  {data.summary.warningJobs}
                </div>
              </DarkCard>
            </div>

            {/* Tabla de jobs recientes */}
            <div>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Jobs recientes ({filteredJobs.length})
                  </span>
                </div>
                {/* Filtros */}
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={filterEntity}
                    onChange={(e) => setFilterEntity(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Todas las entidades</option>
                    {ENTITY_TYPES.map((e) => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </select>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Todos los estados</option>
                    {["SUCCESS", "FAILED", "WARNING", "RUNNING"].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {filteredJobs.length === 0 ? (
                <DarkCard className="text-center py-8">
                  <p className="text-slate-500 text-sm">No hay jobs con los filtros seleccionados.</p>
                </DarkCard>
              ) : (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/80">
                          {["FECHA", "PMS", "ENTIDAD", "MODO", "STATUS", "REGISTROS", "DURACIÓN", "TRIGGER", "ERROR"].map((h) => (
                            <th key={h} className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {filteredJobs.map((job) => (
                          <tr
                            key={job.id}
                            className={`hover:bg-slate-800/40 transition-colors ${
                              job.status === "FAILED" ? "bg-red-500/5" : ""
                            }`}
                          >
                            <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                              {fmtDateTime(job.created_at)}
                            </td>
                            <td className="px-3 py-2.5">
                              {job.providerCode ? (
                                <span className="inline-flex items-center rounded px-2 py-0.5 text-[9px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">
                                  {job.providerCode}
                                </span>
                              ) : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <EntityBadge entity={job.entity_type} />
                            </td>
                            <td className="px-3 py-2.5">
                              <SyncModeBadge mode={job.sync_mode} />
                            </td>
                            <td className="px-3 py-2.5">
                              <StatusBadge status={job.status} />
                            </td>
                            <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                              <span className="font-semibold">{job.records_read ?? 0}</span>
                              <span className="text-slate-600"> / </span>
                              <span className="text-slate-500">{job.records_updated ?? 0}</span>
                            </td>
                            <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                              {job.durationSeconds != null ? `${job.durationSeconds}s` : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-slate-500 uppercase text-[10px]">
                              {job.triggered_by ?? "—"}
                            </td>
                            <td className="px-3 py-2.5 text-red-400 max-w-[160px] truncate" title={job.error_message ?? ""}>
                              {job.error_message ? job.error_message.slice(0, 50) + (job.error_message.length > 50 ? "…" : "") : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-3 border-t border-slate-800">
                    <span className="text-[10px] text-slate-600">
                      Mostrando {filteredJobs.length} jobs · Actualizado: {fmtDateTime(data.queriedAt)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
