import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  list_audit_events,
  admin_list_customers,
  list_audit_types,
  export_audit_events,
  type AuditExportFormat,
} from "@/services/adminService";
import { DataTable, Th, Tr, Td } from "@/components/ui/DataTable";

type AuditSource = "ALL" | "PRODUCT" | "SYSTEM";

type AuditFilters = {
  source: AuditSource;
  customerQuery: string; // id o email (o parte)
  customerSelected?: { customer_id: string; email?: string | null } | null;
  type: string; // "" = todos
  dateFrom: string; // yyyy-mm-dd
  dateTo: string; // yyyy-mm-dd
};

function shortId(v?: string | null, n = 10) {
  if (!v) return "—";
  return v.length <= n ? v : `${v.slice(0, n)}…`;
}

function toISOStart(dateYYYYMMDD: string) {
  return dateYYYYMMDD ? new Date(`${dateYYYYMMDD}T00:00:00`).toISOString() : "";
}

function toISOEnd(dateYYYYMMDD: string) {
  if (!dateYYYYMMDD) return "";
  const d = new Date(`${dateYYYYMMDD}T23:59:59.999`);
  return d.toISOString();
}

function cx(...cls: Array<string | false | null | undefined>) {
  return cls.filter(Boolean).join(" ");
}

export default function AdminAuditPage() {
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<any[]>([]);

  const [filters, setFilters] = useState<AuditFilters>({
    source: "ALL",
    customerQuery: "",
    customerSelected: null,
    type: "",
    dateFrom: "",
    dateTo: "",
  });

  const [applied, setApplied] = useState<AuditFilters>(filters);

  // ---- Tipos disponibles
  const [types, setTypes] = useState<string[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);

  // ---- Autocomplete clientes
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerOptions, setCustomerOptions] = useState<
    Array<{ customer_id: string; email?: string | null }>
  >([]);
  const customerBoxRef = useRef<HTMLDivElement | null>(null);
  const customerTimer = useRef<number | null>(null);

  // ---- EXPORT UI
  const [exportOpen, setExportOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportFormat, setExportFormat] = useState<AuditExportFormat>("PDF");
  const [exportForm, setExportForm] = useState({
    delivered_to_name: "",
    delivered_to_org: "",
    delivered_to_reason: "",
    delivered_to_reference: "",
  });
  const [exportError, setExportError] = useState<string>("");

  const load = async (f: AuditFilters) => {
    setLoading(true);
    try {
      const customerParam =
        f.customerSelected?.email?.trim() ||
        f.customerSelected?.customer_id?.trim() ||
        f.customerQuery.trim() ||
        null;

      const data = await list_audit_events({
        source: f.source,
        customer: customerParam,
        type: f.type || null,
        from: f.dateFrom ? toISOStart(f.dateFrom) : null,
        to: f.dateTo ? toISOEnd(f.dateTo) : null,
        limit: 200,
        offset: 0,
      });

      setEvents(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(applied);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    applied.source,
    applied.customerQuery,
    applied.type,
    applied.dateFrom,
    applied.dateTo,
    applied.customerSelected,
  ]);

  // cargar tipos cuando cambia el origen
  useEffect(() => {
    let cancel = false;
    void (async () => {
      setLoadingTypes(true);
      try {
        const t = await list_audit_types(filters.source);
        if (!cancel) setTypes(Array.isArray(t) ? t : []);
      } finally {
        if (!cancel) setLoadingTypes(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [filters.source]);

  // cerrar dropdown de clientes al hacer click fuera
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = customerBoxRef.current;
      if (!el) return;
      if (!el.contains(e.target as any)) setCustomerOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // buscar clientes con debounce cuando escribes
  useEffect(() => {
    const q = filters.customerQuery.trim();

    // si había selección y escribe algo distinto, anulamos selección
    if (
      filters.customerSelected &&
      q &&
      filters.customerSelected.email !== q &&
      filters.customerSelected.customer_id !== q
    ) {
      setFilters((s) => ({ ...s, customerSelected: null }));
    }

    if (customerTimer.current) window.clearTimeout(customerTimer.current);

    if (!q) {
      setCustomerOptions([]);
      return;
    }

    customerTimer.current = window.setTimeout(() => {
      void (async () => {
        setCustomerLoading(true);
        try {
          const opts = await admin_list_customers(q);
          setCustomerOptions(Array.isArray(opts) ? opts : []);
          setCustomerOpen(true);
        } finally {
          setCustomerLoading(false);
        }
      })();
    }, 250);

    return () => {
      if (customerTimer.current) window.clearTimeout(customerTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.customerQuery]);

  const rows = useMemo(() => events ?? [], [events]);

  const applyFilters = () => setApplied(filters);

  const resetFilters = () => {
    const reset: AuditFilters = {
      source: "ALL",
      customerQuery: "",
      customerSelected: null,
      type: "",
      dateFrom: "",
      dateTo: "",
    };
    setFilters(reset);
    setApplied(reset);
    setCustomerOptions([]);
    setCustomerOpen(false);
  };

  const selectCustomer = (opt: { customer_id: string; email?: string | null }) => {
    setFilters((s) => ({
      ...s,
      customerSelected: opt,
      customerQuery: opt.email || opt.customer_id,
    }));
    setCustomerOpen(false);
  };

  const openExport = () => {
    setExportError("");
    setExportOpen(true);
  };

  const closeExport = () => {
    setExportOpen(false);
    setExportLoading(false);
    setExportError("");
  };

  const doExport = async () => {
    setExportError("");

    if (!exportForm.delivered_to_name.trim()) {
      setExportError("Falta: A quién se entrega");
      return;
    }
    if (!exportForm.delivered_to_reason.trim()) {
      setExportError("Falta: Motivo/Finalidad");
      return;
    }

    const customerParam =
      applied.customerSelected?.email?.trim() ||
      applied.customerSelected?.customer_id?.trim() ||
      applied.customerQuery.trim() ||
      null;

    setExportLoading(true);
    try {
      const res = await export_audit_events({
        format: exportFormat,
        source: applied.source,
        customer: customerParam,
        type: applied.type || null,
        from: applied.dateFrom ? toISOStart(applied.dateFrom) : null,
        to: applied.dateTo ? toISOEnd(applied.dateTo) : null,

        delivered_to_name: exportForm.delivered_to_name.trim(),
        delivered_to_org: exportForm.delivered_to_org.trim() || null,
        delivered_to_reason: exportForm.delivered_to_reason.trim(),
        delivered_to_reference: exportForm.delivered_to_reference.trim() || null,
      });

      if (res?.signed_url) {
        window.open(res.signed_url, "_blank", "noopener,noreferrer");
      }

      closeExport();
    } catch (e: any) {
      setExportError(e?.message || "Error exportando");
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <section className="flex h-full min-h-0 w-full min-w-0 flex-col gap-3 overflow-hidden">
      {/* HEADER (1 fila) */}
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-2">
            <h1 className="shrink-0 text-lg font-semibold text-slate-900">
              Auditoría
            </h1>
            <p className="min-w-0 truncate text-xs text-slate-500">
              Consultas y acciones de clientes + eventos del sistema (Stripe).
            </p>
          </div>
        </div>

        <div className="shrink-0 text-xs text-slate-600">
          {loading ? "Cargando…" : `${rows.length} eventos`}
        </div>
      </div>

      {/* CARD 1: FILTROS (COMPACTO) */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Barra superior: título+desc + botones a la derecha */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="shrink-0 text-xs font-semibold text-slate-900">
                Filtros
              </h2>
              <span className="min-w-0 truncate text-[11px] text-slate-500">
                Acota por origen, cliente, tipo y rango de fechas.
              </span>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <button
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
              onClick={openExport}
            >
              Exportar
            </button>

            <button
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800"
              onClick={applyFilters}
            >
              Aplicar
            </button>
            <button
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
              onClick={resetFilters}
            >
              Limpiar
            </button>
          </div>
        </div>

        {/* Fila única de filtros */}
        <div className="px-4 py-3">
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-12 items-end">
            {/* Origen */}
            <div className="xl:col-span-2 min-w-0">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Origen
              </label>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                value={filters.source}
                onChange={(e) =>
                  setFilters((s) => ({
                    ...s,
                    source: e.target.value as AuditSource,
                    type: "",
                  }))
                }
              >
                <option value="ALL">Ambos</option>
                <option value="PRODUCT">Producto</option>
                <option value="SYSTEM">Stripe/Sistema</option>
              </select>
            </div>

            {/* Cliente */}
            <div className="xl:col-span-4 min-w-0" ref={customerBoxRef}>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Cliente (id/email)
              </label>

              <div className="relative mt-1">
                <input
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 pr-8 text-xs"
                  placeholder="Ej: c816… o ana@hotel.com"
                  value={filters.customerQuery}
                  onFocus={() => {
                    if (customerOptions.length > 0) setCustomerOpen(true);
                  }}
                  onChange={(e) =>
                    setFilters((s) => ({ ...s, customerQuery: e.target.value }))
                  }
                />
                <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
                  {customerLoading ? "…" : ""}
                </div>

                {customerOpen &&
                  (customerOptions.length > 0 || customerLoading) && (
                    <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                      <div className="max-h-56 overflow-auto">
                        {customerOptions.length === 0 && customerLoading ? (
                          <div className="px-3 py-2 text-xs text-slate-500">
                            Buscando…
                          </div>
                        ) : (
                          customerOptions.map((opt) => (
                            <button
                              key={opt.customer_id}
                              type="button"
                              onClick={() => selectCustomer(opt)}
                              className={cx(
                                "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-slate-50",
                                filters.customerSelected?.customer_id ===
                                  opt.customer_id && "bg-slate-50"
                              )}
                            >
                              <div className="min-w-0">
                                <div className="truncate text-slate-900">
                                  {opt.email || "—"}
                                </div>
                                <div className="truncate text-[11px] text-slate-500">
                                  {opt.customer_id}
                                </div>
                              </div>
                              <span className="shrink-0 text-[11px] text-slate-400">
                                seleccionar
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
              </div>

              {filters.customerSelected && (
                <div className="mt-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-700">
                    {filters.customerSelected.email ||
                      shortId(filters.customerSelected.customer_id, 20)}
                    <button
                      type="button"
                      className="text-slate-500 hover:text-slate-700"
                      onClick={() =>
                        setFilters((s) => ({
                          ...s,
                          customerSelected: null,
                          customerQuery: "",
                        }))
                      }
                      aria-label="Quitar cliente"
                    >
                      ✕
                    </button>
                  </span>
                </div>
              )}
            </div>

            {/* Tipo */}
            <div className="xl:col-span-2 min-w-0">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Tipo
              </label>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                value={filters.type}
                onChange={(e) =>
                  setFilters((s) => ({ ...s, type: e.target.value }))
                }
              >
                <option value="">
                  {loadingTypes ? "Cargando…" : "Todos"}
                </option>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Desde */}
            <div className="xl:col-span-2 min-w-0">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Desde
              </label>
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                value={filters.dateFrom}
                onChange={(e) =>
                  setFilters((s) => ({ ...s, dateFrom: e.target.value }))
                }
              />
            </div>

            {/* Hasta */}
            <div className="xl:col-span-2 min-w-0">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Hasta
              </label>
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                value={filters.dateTo}
                onChange={(e) =>
                  setFilters((s) => ({ ...s, dateTo: e.target.value }))
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* CARD 2: TABLA (CRECE + SCROLL) */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Eventos</h2>
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-scroll">
          <div className="min-w-[1100px] text-xs">
            <DataTable>
              <thead className="sticky top-0 z-10 bg-white">
                <tr>
                  <Th className="text-[11px] uppercase tracking-wider text-slate-500">Fecha</Th>
                  <Th className="text-[11px] uppercase tracking-wider text-slate-500">Origen</Th>
                  <Th className="text-[11px] uppercase tracking-wider text-slate-500">Tipo</Th>
                  <Th className="text-[11px] uppercase tracking-wider text-slate-500">Cliente</Th>
                  <Th className="text-[11px] uppercase tracking-wider text-slate-500">App</Th>
                  <Th className="text-[11px] uppercase tracking-wider text-slate-500">Stripe</Th>
                  <Th className="text-[11px] uppercase tracking-wider text-slate-500">Payload</Th>
                </tr>
              </thead>

              <tbody>
                {rows.length === 0 && !loading ? (
                  <Tr>
                    <Td className="py-6 text-center text-xs text-slate-500" colSpan={7 as any}>
                      Sin eventos para estos filtros.
                    </Td>
                  </Tr>
                ) : (
                  rows.map((ev) => (
                    <Tr key={ev.id}>
                      <Td className="whitespace-nowrap text-xs text-slate-500">
                        {ev.created_at ? new Date(ev.created_at).toLocaleString() : "—"}
                      </Td>
                      <Td className="whitespace-nowrap text-xs">{ev.source ?? "—"}</Td>
                      <Td className="whitespace-nowrap text-xs">{ev.type ?? "—"}</Td>
                      <Td className="whitespace-nowrap text-xs" title={ev.customer_id ?? ""}>
                        {shortId(ev.customer_id, 14)}
                      </Td>
                      <Td className="whitespace-nowrap text-xs">{ev.app_id ?? "—"}</Td>
                      <Td className="whitespace-nowrap text-xs" title={ev.stripe_subscription_id ?? ""}>
                        {ev.stripe_subscription_id ? shortId(ev.stripe_subscription_id, 16) : "—"}
                      </Td>

                      <Td className="text-xs text-slate-600">
                        {ev.payload ? (
                          <details>
                            <summary className="cursor-pointer select-none">
                              <span className="inline-block max-w-[520px] truncate align-middle">
                                {JSON.stringify(ev.payload)}
                              </span>
                              <span className="ml-2 text-[11px] text-slate-400">ver</span>
                            </summary>
                            <pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-[11px] text-slate-700">
                              {JSON.stringify(ev.payload, null, 2)}
                            </pre>
                          </details>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </Td>
                    </Tr>
                  ))
                )}
              </tbody>
            </DataTable>
          </div>
        </div>
      </section>

      {/* MODAL EXPORT */}
      {exportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Exportar auditoría</p>
                <p className="text-[11px] text-slate-500">
                  Se registrará quién exporta y a quién se entrega.
                </p>
              </div>
              <button
                className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-50"
                onClick={closeExport}
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              {exportError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {exportError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="md:col-span-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Formato
                  </label>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value as AuditExportFormat)}
                  >
                    <option value="PDF">PDF</option>
                    <option value="CSV">CSV</option>
                    <option value="XML">XML</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Filtros aplicados
                  </label>
                  <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
                    <div>Origen: <b>{applied.source}</b></div>
                    <div>
                      Cliente: <b>{(applied.customerSelected?.email || applied.customerQuery || "Todos")}</b>
                    </div>
                    <div>Tipo: <b>{applied.type || "Todos"}</b></div>
                    <div>
                      Fechas: <b>{applied.dateFrom || "—"}</b> → <b>{applied.dateTo || "—"}</b>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    A quién se entrega *
                  </label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
                    placeholder="Ej: Inspector AEPD / Juzgado / Agencia..."
                    value={exportForm.delivered_to_name}
                    onChange={(e) => setExportForm((s) => ({ ...s, delivered_to_name: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Organismo / Entidad
                  </label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
                    placeholder="Ej: AEPD / Policía / Guardia Civil..."
                    value={exportForm.delivered_to_org}
                    onChange={(e) => setExportForm((s) => ({ ...s, delivered_to_org: e.target.value }))}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Motivo / Finalidad *
                  </label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
                    placeholder="Ej: Inspección / Requerimiento / Procedimiento..."
                    value={exportForm.delivered_to_reason}
                    onChange={(e) => setExportForm((s) => ({ ...s, delivered_to_reason: e.target.value }))}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Referencia (expediente, ticket, etc.)
                  </label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
                    placeholder="Ej: EXP-2026-000123"
                    value={exportForm.delivered_to_reference}
                    onChange={(e) => setExportForm((s) => ({ ...s, delivered_to_reference: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <button
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                onClick={closeExport}
                disabled={exportLoading}
              >
                Cancelar
              </button>
              <button
                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                onClick={doExport}
                disabled={exportLoading}
              >
                {exportLoading ? "Generando…" : "Generar y descargar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
