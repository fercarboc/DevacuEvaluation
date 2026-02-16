import React, { useEffect, useMemo, useRef, useState } from "react";
import { PlanTier } from "../../auditor";
import { AlertCircle, CheckCircle2, Download, FileText, RefreshCw, Table } from "lucide-react";
import { callEvalFn } from "@/services/callEvalFn";

interface ExportsViewAuditorProps {
  currentPlan: PlanTier;
}

type ExportType = "PDF" | "CSV";

/**
 * ✅ Reordenado: #1 es “Incidencias por plataforma (mensual)”
 * ✅ UI: SOLO dejamos las 3 opciones que de verdad vais a usar (80% uso real).
 * ✅ Añadido: toggle "Usar created_at" (period_field) para casos especiales.
 */
type ExportScope =
  | "INCIDENTS_BY_PLATFORM_MONTHLY" // ✅ #1
  | "INCIDENTS_BY_TYPE_MONTHLY"
  | "ECONOMIC_IMPACT_MONTHLY"
  // legacy (para histórico en tabla)
  | "KPIS_MONTHLY"
  | "INCIDENTS_100_STAYS_MONTHLY"
  | "TOP_MISSING_ITEMS"
  | "SECTOR_CATEGORY_INCIDENT"
  | "OUTLIER_HOTELS"
  | "ADR_EFFECTIVE"
  | "AUDIT_LOG";

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
    case "INCIDENTS_BY_PLATFORM_MONTHLY":
      return "Incidencias por plataforma (mensual)";
    case "INCIDENTS_BY_TYPE_MONTHLY":
      return "Incidencias por tipo (mensual)";
    case "ECONOMIC_IMPACT_MONTHLY":
      return "Impacto económico (mensual)";
    case "AUDIT_LOG":
      return "Log de auditoría (uso del sistema)";
    case "KPIS_MONTHLY":
      return "KPIs mensuales";
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

function extFromType(t: ExportType) {
  return t === "PDF" ? "pdf" : "csv";
}

function safeFilename(s: string) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

type ScopeInfo = {
  title: string;
  what: string[];
  how: string[];
  tips?: string[];
  note?: string;
};

const SCOPE_INFO: Record<ExportScope, ScopeInfo> = {
  // ✅ #1
  INCIDENTS_BY_PLATFORM_MONTHLY: {
    title: "Incidencias por plataforma (mensual) — lo que más pide un hotel",
    what: [
      "Conteo de incidencias agrupadas por mes y plataforma (Booking/Airbnb/Expedia/etc.).",
      "Incluye impacto económico agregado (gross / recovered / net_loss) si hay datos.",
    ],
    how: [
      "Ver qué canal trae más problemas y ajustar políticas (depósitos, preautorización, filtros).",
      "Negociar con OTAs o cambiar mix de canales.",
    ],
    tips: ["Para Excel/BI usa CSV. Para entregar a auditoría usa PDF (A4 apaisado)."],
    note: "Se calcula con debacu_evaluations por rango de fechas. Si no hay importes, las columnas económicas saldrán a 0.",
  },

  INCIDENTS_BY_TYPE_MONTHLY: {
    title: "Incidencias por tipo (mensual)",
    what: ["Conteo de incidencias por tipo agrupado por mes.", "Sirve para ver qué problema crece y cuándo."],
    how: ["Priorizar acciones (formación, depósito, checklist, etc.).", "Medir impacto tras cambios de política."],
    tips: ["Si ves un tipo disparado, cruza con turnos/temporada."],
  },

  ECONOMIC_IMPACT_MONTHLY: {
    title: "Impacto económico (mensual)",
    what: ["Suma mensual de gross / recovered / net_loss.", "Te deja ver coste real del riesgo y recuperación."],
    how: ["Medir pérdidas netas por mes.", "Justificar medidas y ver ROI."],
    tips: ["Si tus net_loss son 0 siempre, te falta registrar importes o recuperación."],
  },

  // legacy info (por histórico)
  AUDIT_LOG: {
    title: "Log de auditoría (uso del sistema)",
    what: ["Acciones registradas (búsquedas, descargas, accesos, etc.).", "Útil para cumplimiento y trazabilidad."],
    how: ["Auditoría interna.", "Responder a incidencias o requerimientos."],
    tips: ["Ordena por created_at (lo normal)."],
  },
  KPIS_MONTHLY: {
    title: "KPIs mensuales (dirección / control)",
    what: ["Visión agregada por mes para control operativo.", "Útil para reporting interno y tendencia."],
    how: ["Comparar meses y detectar cambios bruscos.", "Seguimiento sin entrar al detalle."],
    tips: ["Ideal para BI en CSV."],
    note: "Este export es más de análisis que de “presentación”.",
  },
  INCIDENTS_100_STAYS_MONTHLY: {
    title: "Incidencias por 100 estancias (normalizado)",
    what: ["Métrica comparable aunque cambie el volumen de estancias."],
    how: ["Comparar periodos con distinta ocupación.", "Detectar deterioro real."],
    tips: ["Útil para justificar medidas."],
  },
  TOP_MISSING_ITEMS: {
    title: "Top objetos perdidos (inventory/riesgo)",
    what: ["Ranking de ítems más reportados.", "Base para ajustar depósitos e inventario."],
    how: ["Revisar qué objetos controlar mejor.", "Ajustar precios de reposición."],
    tips: ["Si el top no cuadra, revisa catálogo/etiquetado."],
  },
  SECTOR_CATEGORY_INCIDENT: {
    title: "Sector: categoría vs incidente (benchmark)",
    what: ["Comparativa por categoría/segmento para entender patrones."],
    how: ["Contextualizar el riesgo.", "Ajustar políticas por segmento."],
    tips: ["No es para culpar; es para decidir."],
  },
  OUTLIER_HOTELS: {
    title: "Hoteles outlier (señales anómalas)",
    what: ["Identifica valores fuera de rango (outliers).", "Útil para auditoría interna y datos raros."],
    how: ["Validar si hay errores de datos o patrones reales.", "Investigar picos."],
    tips: ["Primero revisa integridad/carga de datos."],
  },
  ADR_EFFECTIVE: {
    title: "ADR efectivo",
    what: ["Cálculo/estimación de ADR efectivo (según definición del sistema)."],
    how: ["Contrastar contra ADR real y revisar desviaciones.", "Ver impacto de estacionalidad/promos."],
    tips: ["Base para BI si quieres forecasting."],
  },
};

