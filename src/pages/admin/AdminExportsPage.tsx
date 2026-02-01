// src/pages/admin/AdminExportsPage.tsx  (ajusta la ruta si la tienes en otro sitio)
import React, { useEffect, useMemo, useState } from "react";
import {
  admin_list_system_exports,
  admin_list_export_downloads,
  admin_get_signed_export_url,
} from "@/services/adminService";
import { DataTable, Th, Tr, Td } from "@/components/ui/DataTable";

type ExportFormat = "CSV" | "PDF" | "XML" | "";

type Filters = {
  q: string;
  customer: string;
  from: string; // yyyy-mm-dd
  to: string; // yyyy-mm-dd
  format: ExportFormat;
};

type SignedUrlResponse = {
  ok: boolean;
  signed_url: string;
  expires_in: number;
};

type ExportRow = {
  id: string;
  created_at: string;
  generated_by_email?: string | null;
  format?: string | null;
  storage_path?: string | null;
  storage_bucket?: string | null;
  row_count?: number | null;
  download_count?: number | null;
  last_download_at?: string | null;

  delivered_to_name?: string | null;
  delivered_to_org?: string | null;
  delivered_to_reason?: string | null;
  delivered_to_reference?: string | null;
};

type DownloadRow = {
  id: string;
  export_id?: string;
  created_at: string;
  downloaded_by_email?: string | null;
  ip?: string | null;
  user_agent?: string | null;
};

function short(v?: string | null, n = 18) {
  if (!v) return "—";
  return v.length <= n ? v : `${v.slice(0, n)}…`;
}

function fmt(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
}

