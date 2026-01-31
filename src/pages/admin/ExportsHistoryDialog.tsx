// src/components/admin/ExportsHistoryDialog.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  admin_audit_exports_list,
  admin_audit_exports_stats,
  admin_audit_exports_downloads,
  admin_get_signed_export_url,
} from "@/services/adminService";

import { admin_list_audit_exports_v2 } from "@/services/adminService";


type ExportRow = {
  id: string;
  created_at: string;

  app_id: string;
  customer_id: string | null;

  type: string;
  source: string;
  format: string;

  file_name: string;
  mime_type: string;
  storage_bucket: string;
  storage_path: string;

  row_count?: number | null;
  date_from?: string | null;
  date_to?: string | null;

  provided_to_type?: string | null;
  provided_to_name?: string | null;
  provided_to_contact?: string | null;
  provided_to_ref?: string | null;

  purpose?: string | null;
  legal_basis?: string | null;
  notes?: string | null;

  generated_by_email?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  defaultType?: string; // "CONFIG_CHANGES"
};

type Filters = {
  q: string;
  customer_id: string;
  from: string;
  to: string;
  format: "" | "PDF" | "CSV" | "XML";
  type: string;
  provided_to_type: string;
};

type DownloadStats = {
  download_count: number;
  last_downloaded_at: string | null;
  last_downloaded_by_email: string | null;
};

type DownloadRow = {
  id: string;
  export_id: string;
  downloaded_at: string;
  downloaded_by_user_id: string | null;
  downloaded_by_email: string | null;
  ip: string | null;
  user_agent: string | null;
};

const cx = (...cls: Array<string | false | null | undefined>) =>
  cls.filter(Boolean).join(" ");

function fmtDateTime(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString();
}

function shortPath(bucket?: string | null, path?: string | null) {
  if (!bucket || !path) return "—";
  const p = path.length > 48 ? "…" + path.slice(-48) : path;
  return `${bucket}/${p}`;
}

async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const res: R[] = new Array(items.length);
  let i = 0;

  const workers = new Array(Math.max(1, limit)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      res[idx] = await fn(items[idx], idx);
    }
  });

  await Promise.all(workers);
  return res;
}

