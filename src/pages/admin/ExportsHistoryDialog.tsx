// src/components/admin/ExportsHistoryDialog.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  admin_list_system_exports,
  admin_get_signed_export_url,
  admin_list_export_downloads,
} from "@/services/adminService";

 type ExportRow = {
  id: string;
  created_at: string;

  generated_by_user_id: string;
  generated_by_email: string | null;

  delivered_to_name: string | null;
  delivered_to_org: string | null;
  delivered_to_reason: string | null;
  delivered_to_reference: string | null;

  filter_source: string | null;
  filter_customer: string | null;
  filter_type: string | null;
  filter_from: string | null;
  filter_to: string | null;

  format: "PDF" | "CSV" | "XML" | string;
  row_count: number | null;

  storage_bucket: string;
  storage_path: string;

  download_count: number | null;
  last_download_at: string | null;
};


type Props = {
  open: boolean;
  onClose: () => void;
  defaultType?: string;
  forceSystemExports?: boolean; // ✅ nuevo
};


type Filters = {
  q: string;
  source: "" | "ALL" | "SYSTEM" | "PRODUCT";
  customer: string;
  type: string;
  from: string;
  to: string;
  format: "" | "PDF" | "CSV" | "XML";
};

type DownloadRow = {
  id: string;
  export_id: string;
  created_at: string;
  downloaded_by?: string | null;
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

function fileNameFromPath(path?: string | null) {
  if (!path) return "—";
  const clean = path.split("?")[0];
  const parts = clean.split("/");
  return parts[parts.length - 1] || clean;
}

function shortPath(bucket?: string | null, path?: string | null) {
  if (!bucket || !path) return "—";
  const p = path.length > 60 ? "…" + path.slice(-60) : path;
  return `${bucket}/${p}`;
}

function parseEdgeArray<T = any>(raw: any): T[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.rows)) return raw.rows;
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
}