export default function AdminExportsPage() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ExportRow[]>([]);
  const [error, setError] = useState("");

  const [filters, setFilters] = useState<Filters>({
    q: "",
    customer: "",
    from: "",
    to: "",
    format: "",
  });
  const [applied, setApplied] = useState<Filters>(filters);

  // Drawer descargas
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [downloadsLoading, setDownloadsLoading] = useState(false);
  const [downloadsRows, setDownloadsRows] = useState<DownloadRow[]>([]);
  const [selectedExport, setSelectedExport] = useState<ExportRow | null>(null);

  // Para deshabilitar botones mientras genera
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function load(f: Filters) {
    setLoading(true);
    setError("");

    try {
      const data = await admin_list_system_exports({
        q: f.q?.trim() || null,
        customer_id: f.customer?.trim() || null,
        from: f.from || null,
        to: f.to || null,
        format: (f.format || null) as any,
        limit: 200,
        offset: 0,
      });

      // Si tu edge devuelve { data: [...] } o { rows: [...] }, aquí lo puedes adaptar.
      const list = Array.isArray(data)
        ? data
        : Array.isArray((data as any)?.data)
          ? (data as any).data
          : Array.isArray((data as any)?.rows)
            ? (data as any).rows
            : [];

      setRows(list as ExportRow[]);
    } catch (e: any) {
      setError(e?.message || "Error cargando exportaciones");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(applied);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied.q, applied.customer, applied.from, applied.to, applied.format]);

  const count = useMemo(() => rows.length, [rows]);

  const apply = () => setApplied(filters);

  const reset = () => {
    const r: Filters = { q: "", customer: "", from: "", to: "", format: "" };
    setFilters(r);
    setApplied(r);
  };

  const download = async (exportId: string) => {
  try {
    setError("");
    const res = await admin_get_signed_export_url(exportId, 600);
    window.open(res.signed_url, "_blank", "noopener,noreferrer");
  } catch (e: any) {
    setError(e?.message || "No se pudo generar la URL firmada");
  }
};


  const openDownloads = async (row: ExportRow) => {
    setSelectedExport(row);
    setDownloadsOpen(true);
    setDownloadsLoading(true);
    setDownloadsRows([]);
    setError("");

    try {
      const data = await admin_list_export_downloads(row.id, 200, 0);

      const list = Array.isArray(data)
        ? data
        : Array.isArray((data as any)?.data)
          ? (data as any).data
          : Array.isArray((data as any)?.rows)
            ? (data as any).rows
            : [];

      setDownloadsRows(list as DownloadRow[]);
    } catch (e: any) {
      setDownloadsRows([]);
      setError(e?.message || "No se pudieron cargar las descargas");
    } finally {
      setDownloadsLoading(false);
    }
  };

  return (
    <section className="relative flex h-full min-h-0 w-full min-w-0 flex-col gap-3 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            Exportaciones de auditoría
          </h1>
          <p className="text-xs text-slate-500">
            Histórico de entregas y descargas.
          </p>
        </div>
        <div className="text-xs text-slate-600">
          {loading ? "Cargando…" : `${count} registros`}
        </div>
      </div>

      {/* Filtros (mínimos, pero completos) */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
          <span className="text-xs font-semibold text-slate-900">Filtros</span>
          <div className="flex gap-2">
            <button
              onClick={apply}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white"
              disabled={loading}
            >
              Aplicar
            </button>
            <button
              onClick={reset}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px]"
              disabled={loading}
            >
              Limpiar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 px-4 py-3 xl:grid-cols-12">
          <div className="xl:col-span-4">
            <label className="text-[10px] uppercase text-slate-500">
              Búsqueda libre
            </label>
            <input
              className="mt-1 w-full rounded-lg border px-2.5 py-1.5 text-xs"
              placeholder="email, entregado a, referencia…"
              value={filters.q}
              onChange={(e) => setFilters((s) => ({ ...s, q: e.target.value }))}
            />
          </div>

          <div className="xl:col-span-3">
            <label className="text-[10px] uppercase text-slate-500">Cliente</label>
            <input
              className="mt-1 w-full rounded-lg border px-2.5 py-1.5 text-xs"
              placeholder="email / id"
              value={filters.customer}
              onChange={(e) =>
                setFilters((s) => ({ ...s, customer: e.target.value }))
              }
            />
          </div>

          <div className="xl:col-span-2">
            <label className="text-[10px] uppercase text-slate-500">Formato</label>
            <select
              className="mt-1 w-full rounded-lg border px-2.5 py-1.5 text-xs"
              value={filters.format}
              onChange={(e) =>
                setFilters((s) => ({ ...s, format: e.target.value as ExportFormat }))
              }
            >
              <option value="">Todos</option>
              <option value="PDF">PDF</option>
              <option value="CSV">CSV</option>
              <option value="XML">XML</option>
            </select>
          </div>

          <div className="xl:col-span-1">
            <label className="text-[10px] uppercase text-slate-500">Desde</label>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border px-2.5 py-1.5 text-xs"
              value={filters.from}
              onChange={(e) => setFilters((s) => ({ ...s, from: e.target.value }))}
            />
          </div>

          <div className="xl:col-span-2">
            <label className="text-[10px] uppercase text-slate-500">Hasta</label>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border px-2.5 py-1.5 text-xs"
              value={filters.to}
              onChange={(e) => setFilters((s) => ({ ...s, to: e.target.value }))}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Tabla */}
      <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Histórico de exportaciones
          </h2>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <DataTable>
            <thead className="sticky top-0 bg-white">
              <tr>
                <Th>Fecha</Th>
                <Th>Generado por</Th>
                <Th>Formato</Th>
                <Th>Fichero</Th>
                <Th>Descargas</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading ? (
                <Tr>
                  <Td colSpan={6 as any} className="py-6 text-center text-xs">
                    No hay exportaciones.
                  </Td>
                </Tr>
              ) : (
                rows.map((r) => (
                  <Tr key={r.id}>
                    <Td>{fmt(r.created_at)}</Td>
                    <Td title={r.generated_by_email ?? ""}>
                      {short(r.generated_by_email, 22)}
                    </Td>
                    <Td>{r.format ?? "—"}</Td>
                    <Td title={r.storage_path ?? ""}>
                      {short(r.storage_path, 36)}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <button
                        onClick={() => openDownloads(r)}
                        className="text-blue-700 underline text-xs"
                      >
                        {r.download_count ?? 0}
                      </button>
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <button
                        onClick={() => download(r.id)}
                        disabled={downloadingId === r.id}
                        className="rounded-md bg-slate-900 px-3 py-1 text-xs text-white disabled:opacity-60"
                      >
                        {downloadingId === r.id ? "Generando…" : "Descargar"}
                      </button>
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </DataTable>
        </div>
      </section>

      {/* Drawer descargas */}
      {downloadsOpen && (
        <div className="fixed inset-0 z-50">
          {/* overlay */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setDownloadsOpen(false)}
            aria-hidden="true"
          />

          {/* panel */}
          <div className="absolute right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl border-l border-slate-200 flex flex-col">
            <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <div className="font-semibold text-sm text-slate-900">
                  Descargas
                </div>
                <div className="text-xs text-slate-500 truncate">
                  {selectedExport?.storage_path ?? selectedExport?.id ?? "—"}
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  Total: {selectedExport?.download_count ?? 0} · Última:{" "}
                  {selectedExport?.last_download_at
                    ? fmt(selectedExport.last_download_at)
                    : "—"}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* botón descargar también aquí */}
                {selectedExport?.id ? (
                  <button
                    onClick={() => download(selectedExport.id)}
                    disabled={downloadingId === selectedExport.id}
                    className="rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-60"
                  >
                    {downloadingId === selectedExport.id ? "Generando…" : "Descargar"}
                  </button>
                ) : null}

                {/* ✅ botón cierre (te faltaba) */}
                <button
                  onClick={() => setDownloadsOpen(false)}
                  className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {downloadsLoading ? (
                <div className="text-xs text-slate-600">Cargando…</div>
              ) : downloadsRows.length === 0 ? (
                <div className="text-xs text-slate-500">
                  No hay descargas registradas.
                </div>
              ) : (
                <DataTable>
                  <thead className="sticky top-0 bg-white">
                    <tr>
                      <Th>Fecha</Th>
                      <Th>Usuario</Th>
                      <Th>IP</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {downloadsRows.map((d) => (
                      <Tr key={d.id}>
                        <Td>{fmt(d.created_at)}</Td>
                        <Td title={d.downloaded_by_email ?? ""}>
                          {short(d.downloaded_by_email, 26)}
                        </Td>
                        <Td>{d.ip ?? "—"}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </DataTable>
              )}
            </div>

            <div className="border-t px-4 py-3 text-[11px] text-slate-500">
              Nota: el log de descargas se crea al generar la URL firmada.
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