const USED_SCOPES: ExportScope[] = [
  "INCIDENTS_BY_PLATFORM_MONTHLY",
  "INCIDENTS_BY_TYPE_MONTHLY",
  "ECONOMIC_IMPACT_MONTHLY",
];

function getFiltersPeriodField(filters: any | null): "evaluation_date" | "created_at" {
  const pf = String(filters?.period_field ?? "evaluation_date").trim();
  return pf === "created_at" ? "created_at" : "evaluation_date";
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

  // ✅ por defecto el scope #1
  const [exportScope, setExportScope] = useState<ExportScope>("INCIDENTS_BY_PLATFORM_MONTHLY");
  const [periodFrom, setPeriodFrom] = useState<string>(defaultFrom);
  const [periodTo, setPeriodTo] = useState<string>(defaultTo);

  // ✅ toggle para period_field
  const [useCreatedAt, setUseCreatedAt] = useState<boolean>(false);

  const [loadingType, setLoadingType] = useState<ExportType | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [exports, setExports] = useState<ExportRow[]>([]);

  const [monthUsed, setMonthUsed] = useState<number | null>(null);
  const [monthLimit, setMonthLimit] = useState<number | null>(null);

  // 🔒 Bloqueo duro anti re-entrada
  const runLockRef = useRef(false);

  // 🛑 Cancelación si desmonta
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

      const rows = (r.exports ?? []).slice().sort((a, b) => {
        const ta = new Date(a.created_at).getTime();
        const tb = new Date(b.created_at).getTime();
        return tb - ta; // ✅ created_at DESC
      });

      setExports(rows);
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

  /**
   * Descarga directa SIN abrir nueva ventana:
   * - Intenta fetch -> blob -> anchor download.
   * - Si el navegador/CORS lo impide, fallback a navegar en la MISMA pestaña.
   */
  const downloadFileDirect = async (url: string, filename: string) => {
    try {
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) throw new Error(`download_http_${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(objectUrl);
      return;
    } catch {
      window.location.href = url;
    }
  };

  /**
   * ✅ genera + descarga usando customer_audit_export_build (Edge nueva)
   * Añadimos filters.period_field según toggle.
   */
  const runExport = async (type: ExportType) => {
    if (runLockRef.current) return;
    runLockRef.current = true;

    const v = validateRange();
    if (v) {
      setError(v);
      runLockRef.current = false;
      return;
    }

    setLoadingType(type);
    setError(null);

    type BuildResp = {
      ok: boolean;
      export_id?: string;
      status?: ExportStatus;
      url?: string | null; // ✅ tu Edge devuelve "url" (signed url)
      download_url?: string | null; // compat
      data?: {
        export_id?: string;
        status?: ExportStatus;
        url?: string | null;
        download_url?: string | null;
      };
      error?: string;
      detail?: string;
    };

    try {
      const filters = {
        period_field: useCreatedAt ? "created_at" : "evaluation_date",
      };

      const r = await callEvalFn<BuildResp>("customer_audit_export_build", {
        export_type: type,
        export_scope: exportScope,
        period_from: periodFrom,
        period_to: periodTo,
        filters, // ✅ nunca null, y con period_field
      });

      if (cancelRef.current.cancelled) return;

      const exportId = (r as any)?.export_id ?? (r as any)?.data?.export_id ?? null;
      if (!exportId) {
        const msg = (r as any)?.detail || (r as any)?.error || "missing_export_id";
        throw new Error(msg);
      }

      // refresca lista para que aparezca
      await reload();
      if (cancelRef.current.cancelled) return;

      const signedUrl =
        (r as any)?.url ??
        (r as any)?.download_url ??
        (r as any)?.data?.url ??
        (r as any)?.data?.download_url ??
        null;

      if (signedUrl) {
        const label = safeFilename(scopeLabel(exportScope));
        const ext = extFromType(type);
        const pf = useCreatedAt ? "created_at" : "evaluation_date";
        const fn = `${label}_${periodFrom}_${periodTo}_${pf}_${exportId}.${ext}`;
        await downloadFileDirect(signedUrl, fn);
        await reload();
        return;
      }

      // fallback: polling ligero (si no viene url)
      const maxTries = 10;
      for (let i = 0; i < maxTries; i++) {
        if (cancelRef.current.cancelled) return;
        await sleep(1200);
        if (cancelRef.current.cancelled) return;

        await reload();
        if (cancelRef.current.cancelled) return;

        const st = exports.find((x) => x.id === exportId)?.status ?? null;
        if (st === "COMPLETED" || st === "READY" || st === "FAILED") break;
      }
    } catch (e) {
      if (!cancelRef.current.cancelled) {
        setError(e instanceof Error ? e.message : "EXPORT_FAILED");
      }
    } finally {
      if (!cancelRef.current.cancelled) setLoadingType(null);
      runLockRef.current = false;
    }
  };

  /**
   * Descarga desde historial (legacy): customer_audit_export_download
   * (para exports antiguos / pipeline previo)
   */
  const downloadExport = async (row: ExportRow) => {
    if (row.status !== "COMPLETED" && row.status !== "READY") return;

    setError(null);
    try {
      type DownloadResp = {
        ok: true;
        url: string;
        export_id: string;
        expires_in?: number;
        export_type?: ExportType;
        export_scope?: ExportScope;
        period_from?: string;
        period_to?: string;
      };

      const r = await callEvalFn<DownloadResp>("customer_audit_export_download", {
        export_id: row.id,
      });

      const label = safeFilename(scopeLabel(row.export_scope));
      const ext = extFromType(row.export_type);
      const fn = `${label}_${row.period_from}_${row.period_to}_${row.id}.${ext}`;

      await downloadFileDirect(r.url, fn);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "DOWNLOAD_FAILED");
    }
  };

  // info card (si scope legacy, sigue mostrando su info)
  const info = SCOPE_INFO[exportScope] ?? {
    title: scopeLabel(exportScope),
    what: ["Export legacy."],
    how: ["Mantiene compatibilidad con histórico."],
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header compacto */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-slate-800">Exportaciones</h2>
          <p className="text-slate-500 text-sm">Genera archivos para auditoría, BI y reporting interno.</p>
        </div>

        {(monthUsed !== null || monthLimit !== null) && !isPremium && (
          <div className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2">
            Uso mensual: <span className="font-bold">{monthUsed ?? "-"}</span> /{" "}
            <span className="font-bold">{monthLimit ?? "-"}</span>
          </div>
        )}
      </div>

      {/* Panel superior */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Controles + acciones */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Scope</label>
              <select
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white"
                value={exportScope}
                onChange={(e) => setExportScope(e.target.value as ExportScope)}
              >
                {/* ✅ SOLO las 3 que se usan de verdad */}
                <option value="INCIDENTS_BY_PLATFORM_MONTHLY">Incidencias por plataforma (mensual)</option>
                <option value="INCIDENTS_BY_TYPE_MONTHLY">Incidencias por tipo (mensual)</option>
                <option value="ECONOMIC_IMPACT_MONTHLY">Impacto económico (mensual)</option>
              </select>
              <div className="text-[11px] text-slate-500">
                Hemos ocultado opciones poco usadas para evitar ruido. El histórico seguirá saliendo en la tabla.
              </div>
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

            <button
              onClick={() => void reload()}
              disabled={listLoading}
              className="w-full border border-slate-200 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
              title="Refresca la tabla de exportaciones"
            >
              <RefreshCw size={18} className={listLoading ? "animate-spin" : ""} />
              Refrescar
            </button>
          </div>

          {/* ✅ Toggle period_field */}
          <div className="flex items-start justify-between gap-3 border border-slate-200 rounded-xl px-3 py-2 bg-slate-50">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-slate-700">Campo de fecha</div>
              <div className="text-[11px] text-slate-600">
                Por defecto usamos <span className="font-bold">evaluation_date</span> (fecha del hecho). Activa esto
                solo si quieres filtrar por <span className="font-bold">created_at</span> (fecha de registro).
              </div>
            </div>

            <label className="inline-flex items-center gap-2 select-none cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={useCreatedAt}
                onChange={(e) => setUseCreatedAt(e.target.checked)}
              />
              <span className="text-xs font-bold text-slate-700">Usar created_at</span>
            </label>
          </div>

          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div>}

          <div className="flex flex-col md:flex-row gap-3">
            <button
              disabled={loadingType !== null}
              onClick={() => void runExport("PDF")}
              className="flex-1 bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <FileText size={18} />
              {loadingType === "PDF" ? "Generando PDF..." : "Generar PDF (A4 apaisado)"}
            </button>

            <button
              disabled={loadingType !== null}
              onClick={() => void runExport("CSV")}
              className="flex-1 bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Table size={18} />
              {loadingType === "CSV" ? "Generando CSV..." : "Generar CSV (BI/Excel)"}
            </button>
          </div>

          <div className="text-xs text-slate-500">
            Genera y descarga al momento (si hay URL firmada). Además queda en historial.
          </div>
        </div>

        {/* Card informativo */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-indigo-600" />
            <h3 className="font-bold text-slate-800 text-sm">¿Para qué sirve este export?</h3>
          </div>

          <div className="space-y-1">
            <div className="text-sm font-bold text-slate-800">{info.title}</div>
            {info.note && <div className="text-xs text-slate-500">{info.note}</div>}
          </div>

          <div className="space-y-2">
            <div>
              <div className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">Qué incluye</div>
              <ul className="text-sm text-slate-600 list-disc pl-5 space-y-1">
                {info.what.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>

            <div>
              <div className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">Cómo lo usa un hotel</div>
              <ul className="text-sm text-slate-600 list-disc pl-5 space-y-1">
                {info.how.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>

            {info.tips && info.tips.length > 0 && (
              <div className="border-t border-slate-100 pt-2">
                <div className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">Consejos</div>
                <ul className="text-sm text-slate-600 list-disc pl-5 space-y-1">
                  {info.tips.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="text-xs text-slate-500 border-t border-slate-100 pt-3">
            Importante: una vez descargado, el hotel es responsable de custodia y borrado seguro (RGPD).
          </div>
        </div>
      </div>

      {/* Historial */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800">Historial de exportaciones</h3>
          <span className="text-xs text-slate-500">Últimas {exports.length} (máx. 25) — ordenadas por created_at</span>
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
                exports.map((r) => {
                  const pf = getFiltersPeriodField(r.filters);
                  const pfLabel = pf === "created_at" ? "created_at" : "evaluation_date";

                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                        <div className="leading-tight">
                          <div>{fmtDateTime(r.created_at)}</div>
                          <div className="text-[11px] text-slate-500">
                            Periodo por: <span className="font-bold">{pfLabel}</span>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-slate-700">
                        <div className="leading-tight">
                          <div>{scopeLabel(r.export_scope)}</div>
                          {/* si es legacy, lo marcas */}
                          {USED_SCOPES.includes(r.export_scope) ? null : (
                            <div className="text-[11px] text-slate-500">legacy</div>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-slate-700">{r.export_type}</td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold border ${badge(
                            r.status
                          )}`}
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="text-xs text-slate-500 pt-2">
          Las exportaciones quedan trazadas (quién, qué, cuándo). Las descargas quedan registradas para auditoría.
          {!isPremium && (
            <>
              {" "}
              <span className="text-indigo-600 font-bold">
                Plan MEDIUM: límite mensual de exportaciones (sube a PREMIUM si necesitas ilimitado).
              </span>
            </>
          )}
          {isPremium && (
            <>
              {" "}
              <span className="text-emerald-700 font-bold">Plan PREMIUM: exportaciones ilimitadas.</span>
            </>
          )}
        </div>

        <div className="flex items-start gap-2 text-xs text-slate-500">
          <div className="mt-0.5 w-5 h-5 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center shrink-0">
            <CheckCircle2 size={12} />
          </div>
          <div>
            Consejo práctico: si el objetivo es BI (PowerBI/Looker/Excel avanzado), genera CSV. Si el objetivo es
            entregar a asesoría/auditoría, genera PDF.
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportsViewAuditor;
