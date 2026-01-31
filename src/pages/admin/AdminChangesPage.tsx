import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/services/supabaseClient"; // ajusta si tu cliente está en otra ruta
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { sha256HexFromBlob } from "@/utils/auditExport";
import { export_system_file } from "@/services/adminService";

 
import ExportsHistoryDialog from "./ExportsHistoryDialog";

type ChangeRow = {
  audit_id: string;
  abuse_settings_id: string;
  created_at: string;
  actor_name: string | null;
  changes_count: number;
  changes_summary: string;
};

type ExportFormat = "PDF" | "CSV";


// ─────────────────────────────
// Tipos de entrega (DEBE coincidir con enum audit_provided_to_type)
// ─────────────────────────────
const providedToType = [
  { value: "AEPD", label: "AEPD" },
  { value: "AUDITOR_EXTERNO", label: "Auditor externo" },
  { value: "JUZGADO", label: "Juzgado" },
  { value: "FUERZAS_SEGURIDAD", label: "Fuerzas y cuerpos de seguridad" },
  { value: "CLIENTE", label: "Cliente" },
  { value: "OTRO", label: "Otro" },
] as const;

type ProvidedToType = (typeof providedToType)[number]["value"];

type ExportMeta = {
  provided_to_type: ProvidedToType;
  provided_to_name: string;
  provided_to_contact: string;
  purpose: string;
  provided_to_ref: string;
  legal_basis: string;
  notes: string;
};



const cx = (...cls: Array<string | false | null | undefined>) =>
  cls.filter(Boolean).join(" ");

function getSeverity(summary: string) {
  const s = (summary || "").toLowerCase();
  const hasCritical = s.includes("critical");
  const hasWarning = s.includes("warning");

  if (hasCritical) return "critical";
  if (hasWarning) return "warning";
  return "normal";
}

function severityBadgeClass(sev: "critical" | "warning" | "normal") {
  switch (sev) {
    case "critical":
      return "bg-red-100 text-red-800 border border-red-200";
    case "warning":
      return "bg-amber-100 text-amber-800 border border-amber-200";
    default:
      return "bg-slate-100 text-slate-700 border border-slate-200";
  }
}

