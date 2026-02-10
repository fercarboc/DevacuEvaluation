import React, { useEffect, useMemo, useRef, useState } from "react";
import { PlanTier } from "../../auditor";
import { FileText, Table, AlertCircle, Download, CheckCircle2, RefreshCw } from "lucide-react";
import { callEvalFn } from "@/services/callEvalFn";

interface ExportsViewAuditorProps {
  currentPlan: PlanTier;
}

type ExportType = "PDF" | "CSV";
type ExportScope =
  | "KPIS_MONTHLY"
  | "INCIDENTS_BY_TYPE_MONTHLY"
  | "INCIDENTS_100_STAYS_MONTHLY"
  | "TOP_MISSING_ITEMS"
  | "SECTOR_CATEGORY_INCIDENT"
  | "OUTLIER_HOTELS"
  | "ADR_EFFECTIVE";

// ✅ soporta ambos estados por compatibilidad (COMPLETED legacy vs READY new)
type ExportStatus = "PENDING" | "COMPLETED" | "READY" | "FAILED";

type ExportRow = {
  id: string;
  org_id: string;
  app_id: string;

  requested_by_user_id: string;
  requested_by_role: string | null;
  requested_by_email: string | null;

  export_type: ExportType;
  export_scope: ExportScope;
  period_from: string; // date
  period_to: string; // date
  filters: any | null;

  row_count: number | null;
  sha256: string | null;
  file_size_bytes: number | null;
  storage_bucket: string;
  storage_path: string;

  status: ExportStatus;
  error_code: string | null;
  error_message: string | null;

  created_at: string; // timestamptz
};

