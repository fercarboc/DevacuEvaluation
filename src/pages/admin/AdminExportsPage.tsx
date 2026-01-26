import React, { useEffect, useMemo, useState } from "react";
import {
  list_audit_exports_v2,
  list_audit_export_downloads,
  sign_audit_export_url,
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

function short(v?: string | null, n = 14) {
  if (!v) return "—";
  return v.length <= n ? v : `${v.slice(0, n)}…`;
}

export default function AdminExportsPage() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState<string>("");

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
  const [downloadsRows, setDownloadsRows] = useState<any[]>([]);
  const [selectedExport, setSelectedExport] = useState<any | null>(null);

  const load = async (f: Filters) => {
    setLoading(true);
    setError("");
    try {
      const data = await list_audit_exports_v2({
        q: f.q.trim() || null,
        customer: f.customer.trim() || null,
        from: f.from || null,
        to: f.to || null,
        format: (f.format || null) as any,
        limit: 200,
        offset: 0,
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || "Error cargando exportaciones");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

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
      const { signed_url } = await sign_audit_export_url(exportId, 600);
      window.open(signed_url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      setError(e?.message || "No se pudo generar la URL firmada");
    }
  };

  const openDownloads = async (row: any) => {
    setSelectedExport(row);
    setDownloadsOpen(true);
    setDownloadsLoading(true);
    setError("");

    try {
      const data = await list_audit_export_downloads(row.id, 200, 0);
      setDownloadsRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || "No se pudieron cargar las descargas");
      setDownloadsRows([]);
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
            Histórico de entregas (quién, cuándo, a quién y por qué).
          </p>
        </div>
        <div className="text-xs text-slate-600">
          {loading ? "Cargando…" : `${count} registros`}
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
          <span className="text-xs font-semibold text-slate-900">Filtros</span>
          <div className="flex gap-2">
            <button
              onClick={apply}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white"
            >
              Aplicar
            </button>
            <button
              onClick={reset}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px]"
            >
              Limpiar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 px-4 py-3 xl:grid-cols-12">
          <div className="xl:col-span-3">
            <label className="text-[10px] uppercase text-slate-500">
              Búsqueda libre
            </label>
            <input
              className="mt-1 w-full rounded-lg border px-2.5 py-1.5 text-xs"
              placeholder="email, entregado a, referencia…"
              value={filters.q}
              onChange={(e) =>
                setFilters((s) => ({ ...s, q: e.target.value }))
              }
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
                setFilters((s) => ({
                  ...s,
                  format: e.target.value as ExportFormat,
                }))
              }
            >
              <option value="">Todos</option>
              <option value="PDF">PDF</option>
              <option value="CSV">CSV</option>
              <option value="XML">XML</option>
            </select>
          </div>

          <div className="xl:col-span-2">
            <label className="text-[10px] uppercase text-slate-500">Desde</label>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border px-2.5 py-1.5 text-xs"
              value={filters.from}
              onChange={(e) =>
                setFilters((s) => ({ ...s, from: e.target.value }))
              }
            />
          </div>

          <div className="xl:col-span-2">
            <label className="text-[10px] uppercase text-slate-500">Hasta</label>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border px-2.5 py-1.5 text-xs"
              value={filters.to}
              onChange={(e) =>
                setFilters((s) => ({ ...s, to: e.target.value }))
              }
            />
          </div>
        </div>
      </div>

      {/* Tabla */}
      <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Histórico de exportaciones
          </h2>
        </div>

        {error && <div className="px-5 py-2 text-xs text-red-600">{error}</div>}

        <div className="min-h-0 flex-1 overflow-auto">
          <DataTable>
            <thead className="sticky top-0 bg-white">
              <tr>
                <Th>Fecha</Th>
                <Th>Generado por</Th>
                <Th>Entregado a</Th>
                <Th>Organismo</Th>
                <Th>Motivo</Th>
                <Th>Formato</Th>
                <Th>Filas</Th>
                <Th>Fichero</Th>
                <Th>Descargas</Th>
                <Th></Th>
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 && !loading ? (
                <Tr>
                  <Td colSpan={10 as any} className="py-6 text-center text-xs">
                    No hay exportaciones.
                  </Td>
                </Tr>
              ) : (
                rows.map((r) => (
                  <Tr key={r.id}>
                    <Td>{new Date(r.created_at).toLocaleString()}</Td>
                    <Td title={r.generated_by_email}>{short(r.generated_by_email, 18)}</Td>
                    <Td>{r.delivered_to_name}</Td>
                    <Td>{r.delivered_to_org || "—"}</Td>
                    <Td title={r.delivered_to_reason}>
                      {short(r.delivered_to_reason, 18)}
                    </Td>
                    <Td>{r.format}</Td>
                    <Td>{r.row_count}</Td>
                    <Td title={r.storage_path}>{short(r.storage_path, 22)}</Td>

                    <Td className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-700">
                          {r.download_count ?? 0}
                        </span>
                        <button
                          onClick={() => openDownloads(r)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Ver
                        </button>
                      </div>
                    </Td>

                    <Td className="whitespace-nowrap">
                      <button
                        onClick={() => download(r.id)}
                        className="rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white"
                      >
                        Descargar
                      </button>
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </DataTable>
        </div>
      </section>

      {/* Drawer lateral: Descargas */}
      {downloadsOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setDownloadsOpen(false)}
          />
          <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl border-l border-slate-200 flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">Descargas</div>
                <div className="text-xs text-slate-500 truncate">
                  {selectedExport?.storage_path
                    ? selectedExport.storage_path
                    : selectedExport?.id}
                </div>
              </div>
              <button
                onClick={() => setDownloadsOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold"
              >
                Cerrar
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {downloadsLoading ? (
                <div className="text-xs text-slate-600">Cargando…</div>
              ) : downloadsRows.length === 0 ? (
                <div className="text-xs text-slate-600">
                  No hay descargas registradas.
                </div>
              ) : (
                <DataTable>
                  <thead className="sticky top-0 bg-white">
                    <tr>
                      <Th>Fecha</Th>
                      <Th>Usuario</Th>
                      <Th>IP</Th>
                      <Th>User agent</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {downloadsRows.map((d) => (
                      <Tr key={d.id}>
                        <Td>{new Date(d.created_at).toLocaleString()}</Td>
                        <Td title={d.downloaded_by_email}>
                          {short(d.downloaded_by_email, 22)}
                        </Td>
                        <Td>{d.ip || "—"}</Td>
                        <Td title={d.user_agent}>{short(d.user_agent, 46)}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </DataTable>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