async function sha256Text(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizePdfText(input: any) {
  let s = String(input ?? "");

  // Caso típico: "&R&a&n&g&o" => "Rango"
  const ampCount = (s.match(/&/g) || []).length;
  if (ampCount >= Math.floor(s.length / 2)) {
    s = s.replace(/&/g, "");
  }

  // jsPDF a veces falla con ciertos caracteres unicode
  s = s.replaceAll("→", "->").replaceAll("–", "-").replaceAll("—", "-");

  // Limpieza básica (evita caracteres invisibles raros)
  s = s.replace(/[\u0000-\u001F\u007F]/g, "");

  return s;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** Construye el PDF y devuelve:
 *  - blob: para descargar/subir
 *  - reportHash: el hash que se imprime en el footer (hash lógico del contenido)
 */
async function buildPdfBlob(
  rows: ChangeRow[],
  meta: { from?: string; to?: string }
): Promise<{ blob: Blob; reportHash: string }> {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4",
  });

  const subtitle = "Debacu Evaluation 360";
  const title = "Informe de cambios de configuración";
  const generated = new Date().toLocaleString();
  const rangeText = `Rango: ${meta.from || "inicio"} → ${meta.to || "hoy"}`;

  // ───────────────── Header ─────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(normalizePdfText(subtitle), 40, 45);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(normalizePdfText(title), 40, 70);

  doc.setFontSize(10);
  doc.text(`Generado: ${normalizePdfText(generated)}`, 40, 90);
  doc.text(normalizePdfText(rangeText), 40, 105);

  // ───────────────── Tabla ─────────────────
  const body = rows.map((r) => [
    normalizePdfText(new Date(r.created_at).toLocaleString()),
    normalizePdfText(r.actor_name ?? "system"),
    normalizePdfText(getSeverity(r.changes_summary)),
    normalizePdfText(r.changes_summary),
    String(r.changes_count ?? ""),
    normalizePdfText(r.audit_id),
  ]);

  autoTable(doc, {
    startY: 125,
    head: [["Fecha", "Actor", "Severidad", "Cambios", "Nº", "Audit ID"]],
    body,
    margin: { left: 40, right: 40 },
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 6,
      overflow: "linebreak",
      valign: "top",
      textColor: [30, 30, 30],
      fillColor: false,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: 255,
      fontStyle: "bold",
      halign: "left",
    },
    alternateRowStyles: undefined,
    columnStyles: {
      0: { cellWidth: 95 }, // Fecha
      1: { cellWidth: 115 }, // Actor
      2: { cellWidth: 70 }, // Severidad
      3: { cellWidth: 360 }, // Cambios
      4: { cellWidth: 30, halign: "left" }, // Nº
      5: {
        cellWidth: 92,
        fontSize: 7,
        textColor: [120, 120, 120],
        overflow: "linebreak",
      },
    },
    tableWidth: doc.internal.pageSize.getWidth() - 80,
    didDrawPage: (data) => {
      doc.setDrawColor(220);
      doc.line(
        data.settings.margin.left,
        data.cursor.y + 10,
        doc.internal.pageSize.getWidth() - data.settings.margin.right,
        data.cursor.y + 10
      );
    },
  });

  // Hash “lógico” del informe (mismo que imprimes)
  const hashSource = rows
    .map((r) => `${r.audit_id}|${r.created_at}|${r.changes_summary}`)
    .join("\n");
  const reportHash = await sha256Text(hashSource);

  // ───────────────── Footer ─────────────────
  const pageCount = doc.getNumberOfPages();
  doc.setFontSize(9);

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.text(
      `Documento generado automáticamente · Página ${i} / ${pageCount}`,
      40,
      doc.internal.pageSize.getHeight() - 25
    );
    doc.text(
      `Hash SHA256: ${reportHash}`,
      40,
      doc.internal.pageSize.getHeight() - 12
    );
  }

  const blob = doc.output("blob") as Blob;
  return { blob, reportHash };
}

/** CSV (sin hash) + luego lo añadimos como última línea */
function buildCsvBase(rows: ChangeRow[]) {
  const headers = [
    "Fecha",
    "Actor",
    "Severidad",
    "Cambios",
    "Resumen",
    "Audit ID",
    "Abuse Settings ID",
  ];

  const escapeCell = (v: any) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines = rows.map((r) => {
    const severity = getSeverity(r.changes_summary);
    return [
      escapeCell(new Date(r.created_at).toISOString()),
      escapeCell(r.actor_name ?? "system"),
      escapeCell(severity),
      escapeCell(r.changes_count),
      escapeCell(r.changes_summary),
      escapeCell(r.audit_id),
      escapeCell(r.abuse_settings_id),
    ].join(",");
  });

  return [headers.join(","), ...lines].join("\n");
}

/** Genera CSV final con línea de hash *coherente con el propio fichero* */
async function buildCsvWithHash(rows: ChangeRow[]) {
  const base = buildCsvBase(rows);

  const provisional = `${base}\n\n# Hash SHA256: __PENDING__\n`;
  const provisionalBlob = new Blob([provisional], { type: "text/csv;charset=utf-8" });
  const provisionalHash = await sha256HexFromBlob(provisionalBlob);

  const finalText = `${base}\n\n# Hash SHA256: ${provisionalHash}\n`;
  const finalBlob = new Blob([finalText], { type: "text/csv;charset=utf-8" });
  const finalSha = await sha256HexFromBlob(finalBlob);

  const finalText2 = `${base}\n\n# Hash SHA256: ${finalSha}\n`;
  const finalBlob2 = new Blob([finalText2], { type: "text/csv;charset=utf-8" });

  return { blob: finalBlob2, sha: finalSha };
}