export default function ExportsHistoryDialog({ open, onClose, defaultType }: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ExportRow[]>([]);
  const [error, setError] = useState<string>("");

  const [page, setPage] = useState(0);
  const pageSize = 50;

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ExportRow | null>(null);

  // ✅ Stats por export_id
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsById, setStatsById] = useState<Record<string, DownloadStats>>({});

  // ✅ Drawer historial descargas
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [downloadsLoading, setDownloadsLoading] = useState(false);
  const [downloadsRows, setDownloadsRows] = useState<DownloadRow[]>([]);
  const [downloadsError, setDownloadsError] = useState<string>("");

  const [filters, setFilters] = useState<Filters>({
    q: "",
    customer_id: "",
    from: "",
    to: "",
    format: "",
    type: defaultType ?? "",
    provided_to_type: "",
  });

  const providedToTypeOptions = useMemo(
    () => ["", "AEPD", "AUDITOR_EXTERNO", "JUZGADO", "FUERZAS_SEGURIDAD", "CLIENTE", "OTRO"],
    []
  );

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setPage(0);
    setDownloadsOpen(false);
    setDownloadsRows([]);
    setDownloadsError("");
    setFilters((f) => ({ ...f, type: defaultType ?? f.type }));
    void load(0, { ...filters, type: defaultType ?? filters.type });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function load(targetPage = page, f = filters) {
    setLoading(true);
    setError("");
    try {
            const data = await admin_audit_exports_list({
          app_id: "SYSTEM",
          customer_id: f.customer_id || null,
          from: f.from || null,
          to: f.to || null,
          format: f.format || null,
          type: f.type || null,
          provided_to_type: f.provided_to_type || null,
          q: f.q || null,
          limit: pageSize,
          offset: targetPage * pageSize,
        });


      const nextRows = (data ?? []) as ExportRow[];
      setRows(nextRows);

      // ✅ precarga stats de descargas para los exports listados
      void preloadDownloadStats(nextRows);
    } catch (e: any) {
      setRows([]);
      setError(e?.message ?? "Error cargando exportaciones");
    } finally {
      setLoading(false);
    }
  }

  async function preloadDownloadStats(nextRows: ExportRow[]) {
    if (!nextRows?.length) {
      setStatsById({});
      return;
    }

    setStatsLoading(true);
    try {
      const ids = nextRows.map((r) => r.id).filter(Boolean);

      // evitamos pedir stats si ya los tenemos en cache
      const missing = ids.filter((id) => !statsById[id]);

      if (missing.length === 0) return;

      const results = await mapWithLimit(missing, 6, async (exportId) => {
        try {
          const s = await admin_audit_exports_stats(exportId);

          return {
            exportId,
            stats: {
              download_count: Number(s?.download_count ?? 0),
              last_downloaded_at: s?.last_downloaded_at ?? null,
              last_downloaded_by_email: s?.last_downloaded_by_email ?? null,
            } satisfies DownloadStats,
          };
        } catch {
          return {
            exportId,
            stats: { download_count: 0, last_downloaded_at: null, last_downloaded_by_email: null } as DownloadStats,
          };
        }
      });

      setStatsById((prev) => {
        const next = { ...prev };
        for (const r of results) next[r.exportId] = r.stats;
        return next;
      });
    } finally {
      setStatsLoading(false);
    }
  }

  function applyFilters() {
    setPage(0);
    void load(0, filters);
  }

  function resetFilters() {
    const next: Filters = {
      q: "",
      customer_id: "",
      from: "",
      to: "",
      format: "",
      type: defaultType ?? "",
      provided_to_type: "",
    };
    setFilters(next);
    setSelected(null);
    setPage(0);
    setStatsById({});
    void load(0, next);
  }