export default function ExportsHistoryDialog({
  open,
  onClose,
  defaultType,
  forceSystemExports,
}: Props) {

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ExportRow[]>([]);
  const [error, setError] = useState("");

  const [page, setPage] = useState(0);
  const pageSize = 50;

  const [selected, setSelected] = useState<ExportRow | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // modal historial descargas
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [downloadsLoading, setDownloadsLoading] = useState(false);
  const [downloadsRows, setDownloadsRows] = useState<DownloadRow[]>([]);
  const [downloadsError, setDownloadsError] = useState("");

  const [filters, setFilters] = useState<Filters>({
    q: "",
    source: "",
    customer: "",
    type: defaultType ?? "",
    from: "",
    to: "",
    format: "",
  });

  const sourceOptions = useMemo(() => ["", "ALL", "SYSTEM", "PRODUCT"] as const, []);
  const formatOptions = useMemo(() => ["", "PDF", "CSV", "XML"] as const, []);

  useEffect(() => {
    if (!open) return;

    setSelected(null);
    setPage(0);
    setError("");

    setDownloadsOpen(false);
    setDownloadsRows([]);
    setDownloadsError("");

    // si defaultType viene, lo fijamos al abrir
    setFilters((prev) => ({ ...prev, type: defaultType ?? prev.type }));

    void load(0, { ...filters, type: defaultType ?? filters.type });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);





async function load(targetPage = page, f = filters) {
  setLoading(true);
  setError("");

  try {
    const raw = await admin_list_system_exports({
      // ✅ esta pantalla es SYSTEM (config changes exportados a system-exports)
      app_id: forceSystemExports ? "SYSTEM" : "DEBACU_EVAL",

      q: f.q || null,

      // ✅ IMPORTANTE:
      // En tu tabla audit_exports el campo "source" NO es "SYSTEM".
      // Así que para system exports NO filtres por source con valores SYSTEM/PRODUCT.
      source: forceSystemExports ? null : (f.source || null),

      customer_id: f.customer || null,
      type: f.type || null,
      from: f.from || null,
      to: f.to || null,
      format: f.format || null,

      limit: pageSize,
      offset: targetPage * pageSize,
    });

    const nextRows = parseEdgeArray<ExportRow>(raw);
    setRows(nextRows);

    if (!selected && nextRows.length > 0) setSelected(nextRows[0]);
  } catch (e: any) {
    console.error(e);
    setRows([]);
    setSelected(null);
    setError(e?.message ?? "Error cargando exportaciones");
  } finally {
    setLoading(false);
  }
}


  function applyFilters() {
    setPage(0);
    setSelected(null);
    void load(0, filters);
  }

  function resetFilters() {
    const next: Filters = {
      q: "",
      source: "",
      customer: "",
      type: defaultType ?? "",
      from: "",
      to: "",
      format: "",
    };
    setFilters(next);
    setPage(0);
    setSelected(null);
    void load(0, next);
  }

 async function downloadExport(r: ExportRow) {
  if (!r?.id) return;

  setDownloadingId(r.id);
  setError("");

  try {
    

   

    // refresca contadores
    await load(page, filters);
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
      const raw = await admin_list_export_downloads(exportId, 200, 0);
      const data = parseEdgeArray<DownloadRow>(raw);
      setDownloadsRows(data);
    } catch (e: any) {
      setDownloadsError(e?.message ?? "Error cargando descargas");
    } finally {
      setDownloadsLoading(false);
    }
  }

  if (!open) return null;

  const sel = selected;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      <div className="absolute left-1/2 top-1/2 w-[min(1450px,96vw)] -translate-x-1/2 -translate-y-1/2">
        <div className="flex h-[90vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {/* header */}
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-slate-900">
                Exportaciones (audit-exports)
              </div>
              <div className="mt-0.5 text-sm text-slate-500">
                Lista + detalle de entrega + histórico de descargas.
              </div>
            </div>

            <button
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cerrar
            </button>
          </div>

          <div className="grid flex-1 grid-cols-12 overflow-hidden">
            {/* LEFT */}
            <div className="col-span-12 flex min-w-0 flex-col lg:col-span-8">
              {/* filters */}
              <div className="border-b border-slate-200 px-5 py-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                  <div className="md:col-span-4">
                    <label className="text-xs font-medium text-slate-600">Buscar</label>
                    <input
                      value={filters.q}
                      onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                      placeholder="storage_path, delivered_to, email…"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs font-medium text-slate-600">Source</label>
                    <select
                      value={filters.source}
                      onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value as any }))}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                    >
                      {sourceOptions.map((s) => (
                        <option key={s} value={s}>
                          {s === "" ? "Todos" : s}
                        </option>
                      ))}
                    </select>
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

                  <div className="md:col-span-2">
                    <label className="text-xs font-medium text-slate-600">Formato</label>
                    <select
                      value={filters.format}
                      onChange={(e) => setFilters((f) => ({ ...f, format: e.target.value as any }))}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                    >
                      {formatOptions.map((x) => (
                        <option key={x} value={x}>
                          {x === "" ? "Todos" : x}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-4">
                    <label className="text-xs font-medium text-slate-600">filter_type</label>
                    <input
                      value={filters.type}
                      onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
                      placeholder="CHECK_SIGNALS, CONFIG_CHANGES…"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>

                  <div className="md:col-span-4">
                    <label className="text-xs font-medium text-slate-600">filter_customer</label>
                    <input
                      value={filters.customer}
                      onChange={(e) => setFilters((f) => ({ ...f, customer: e.target.value }))}
                      placeholder="email / customer ref (según tu vista)"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>

                  <div className="md:col-span-12 flex flex-wrap items-center gap-2 pt-1">
                    <button
                      onClick={applyFilters}
                      className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
                      disabled={loading}
                    >
                      Aplicar
                    </button>
                    <button
                      onClick={resetFilters}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      disabled={loading}
                    >
                      Reset
                    </button>

                    <div className="ml-auto text-sm text-slate-600">
                      {loading ? "Cargando…" : `${rows.length} resultados`}
                    </div>
                  </div>
                </div>

                {error ? (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}
              </div>

              {/* table */}
              <div className="flex-1 min-w-0 overflow-hidden">
                <div className="h-full w-full overflow-auto">
                  <table className="w-full table-fixed text-sm">
                    <thead className="sticky top-0 z-10 bg-white">
                      <tr className="border-b border-slate-200 text-slate-600">
                        <th className="w-[170px] px-4 py-3 text-left">Fecha</th>
                        <th className="w-[160px] px-4 py-3 text-left">Tipo</th>
                        <th className="w-[90px] px-4 py-3 text-left">Formato</th>
                        <th className="min-w-[420px] px-4 py-3 text-left">Archivo</th>
                        <th className="w-[150px] px-4 py-3 text-left">Descargas</th>
                        <th className="w-[200px] px-4 py-3 text-left">Entregado</th>
                        <th className="w-[140px] px-4 py-3 text-right">Acciones</th>
                      </tr>
                    </thead>

                    <tbody>
                      {rows.map((r) => {
                        const isSel = selected?.id === r.id;
                        const downloads = Number(r.download_count ?? 0);

                        return (
                          <tr
                            key={r.id}
                            className={cx(
                              "border-b border-slate-100 hover:bg-slate-50",
                              isSel && "bg-slate-50"
                            )}
                            onClick={() => setSelected(r)}
                            style={{ cursor: "pointer" }}
                          >
                            <td className="px-4 py-3 align-top">{fmtDateTime(r.created_at)}</td>

                            <td className="px-4 py-3 align-top">
                              <div className="font-medium text-slate-900">{r.filter_type ?? "—"}</div>
                              <div className="text-xs text-slate-500">
                                {r.filter_from || r.filter_to
                                  ? `${r.filter_from ?? "—"} → ${r.filter_to ?? "—"}`
                                  : r.filter_source ?? "—"}
                              </div>
                            </td>

                            <td className="px-4 py-3 align-top">{r.format}</td>

                            <td className="px-4 py-3 align-top">
                              <div className="truncate font-medium text-slate-900">
                                {fileNameFromPath(r.storage_path)}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {shortPath(r.storage_bucket, r.storage_path)}
                              </div>
                            </td>

                            <td className="px-4 py-3 align-top">
                              <div className="font-medium text-slate-900">{downloads}</div>
                              <div className="text-xs text-slate-500">
                                {r.last_download_at ? fmtDateTime(r.last_download_at) : "—"}
                              </div>
                            </td>

                            <td className="px-4 py-3 align-top">
                              <div className="text-slate-900">{r.delivered_to_org ?? r.delivered_to_name ?? "—"}</div>
                              <div className="text-xs text-slate-500">
                                {r.delivered_to_reason ?? "—"} · {r.delivered_to_reference ?? "—"}
                              </div>
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
                  Selecciona una exportación para ver entrega, filtros y descargas.
                </div>
              </div>

              <div className="flex-1 overflow-auto px-5 py-4">
                {!sel ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    Ninguna exportación seleccionada.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-xs text-slate-500">Archivo</div>
                      <div className="mt-1 font-medium text-slate-900">
                        {fileNameFromPath(sel.storage_path)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {sel.format} · {sel.row_count ?? 0} filas
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        {sel.storage_bucket}/{sel.storage_path}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-xs text-slate-500">Filtros aplicados</div>
                      <div className="mt-2 space-y-1 text-sm text-slate-900">
                        <div>
                          <span className="text-slate-500">source:</span> {sel.filter_source ?? "—"}
                        </div>
                        <div>
                          <span className="text-slate-500">customer:</span> {sel.filter_customer ?? "—"}
                        </div>
                        <div>
                          <span className="text-slate-500">type:</span> {sel.filter_type ?? "—"}
                        </div>
                        <div>
                          <span className="text-slate-500">rango:</span>{" "}
                          {sel.filter_from ?? "—"} → {sel.filter_to ?? "—"}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-xs text-slate-500">Entrega</div>
                      <div className="mt-2 space-y-1 text-sm text-slate-900">
                        <div>
                          <span className="text-slate-500">Nombre:</span> {sel.delivered_to_name ?? "—"}
                        </div>
                        <div>
                          <span className="text-slate-500">Org:</span> {sel.delivered_to_org ?? "—"}
                        </div>
                        <div>
                          <span className="text-slate-500">Motivo:</span> {sel.delivered_to_reason ?? "—"}
                        </div>
                        <div>
                          <span className="text-slate-500">Ref:</span> {sel.delivered_to_reference ?? "—"}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-xs text-slate-500">Descargas</div>
                      <div className="mt-2 space-y-1 text-sm text-slate-900">
                        <div>
                          <span className="text-slate-500">Total:</span> {Number(sel.download_count ?? 0)}
                        </div>
                        <div>
                          <span className="text-slate-500">Última:</span>{" "}
                          {sel.last_download_at ? fmtDateTime(sel.last_download_at) : "—"}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => void openDownloadsHistory(sel.id)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          Ver histórico
                        </button>

                        <button
                          onClick={() => void downloadExport(sel)}
                          className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
                          disabled={downloadingId === sel.id}
                        >
                          {downloadingId === sel.id ? "Generando…" : "Descargar / Imprimir"}
                        </button>
                      </div>

                      {downloadsError ? (
                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                          {downloadsError}
                        </div>
                      ) : null}
                    </div>

                    <div className="text-xs text-slate-500">
                      Generado por: {sel.generated_by_email ?? "—"} · {fmtDateTime(sel.created_at)}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
                Nota: el log de descargas se crea al generar la URL firmada.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal descargas */}
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
                    Export: {selected ? fileNameFromPath(selected.storage_path) : "—"}
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
                {downloadsLoading ? (
                  <div className="px-3 py-8 text-center text-slate-500">Cargando…</div>
                ) : downloadsRows.length === 0 ? (
                  <div className="px-3 py-8 text-center text-slate-500">No hay descargas registradas.</div>
                ) : (
                  <table className="w-full table-fixed text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-slate-200 text-slate-600">
                        <th className="w-[210px] px-3 py-3 text-left">Fecha</th>
                        <th className="w-[240px] px-3 py-3 text-left">Email</th>
                        <th className="w-[150px] px-3 py-3 text-left">IP</th>
                        <th className="px-3 py-3 text-left">User Agent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {downloadsRows.map((d) => (
                        <tr key={d.id} className="border-b border-slate-100">
                          <td className="px-3 py-3 align-top">{fmtDateTime(d.created_at)}</td>
                          <td className="px-3 py-3 align-top">{d.downloaded_by_email ?? "—"}</td>
                          <td className="px-3 py-3 align-top">{d.ip ?? "—"}</td>
                          <td className="px-3 py-3 align-top">
                            <div className="truncate">{d.user_agent ?? "—"}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
                Si aquí no aparece nada: es que nadie ha generado URL firmada para ese export.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
