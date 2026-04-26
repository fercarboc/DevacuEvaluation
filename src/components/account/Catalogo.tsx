import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  RefreshCw,
  Save,
  Plus,
  X,
  Tag,
  Package,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { callEvalFn } from "@/services/callEvalFn";

/** =========================================================
 *  Tipos (aligned con tus Edge list actuales)
 * ========================================================= */
type ItemCatalogItem = {
  item_code: string;
  title: string | null;
  category: string | null;
  unit_price: number | null;
  currency: string | null;
  description: string | null;
  is_active: boolean;
  source?: "GLOBAL" | "OVERRIDE" | "CUSTOM"; // si lo devuelves
};

type IncidentCatalogItem = {
  incident_type: string;
  title: string | null;
  description: string | null;
  severity: number | null;
  default_gross_min: number | null;
  default_gross_max: number | null;
  default_recovery_pct: number | null;
  suggested_actions: string | null;
  is_active: boolean;
  source?: "GLOBAL" | "OVERRIDE" | "CUSTOM";
};

type TabKey = "items" | "incidents";

type Status = "idle" | "loading" | "saving" | "success" | "error";

function clampText(s: string, max: number) {
  const t = (s ?? "").trim();
  return t.length > max ? t.slice(0, max) : t;
}

function parseMoneyNullable(input: string): number | null {
  const t = (input ?? "").trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

function toCodeUpperSnake(input: string) {
  // Autogenera código estable a partir de título (solo para CUSTOM)
  const raw = (input ?? "").trim().toUpperCase();
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "CUSTOM_ITEM";
}

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-[92vw] max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-slate-700" />
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 hover:bg-slate-50"
            aria-label="Cerrar"
            title="Cerrar"
          >
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/** =========================================================
 *  Catalogo.tsx
 * ========================================================= */
export const Catalogo: React.FC = () => {
  const [tab, setTab] = useState<TabKey>("items");

  // carga listados
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const [items, setItems] = useState<ItemCatalogItem[]>([]);
  const [incidents, setIncidents] = useState<IncidentCatalogItem[]>([]);

  // filtros
  const [q, setQ] = useState("");
  const [filterSource, setFilterSource] = useState<"" | "GLOBAL" | "OVERRIDE" | "CUSTOM">("");
  const [filterCategory, setFilterCategory] = useState<string>(""); // items
  const [filterIncidentActive, setFilterIncidentActive] = useState<"" | "ACTIVE" | "INACTIVE">("");

  // ediciones (drafts locales)
  const [itemDrafts, setItemDrafts] = useState<Record<string, { is_active?: boolean; unit_price?: string }>>({});
  const [incidentDrafts, setIncidentDrafts] = useState<
    Record<
      string,
      {
        is_active?: boolean;
        title?: string;
        description?: string;
        severity?: string;
        default_gross_min?: string;
        default_gross_max?: string;
        default_recovery_pct?: string;
        suggested_actions?: string;
      }
    >
  >({});

  // modal custom
  const [openAddItem, setOpenAddItem] = useState(false);
  const [openAddIncident, setOpenAddIncident] = useState(false);

  const [newItem, setNewItem] = useState({
    title: "",
    item_code: "",
    category: "",
    unit_price: "",
    currency: "EUR",
    description: "",
    is_active: true,
    allow_edit_code: false, // si el user quiere tocar el código
  });

  const [newIncident, setNewIncident] = useState({
    title: "",
    incident_type: "",
    description: "",
    severity: "2",
    default_gross_min: "",
    default_gross_max: "",
    default_recovery_pct: "",
    suggested_actions: "",
    is_active: true,
    allow_edit_code: false,
  });

  /** =========================================================
   *  Load
   * ========================================================= */
  const loadAll = async () => {
    setStatus("loading");
    setError(null);
    try {
      // Items list
      const resItems = await callEvalFn<any>("debacu_eval_item_catalog_list", {});
      if (!resItems?.ok || !Array.isArray(resItems?.items)) {
        throw new Error(resItems?.error || "No se pudo cargar catálogo de items");
      }
      setItems(resItems.items);

      // Incidents list (ajusta el shape: tu antigua función devolvía {incidents:[]}; ahora te conviene {items:[]}
      const resInc = await callEvalFn<any>("debacu_eval_incident_catalog_list", {});
      const list = Array.isArray(resInc?.items)
        ? resInc.items
        : Array.isArray(resInc?.incidents)
        ? resInc.incidents
        : null;

      if (!resInc?.ok || !Array.isArray(list)) {
        throw new Error(resInc?.error || "No se pudo cargar catálogo de incidencias");
      }
      setIncidents(list);

      setStatus("idle");
    } catch (e: any) {
      setStatus("error");
      setError(String(e?.message ?? e));
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** =========================================================
   *  Helpers (draft)
   * ========================================================= */
  const setItemDraft = (item_code: string, patch: Partial<{ is_active: boolean; unit_price: string }>) => {
    setItemDrafts((prev) => ({
      ...prev,
      [item_code]: { ...(prev[item_code] || {}), ...patch },
    }));
  };

  const setIncidentDraft = (
    incident_type: string,
    patch: Partial<{
      is_active: boolean;
      title: string;
      description: string;
      severity: string;
      default_gross_min: string;
      default_gross_max: string;
      default_recovery_pct: string;
      suggested_actions: string;
    }>
  ) => {
    setIncidentDrafts((prev) => ({
      ...prev,
      [incident_type]: { ...(prev[incident_type] || {}), ...patch },
    }));
  };

  const itemEffective = (it: ItemCatalogItem) => {
    const d = itemDrafts[it.item_code];
    return {
      is_active: typeof d?.is_active === "boolean" ? d.is_active : it.is_active,
      unit_price_str:
        typeof d?.unit_price === "string"
          ? d.unit_price
          : it.unit_price === null || it.unit_price === undefined
          ? ""
          : String(it.unit_price),
    };
  };

  const incidentEffective = (ic: IncidentCatalogItem) => {
    const d = incidentDrafts[ic.incident_type];
    return {
      is_active: typeof d?.is_active === "boolean" ? d.is_active : ic.is_active,
      title: typeof d?.title === "string" ? d.title : ic.title ?? "",
      description: typeof d?.description === "string" ? d.description : ic.description ?? "",
      severity: typeof d?.severity === "string" ? d.severity : ic.severity === null ? "" : String(ic.severity),
      default_gross_min:
        typeof d?.default_gross_min === "string"
          ? d.default_gross_min
          : ic.default_gross_min === null
          ? ""
          : String(ic.default_gross_min),
      default_gross_max:
        typeof d?.default_gross_max === "string"
          ? d.default_gross_max
          : ic.default_gross_max === null
          ? ""
          : String(ic.default_gross_max),
      default_recovery_pct:
        typeof d?.default_recovery_pct === "string"
          ? d.default_recovery_pct
          : ic.default_recovery_pct === null
          ? ""
          : String(ic.default_recovery_pct),
      suggested_actions:
        typeof d?.suggested_actions === "string" ? d.suggested_actions : ic.suggested_actions ?? "",
    };
  };

  /** =========================================================
   *  SAVE (usa Edge de escritura)
   * =========================================================
   *  Necesitas implementar esta Edge:
   *  - supabase/functions/debacu_eval_catalog_manage/index.ts
   *
   *  body: { action: "...", payload: {...} }
   */
  const manage = async (action: string, payload: Record<string, any>) => {
    // En tu stack, callEvalFn ya mete Authorization + x-session-token
    return await callEvalFn<any>("debacu_eval_catalog_manage", { action, payload });
  };

  const saveItemOverride = async (it: ItemCatalogItem) => {
    setStatus("saving");
    setError(null);
    try {
      const eff = itemEffective(it);
      const unit_price = parseMoneyNullable(eff.unit_price_str);

      // override: solo toca is_active / unit_price (por hotel)
      const res = await manage("ITEM_OVERRIDE_UPSERT", {
        item_code: it.item_code,
        is_active: eff.is_active,
        unit_price,
      });

      if (!res?.ok) throw new Error(res?.error || "No se pudo guardar override");
      setStatus("success");
      setTimeout(() => setStatus("idle"), 900);
      await loadAll();
    } catch (e: any) {
      setStatus("error");
      setError(String(e?.message ?? e));
    }
  };

  const saveIncidentOverride = async (ic: IncidentCatalogItem) => {
    setStatus("saving");
    setError(null);
    try {
      const eff = incidentEffective(ic);

      const payload = {
        incident_type: ic.incident_type,
        is_active: eff.is_active,
        title_override: clampText(eff.title, 80) || null,
        description_override: clampText(eff.description, 300) || null,
        severity_override: eff.severity ? Math.max(1, Math.min(5, Number(eff.severity))) : null,
        default_gross_min_override: eff.default_gross_min ? parseMoneyNullable(eff.default_gross_min) : null,
        default_gross_max_override: eff.default_gross_max ? parseMoneyNullable(eff.default_gross_max) : null,
        default_recovery_pct_override: eff.default_recovery_pct
          ? Math.max(0, Math.min(100, Number(eff.default_recovery_pct)))
          : null,
        suggested_actions_override: clampText(eff.suggested_actions, 240) || null,
      };

      const res = await manage("INC_OVERRIDE_UPSERT", payload);
      if (!res?.ok) throw new Error(res?.error || "No se pudo guardar override");
      setStatus("success");
      setTimeout(() => setStatus("idle"), 900);
      await loadAll();
    } catch (e: any) {
      setStatus("error");
      setError(String(e?.message ?? e));
    }
  };

  const createCustomItem = async () => {
    setStatus("saving");
    setError(null);
    try {
      const title = clampText(newItem.title, 80);
      if (!title) throw new Error("Título obligatorio");

      const code = newItem.allow_edit_code
        ? toCodeUpperSnake(newItem.item_code)
        : toCodeUpperSnake(title);

      const unit_price = parseMoneyNullable(newItem.unit_price);
      if (unit_price === null) throw new Error("Precio obligatorio (número)");

      const res = await manage("ITEM_CUSTOM_UPSERT", {
        item_code: code,
        title,
        category: clampText(newItem.category, 40) || null,
        unit_price,
        currency: (newItem.currency || "EUR").toUpperCase().slice(0, 3),
        description: clampText(newItem.description, 240) || null,
        is_active: !!newItem.is_active,
      });

      if (!res?.ok) throw new Error(res?.error || "No se pudo crear item personalizado");
      setOpenAddItem(false);
      setNewItem({
        title: "",
        item_code: "",
        category: "",
        unit_price: "",
        currency: "EUR",
        description: "",
        is_active: true,
        allow_edit_code: false,
      });
      setStatus("success");
      setTimeout(() => setStatus("idle"), 900);
      await loadAll();
    } catch (e: any) {
      setStatus("error");
      setError(String(e?.message ?? e));
    }
  };

  const createCustomIncident = async () => {
    setStatus("saving");
    setError(null);
    try {
      const title = clampText(newIncident.title, 80);
      if (!title) throw new Error("Título obligatorio");

      const code = newIncident.allow_edit_code
        ? toCodeUpperSnake(newIncident.incident_type)
        : toCodeUpperSnake(title);

      const severity = Math.max(1, Math.min(5, Number(newIncident.severity || 2)));

      const res = await manage("INC_CUSTOM_UPSERT", {
        incident_type: code,
        title,
        description: clampText(newIncident.description, 300) || null,
        severity,
        default_gross_min: newIncident.default_gross_min ? parseMoneyNullable(newIncident.default_gross_min) : null,
        default_gross_max: newIncident.default_gross_max ? parseMoneyNullable(newIncident.default_gross_max) : null,
        default_recovery_pct: newIncident.default_recovery_pct
          ? Math.max(0, Math.min(100, Number(newIncident.default_recovery_pct)))
          : null,
        suggested_actions: clampText(newIncident.suggested_actions, 240) || null,
        is_active: !!newIncident.is_active,
      });

      if (!res?.ok) throw new Error(res?.error || "No se pudo crear incidente personalizado");
      setOpenAddIncident(false);
      setNewIncident({
        title: "",
        incident_type: "",
        description: "",
        severity: "2",
        default_gross_min: "",
        default_gross_max: "",
        default_recovery_pct: "",
        suggested_actions: "",
        is_active: true,
        allow_edit_code: false,
      });
      setStatus("success");
      setTimeout(() => setStatus("idle"), 900);
      await loadAll();
    } catch (e: any) {
      setStatus("error");
      setError(String(e?.message ?? e));
    }
  };

  /** =========================================================
   *  Derived filters
   * ========================================================= */
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      if (it.category) set.add(it.category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo(() => {
    const text = q.trim().toLowerCase();
    return items
      .filter((it) => {
        if (filterSource && (it.source || "GLOBAL") !== filterSource) return false;
        if (filterCategory && String(it.category || "") !== filterCategory) return false;
        if (!text) return true;
        const hay = `${it.item_code} ${it.title || ""} ${it.category || ""}`.toLowerCase();
        return hay.includes(text);
      })
      .sort((a, b) => String(a.title || a.item_code).localeCompare(String(b.title || b.item_code)));
  }, [items, q, filterSource, filterCategory]);

  const filteredIncidents = useMemo(() => {
    const text = q.trim().toLowerCase();
    return incidents
      .filter((ic) => {
        if (filterSource && (ic.source || "GLOBAL") !== filterSource) return false;
        if (filterIncidentActive === "ACTIVE" && !ic.is_active) return false;
        if (filterIncidentActive === "INACTIVE" && ic.is_active) return false;
        if (!text) return true;
        const hay = `${ic.incident_type} ${ic.title || ""}`.toLowerCase();
        return hay.includes(text);
      })
      .sort((a, b) => String(a.title || a.incident_type).localeCompare(String(b.title || b.incident_type)));
  }, [incidents, q, filterSource, filterIncidentActive]);

  /** =========================================================
   *  UI
   * ========================================================= */
  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Catálogo</h2>
            <p className="text-sm text-slate-600 mt-1">
              Catálogo global + configuración por hotel (override). Los personalizados son secundarios.
            </p>

            {error && (
              <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">
                <div className="font-semibold">Error</div>
                <div className="mt-1">{error}</div>
              </div>
            )}

            {status === "success" && (
              <div className="mt-3 text-xs text-green-700 bg-green-50 border border-green-100 rounded-xl p-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Guardado correctamente.
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadAll()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold"
              title="Recargar"
              type="button"
              disabled={status === "loading" || status === "saving"}
            >
              <RefreshCw className="w-4 h-4" />
              Recargar
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => setTab("items")}
          className={`px-4 py-2 rounded-xl text-sm font-semibold border ${
            tab === "items" ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200 text-slate-700"
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <Package className="w-4 h-4" /> Items / Objetos
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab("incidents")}
          className={`px-4 py-2 rounded-xl text-sm font-semibold border ${
            tab === "incidents" ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200 text-slate-700"
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Incidencias
          </span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Buscar</label>
            <div className="flex items-center gap-2 border border-slate-300 rounded-xl px-3 py-2">
              <Search className="w-4 h-4 text-slate-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full outline-none text-sm"
                placeholder="Código, título, categoría…"
              />
            </div>
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Fuente</label>
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white"
            >
              <option value="">Todas</option>
              <option value="GLOBAL">GLOBAL</option>
              <option value="OVERRIDE">OVERRIDE</option>
              <option value="CUSTOM">CUSTOM</option>
            </select>
          </div>

          {tab === "items" ? (
            <div className="md:col-span-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Categoría</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white"
              >
                <option value="">Todas</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="md:col-span-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Estado</label>
              <select
                value={filterIncidentActive}
                onChange={(e) => setFilterIncidentActive(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white"
              >
                <option value="">Todos</option>
                <option value="ACTIVE">Activos</option>
                <option value="INACTIVE">Inactivos</option>
              </select>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {tab === "items" ? (
              <>
                Mostrando <span className="font-semibold">{filteredItems.length}</span> items
              </>
            ) : (
              <>
                Mostrando <span className="font-semibold">{filteredIncidents.length}</span> incidencias
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {tab === "items" ? (
              <button
                type="button"
                onClick={() => setOpenAddItem(true)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold"
              >
                <Plus className="w-4 h-4" />
                Añadir item personalizado
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setOpenAddIncident(true)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold"
              >
                <Plus className="w-4 h-4" />
                Añadir incidencia personalizada
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      {tab === "items" ? (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-100 text-xs text-slate-600">
            Edita <strong>precio</strong> y <strong>activo</strong> por hotel. El <strong>código</strong> es estable.
          </div>

          <div className="divide-y divide-slate-100">
            {filteredItems.map((it) => {
              const eff = itemEffective(it);
              const src = it.source || "GLOBAL";
              const isCustom = src === "CUSTOM";

              return (
                <div key={it.item_code} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {it.title || it.item_code}
                        </div>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full border ${
                            src === "GLOBAL"
                              ? "border-slate-200 text-slate-600"
                              : src === "OVERRIDE"
                              ? "border-indigo-200 text-indigo-700"
                              : "border-emerald-200 text-emerald-700"
                          }`}
                        >
                          {src}
                        </span>
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        <span className="font-mono">{it.item_code}</span>
                        {it.category ? <> · {it.category}</> : null}
                        {it.currency ? <> · {it.currency}</> : null}
                      </div>

                      {it.description && <div className="mt-2 text-xs text-slate-600">{it.description}</div>}
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <label className="flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={!!eff.is_active}
                          onChange={(e) => setItemDraft(it.item_code, { is_active: e.target.checked })}
                          className="h-4 w-4"
                        />
                        Activo
                      </label>

                      <button
                        type="button"
                        onClick={() => void saveItemOverride(it)}
                        disabled={status === "saving" || status === "loading"}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white hover:bg-black text-xs font-semibold disabled:opacity-40"
                        title="Guardar override"
                      >
                        <Save className="w-4 h-4" />
                        Guardar
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-3">
                    <div className="md:col-span-3">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Precio unitario</label>
                      <input
                        value={eff.unit_price_str}
                        onChange={(e) => setItemDraft(it.item_code, { unit_price: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white"
                        placeholder="Ej: 15.00"
                      />
                      <div className="mt-1 text-[11px] text-slate-500">
                        Base global visible. Aquí se guarda el override del hotel.
                      </div>
                    </div>

                    <div className="md:col-span-9">
                      <div className="text-[11px] text-slate-500">
                        {isCustom ? (
                          <>
                            Este item es <strong>personalizado</strong> (solo existe en tu hotel). Puedes desactivarlo o
                            ajustar precio. El código debería mantenerse estable.
                          </>
                        ) : (
                          <>
                            Este item viene del <strong>catálogo global</strong>. Tu hotel solo puede ajustar precio y
                            activar/desactivar.
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {!filteredItems.length && (
              <div className="p-6 text-sm text-slate-600">No hay items con estos filtros.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-100 text-xs text-slate-600">
            Puedes ajustar por hotel: <strong>activo</strong> y parámetros por defecto (rangos, recovery, texto).
          </div>

          <div className="divide-y divide-slate-100">
            {filteredIncidents.map((ic) => {
              const eff = incidentEffective(ic);
              const src = ic.source || "GLOBAL";
              const isCustom = src === "CUSTOM";

              return (
                <div key={ic.incident_type} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {ic.title || ic.incident_type}
                        </div>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full border ${
                            src === "GLOBAL"
                              ? "border-slate-200 text-slate-600"
                              : src === "OVERRIDE"
                              ? "border-indigo-200 text-indigo-700"
                              : "border-emerald-200 text-emerald-700"
                          }`}
                        >
                          {src}
                        </span>
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        <span className="font-mono">{ic.incident_type}</span>
                      </div>

                      {ic.description && <div className="mt-2 text-xs text-slate-600">{ic.description}</div>}
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <label className="flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={!!eff.is_active}
                          onChange={(e) => setIncidentDraft(ic.incident_type, { is_active: e.target.checked })}
                          className="h-4 w-4"
                        />
                        Activo
                      </label>

                      <button
                        type="button"
                        onClick={() => void saveIncidentOverride(ic)}
                        disabled={status === "saving" || status === "loading"}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white hover:bg-black text-xs font-semibold disabled:opacity-40"
                        title="Guardar override"
                      >
                        <Save className="w-4 h-4" />
                        Guardar
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-3">
                    <div className="md:col-span-4">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Título</label>
                      <input
                        value={eff.title}
                        onChange={(e) => setIncidentDraft(ic.incident_type, { title: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white"
                        placeholder="Título"
                      />
                    </div>

                    <div className="md:col-span-8">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Descripción</label>
                      <input
                        value={eff.description}
                        onChange={(e) => setIncidentDraft(ic.incident_type, { description: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white"
                        placeholder="Descripción"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Severidad (1-5)</label>
                      <input
                        value={eff.severity}
                        onChange={(e) => setIncidentDraft(ic.incident_type, { severity: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white"
                        placeholder="2"
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Gross min (€)</label>
                      <input
                        value={eff.default_gross_min}
                        onChange={(e) => setIncidentDraft(ic.incident_type, { default_gross_min: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white"
                        placeholder="Ej: 10"
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Gross max (€)</label>
                      <input
                        value={eff.default_gross_max}
                        onChange={(e) => setIncidentDraft(ic.incident_type, { default_gross_max: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white"
                        placeholder="Ej: 200"
                      />
                    </div>

                    <div className="md:col-span-4">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Recovery %</label>
                      <input
                        value={eff.default_recovery_pct}
                        onChange={(e) => setIncidentDraft(ic.incident_type, { default_recovery_pct: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white"
                        placeholder="Ej: 100"
                      />
                    </div>

                    <div className="md:col-span-12">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Acciones sugeridas
                      </label>
                      <input
                        value={eff.suggested_actions}
                        onChange={(e) => setIncidentDraft(ic.incident_type, { suggested_actions: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white"
                        placeholder="Ej: Inventario, fotos, cargo…"
                      />
                      <div className="mt-1 text-[11px] text-slate-500">
                        {isCustom ? (
                          <>
                            Incidente <strong>personalizado</strong> (solo tu hotel). Ajusta lo que necesites.
                          </>
                        ) : (
                          <>
                            Incidente <strong>global</strong>. Aquí guardas overrides del hotel.
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {!filteredIncidents.length && (
              <div className="p-6 text-sm text-slate-600">No hay incidencias con estos filtros.</div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Add custom item */}
      <Modal open={openAddItem} title="Añadir item personalizado" onClose={() => setOpenAddItem(false)}>
        <div className="text-xs text-slate-600 mb-4">
          Esto es secundario. Úsalo solo si el hotel necesita algo que no existe en el catálogo global.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-7">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Título *</label>
            <input
              value={newItem.title}
              onChange={(e) => {
                const v = e.target.value;
                setNewItem((p) => ({
                  ...p,
                  title: v,
                  item_code: p.allow_edit_code ? p.item_code : toCodeUpperSnake(v),
                }));
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white"
              placeholder="Ej: Cargador iPhone"
            />
          </div>

          <div className="md:col-span-5">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Categoría</label>
            <input
              value={newItem.category}
              onChange={(e) => setNewItem((p) => ({ ...p, category: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white"
              placeholder="Ej: ROOM / ELECTRONICS"
            />
          </div>

          <div className="md:col-span-4">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Precio *</label>
            <input
              value={newItem.unit_price}
              onChange={(e) => setNewItem((p) => ({ ...p, unit_price: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white"
              placeholder="Ej: 15.00"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Moneda</label>
            <input
              value={newItem.currency}
              onChange={(e) => setNewItem((p) => ({ ...p, currency: e.target.value.toUpperCase().slice(0, 3) }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white"
              placeholder="EUR"
            />
          </div>

          <div className="md:col-span-6">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Descripción</label>
            <input
              value={newItem.description}
              onChange={(e) => setNewItem((p) => ({ ...p, description: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white"
              placeholder="Opcional"
            />
          </div>

          <div className="md:col-span-12">
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={newItem.is_active}
                onChange={(e) => setNewItem((p) => ({ ...p, is_active: e.target.checked }))}
                className="h-4 w-4"
              />
              Activo
            </label>
          </div>

          <div className="md:col-span-12 border-t border-slate-100 pt-3">
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={newItem.allow_edit_code}
                onChange={(e) =>
                  setNewItem((p) => ({
                    ...p,
                    allow_edit_code: e.target.checked,
                    item_code: e.target.checked ? p.item_code : toCodeUpperSnake(p.title),
                  }))
                }
                className="h-4 w-4"
              />
              Permitir editar código (solo si sabes lo que haces)
            </label>

            <div className="mt-2">
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">item_code</label>
              <input
                value={newItem.item_code}
                onChange={(e) => setNewItem((p) => ({ ...p, item_code: toCodeUpperSnake(e.target.value) }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono text-slate-900 bg-white"
                disabled={!newItem.allow_edit_code}
              />
              <div className="mt-1 text-[11px] text-slate-500">
                Formato estable: MAYUSCULAS_CON_GUIONES_BAJOS. No lo cambies luego.
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold"
            onClick={() => setOpenAddItem(false)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded-xl bg-slate-900 text-white hover:bg-black text-xs font-semibold disabled:opacity-40"
            onClick={() => void createCustomItem()}
            disabled={status === "saving"}
          >
            <span className="inline-flex items-center gap-2">
              <Save className="w-4 h-4" /> Crear
            </span>
          </button>
        </div>
      </Modal>

      {/* Modal: Add custom incident */}
      <Modal open={openAddIncident} title="Añadir incidencia personalizada" onClose={() => setOpenAddIncident(false)}>
        <div className="text-xs text-slate-600 mb-4">
          Esto es secundario. Úsalo solo si el hotel tiene un tipo operativo que no encaja en el catálogo global.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-7">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Título *</label>
            <input
              value={newIncident.title}
              onChange={(e) => {
                const v = e.target.value;
                setNewIncident((p) => ({
                  ...p,
                  title: v,
                  incident_type: p.allow_edit_code ? p.incident_type : toCodeUpperSnake(v),
                }));
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white"
              placeholder="Ej: Mascotas no permitidas"
            />
          </div>

          <div className="md:col-span-5">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Severidad (1-5)</label>
            <input
              value={newIncident.severity}
              onChange={(e) => setNewIncident((p) => ({ ...p, severity: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white"
              placeholder="2"
            />
          </div>

          <div className="md:col-span-12">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Descripción</label>
            <input
              value={newIncident.description}
              onChange={(e) => setNewIncident((p) => ({ ...p, description: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white"
              placeholder="Opcional"
            />
          </div>

          <div className="md:col-span-4">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Gross min (€)</label>
            <input
              value={newIncident.default_gross_min}
              onChange={(e) => setNewIncident((p) => ({ ...p, default_gross_min: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white"
              placeholder="Ej: 10"
            />
          </div>

          <div className="md:col-span-4">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Gross max (€)</label>
            <input
              value={newIncident.default_gross_max}
              onChange={(e) => setNewIncident((p) => ({ ...p, default_gross_max: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white"
              placeholder="Ej: 200"
            />
          </div>

          <div className="md:col-span-4">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Recovery %</label>
            <input
              value={newIncident.default_recovery_pct}
              onChange={(e) => setNewIncident((p) => ({ ...p, default_recovery_pct: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white"
              placeholder="Ej: 100"
            />
          </div>

          <div className="md:col-span-12">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Acciones sugeridas</label>
            <input
              value={newIncident.suggested_actions}
              onChange={(e) => setNewIncident((p) => ({ ...p, suggested_actions: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white"
              placeholder="Ej: Registrar, fotos, aviso…"
            />
          </div>

          <div className="md:col-span-12">
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={newIncident.is_active}
                onChange={(e) => setNewIncident((p) => ({ ...p, is_active: e.target.checked }))}
                className="h-4 w-4"
              />
              Activo
            </label>
          </div>

          <div className="md:col-span-12 border-t border-slate-100 pt-3">
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={newIncident.allow_edit_code}
                onChange={(e) =>
                  setNewIncident((p) => ({
                    ...p,
                    allow_edit_code: e.target.checked,
                    incident_type: e.target.checked ? p.incident_type : toCodeUpperSnake(p.title),
                  }))
                }
                className="h-4 w-4"
              />
              Permitir editar código (solo si sabes lo que haces)
            </label>

            <div className="mt-2">
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">incident_type</label>
              <input
                value={newIncident.incident_type}
                onChange={(e) => setNewIncident((p) => ({ ...p, incident_type: toCodeUpperSnake(e.target.value) }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono text-slate-900 bg-white"
                disabled={!newIncident.allow_edit_code}
              />
              <div className="mt-1 text-[11px] text-slate-500">
                Formato estable: MAYUSCULAS_CON_GUIONES_BAJOS. No lo cambies luego.
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold"
            onClick={() => setOpenAddIncident(false)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded-xl bg-slate-900 text-white hover:bg-black text-xs font-semibold disabled:opacity-40"
            onClick={() => void createCustomIncident()}
            disabled={status === "saving"}
          >
            <span className="inline-flex items-center gap-2">
              <Save className="w-4 h-4" /> Crear
            </span>
          </button>
        </div>
      </Modal>
    </div>
  );
};
