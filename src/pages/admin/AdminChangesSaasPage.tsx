import React, { useEffect, useMemo, useState } from "react";
import {
  admin_list_config_changes_saas,
  type ConfigChangeSaasRow,
} from "@/services/adminService";

const cx = (...cls: Array<string | false | null | undefined>) => cls.filter(Boolean).join(" ");

function fmtMadrid(ts: string) {
  try {
    return new Date(ts).toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
  } catch {
    return ts;
  }
}

function safeInline(v: any) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function diffEntries(diff: Record<string, { before: any; after: any }>) {
  const entries = Object.entries(diff ?? {});
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  return entries;
}

export default function AdminChangesSaasPage() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ConfigChangeSaasRow[]>([]);
  const [error, setError] = useState<string>("");

  // filtros
  const [q, setQ] = useState("");
  const [from, setFrom] = useState<string>(""); // yyyy-mm-dd
  const [to, setTo] = useState<string>(""); // yyyy-mm-dd

  // paginación
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  // expand
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const page = useMemo(() => Math.floor(offset / limit) + 1, [offset, limit]);
  const pages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  const load = async (nextOffset = 0) => {
    setLoading(true);
    setError("");
    try {
      const data = await admin_list_config_changes_saas({
        q: q.trim() || null,
        from: from || null,
        to: to || null,
        limit,
        offset: nextOffset,
      });
      setRows(data.rows);
      setTotal(data.total);
      setOffset(data.offset);
    } catch (e: any) {
      setError(e?.message ?? "Error cargando cambios SaaS");
      setRows([]);
      setTotal(0);
      setOffset(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Cambios · Configuración SaaS</h1>
          <p className="text-sm text-slate-500">
            Auditoría de settings globales (retención, umbral de abuso, accesos). Sin rollback automático.
          </p>
        </div>

        <button
          onClick={() => void load(0)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          disabled={loading}
        >
          {loading ? "Cargando..." : "Refrescar"}
        </button>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Búsqueda</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="email / action..."
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

          <div className="ml-auto flex items-center gap-2">
            <select
              value={limit}
              onChange={(e) => {
                const n = Number(e.target.value);
                setLimit(n);
                void load(0);
              }}
              className="h-9 rounded-lg border border-slate-200 px-2 text-sm"
              disabled={loading}
              title="Filas por página"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}/pág
                </option>
              ))}
            </select>

            <button
              onClick={() => void load(0)}
              className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
              disabled={loading}
            >
              Aplicar
            </button>

            <button
              onClick={() => {
                setQ("");
                setFrom("");
                setTo("");
                void load(0);
              }}
              className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
              disabled={loading}
            >
              Limpiar
            </button>
          </div>
        </div>

        {error ? <div className="p-4 text-sm text-red-700">{error}</div> : null}

        <div className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {total} eventos · página {page}/{pages}
            </p>
            <p className="text-xs text-slate-400">Fuente: debacu_eval_settings_audit_log</p>
          </div>

          <div className="overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-xs text-slate-500">
                  <th className="px-3 py-2 text-left">FECHA (Madrid)</th>
                  <th className="px-3 py-2 text-left">ADMIN</th>
                  <th className="px-3 py-2 text-left">ACCIÓN</th>
                  <th className="px-3 py-2 text-left">CAMBIOS</th>
                  <th className="px-3 py-2 text-right">DETALLE</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={5}>
                      Cargando...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={5}>
                      Sin resultados
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const entries = diffEntries(r.diff || {});
                    return (
                      <React.Fragment key={r.id}>
                        <tr className="border-t border-slate-100">
                          <td className="px-3 py-2 whitespace-nowrap">{fmtMadrid(r.created_at)}</td>
                          <td className="px-3 py-2">{r.actor_email ?? "—"}</td>
                          <td className="px-3 py-2">{r.action}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-1">
                              {entries.length === 0 ? (
                                <span className="text-xs text-slate-500">—</span>
                              ) : (
                                entries.slice(0, 3).map(([k, v]) => (
                                  <div key={k} className="text-xs text-slate-700">
                                    <span className="font-semibold">{k}</span>:{" "}
                                    <span className="text-slate-500">{safeInline(v.before)}</span>{" "}
                                    → <span className="text-slate-900">{safeInline(v.after)}</span>
                                  </div>
                                ))
                              )}
                              {entries.length > 3 && (
                                <span className="text-[11px] text-slate-400">
                                  +{entries.length - 3} más…
                                </span>
                              )}
                              <span className="text-[11px] text-slate-400">id: {r.id}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() => setOpen((m) => ({ ...m, [r.id]: !m[r.id] }))}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              {open[r.id] ? "Ocultar" : "Ver JSON"}
                            </button>
                          </td>
                        </tr>

                        {open[r.id] && (
                          <tr className="border-t border-slate-100">
                            <td className="px-3 py-3" colSpan={5}>
                              <div className="grid gap-3 lg:grid-cols-2">
                                <div className="rounded-xl bg-slate-50 p-3">
                                  <p className="text-xs font-semibold text-slate-700 mb-2">Diff</p>
                                  <pre className="text-xs whitespace-pre-wrap">
                                    {JSON.stringify(r.diff ?? {}, null, 2)}
                                  </pre>
                                </div>
                                <div className="rounded-xl bg-slate-50 p-3">
                                  <p className="text-xs font-semibold text-slate-700 mb-2">Meta</p>
                                  <div className="text-xs text-slate-700 space-y-1">
                                    <div>
                                      <span className="font-semibold">IP:</span> {r.ip ?? "—"}
                                    </div>
                                    <div>
                                      <span className="font-semibold">User-Agent:</span>{" "}
                                      {r.user_agent ?? "—"}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button
              disabled={!canPrev || loading}
              onClick={() => void load(Math.max(0, offset - limit))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 disabled:opacity-50 hover:bg-slate-50"
            >
              ← Anterior
            </button>

            <button
              disabled={!canNext || loading}
              onClick={() => void load(offset + limit)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 disabled:opacity-50 hover:bg-slate-50"
            >
              Siguiente →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
