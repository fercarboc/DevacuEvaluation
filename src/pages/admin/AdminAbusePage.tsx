import React, { useEffect, useMemo, useState } from "react";
import {
  admin_list_usage_alerts,
  admin_get_usage_alert,
  admin_ack_usage_alert,
  admin_resolve_usage_alert,
  admin_reopen_usage_alert,
  admin_list_usage_alert_actions,
  admin_add_usage_alert_note,
  admin_usage_alert_metrics,
  admin_get_abuse_settings,
  admin_update_abuse_settings,
} from "@/services/adminService";

import { DataTable, Th, Tr, Td } from "@/components/ui/DataTable";

type AlertStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type AlertRow = {
  id: string;
  detected_at: string;
  customer_id: string;
  customer_name?: string | null;
  customer_email?: string | null;
  alert_type: string;
  severity: Severity;
  reason: string;
  status: AlertStatus;
};

type AlertDetail = {
  id: string;
  detected_at: string;
  customer_id: string;
  alert_type: string;
  severity: Severity;
  reason: string;
  detail: any;
  status: AlertStatus;
  resolved_at?: string | null;
  admin_notes?: string | null;
};

type AlertActionRow = {
  id: string;
  created_at: string;
  action_type: "ACKNOWLEDGED" | "RESOLVED" | "REOPENED" | "NOTE" | string;
  from_status?: string | null;
  to_status?: string | null;
  note?: string | null;
  actor_email?: string | null;
  ip?: string | null;
  user_agent?: string | null;
};

type AbuseSettings = {
  id: string;
  ack_warning_minutes: number;
  ack_critical_minutes: number;
  resolve_warning_minutes: number;
  resolve_critical_minutes: number;
  updated_at: string;
  updated_by: string | null;
};

type SlaLevel = "ok" | "warn" | "bad";

const cx = (...cls: Array<string | false | undefined | null>) =>
  cls.filter(Boolean).join(" ");

