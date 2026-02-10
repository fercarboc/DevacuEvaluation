// src/views/HistoryViewAuditor.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  X,
  ShieldCheck,
  AlertCircle,
  Clock,
  User,
  Download,
  Info,
} from "lucide-react";

import EmptyState from "@/components/ui/EmptyState";

import {
  list_audit_history,
  get_audit_history_detail,
  audit_export_generate,
  audit_export_download,
  type AuditHistoryItem,
} from "@/services/clientService";

type RiskUi = "Alto" | "Medio" | "Bajo" | "No concluyente";

function toUiRisk(riskRaw?: string | null): RiskUi {
  const r = (riskRaw ?? "").toUpperCase();
  if (r === "ALTO" || r === "HIGH") return "Alto";
  if (r === "MEDIO" || r === "MEDIUM") return "Medio";
  if (r === "BAJO" || r === "LOW") return "Bajo";
  return "No concluyente";
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * UI state para el modal
 * (snake_case también, como estás haciendo en toda la UI).
 */
type SelectedFicha = {
  audit_id: string;
  created_at: string;

  risk_ui: RiskUi;
  type_label: string;

  actor_role: string;
  actor_email: string | null;

  contact_masked: string | null;

  avg_stars: number | null;
  match_strength: string | null;

  count_bucket: string | null;
  count_exact: number | null;

  result_count: number | null;

  meta: any;
};

const HistoryViewAuditor: React.FC = () => {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const page_size = 10;

  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<AuditHistoryItem[]>([]);

  const [selected, setSelected] = useState<SelectedFicha | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / page_size)),
    [total, page_size],
  );

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await list_audit_history({
        page,
        page_size,
        q: q.trim(),
        event_type: "CHECK_SIGNALS",
      });

      setItems(res.items ?? []);
      setTotal(typeof res.total === "number" ? res.total : 0);
    } catch (e: any) {
      console.error(e);
      setError("No ha sido posible cargar el histórico.");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // búsqueda: al cambiar q, vuelve a página 1 y recarga
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      void load();
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const openFicha = async (row: AuditHistoryItem) => {
    setSelectedLoading(true);

    try {
      // ✅ tu API usa audit_id
      const detail = await get_audit_history_detail(row.audit_id);

      const risk_ui = toUiRisk(detail.risk_level);

      // ✅ “tipo” lo sacamos del event_type (y si no existe, fallback)
      const type_label = detail.event_type ?? "—";

      setSelected({
        audit_id: detail.audit_id,
        created_at: detail.created_at,

        risk_ui,
        type_label,

        actor_role: detail.actor_role ?? "—",
        actor_email: detail.actor_email ?? null,

        contact_masked: detail.search_value_masked ?? row.search_value_masked ?? null,

        avg_stars: detail.avg_stars ?? null,
        match_strength: detail.match_strength ?? null,

        count_bucket: detail.count_bucket ?? null,
        count_exact: typeof detail.count_exact === "number" ? detail.count_exact : null,

        result_count: typeof detail.result_count === "number" ? detail.result_count : null,

        meta: detail.meta ?? null,
      });
    } catch (e) {
      console.error(e);

      // fallback SOLO con row
      const risk_ui = toUiRisk(row.risk_level);
      const type_label = row.event_type ?? "—";

      setSelected({
        audit_id: row.audit_id,
        created_at: row.created_at,

        risk_ui,
        type_label,

        actor_role: row.actor_role ?? "—",
        actor_email: row.actor_email ?? null,

        contact_masked: row.search_value_masked ?? null,

        avg_stars: row.avg_stars ?? null,
        match_strength: row.match_strength ?? null,

        count_bucket: row.count_bucket ?? null,
        count_exact: typeof row.count_exact === "number" ? row.count_exact : null,

        result_count: typeof row.result_count === "number" ? row.result_count : null,

        meta: row.meta ?? null,
      });
    } finally {
      setSelectedLoading(false);
    }
  };

  const closeFicha = () => setSelected(null);

  /**
   * ✅ PDF REAL:
   * Genera export (customer_audit_exports + storage) y luego registra descarga y devuelve signed url.
   */
  const onPdf = async () => {
    if (!selected) return;

    try {
      setPdfLoading(true);

      const iso = todayISO();

      const gen: any = await audit_export_generate({
        export_type: "PDF",
        export_scope: "AUDIT_LOG",
        period_from: iso,
        period_to: iso,
        filters: {
          event_type: "CHECK_SIGNALS",
          q: q.trim() || null,
        },
        // útil: trazabilidad vincular export al audit_id seleccionado
        source_audit_id: selected.audit_id,
      });

      const export_id = gen?.export_id;
      if (!export_id) throw new Error("missing_export_id");

      const dl: any = await audit_export_download(export_id);
      const url = dl?.download_url;
      if (!url) throw new Error("missing_download_url");

      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      console.error(e);
      alert("No se pudo generar/descargar el PDF.");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            Histórico de Consultas
          </h2>
          <p className="text-slate-500">
            Trazabilidad operativa y auditoría interna.
          </p>
        </div>

        <div className="relative w-full md:w-72 shadow-sm">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="text"
            placeholder="ID / Contacto..."
            className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-4 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-slate-500">Cargando histórico...</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">{error}</div>
        ) : items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Sin resultados"
              description="No hay consultas registradas para este filtro."
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    <th className="px-6 py-4">Fecha / Hora</th>
                    <th className="px-6 py-4">Tipo</th>
                    <th className="px-6 py-4">Riesgo</th>
                    <th className="px-6 py-4">Auditor</th>
                    <th className="px-6 py-4 text-right">Acción</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {items.map((row) => {
                    const risk_ui = toUiRisk(row.risk_level);
                    const type_label = row.event_type ?? "—";
                    const auditor = row.actor_role ?? "—";

                    return (
                      <tr
                        key={row.audit_id}
                        className="hover:bg-slate-50 transition-colors group"
                      >
                        <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap font-medium">
                          {formatDateTime(row.created_at)}
                        </td>

                        <td className="px-6 py-4 text-sm font-bold text-slate-800">
                          {type_label}
                        </td>

                        <td className="px-6 py-4">
                          <span
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                              risk_ui === "Alto"
                                ? "bg-red-50 text-red-700 border-red-100"
                                : risk_ui === "Medio"
                                ? "bg-amber-50 text-amber-700 border-amber-100"
                                : risk_ui === "Bajo"
                                ? "bg-green-50 text-green-700 border-green-100"
                                : "bg-slate-50 text-slate-600 border-slate-200"
                            }`}
                          >
                            {risk_ui}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-sm text-slate-500 font-medium italic">
                          {auditor}
                        </td>

                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => void openFicha(row)}
                            className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 text-[11px] font-bold uppercase ml-auto transition-all group-hover:translate-x-[-4px]"
                          >
                            <FileText size={14} />
                            Ver ficha
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-tight">
                Trazabilidad total: {total.toLocaleString()} registros
              </p>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 transition-colors disabled:opacity-30"
                >
                  <ChevronLeft size={18} />
                </button>

                <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                  <span>{page}</span>
                  <span className="text-slate-400">/</span>
                  <span>{totalPages}</span>
                </div>

                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 transition-colors disabled:opacity-30"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center gap-2">
        <Info size={14} className="text-slate-400" />
        <p className="text-[11px] text-slate-500 font-medium">
          Se muestran eventos sin PII. La descarga masiva depende del plan.
        </p>
      </div>

      {/* Modal */}
      {selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-300">
          <div
            className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-50 border-b border-slate-200 px-8 py-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center shadow-inner">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">
                    Ficha Técnica
                  </h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                    Auditoría Evaluation360
                  </p>
                </div>
              </div>
              <button
                onClick={closeFicha}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-8 overflow-y-auto max-h-[70vh]">
              <div
                className={`p-5 rounded-2xl border flex items-center gap-4 shadow-sm ${
                  selected.risk_ui === "Alto"
                    ? "bg-red-50 border-red-100 text-red-900"
                    : selected.risk_ui === "Medio"
                    ? "bg-amber-50 border-amber-100 text-amber-900"
                    : selected.risk_ui === "Bajo"
                    ? "bg-emerald-50 border-emerald-100 text-emerald-900"
                    : "bg-slate-50 border-slate-200 text-slate-800"
                }`}
              >
                {selected.risk_ui === "Alto" ? (
                  <AlertCircle size={28} className="shrink-0" />
                ) : (
                  <ShieldCheck size={28} className="shrink-0" />
                )}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                    Evaluación de Riesgo
                  </p>
                  <p className="text-xl font-black">
                    NIVEL {selected.risk_ui.toUpperCase()}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-y-6 gap-x-12">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    AUDIT ID
                  </p>
                  <p className="text-sm font-mono font-bold text-slate-800">
                    {selected.audit_id}
                  </p>
                </div>

                <div className="space-y-1 text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Timestamp
                  </p>
                  <div className="flex items-center justify-end gap-1.5 text-sm font-bold text-slate-800">
                    <Clock size={14} className="text-slate-400" />
                    <span>{formatDateTime(selected.created_at)}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Tipo
                  </p>
                  <p className="text-sm font-bold text-slate-800">
                    {selected.type_label}
                  </p>
                </div>

                <div className="space-y-1 text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Auditor
                  </p>
                  <div className="flex items-center justify-end gap-1.5 text-sm font-bold text-slate-800">
                    <User size={14} className="text-slate-400" />
                    <span>{selected.actor_role || "—"}</span>
                  </div>
                  {selected.actor_email ? (
                    <p className="text-[11px] text-slate-400 font-mono">
                      {selected.actor_email}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3 pt-6 border-t border-slate-100">
                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                  Resumen
                </h4>
                <div className="bg-slate-50 p-5 rounded-2xl text-sm text-slate-600 leading-relaxed italic border border-slate-200/50 shadow-inner">
                  “Consulta sobre{" "}
                  <span className="text-indigo-700 font-bold">
                    {selected.contact_masked ?? "—"}
                  </span>
                  . Coincidencia:{" "}
                  <span className="font-bold">
                    {selected.match_strength ?? "—"}
                  </span>
                  . Registros:{" "}
                  <span className="font-bold">
                    {selected.result_count ?? "—"}
                  </span>
                  . Media:{" "}
                  <span className="font-bold">
                    {selected.avg_stars ?? "—"}
                  </span>
                  .”
                </div>
              </div>

              <div className="flex items-center justify-between pt-6 border-t border-slate-100">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Trazabilidad
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 uppercase">
                    Audit ID: {selected.audit_id}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black uppercase border border-emerald-100">
                  <ShieldCheck size={12} />
                  Integridad OK
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border-t border-slate-200 px-8 py-5 flex items-center justify-between">
              <p className="text-[10px] text-slate-400 max-w-[240px] leading-tight font-medium">
                La generación y descarga del PDF quedan registradas (exports + downloads).
              </p>

              <div className="flex gap-4">
                <button
                  onClick={closeFicha}
                  className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-all"
                >
                  Cerrar
                </button>

                <button
                  disabled={selectedLoading || pdfLoading}
                  onClick={() => void onPdf()}
                  className="px-5 py-2.5 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 flex items-center gap-2 transition-all transform hover:scale-105 active:scale-95 disabled:opacity-60"
                >
                  <Download size={16} />
                  {pdfLoading ? "Generando…" : "PDF"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryViewAuditor;