function fmtBytes(n?: number | null) {
  if (!n || n <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function badge(status: ExportStatus) {
  if (status === "COMPLETED" || status === "READY") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "FAILED") return "bg-red-50 text-red-700 border-red-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function scopeLabel(s: ExportScope) {
  switch (s) {
    case "KPIS_MONTHLY":
      return "KPIs mensuales";
    case "INCIDENTS_BY_TYPE_MONTHLY":
      return "Incidencias por tipo (mensual)";
    case "INCIDENTS_100_STAYS_MONTHLY":
      return "Incidencias / 100 estancias";
    case "TOP_MISSING_ITEMS":
      return "Top objetos perdidos";
    case "SECTOR_CATEGORY_INCIDENT":
      return "Sector: categoría vs incidente";
    case "OUTLIER_HOTELS":
      return "Hoteles outlier";
    case "ADR_EFFECTIVE":
      return "ADR efectivo";
    default:
      return s;
  }
}

const ExportsViewAuditor: React.FC<ExportsViewAuditorProps> = ({ currentPlan }) => {
  const isPremium = currentPlan === PlanTier.PREMIUM;

  // Defaults: últimos 30 días
  const today = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, [today]);
  const defaultTo = useMemo(() => today.toISOString().slice(0, 10), [today]);

  const [exportScope, setExportScope] = useState<ExportScope>("KPIS_MONTHLY");
  const [periodFrom, setPeriodFrom] = useState<string>(defaultFrom);
  const [periodTo, setPeriodTo] = useState<string>(defaultTo);

  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [exports, setExports] = useState<ExportRow[]>([]);

  const [monthUsed, setMonthUsed] = useState<number | null>(null);
  const [monthLimit, setMonthLimit] = useState<number | null>(null);

  // 🔒 Bloqueo duro anti re-entrada (el fix del “bucle” real)
  const runLockRef = useRef(false);

  // 🛑 Cancelación de polling si desmonta / cambias de página
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  useEffect(() => {
    cancelRef.current.cancelled = false;
    return () => {
      cancelRef.current.cancelled = true;
    };
  }, []);

  const reload = async () => {
    setListLoading(true);
    setError(null);
    try {
      type ListResp = {
        ok: true;
        org_id: string;
        app_id: string;
        exports: ExportRow[];
        month_used?: number;
        month_limit?: number;
      };

      const r = await callEvalFn<ListResp>("customer_audit_exports_list", {
        limit: 25,
        offset: 0,
      });

      if (cancelRef.current.cancelled) return;

      setExports(r.exports ?? []);
      setMonthUsed(typeof r.month_used === "number" ? r.month_used : null);
      setMonthLimit(typeof r.month_limit === "number" ? r.month_limit : null);
    } catch (e) {
      if (cancelRef.current.cancelled) return;
      setError(e instanceof Error ? e.message : "LIST_FAILED");
    } finally {
      if (!cancelRef.current.cancelled) setListLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validateRange = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(periodTo)) {
      return "Formato de fecha inválido (usa YYYY-MM-DD).";
    }
    if (periodFrom > periodTo) return "La fecha 'Desde' no puede ser posterior a 'Hasta'.";
    return null;
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const runExport = async (type: ExportType) => {
    // 🔒 si entra dos veces por doble click / doble handler: cortamos
    if (runLockRef.current) return;
    runLockRef.current = true;

    const v = validateRange();
    if (v) {
      setError(v);
      runLockRef.current = false;
      return;
    }

    setLoading(true);
    setError(null);

    try {
      type GenerateResp = {
        ok: true;
        export_id: string;
        status: ExportStatus;
      };

      // ⚠️ No mandes storage_bucket (que lo decida backend). Y filters siempre objeto.
      const r = await callEvalFn<GenerateResp>("customer_audit_export_generate", {
        export_type: type,
        export_scope: exportScope,
        period_from: periodFrom,
        period_to: periodTo,
        filters: {}, // ✅ nunca null
      });

      if (cancelRef.current.cancelled) return;

      const exportId = r.export_id;
      if (!exportId) throw new Error("missing_export_id");

      // refresca una vez
      await reload();
      if (cancelRef.current.cancelled) return;

      // polling ligero hasta READY/COMPLETED/FAILED
      const maxTries = 10;
      for (let i = 0; i < maxTries; i++) {
        if (cancelRef.current.cancelled) return;
        await sleep(1200);
        if (cancelRef.current.cancelled) return;

        type ListOnly = { ok: true; exports: ExportRow[] };
        const latest = await callEvalFn<ListOnly>("customer_audit_exports_list", {
          limit: 25,
          offset: 0,
        });

        if (cancelRef.current.cancelled) return;

        const rows = latest.exports ?? [];
        setExports(rows);

        const st = rows.find((x) => x.id === exportId)?.status ?? null;
        if (st === "COMPLETED" || st === "READY" || st === "FAILED") break;
      }
    } catch (e) {
      if (!cancelRef.current.cancelled) {
        setError(e instanceof Error ? e.message : "EXPORT_FAILED");
      }
    } finally {
      if (!cancelRef.current.cancelled) setLoading(false);
      runLockRef.current = false; // 🔓
    }
  };

  const downloadExport = async (row: ExportRow) => {
    if (row.status !== "COMPLETED" && row.status !== "READY") return;

    setError(null);
    try {
      type DownloadResp = { ok: true; url: string; export_id: string; expires_in?: number };

      const r = await callEvalFn<DownloadResp>("customer_audit_export_download", {
        export_id: row.id,
      });

      window.open(r.url, "_blank", "noopener,noreferrer");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "DOWNLOAD_FAILED");
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-slate-800">Exportaciones</h2>
        <p className="text-slate-500">Descarga informes operativos para análisis externo o presentación interna.</p>
      </div>

      {/* Controles */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Scope</label>
            <select
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white"
              value={exportScope}
              onChange={(e) => setExportScope(e.target.value as ExportScope)}
            >
              <option value="KPIS_MONTHLY">KPIs mensuales</option>
              <option value="INCIDENTS_BY_TYPE_MONTHLY">Incidencias por tipo (mensual)</option>
              <option value="INCIDENTS_100_STAYS_MONTHLY">Incidencias / 100 estancias</option>
              <option value="TOP_MISSING_ITEMS">Top objetos perdidos</option>
              <option value="SECTOR_CATEGORY_INCIDENT">Sector: categoría vs incidente</option>
              <option value="OUTLIER_HOTELS">Hoteles outlier</option>
              <option value="ADR_EFFECTIVE">ADR efectivo</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Desde</label>
            <input
              type="date"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Hasta</label>
            <input
              type="date"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => void reload()}
              disabled={listLoading}
              className="w-full border border-slate-200 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw size={18} className={listLoading ? "animate-spin" : ""} />
              Refrescar
            </button>
          </div>
        </div>

        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div>}

        {(monthUsed !== null || monthLimit !== null) && !isPremium && (
          <div className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl p-3">
            Uso mensual: <span className="font-bold">{monthUsed ?? "-"}</span> /{" "}
            <span className="font-bold">{monthLimit ?? "-"}</span> exportaciones.
          </div>
        )}
      </div>

      {/* Tarjetas Export */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center text-center space-y-6">
          <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center">
            <FileText size={40} />
          </div>
          <div>
            <h3 className="font-bold text-lg">Informe PDF</h3>
            <p className="text-sm text-slate-500 mt-2">
              Documento auditable (resumen + tabla). Si quieres “PDF bonito con gráficos” lo hacemos después (requiere
              pipeline extra).
            </p>
          </div>
          <button
            disabled={loading}
            onClick={() => void runExport("PDF")}
            className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Download size={18} />
            {loading ? "Generando..." : "Exportar PDF"}
          </button>
        </div>

        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center">
            <Table size={40} />
          </div>
          <div>
            <h3 className="font-bold text-lg">Datos Crudos (CSV/Excel)</h3>
            <p className="text-sm text-slate-500 mt-2">CSV completo para BI externo. (Excel lo abres desde CSV sin problemas.)</p>
          </div>
          <button
            disabled={loading}
            onClick={() => void runExport("CSV")}
            className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Download size={18} />
            {loading ? "Generando..." : "Exportar CSV"}
          </button>
        </div>
      </div>

      {/* Historial exports */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800">Historial de exportaciones</h3>
          <span className="text-xs text-slate-500">Últimas {exports.length} (máx. 25)</span>
        </div>

        <div className="overflow-auto border border-slate-100 rounded-xl">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="text-left px-4 py-3 font-bold">Fecha</th>
                <th className="text-left px-4 py-3 font-bold">Scope</th>
                <th className="text-left px-4 py-3 font-bold">Tipo</th>
                <th className="text-left px-4 py-3 font-bold">Estado</th>
                <th className="text-left px-4 py-3 font-bold">Filas</th>
                <th className="text-left px-4 py-3 font-bold">Tamaño</th>
                <th className="text-right px-4 py-3 font-bold">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {exports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    No hay exportaciones todavía.
                  </td>
                </tr>
              ) : (
                exports.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">{fmtDateTime(r.created_at)}</td>
                    <td className="px-4 py-3 text-slate-700">{scopeLabel(r.export_scope)}</td>
                    <td className="px-4 py-3 text-slate-700">{r.export_type}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold border ${badge(r.status)}`}
                        title={r.status === "FAILED" ? r.error_message ?? "Error" : ""}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{r.row_count ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{fmtBytes(r.file_size_bytes)}</td>
                    <td className="px-4 py-3 text-right">
                      {r.status === "COMPLETED" || r.status === "READY" ? (
                        <button
                          onClick={() => void downloadExport(r)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800"
                        >
                          <Download size={16} />
                          Descargar
                        </button>
                      ) : r.status === "FAILED" ? (
                        <span className="text-xs text-red-600 font-bold">Falló</span>
                      ) : (
                        <span className="text-xs text-slate-500 font-bold">Procesando…</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info legal */}
      <div className="bg-white p-8 rounded-2xl border border-slate-200 space-y-6">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <AlertCircle size={20} className="text-indigo-600" />
          Información Importante de Exportación
        </h3>
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="w-5 h-5 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center shrink-0 mt-0.5">
              <CheckCircle2 size={12} />
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              El hotel es <span className="font-bold">exclusivamente responsable</span> del uso, custodia y eliminación segura de los datos una vez exportados del sistema Evaluation360.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="w-5 h-5 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center shrink-0 mt-0.5">
              <CheckCircle2 size={12} />
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Las exportaciones quedan trazadas (quién, qué, cuándo). El acceso posterior se registra mediante descargas auditadas.
            </p>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100">
          {isPremium ? (
            <p className="text-xs font-bold text-emerald-600 bg-emerald-50 p-3 rounded-lg text-center uppercase tracking-wide">
              Tu plan PREMIUM permite exportaciones ilimitadas e indicadores preparados para API.
            </p>
          ) : (
            <p className="text-xs font-bold text-indigo-600 bg-indigo-50 p-3 rounded-lg text-center uppercase tracking-wide">
              Plan MEDIUM: Límite de 10 exportaciones mensuales. Actualiza a PREMIUM para uso ilimitado.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExportsViewAuditor;