function badgeSeverity(sev: Severity) {
  switch (sev) {
    case "CRITICAL":
      return "bg-red-100 text-red-700 border-red-200";
    case "HIGH":
      return "bg-orange-100 text-orange-700 border-orange-200";
    case "MEDIUM":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "LOW":
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function badgeStatus(st: AlertStatus) {
  switch (st) {
    case "OPEN":
      return "bg-slate-900 text-white border-slate-900";
    case "ACKNOWLEDGED":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "RESOLVED":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function typeLabel(t: string) {
  const x = (t || "").toUpperCase();
  if (x === "USAGE_THRESHOLD") return "Uso elevado";
  if (x === "RATE_LIMIT") return "Rate limit";
  if (x === "FAILED_AUTH") return "Intentos fallidos";
  if (x === "PATTERN_ANOMALY") return "Patrón anómalo";
  if (x === "SYSTEM_PROTECTION") return "Protección sistema";
  return t || "—";
}

function safeJson(v: any) {
  try {
    return JSON.stringify(v ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function fmtDuration(seconds: number | null | undefined) {
  if (seconds == null || !isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${ss}s`;
  return `${ss}s`;
}

function slaClass(level: SlaLevel) {
  switch (level) {
    case "ok":
      return "text-emerald-700";
    case "warn":
      return "text-amber-700";
    case "bad":
      return "text-red-700";
    default:
      return "text-slate-900";
  }
}

function slaBadgeClass(level: SlaLevel) {
  switch (level) {
    case "ok":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "warn":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "bad":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

function slaLabel(level: SlaLevel) {
  if (level === "ok") return "OK";
  if (level === "warn") return "ALERTA";
  return "CRÍTICO";
}

function actionPill(a: AlertActionRow) {
  const t = (a.action_type || "").toUpperCase();
  if (t === "ACKNOWLEDGED") return "bg-blue-50 text-blue-700 border-blue-200";
  if (t === "RESOLVED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (t === "REOPENED") return "bg-slate-50 text-slate-700 border-slate-200";
  if (t === "NOTE") return "bg-violet-50 text-violet-700 border-violet-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

const DEFAULT_ABUSE_SETTINGS = {
  ack_warning_minutes: 15,
  ack_critical_minutes: 60,
  resolve_warning_minutes: 240,
  resolve_critical_minutes: 720,
} as const;

function clampMin1(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
}

function pickComparable(s: AbuseSettings | null) {
  if (!s) return null;
  return {
    ack_warning_minutes: Number(s.ack_warning_minutes),
    ack_critical_minutes: Number(s.ack_critical_minutes),
    resolve_warning_minutes: Number(s.resolve_warning_minutes),
    resolve_critical_minutes: Number(s.resolve_critical_minutes),
  };
}

export default function AdminAbusePage() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [error, setError] = useState<string>("");

  const [status, setStatus] = useState<AlertStatus | "ALL">("OPEN");

  // drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<AlertDetail | null>(null);

  // acciones
  const [note, setNote] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSavedMsg, setNoteSavedMsg] = useState<string>("");

  // timeline
  const [actionsLoading, setActionsLoading] = useState(false);
  const [actions, setActions] = useState<AlertActionRow[]>([]);
  const [actionsError, setActionsError] = useState<string>("");

  // Métricas
  const [kpiRange, setKpiRange] = useState<7 | 30 | 90>(30);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metrics, setMetrics] = useState<any>(null);

  // Abuse settings (SLA)
  const [abuseSettings, setAbuseSettings] = useState<AbuseSettings | null>(null);
  const [abuseSettingsSnapshot, setAbuseSettingsSnapshot] = useState<AbuseSettings | null>(null);

  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const configDirty = useMemo(() => {
    const a = pickComparable(abuseSettings);
    const b = pickComparable(abuseSettingsSnapshot);
    return JSON.stringify(a) !== JSON.stringify(b);
  }, [abuseSettings, abuseSettingsSnapshot]);

  const ackSlaLevel = useMemo<SlaLevel>(() => {
    const p95 = metrics?.p95_ack_seconds;
    if (p95 == null || !isFinite(p95)) return "ok";

    const warnMin = abuseSettings?.ack_warning_minutes ?? DEFAULT_ABUSE_SETTINGS.ack_warning_minutes;
    const critMin = abuseSettings?.ack_critical_minutes ?? DEFAULT_ABUSE_SETTINGS.ack_critical_minutes;

    const s = Math.max(0, Number(p95));
    if (s < warnMin * 60) return "ok";
    if (s < critMin * 60) return "warn";
    return "bad";
  }, [
    metrics?.p95_ack_seconds,
    abuseSettings?.ack_warning_minutes,
    abuseSettings?.ack_critical_minutes,
  ]);

  const resolveSlaLevel = useMemo<SlaLevel>(() => {
    const p95 = metrics?.p95_resolve_seconds;
    if (p95 == null || !isFinite(p95)) return "ok";

    const warnMin =
      abuseSettings?.resolve_warning_minutes ?? DEFAULT_ABUSE_SETTINGS.resolve_warning_minutes;
    const critMin =
      abuseSettings?.resolve_critical_minutes ?? DEFAULT_ABUSE_SETTINGS.resolve_critical_minutes;

    const s = Math.max(0, Number(p95));
    if (s < warnMin * 60) return "ok";
    if (s < critMin * 60) return "warn";
    return "bad";
  }, [
    metrics?.p95_resolve_seconds,
    abuseSettings?.resolve_warning_minutes,
    abuseSettings?.resolve_critical_minutes,
  ]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await admin_list_usage_alerts({
        status: status === "ALL" ? null : status,
        limit: 200,
        offset: 0,
      });
      setRows(Array.isArray(data) ? (data as AlertRow[]) : []);
    } catch (e: any) {
      setError(e?.message || "Error cargando alertas");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const loadMetrics = async () => {
    setMetricsLoading(true);
    try {
      const to = new Date();
      const from = new Date(to.getTime() - kpiRange * 24 * 60 * 60 * 1000);
      const m = await admin_usage_alert_metrics(from.toISOString(), to.toISOString());
      setMetrics(m);
    } catch {
      setMetrics(null);
    } finally {
      setMetricsLoading(false);
    }
  };

  useEffect(() => {
    void loadMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpiRange]);

  const refreshDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const d = await admin_get_usage_alert(id);
      setDetail(d as AlertDetail);
      setNote((d as any)?.admin_notes ?? "");
    } finally {
      setDetailLoading(false);
    }
  };

  const loadAbuseSettings = async () => {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const s = await admin_get_abuse_settings();
      const next = (s as any) as AbuseSettings | null;

      // si viene null, dejamos un objeto base para poder editar igualmente
      const safe =
        next ??
        ({
          id: "default",
          ...DEFAULT_ABUSE_SETTINGS,
          updated_at: new Date().toISOString(),
          updated_by: null,
        } as any);

      setAbuseSettings(safe);
      setAbuseSettingsSnapshot(safe);
    } catch (e: any) {
      setConfigError(e?.message || "No se pudo cargar la configuración");
      setAbuseSettings(null);
      setAbuseSettingsSnapshot(null);
    } finally {
      setConfigLoading(false);
    }
  };

  useEffect(() => {
    void loadAbuseSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshActions = async (id: string) => {
    setActionsLoading(true);
    setActionsError("");
    try {
      const list = await admin_list_usage_alert_actions(id, 200, 0);
      setActions(Array.isArray(list) ? (list as AlertActionRow[]) : []);
    } catch (e: any) {
      setActionsError(e?.message || "Error cargando timeline");
      setActions([]);
    } finally {
      setActionsLoading(false);
    }
  };

  const openDrawer = async (id: string) => {
    setSelectedId(id);
    setDrawerOpen(true);
    setDetail(null);
    setError("");
    setNote("");
    setActions([]);
    setActionsError("");
    await Promise.all([refreshDetail(id), refreshActions(id)]);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedId(null);
    setDetail(null);
    setNote("");
    setActions([]);
    setActionsError("");
  };

  const countOpen = useMemo(() => rows.filter((r) => r.status === "OPEN").length, [rows]);
  const countHigh = useMemo(
    () => rows.filter((r) => r.severity === "HIGH" || r.severity === "CRITICAL").length,
    [rows]
  );
  const countFailedAuth = useMemo(
    () => rows.filter((r) => (r.alert_type || "").toUpperCase() === "FAILED_AUTH").length,
    [rows]
  );

  const doAck = async () => {
    if (!selectedId) return;
    setActionLoading(true);
    setError("");
    try {
      await admin_ack_usage_alert(selectedId, note || null);
      await Promise.all([load(), refreshDetail(selectedId), refreshActions(selectedId)]);
    } catch (e: any) {
      setError(e?.message || "No se pudo marcar como revisada");
    } finally {
      setActionLoading(false);
    }
  };

  const doResolve = async () => {
    if (!selectedId) return;
    setActionLoading(true);
    setError("");
    try {
      await admin_resolve_usage_alert(selectedId, note || null);
      await Promise.all([load(), refreshDetail(selectedId), refreshActions(selectedId)]);
    } catch (e: any) {
      setError(e?.message || "No se pudo resolver");
    } finally {
      setActionLoading(false);
    }
  };

  const doReopen = async () => {
    if (!selectedId) return;
    setActionLoading(true);
    setError("");
    try {
      await admin_reopen_usage_alert(selectedId, note || null);
      await Promise.all([load(), refreshDetail(selectedId), refreshActions(selectedId)]);
    } catch (e: any) {
      setError(e?.message || "No se pudo reabrir");
    } finally {
      setActionLoading(false);
    }
  };

  const doSaveNote = async () => {
    if (!selectedId) return;
    const n = (note || "").trim();
    if (!n) {
      setError("La nota está vacía.");
      return;
    }

    setNoteSaving(true);
    setNoteSavedMsg("");
    setError("");

    try {
      await admin_add_usage_alert_note(selectedId, n);
      await Promise.all([refreshDetail(selectedId), refreshActions(selectedId)]);
      setNoteSavedMsg("Nota guardada en timeline.");
      setTimeout(() => setNoteSavedMsg(""), 1800);
    } catch (e: any) {
      setError(e?.message || "No se pudo guardar la nota");
    } finally {
      setNoteSaving(false);
    }
  };

  return (
    <div className="relative space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Uso y abuso</h1>
          <p className="text-xs text-slate-500">
            Monitorización operativa: alertas de consumo, seguridad y patrones anómalos.
          </p>
        </div>
        <button
          onClick={load}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {loading ? "Cargando…" : "Refrescar alertas"}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Alertas activas</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{countOpen}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Severidad alta</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{countHigh}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Seguridad (failed auth)</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{countFailedAuth}</p>
        </div>

        {/* ACK con SLA */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">T. medio ACK</p>

          <p className={cx("mt-1 text-2xl font-semibold", slaClass(ackSlaLevel))}>
            {metricsLoading ? "…" : fmtDuration(metrics?.avg_ack_seconds)}
          </p>

          <div className="mt-2 flex items-center gap-2">
            <span
              className={cx(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                slaBadgeClass(ackSlaLevel)
              )}
            >
              SLA {slaLabel(ackSlaLevel)}
            </span>

            <span className="text-[11px] text-slate-500">
              P95: {metricsLoading ? "…" : fmtDuration(metrics?.p95_ack_seconds)}
            </span>
          </div>

          <p className="mt-1 text-[11px] text-slate-500">Rango: {kpiRange} días</p>
          <p className="mt-1 text-[11px] text-slate-500">
            SLA violado (ACK): {metricsLoading ? "…" : (metrics?.sla_ack_violations ?? "—")}
          </p>
        </div>

        {/* RESOLVE con SLA */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">T. medio RESOLVE</p>

          <p className={cx("mt-1 text-2xl font-semibold", slaClass(resolveSlaLevel))}>
            {metricsLoading ? "…" : fmtDuration(metrics?.avg_resolve_seconds)}
          </p>

          <div className="mt-2 flex items-center gap-2">
            <span
              className={cx(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                slaBadgeClass(resolveSlaLevel)
              )}
            >
              SLA {slaLabel(resolveSlaLevel)}
            </span>

            <span className="text-[11px] text-slate-500">
              P95: {metricsLoading ? "…" : fmtDuration(metrics?.p95_resolve_seconds)}
            </span>
          </div>

          <p className="mt-1 text-[11px] text-slate-500">
            Reabiertas: {metricsLoading ? "…" : (metrics?.reopened_events ?? "—")}
          </p>

          <p className="mt-1 text-[11px] text-slate-500">
            SLA violado (RESOLVE): {metricsLoading ? "…" : (metrics?.sla_resolve_violations ?? "—")}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <label className="text-[10px] uppercase text-slate-500">Estado</label>
            <select
              className="mt-1 w-56 rounded-lg border px-2.5 py-1.5 text-xs"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
            >
              <option value="OPEN">Abiertas</option>
              <option value="ACKNOWLEDGED">Revisadas</option>
              <option value="RESOLVED">Resueltas</option>
              <option value="ALL">Todas</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] uppercase text-slate-500">KPIs</label>
            <select
              className="mt-1 w-32 rounded-lg border px-2.5 py-1.5 text-xs"
              value={kpiRange}
              onChange={(e) => setKpiRange(Number(e.target.value) as any)}
            >
              <option value={7}>7 días</option>
              <option value={30}>30 días</option>
              <option value={90}>90 días</option>
            </select>
          </div>

          <div className="text-xs text-slate-600">
            {loading ? "Cargando…" : `${rows.length} alertas`}
          </div>
        </div>
      </div>

      {/* Tabla */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Alertas</h2>
        </div>

        {error && <div className="mb-3 text-xs text-red-600">{error}</div>}

        <div className="overflow-auto">
          <DataTable>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Cliente</Th>
                <Th>Tipo</Th>
                <Th>Severidad</Th>
                <Th>Motivo</Th>
                <Th>Estado</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading ? (
                <Tr>
                  <Td colSpan={7 as any} className="py-6 text-center text-xs">
                    No hay alertas.
                  </Td>
                </Tr>
              ) : (
                rows.map((r) => (
                  <Tr key={r.id}>
                    <Td>{new Date(r.detected_at).toLocaleString()}</Td>
                    <Td>
                      <div className="min-w-[180px]">
                        <div className="text-sm text-slate-900">
                          {r.customer_name || r.customer_email || "—"}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {r.customer_email || r.customer_id}
                        </div>
                      </div>
                    </Td>
                    <Td>{typeLabel(r.alert_type)}</Td>
                    <Td>
                      <span
                        className={cx(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                          badgeSeverity(r.severity)
                        )}
                      >
                        {r.severity}
                      </span>
                    </Td>
                    <Td className="max-w-[520px]">
                      <span className="block truncate text-sm text-slate-700" title={r.reason}>
                        {r.reason}
                      </span>
                    </Td>
                    <Td>
                      <span
                        className={cx(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                          badgeStatus(r.status)
                        )}
                      >
                        {r.status}
                      </span>
                    </Td>
                    <Td>
                      <button
                        onClick={() => openDrawer(r.id)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Ver
                      </button>
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </DataTable>
        </div>
      </section>

      {/* Configuración (SLA + placeholders) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Configuración de protección</h2>
            <p className="text-xs text-slate-500">
              Rate limit, umbrales y SLA (ACK/RESOLVE) configurables.
            </p>
          </div>

          <button
            type="button"
            onClick={loadAbuseSettings}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {configLoading ? "…" : "Refrescar"}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-500">rate_limit</p>
            <p className="text-sm font-semibold text-slate-900">120 req/min</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-500">abuse_threshold</p>
            <p className="text-sm font-semibold text-slate-900">80%</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-900">SLA de alertas (minutos)</p>
              <p className="mt-1 text-xs text-slate-500">
                Warning &lt; Critical. Se usa para clasificar OK / ALERTA / CRÍTICO.
              </p>
            </div>

            <div className="text-[11px] text-slate-500">
              {abuseSettings?.updated_at ? (
                <>Actualizado: {new Date(abuseSettings.updated_at).toLocaleString()}</>
              ) : (
                <>—</>
              )}
            </div>
          </div>

          {configError ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {configError}
            </div>
          ) : null}

          {configLoading ? (
            <div className="mt-3 text-xs text-slate-500">Cargando configuración…</div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-900">ACK</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[11px] text-slate-500">Warning</span>
                    <input
                      type="number"
                      min={1}
                      value={abuseSettings?.ack_warning_minutes ?? ""}
                      onChange={(e) => {
                        if (!abuseSettings) return;
                        const n = clampMin1(e.target.value);
                        setAbuseSettings({ ...abuseSettings, ack_warning_minutes: n });
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-400"
                      placeholder="15"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[11px] text-slate-500">Critical</span>
                    <input
                      type="number"
                      min={1}
                      value={abuseSettings?.ack_critical_minutes ?? ""}
                      onChange={(e) => {
                        if (!abuseSettings) return;
                        const n = clampMin1(e.target.value);
                        setAbuseSettings({ ...abuseSettings, ack_critical_minutes: n });
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-400"
                      placeholder="60"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-900">RESOLVE</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[11px] text-slate-500">Warning</span>
                    <input
                      type="number"
                      min={1}
                      value={abuseSettings?.resolve_warning_minutes ?? ""}
                      onChange={(e) => {
                        if (!abuseSettings) return;
                        const n = clampMin1(e.target.value);
                        setAbuseSettings({ ...abuseSettings, resolve_warning_minutes: n });
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-400"
                      placeholder="240"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[11px] text-slate-500">Critical</span>
                    <input
                      type="number"
                      min={1}
                      value={abuseSettings?.resolve_critical_minutes ?? ""}
                      onChange={(e) => {
                        if (!abuseSettings) return;
                        const n = clampMin1(e.target.value);
                        setAbuseSettings({ ...abuseSettings, resolve_critical_minutes: n });
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-400"
                      placeholder="720"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"

              disabled={configLoading || configSaving || !abuseSettings || !configDirty}
              onClick={async () => {
                if (!abuseSettings) return;

                const aw = Number(abuseSettings.ack_warning_minutes);
                const ac = Number(abuseSettings.ack_critical_minutes);
                const rw = Number(abuseSettings.resolve_warning_minutes);
                const rc = Number(abuseSettings.resolve_critical_minutes);

                if ([aw, ac, rw, rc].some((n) => !Number.isFinite(n) || n <= 0)) {
                  setConfigError("Todos los valores deben ser números mayores que 0.");
                  return;
                }
                if (!(aw < ac)) {
                  setConfigError("ACK: Warning debe ser menor que Critical.");
                  return;
                }
                if (!(rw < rc)) {
                  setConfigError("RESOLVE: Warning debe ser menor que Critical.");
                  return;
                }

                setConfigError(null);

                try {
                  setConfigSaving(true);
                  await admin_update_abuse_settings({
                    ack_warning_minutes: aw,
                    ack_critical_minutes: ac,
                    resolve_warning_minutes: rw,
                    resolve_critical_minutes: rc,
                  });

                  // recargar para ver updated_at
                  await loadAbuseSettings();

                  // refrescar KPIs (para que cambie SLA inmediatamente)
                  await loadMetrics();
                } catch (e: any) {
                  setConfigError(e?.message || "No se pudo guardar la configuración");
                } finally {
                  setConfigSaving(false);
                }
              }}
              className={cx(
                "rounded-xl px-4 py-2 text-sm font-semibold border",
                "border-slate-900 bg-slate-900 text-white hover:bg-slate-800",
                (configLoading || configSaving || !abuseSettings || !configDirty) && "opacity-50 cursor-not-allowed"
              )}
            >
              {configSaving ? "Guardando…" : "Guardar cambios"}
            </button>

            <button
              type="button"
              disabled={configLoading || configSaving}
              onClick={loadAbuseSettings}
              className={cx(
                "rounded-xl px-4 py-2 text-sm font-semibold border",
                "border-slate-200 text-slate-700 hover:bg-slate-50",
                (configLoading || configSaving) && "opacity-50 cursor-not-allowed"
              )}
            >
              Cancelar
            </button>

            {configDirty ? (
              <span className="text-xs text-amber-700">Cambios sin guardar</span>
            ) : (
              <span className="text-xs text-slate-500">Sin cambios</span>
            )}
          </div>
        </div>
      </section>





      {/* Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={closeDrawer} />
          <aside className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs text-slate-500">Detalle de alerta</p>
                <h3 className="truncate text-base font-semibold text-slate-900">
                  {detail?.reason || "Cargando…"}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  ID: <span className="font-mono">{selectedId}</span>
                </p>
              </div>

              <button
                onClick={closeDrawer}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>

            <div className="h-[calc(100%-65px)] overflow-auto px-5 py-4">
              {error && <div className="mb-3 text-xs text-red-600">{error}</div>}

              {detailLoading ? (
                <div className="text-sm text-slate-600">Cargando detalle…</div>
              ) : !detail ? (
                <div className="text-sm text-slate-600">No hay detalle disponible.</div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs text-slate-500">Tipo</p>
                      <p className="text-sm font-semibold text-slate-900">{typeLabel(detail.alert_type)}</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs text-slate-500">Severidad</p>
                      <span
                        className={cx(
                          "mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                          badgeSeverity(detail.severity)
                        )}
                      >
                        {detail.severity}
                      </span>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs text-slate-500">Estado</p>
                      <span
                        className={cx(
                          "mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                          badgeStatus(detail.status)
                        )}
                      >
                        {detail.status}
                      </span>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs text-slate-500">Detectada</p>
                      <p className="text-sm font-semibold text-slate-900">
                        {new Date(detail.detected_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Notas */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold text-slate-900">Notas internas</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Se guarda en la alerta (solo visible para admin).
                    </p>
                    <textarea
                      className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-slate-400"
                      rows={4}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Añade una nota (opcional)…"
                    />
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={doSaveNote}
                        disabled={noteSaving || !(note || "").trim()}
                        className={cx(
                          "rounded-xl px-3 py-2 text-sm font-semibold border",
                          noteSaving
                            ? "border-slate-200 text-slate-400"
                            : "border-violet-200 text-violet-700 hover:bg-violet-50",
                          !(note || "").trim() && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {noteSaving ? "Guardando…" : "Guardar nota"}
                      </button>

                      {noteSavedMsg ? <span className="text-xs text-emerald-600">{noteSavedMsg}</span> : null}
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-900">Timeline (auditoría)</p>
                      <button
                        onClick={() => selectedId && refreshActions(selectedId)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        disabled={actionsLoading || !selectedId}
                      >
                        {actionsLoading ? "Cargando…" : "Refrescar"}
                      </button>
                    </div>

                    {actionsError && <div className="mt-2 text-xs text-red-600">{actionsError}</div>}

                    <div className="mt-3 space-y-2">
                      {actionsLoading ? (
                        <div className="text-sm text-slate-600">Cargando timeline…</div>
                      ) : actions.length === 0 ? (
                        <div className="text-sm text-slate-600">Sin acciones registradas.</div>
                      ) : (
                        actions.map((a) => (
                          <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={cx(
                                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                                      actionPill(a)
                                    )}
                                  >
                                    {(a.action_type || "ACTION").toUpperCase()}
                                  </span>

                                  {(a.from_status || a.to_status) && (
                                    <span className="text-[11px] text-slate-600">
                                      {(a.from_status || "—").toUpperCase()} <span className="mx-1">→</span>{" "}
                                      {(a.to_status || "—").toUpperCase()}
                                    </span>
                                  )}
                                </div>

                                <p className="mt-1 text-[11px] text-slate-500">
                                  {new Date(a.created_at).toLocaleString()}
                                  {a.actor_email ? (
                                    <>
                                      {" "}
                                      · <span className="font-medium">{a.actor_email}</span>
                                    </>
                                  ) : null}
                                </p>

                                {a.note ? (
                                  <p className="mt-2 text-sm text-slate-800 whitespace-pre-wrap">{a.note}</p>
                                ) : null}

                                {(a.ip || a.user_agent) && (
                                  <details className="mt-2">
                                    <summary className="cursor-pointer text-[11px] text-slate-500">Datos técnicos</summary>
                                    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-700">
                                      {a.ip ? (
                                        <div>
                                          <span className="text-slate-500">IP:</span>{" "}
                                          <span className="font-mono">{a.ip}</span>
                                        </div>
                                      ) : null}
                                      {a.user_agent ? (
                                        <div className="mt-1">
                                          <span className="text-slate-500">UA:</span>{" "}
                                          <span className="break-words">{a.user_agent}</span>
                                        </div>
                                      ) : null}
                                    </div>
                                  </details>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Detail JSON */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="mb-2 text-xs font-semibold text-slate-900">Detail (técnico)</p>
                    <pre className="whitespace-pre-wrap break-words rounded-xl bg-white p-3 text-[11px] text-slate-800 border border-slate-200">
                      {safeJson(detail.detail)}
                    </pre>
                  </div>

                  {/* Acciones */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold text-slate-900">Acciones</p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={doAck}
                        disabled={actionLoading || detail.status === "ACKNOWLEDGED" || detail.status === "RESOLVED"}
                        className={cx(
                          "rounded-xl px-3 py-2 text-sm font-semibold border",
                          actionLoading
                            ? "border-slate-200 text-slate-400"
                            : "border-blue-200 text-blue-700 hover:bg-blue-50",
                          (detail.status === "ACKNOWLEDGED" || detail.status === "RESOLVED") &&
                            "opacity-50 cursor-not-allowed"
                        )}
                      >
                        Marcar revisada
                      </button>

                      <button
                        onClick={doResolve}
                        disabled={actionLoading || detail.status === "RESOLVED"}
                        className={cx(
                          "rounded-xl px-3 py-2 text-sm font-semibold border",
                          actionLoading
                            ? "border-slate-200 text-slate-400"
                            : "border-emerald-200 text-emerald-700 hover:bg-emerald-50",
                          detail.status === "RESOLVED" && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        Resolver
                      </button>

                      <button
                        onClick={doReopen}
                        disabled={actionLoading || detail.status === "OPEN"}
                        className={cx(
                          "rounded-xl px-3 py-2 text-sm font-semibold border",
                          actionLoading
                            ? "border-slate-200 text-slate-400"
                            : "border-slate-200 text-slate-700 hover:bg-slate-50",
                          detail.status === "OPEN" && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        Reabrir
                      </button>
                    </div>

                    {actionLoading && <p className="mt-2 text-xs text-slate-500">Aplicando acción…</p>}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