export default function AdminChanges() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ChangeRow[]>([]);
  const [error, setError] = useState<string>("");

  // filtros
  const [q, setQ] = useState("");
  const [from, setFrom] = useState<string>(""); // yyyy-mm-dd
  const [to, setTo] = useState<string>(""); // yyyy-mm-dd

  // exporting states
  const [exporting, setExporting] = useState(false);

  // modal export
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("PDF");
  const [exportMeta, setExportMeta] = useState<ExportMeta>({
    // ⚠️ Pon aquí los mismos valores que uses en Auditoría para el enum audit_provided_to_type
    provided_to_type: providedToType[0].value,
    provided_to_name: "",
    provided_to_contact: "",
    purpose: "",
    provided_to_ref: "",
    legal_basis: "Interés legítimo (seguridad y trazabilidad)",
    notes: "",
  });

//ver exportaciones previas Cambios systema
  const [openExports, setOpenExports] = useState(false);

  // confirm/rollback
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [selectedSummary, setSelectedSummary] = useState<string>("");
  const [rollingBack, setRollingBack] = useState(false);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;

    return rows.filter((r) => {
      const hay = [
        r.actor_name ?? "",
        r.changes_summary ?? "",
        String(r.changes_count ?? ""),
        r.abuse_settings_id ?? "",
        r.audit_id ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(qq);
    });
  }, [rows, q]);

  async function load() {
    setLoading(true);
    setError("");

    try {
      let query = supabase
        .from("abuse_settings_audit_grouped")
        .select(
          "audit_id, abuse_settings_id, created_at, actor_name, changes_count, changes_summary"
        )
        .order("created_at", { ascending: false })
        .limit(500);

      if (from) query = query.gte("created_at", `${from}T00:00:00`);
      if (to) query = query.lte("created_at", `${to}T23:59:59`);

      const { data, error } = await query;
      if (error) throw error;

      setRows((data ?? []) as ChangeRow[]);
    } catch (e: any) {
      setError(e?.message ?? "Error cargando cambios");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openRollback(row: ChangeRow) {
    if (row.actor_name === "system") return;

    setSelectedAuditId(row.audit_id);

    const when = new Date(row.created_at).toLocaleString();
    const countLabel = `${row.changes_count} cambio${row.changes_count === 1 ? "" : "s"}`;

    setSelectedSummary(`${countLabel}: ${row.changes_summary} (${when})`);
    setConfirmOpen(true);
  }

  function closeRollback() {
    if (rollingBack) return;
    setConfirmOpen(false);
    setSelectedAuditId(null);
    setSelectedSummary("");
  }

  async function doRollback() {
    if (!selectedAuditId) return;
    setRollingBack(true);
    setError("");

    try {
      const { error } = await (supabase as any).rpc("admin_rollback_abuse_settings", {
        p_audit_id: selectedAuditId,
      });
      if (error) throw error;

      closeRollback();
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Error realizando rollback");
    } finally {
      setRollingBack(false);
    }
  }

  // ───────────────────────────── Export flow (modal -> export) ─────────────────────────────

  function openExportModal(fmt: ExportFormat) {
    if (exporting || loading) return;
    setExportFormat(fmt);
    setError("");
    setExportOpen(true);
  }

  function closeExportModal() {
    if (exporting) return;
    setExportOpen(false);
  }

  function validateExportMeta(m: ExportMeta) {
    if (!m.provided_to_name.trim()) return "El campo “A quién se entrega” es obligatorio.";
    if (!m.purpose.trim()) return "El campo “Motivo / finalidad” es obligatorio.";
    if (!m.provided_to_type.trim()) return "Selecciona “Tipo de entrega”.";
    return "";
  }

  async function doExportWithMeta(fmt: ExportFormat, meta: ExportMeta) {
    const v = validateExportMeta(meta);
    if (v) {
      setError(v);
      return;
    }

    setExporting(true);
    setError("");

    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName =
        fmt === "PDF"
          ? `configuration_changes_${dateStr}.pdf`
          : `configuration_changes_${dateStr}.csv`;

      let blob: Blob;
      let reportHash: string | null = null;

      if (fmt === "PDF") {
        const outPdf = await buildPdfBlob(filtered, { from, to });
        blob = outPdf.blob;
        reportHash = outPdf.reportHash;
      } else {
        const outCsv = await buildCsvWithHash(filtered);
        blob = outCsv.blob;
      }

      const fileBase64 = await blobToBase64(blob);
      const sha256 = await sha256HexFromBlob(blob);

      const out = await export_system_file({
        file_name: fileName,
        mime_type: fmt === "PDF" ? "application/pdf" : "text/csv",
        file_base64: fileBase64,

        // Edge Function acepta sha256 o client_sha256; mandamos ambos por compat.
        sha256,
        client_sha256: sha256,

        app_id: "SYSTEM",
        customer_id: null,

        type: "CONFIG_CHANGES",
        source: "abuse_settings_audit_grouped",
        format: fmt,
        row_count: filtered.length,

        date_from: from || null,
        date_to: to || null,

        filters_json: {
          q: q || "",
          from: from || null,
          to: to || null,
          report_hash: reportHash,
        },

        // 👇 campos de trazabilidad (los que te faltaban en Cambios)
        provided_to_type: meta.provided_to_type,
        provided_to_name: meta.provided_to_name,
        provided_to_contact: meta.provided_to_contact || null,
        provided_to_ref: meta.provided_to_ref || null,

        purpose: meta.purpose,
        legal_basis: meta.legal_basis || null,
        notes: meta.notes || null,
      });

      downloadBlob(blob, fileName);
      console.log("audit_export OK:", out);

      setExportOpen(false);
    } catch (e: any) {
      setError(e?.message ?? "Error exportando");
    } finally {
      setExporting(false);
    }
  }

  // Cerrar modales con ESC
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        if (exportOpen) closeExportModal();
        if (confirmOpen) closeRollback();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportOpen, confirmOpen, rollingBack, exporting]);

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Configuration changes</h1>
          <p className="text-sm text-slate-500">
            Historial de cambios de configuración (Uso y abuso). Rollback solo para administradores.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => openExportModal("CSV")}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            disabled={exporting || loading}
            title="Exportar CSV (requiere registrar a quién se entrega y motivo)"
          >
            {exporting && exportFormat === "CSV" ? "Exportando CSV..." : "Exportar CSV"}
          </button>

          <button
            onClick={() => openExportModal("PDF")}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            disabled={exporting || loading}
            title="Exportar PDF (requiere registrar a quién se entrega y motivo)"
          >
            {exporting && exportFormat === "PDF" ? "Exportando PDF..." : "Exportar PDF"}
          </button>
          <button
              onClick={() => setOpenExports(true)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Ver exportaciones realizadas
            </button>

            <ExportsHistoryDialog
              open={openExports}
              onClose={() => setOpenExports(false)}
              defaultType="CONFIG_CHANGES"
            />

          <button
            onClick={load}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            disabled={loading}
          >
            {loading ? "Cargando..." : "Refrescar"}
          </button>
        </div>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Búsqueda</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="admin, cambios, id..."
              className="h-9 w-72 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-300"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Desde</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-300"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Hasta</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-300"
            />
          </div>

          <button
            onClick={load}
            className="ml-auto h-9 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
            disabled={loading}
          >
            Aplicar
          </button>

          <button
            onClick={() => {
              setQ("");
              setFrom("");
              setTo("");
            }}
            className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
            disabled={loading}
          >
            Limpiar
          </button>
        </div>

        {error ? <div className="p-4 text-sm text-red-700">{error}</div> : null}

        <div className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-slate-500">{filtered.length} eventos (mostrando máx. 500)</p>
            <p className="text-xs text-slate-400">Fuente: abuse_settings_audit_grouped</p>
          </div>

          <div className="overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-xs text-slate-500">
                  <th className="px-3 py-2 text-left">FECHA</th>
                  <th className="px-3 py-2 text-left">ADMIN</th>
                  <th className="px-3 py-2 text-left">CAMBIOS</th>
                  <th className="px-3 py-2 text-left">ACCIÓN</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={4}>
                      Cargando...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={4}>
                      Sin resultados
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.audit_id} className="border-t border-slate-100">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString()}
                      </td>

                      <td className="px-3 py-2">{r.actor_name ?? "—"}</td>

                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            {(() => {
                              const sev = getSeverity(r.changes_summary);
                              return (
                                <span
                                  className={cx(
                                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                                    severityBadgeClass(sev)
                                  )}
                                >
                                  {sev}
                                </span>
                              );
                            })()}

                            <span className="text-xs text-slate-500">
                              {r.changes_count} cambio{r.changes_count === 1 ? "" : "s"}
                            </span>
                          </div>

                          <span className="text-slate-900">{r.changes_summary}</span>
                          <span className="text-[11px] text-slate-400">audit_id: {r.audit_id}</span>
                        </div>
                      </td>

                      <td className="px-3 py-2">
                        <button
                          onClick={() => openRollback(r)}
                          className={cx(
                            "rounded-lg border px-3 py-1.5 text-xs font-semibold",
                            r.actor_name === "system"
                              ? "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                              : "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                          )}
                          disabled={rollingBack || r.actor_name === "system"}
                          title={r.actor_name === "system" ? "Cambio automático del sistema" : ""}
                        >
                          Revertir
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            ⚠️ Revertir restaura el estado anterior del ajuste y crea un nuevo registro de auditoría (trazabilidad completa).
          </p>
        </div>
      </div>

      {/* Modal exportación (igual patrón que Auditoría) */}
      {exportOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeExportModal();
          }}
        >
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Exportar cambios</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Se registrará quién exporta, a quién se entrega, cuándo y por qué.
                </p>
              </div>

              <button
                onClick={closeExportModal}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                disabled={exporting}
                title="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
              {/* Formato */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-500">FORMATO</label>
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                  className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-300"
                  disabled={exporting}
                >
                  <option value="PDF">PDF</option>
                  <option value="CSV">CSV</option>
                </select>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <div className="font-semibold text-slate-700">FILTROS APLICADOS</div>
                  <div className="mt-2 space-y-1">
                    <div>
                      <span className="text-slate-500">Búsqueda:</span> {q?.trim() ? q : "—"}
                    </div>
                    <div>
                      <span className="text-slate-500">Fechas:</span>{" "}
                      {from ? from : "—"} → {to ? to : "—"}
                    </div>
                    <div>
                      <span className="text-slate-500">Eventos:</span> {filtered.length}
                    </div>
                    <div>
                      <span className="text-slate-500">Fuente:</span> abuse_settings_audit_grouped
                    </div>
                    <div>
                      <span className="text-slate-500">Tipo:</span> CONFIG_CHANGES
                    </div>
                  </div>
                </div>
              </div>

              {/* Datos entrega */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-500">TIPO DE ENTREGA *</label>
                  <select
                    value={exportMeta.provided_to_type}
                    onChange={(e) =>
                      setExportMeta((s) => ({
                        ...s,
                        provided_to_type: e.target.value as ProvidedToType,
                      }))
                    }

                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-300"
                    disabled={exporting}
                  >
                    {/* ⚠️ Ajusta estos valores para que coincidan con el enum real (usa los mismos que en Auditoría) */}
                    <option value="AEPD">AEPD</option>
                    <option value="AUDITOR_EXTERNO">AUDITOR_EXTERNO</option>
                    <option value="JUZGADO">JUZGADO</option>
                    <option value="FUERZAS_SEGURIDAD">FUERZAS_SEGURIDAD</option>
                    <option value="CLIENTE">CLIENTE</option>
                    <option value="OTRO">OTRO</option>
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Debe coincidir con tu enum <code className="rounded bg-slate-100 px-1">audit_provided_to_type</code>.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-slate-500">A QUIÉN SE ENTREGA *</label>
                    <input
                      value={exportMeta.provided_to_name}
                      onChange={(e) =>
                        setExportMeta((s) => ({ ...s, provided_to_name: e.target.value }))
                      }
                      placeholder="Ej: Inspector AEPD / Juzgado / Agencia..."
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-300"
                      disabled={exporting}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-500">ORGANISMO / ENTIDAD</label>
                    <input
                      value={exportMeta.provided_to_contact}
                      onChange={(e) =>
                        setExportMeta((s) => ({ ...s, provided_to_contact: e.target.value }))
                      }
                      placeholder="Ej: AEPD / Policía / Guardia Civil..."
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-300"
                      disabled={exporting}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-500">MOTIVO / FINALIDAD *</label>
                  <input
                    value={exportMeta.purpose}
                    onChange={(e) => setExportMeta((s) => ({ ...s, purpose: e.target.value }))}
                    placeholder="Ej: Inspección / Requerimiento / Procedimiento..."
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-300"
                    disabled={exporting}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-500">REFERENCIA (EXPEDIENTE, TICKET, ETC.)</label>
                  <input
                    value={exportMeta.provided_to_ref}
                    onChange={(e) =>
                      setExportMeta((s) => ({ ...s, provided_to_ref: e.target.value }))
                    }
                    placeholder="Ej: EXP-2026-000123"
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-300"
                    disabled={exporting}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-500">BASE LEGAL</label>
                  <input
                    value={exportMeta.legal_basis}
                    onChange={(e) =>
                      setExportMeta((s) => ({ ...s, legal_basis: e.target.value }))
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-300"
                    disabled={exporting}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-500">NOTAS</label>
                  <textarea
                    value={exportMeta.notes}
                    onChange={(e) => setExportMeta((s) => ({ ...s, notes: e.target.value }))}
                    className="mt-1 min-h-[70px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300"
                    placeholder="Opcional: detalles adicionales…"
                    disabled={exporting}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 p-4">
              <button
                onClick={closeExportModal}
                className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
                disabled={exporting}
              >
                Cancelar
              </button>

              <button
                onClick={() => doExportWithMeta(exportFormat, exportMeta)}
                className={cx(
                  "h-9 rounded-lg px-4 text-sm font-semibold text-white",
                  exporting ? "bg-slate-400" : "bg-slate-900 hover:bg-slate-800"
                )}
                disabled={exporting}
              >
                {exporting ? "Generando..." : "Generar y descargar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal confirmación rollback */}
      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeRollback();
          }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="border-b border-slate-100 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Confirmar rollback</h3>
              <p className="mt-1 text-xs text-slate-500">
                Se restaurarán los valores anteriores y se generará un nuevo evento de auditoría.
              </p>
            </div>

            <div className="p-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                {selectedSummary || "—"}
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  onClick={closeRollback}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
                  disabled={rollingBack}
                >
                  Cancelar
                </button>

                <button
                  onClick={doRollback}
                  className={cx(
                    "h-9 rounded-lg px-4 text-sm font-semibold text-white",
                    rollingBack ? "bg-amber-400" : "bg-amber-600 hover:bg-amber-700"
                  )}
                  disabled={rollingBack}
                >
                  {rollingBack ? "Revirtiendo..." : "Revertir ahora"}
                </button>
              </div>

              <p className="mt-3 text-xs text-slate-500">
                Nota: solo debe usarse si el cambio fue incorrecto. El rollback también queda auditado.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