async function downloadExport(r: ExportRow) {
  if (!r?.id) return;
  setDownloadingId(r.id);
  setError("");

  try {
    const res = await admin_get_signed_export_url(r.id);

    // ✅ res puede ser string (lo actual) o objeto (por compatibilidad)
    const signedUrl =
      typeof res === "string"
        ? res
        : (res as any)?.signed_url || (res as any)?.signedUrl || (res as any)?.url;

    if (!signedUrl) throw new Error("No se recibió signed_url");

    window.open(signedUrl, "_blank", "noopener,noreferrer");

    // ✅ refresca stats del export tras descargar
    try {
      const s = await admin_audit_exports_stats(r.id);

      setStatsById((prev) => ({
        ...prev,
        [r.id]: {
          download_count: Number(s?.download_count ?? 0),
          last_downloaded_at: s?.last_downloaded_at ?? null,
          last_downloaded_by_email: s?.last_downloaded_by_email ?? null,
        },
      }));
    } catch {
      // no pasa nada
    }
  } catch (e: any) {
    setError(e?.message ?? "Error generando URL firmada");
  } finally {
    setDownloadingId(null);
  }
}

  async function openDownloadsHistory(exportId: string) {
    setDownloadsOpen(true);
    setDownloadsLoading(true);
    setDownloadsError("");
    setDownloadsRows([]);

    try {
      const data = await admin_audit_exports_downloads(exportId, 200, 0);

      setDownloadsRows((data ?? []) as DownloadRow[]);
    } catch (e: any) {
      setDownloadsError(e?.message ?? "Error cargando descargas");
    } finally {
      setDownloadsLoading(false);
    }
  }

  if (!open) return null;

  const selStats = selected?.id ? statsById[selected.id] : undefined;

  return (
    <div className="fixed inset-0 z-50">
      {/* overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      {/* dialog */}
      <div className="absolute left-1/2 top-1/2 w-[min(1400px,96vw)] -translate-x-1/2 -translate-y-1/2">
        <div className="flex h-[90vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {/* header */}
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-slate-900">
                Exportaciones realizadas
              </div>
              <div className="mt-0.5 text-sm text-slate-500">
                Historial de ficheros exportados + detalle de entrega.
              </div>
            </div>

            <button
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cerrar
            </button>
          </div>

          {/* content */}
          <div className="grid flex-1 grid-cols-12 overflow-hidden">
            {/* LEFT */}
            <div className="col-span-12 flex min-w-0 flex-col lg:col-span-8">
              {/* filters */}
              <div className="border-b border-slate-200 px-5 py-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                  <div className="md:col-span-5">
                    <label className="text-xs font-medium text-slate-600">Buscar</label>
                    <input
                      value={filters.q}
                      onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                      placeholder="archivo, referencia, notas, email…"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs font-medium text-slate-600">Desde</label>
                    <input
                      type="date"
                      value={filters.from}
                      onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs font-medium text-slate-600">Hasta</label>
                    <input
                      type="date"
                      value={filters.to}
                      onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>

                  <div className="md:col-span-3">
                    <label className="text-xs font-medium text-slate-600">Formato</label>
                    <select
                      value={filters.format}
                      onChange={(e) => setFilters((f) => ({ ...f, format: e.target.value as any }))}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                    >
                      <option value="">Todos</option>
                      <option value="PDF">PDF</option>
                      <option value="CSV">CSV</option>
                      <option value="XML">XML</option>
                    </select>
                  </div>

                  <div className="md:col-span-4">
                    <label className="text-xs font-medium text-slate-600">Tipo</label>
                    <input
                      value={filters.type}
                      onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
                      placeholder="CONFIG_CHANGES…"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>

                  <div className="md:col-span-4">
                    <label className="text-xs font-medium text-slate-600">Tipo entrega</label>
                    <select
                      value={filters.provided_to_type}
                      onChange={(e) => setFilters((f) => ({ ...f, provided_to_type: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                    >
                      {providedToTypeOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt === "" ? "Todos" : opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-4">
                    <label className="text-xs font-medium text-slate-600">Cliente (customer_id)</label>
                    <input
                      value={filters.customer_id}
                      onChange={(e) => setFilters((f) => ({ ...f, customer_id: e.target.value }))}
                      placeholder="uuid (opcional)"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>

                  <div className="md:col-span-12 flex flex-wrap items-center gap-2 pt-1">
                    <button
                      onClick={applyFilters}
                      className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
                    >
                      Aplicar filtros
                    </button>
                    <button
                      onClick={resetFilters}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Reset
                    </button>

                    <div className="ml-auto text-sm text-slate-600">
                      {loading ? "Cargando…" : `${rows.length} resultados`}
                      {statsLoading ? " · stats…" : ""}
                    </div>
                  </div>
                </div>

                {error ? (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}
              </div>

              {/* table area (scroll) */}
              <div className="flex-1 min-w-0 overflow-hidden">
                <div className="h-full w-full overflow-auto">
                  <table className="w-full table-fixed text-sm">
                    <thead className="sticky top-0 z-10 bg-white">
                      <tr className="border-b border-slate-200 text-slate-600">
                        <th className="w-[170px] px-4 py-3 text-left">Fecha</th>
                        <th className="w-[160px] px-4 py-3 text-left">Tipo</th>
                        <th className="w-[90px] px-4 py-3 text-left">Formato</th>
                        <th className="min-w-[420px] px-4 py-3 text-left">Archivo</th>

                        {/* ✅ NUEVO */}
                        <th className="w-[140px] px-4 py-3 text-left">Descargas</th>

                        <th className="w-[170px] px-4 py-3 text-left">Entregado a</th>
                        <th className="w-[130px] px-4 py-3 text-right">Acciones</th>
                      </tr>
                    </thead>

                    <tbody>
                      {rows.map((r) => {
                        const isSel = selected?.id === r.id;
                        const st = statsById[r.id];

                        return (
                          <tr
                            key={r.id}
                            className={cx("border-b border-slate-100 hover:bg-slate-50", isSel && "bg-slate-50")}
                            onClick={() => setSelected(r)}
                            style={{ cursor: "pointer" }}
                          >
                            <td className="px-4 py-3 align-top">{fmtDateTime(r.created_at)}</td>

                            <td className="px-4 py-3 align-top">
                              <div className="font-medium text-slate-900">{r.type}</div>
                              <div className="text-xs text-slate-500">{r.source || "—"}</div>
                            </td>

                            <td className="px-4 py-3 align-top">{r.format}</td>

                            <td className="px-4 py-3 align-top">
                              <div className="truncate font-medium text-slate-900">{r.file_name}</div>
                              <div className="mt-1 text-xs text-slate-500">
                                {shortPath(r.storage_bucket, r.storage_path)}
                              </div>
                            </td>

                            {/* ✅ NUEVO */}
                            <td className="px-4 py-3 align-top">
                              <div className="font-medium text-slate-900">
                                {st ? st.download_count : "—"}
                              </div>
                              <div className="text-xs text-slate-500">
                                {st?.last_downloaded_at ? fmtDateTime(st.last_downloaded_at) : "—"}
                              </div>
                            </td>

                            <td className="px-4 py-3 align-top">
                              <div className="text-slate-900">{r.provided_to_type ?? "—"}</div>
                              <div className="text-xs text-slate-500">{r.provided_to_name ?? "—"}</div>
                            </td>

                            <td className="px-4 py-3 text-right align-top">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void downloadExport(r);
                                }}
                                className="rounded-xl bg-slate-900 px-3 py-2 text-xs text-white hover:bg-slate-800 disabled:opacity-60"
                                disabled={downloadingId === r.id}
                              >
                                {downloadingId === r.id ? "Generando…" : "Descargar"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}

                      {!loading && rows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                            No hay exportaciones con esos filtros.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* pagination */}
              <div className="flex items-center gap-2 border-t border-slate-200 px-5 py-3">
                <button
                  onClick={() => {
                    const next = Math.max(0, page - 1);
                    setPage(next);
                    void load(next);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  disabled={page === 0 || loading}
                >
                  ← Anterior
                </button>

                <button
                  onClick={() => {
                    const next = page + 1;
                    setPage(next);
                    void load(next);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  disabled={loading || rows.length < pageSize}
                >
                  Siguiente →
                </button>

                <div className="ml-auto text-sm text-slate-600">Página {page + 1}</div>
              </div>
            </div>

            {/* RIGHT */}
            <div className="col-span-12 flex h-full flex-col border-l border-slate-200 lg:col-span-4">
              <div className="border-b border-slate-200 px-5 py-4">
                <div className="text-sm font-semibold text-slate-900">Detalle</div>
                <div className="mt-1 text-sm text-slate-500">
                  Selecciona una exportación para ver a quién, por qué y cuándo.
                </div>
              </div>

              <div className="flex-1 overflow-auto px-5 py-4">
                {!selected ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    Ninguna exportación seleccionada.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-xs text-slate-500">Archivo</div>
                      <div className="mt-1 font-medium text-slate-900">{selected.file_name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {selected.format} · {selected.mime_type}
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        {selected.storage_bucket}/{selected.storage_path}
                      </div>
                    </div>

                    {/* ✅ NUEVO: Descargas */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-xs text-slate-500">Descargas</div>
                      <div className="mt-2 space-y-1 text-sm text-slate-900">
                        <div>
                          <span className="text-slate-500">Total:</span>{" "}
                          {selStats ? selStats.download_count : "—"}
                        </div>
                        <div>
                          <span className="text-slate-500">Última:</span>{" "}
                          {selStats?.last_downloaded_at ? fmtDateTime(selStats.last_downloaded_at) : "—"}
                        </div>
                        <div>
                          <span className="text-slate-500">Por:</span>{" "}
                          {selStats?.last_downloaded_by_email ?? "—"}
                        </div>
                      </div>

                      <div className="mt-3">
                        <button
                          onClick={() => void openDownloadsHistory(selected.id)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          Ver histórico
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-xs text-slate-500">Entrega / Destinatario</div>
                      <div className="mt-2 space-y-1 text-sm text-slate-900">
                        <div>
                          <span className="text-slate-500">Tipo:</span> {selected.provided_to_type ?? "—"}
                        </div>
                        <div>
                          <span className="text-slate-500">Nombre:</span> {selected.provided_to_name ?? "—"}
                        </div>
                        <div>
                          <span className="text-slate-500">Contacto:</span> {selected.provided_to_contact ?? "—"}
                        </div>
                        <div>
                          <span className="text-slate-500">Referencia:</span> {selected.provided_to_ref ?? "—"}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-xs text-slate-500">Motivo</div>
                      <div className="mt-2 space-y-1 text-sm text-slate-900">
                        <div>
                          <span className="text-slate-500">Purpose:</span> {selected.purpose ?? "—"}
                        </div>
                        <div>
                          <span className="text-slate-500">Base legal:</span> {selected.legal_basis ?? "—"}
                        </div>
                        <div className="pt-2">
                          <span className="text-slate-500">Notas:</span> {selected.notes ?? "—"}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => void downloadExport(selected)}
                        className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
                        disabled={downloadingId === selected.id}
                      >
                        {downloadingId === selected.id ? "Generando…" : "Descargar / Imprimir"}
                      </button>

                      <button
                        onClick={() => {
                          alert("Enviar: lo implementamos con una Edge Function (Brevo) en el siguiente paso.");
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Enviar
                      </button>
                    </div>

                    <div className="text-xs text-slate-500">
                      Generado por: {selected.generated_by_email ?? "—"} · {fmtDateTime(selected.created_at)}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
                Tip: “Descargar / Imprimir” abre el PDF; imprime desde el navegador.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ Mini dialog histórico descargas */}
      {downloadsOpen ? (
        <div className="fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDownloadsOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-1/2 top-1/2 w-[min(1100px,95vw)] -translate-x-1/2 -translate-y-1/2">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <div className="text-base font-semibold text-slate-900">Histórico de descargas</div>
                  <div className="text-sm text-slate-500">
                    Export: {selected?.file_name ?? "—"}
                  </div>
                </div>
                <button
                  onClick={() => setDownloadsOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cerrar
                </button>
              </div>

              <div className="max-h-[70vh] overflow-auto p-4">
                {downloadsError ? (
                  <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {downloadsError}
                  </div>
                ) : null}

                <table className="w-full table-fixed text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-slate-200 text-slate-600">
                      <th className="w-[210px] px-3 py-3 text-left">Fecha</th>
                      <th className="w-[220px] px-3 py-3 text-left">Email</th>
                      <th className="w-[140px] px-3 py-3 text-left">IP</th>
                      <th className="px-3 py-3 text-left">User Agent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {downloadsLoading ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                          Cargando…
                        </td>
                      </tr>
                    ) : downloadsRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                          No hay descargas registradas.
                        </td>
                      </tr>
                    ) : (
                      downloadsRows.map((d) => (
                        <tr key={d.id} className="border-b border-slate-100">
                          <td className="px-3 py-3 align-top">{fmtDateTime(d.downloaded_at)}</td>
                          <td className="px-3 py-3 align-top">{d.downloaded_by_email ?? "—"}</td>
                          <td className="px-3 py-3 align-top">{d.ip ?? "—"}</td>
                          <td className="px-3 py-3 align-top">
                            <div className="truncate">{d.user_agent ?? "—"}</div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
                Nota: este log se escribe cuando se genera la URL firmada (quién la descargó, cuándo y desde dónde).
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
