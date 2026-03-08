import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  CalendarDays,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import {
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  type RevenueEvent,
  type PricingOperation,
  type PricingAdjustmentType,
} from "../services/revenueEvents.service";

import {
  getSeasons,
  createSeason,
  updateSeason,
  deleteSeason,
  type RevenueSeason,
} from "../services/revenueSeasons.service";

type FormMode = "EVENT" | "SEASON";
type ImpactLevel = "LOW" | "MEDIUM" | "HIGH";

type EventType = "FAIR" | "BRIDGE" | "HOLIDAY" | "CONGRESS" | "OTHER";
type SeasonType = "LOW_SEASON" | "MID_SEASON" | "HIGH_SEASON" | "PEAK_SEASON" | "OTHER";

const DEFAULT_EVENT_COLOR = "#10B981";
const DEFAULT_SEASON_COLOR = "#3B82F6";

type EventsSeasonsPageProps = {
  selectedPropertyId: string | null;
  selectedPropertyName?: string | null;
};

type EditingItem =
  | { mode: "EVENT"; id: string }
  | { mode: "SEASON"; id: string }
  | null;

const EventsSeasonsPage: React.FC<EventsSeasonsPageProps> = ({
  selectedPropertyId,
  selectedPropertyName,
}) => {
  const [events, setEvents] = useState<RevenueEvent[]>([]);
  const [seasons, setSeasons] = useState<RevenueSeason[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<FormMode>("EVENT");
  const [editingItem, setEditingItem] = useState<EditingItem>(null);

  const [formData, setFormData] = useState({
    name: "",
    eventType: "FAIR" as EventType,
    seasonType: "HIGH_SEASON" as SeasonType,
    startDate: "",
    endDate: "",
    impactLevel: "MEDIUM" as ImpactLevel,
    color: DEFAULT_EVENT_COLOR,
    priority: 200,
    note: "",
    pricingOperation: "INCREASE" as PricingOperation,
    pricingAdjustmentType: "PERCENT" as PricingAdjustmentType,
    pricingAdjustmentValue: 0,
  });

  const resetForm = useCallback(
    (nextMode?: FormMode) => {
      const targetMode = nextMode ?? mode;

      setEditingItem(null);
      setFormData({
        name: "",
        eventType: "FAIR",
        seasonType: "HIGH_SEASON",
        startDate: "",
        endDate: "",
        impactLevel: "MEDIUM",
        color: targetMode === "EVENT" ? DEFAULT_EVENT_COLOR : DEFAULT_SEASON_COLOR,
        priority: targetMode === "EVENT" ? 200 : 100,
        note: "",
        pricingOperation: "INCREASE",
        pricingAdjustmentType: "PERCENT",
        pricingAdjustmentValue: 0,
      });
    },
    [mode]
  );

  const loadPropertyData = useCallback(async (propertyId: string) => {
    setLoading(true);
    setError("");

    try {
      const [eventsRows, seasonsRows] = await Promise.all([
        getEvents(propertyId),
        getSeasons(propertyId),
      ]);

      setEvents(eventsRows);
      setSeasons(seasonsRows);
    } catch (err) {
      setEvents([]);
      setSeasons([]);
      setError(err instanceof Error ? err.message : "No se pudieron cargar eventos y temporadas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedPropertyId) {
      setEvents([]);
      setSeasons([]);
      setLoading(false);
      setError("");
      setShowForm(false);
      setEditingItem(null);
      return;
    }

    void loadPropertyData(selectedPropertyId);
  }, [selectedPropertyId, loadPropertyData]);

  const handleModeChange = (nextMode: FormMode) => {
    setMode(nextMode);
    resetForm(nextMode);
  };

  const handleOpenForm = () => {
    resetForm(mode);
    setError("");
    setShowForm((prev) => !prev);
  };

  const handleEditSeason = (season: RevenueSeason) => {
    setMode("SEASON");
    setEditingItem({ mode: "SEASON", id: season.id });
    setFormData({
      name: season.name,
      eventType: "FAIR",
      seasonType: (season.seasonType as SeasonType) ?? "HIGH_SEASON",
      startDate: season.startDate,
      endDate: season.endDate,
      impactLevel: (season.impactLevel as ImpactLevel) ?? "MEDIUM",
      color: season.color || DEFAULT_SEASON_COLOR,
      priority: season.priority ?? 100,
      note: season.note ?? "",
      pricingOperation: season.pricingOperation ?? "INCREASE",
      pricingAdjustmentType: season.pricingAdjustmentType ?? "PERCENT",
      pricingAdjustmentValue: Number(season.pricingAdjustmentValue ?? 0),
    });
    setError("");
    setShowForm(true);
  };

  const handleEditEvent = (event: RevenueEvent) => {
    setMode("EVENT");
    setEditingItem({ mode: "EVENT", id: event.id });
    setFormData({
      name: event.name,
      eventType: (event.eventType as EventType) ?? "FAIR",
      seasonType: "HIGH_SEASON",
      startDate: event.startDate,
      endDate: event.endDate,
      impactLevel: (event.impactLevel as ImpactLevel) ?? "MEDIUM",
      color: event.color || DEFAULT_EVENT_COLOR,
      priority: event.priority ?? 200,
      note: event.note ?? "",
      pricingOperation: event.pricingOperation ?? "INCREASE",
      pricingAdjustmentType: event.pricingAdjustmentType ?? "PERCENT",
      pricingAdjustmentValue: Number(event.pricingAdjustmentValue ?? 0),
    });
    setError("");
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPropertyId) {
      setError("Selecciona una propiedad");
      return;
    }

    if (!formData.name.trim()) {
      setError("El nombre es obligatorio");
      return;
    }

    if (!formData.startDate || !formData.endDate) {
      setError("Debes indicar fecha de inicio y fin");
      return;
    }

    if (formData.endDate < formData.startDate) {
      setError("La fecha fin no puede ser menor que la fecha inicio");
      return;
    }

    if (formData.pricingOperation === "SET" && formData.pricingAdjustmentType === "PERCENT") {
      setError("La operación FIJAR solo debe usarse con ajuste de tipo IMPORTE");
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (mode === "EVENT") {
        if (editingItem?.mode === "EVENT") {
          await updateEvent({
            id: editingItem.id,
            name: formData.name.trim(),
            event_type: formData.eventType,
            start_date: formData.startDate,
            end_date: formData.endDate,
            impact_level: formData.impactLevel,
            color: formData.color || DEFAULT_EVENT_COLOR,
            priority: Number(formData.priority) || 200,
            note: formData.note.trim() || null,
            is_active: true,
            pricing_operation: formData.pricingOperation,
            pricing_adjustment_type: formData.pricingAdjustmentType,
            pricing_adjustment_value: Number(formData.pricingAdjustmentValue || 0),
          });
        } else {
          await createEvent({
            property_id: selectedPropertyId,
            name: formData.name.trim(),
            event_type: formData.eventType,
            start_date: formData.startDate,
            end_date: formData.endDate,
            impact_level: formData.impactLevel,
            color: formData.color || DEFAULT_EVENT_COLOR,
            priority: Number(formData.priority) || 200,
            note: formData.note.trim() || null,
            is_active: true,
            pricing_operation: formData.pricingOperation,
            pricing_adjustment_type: formData.pricingAdjustmentType,
            pricing_adjustment_value: Number(formData.pricingAdjustmentValue || 0),
          });
        }
      } else {
        if (editingItem?.mode === "SEASON") {
          await updateSeason({
            id: editingItem.id,
            name: formData.name.trim(),
            season_type: formData.seasonType,
            start_date: formData.startDate,
            end_date: formData.endDate,
            impact_level: formData.impactLevel,
            color: formData.color || DEFAULT_SEASON_COLOR,
            priority: Number(formData.priority) || 100,
            note: formData.note.trim() || null,
            is_active: true,
            pricing_operation: formData.pricingOperation,
            pricing_adjustment_type: formData.pricingAdjustmentType,
            pricing_adjustment_value: Number(formData.pricingAdjustmentValue || 0),
          });
        } else {
          await createSeason({
            property_id: selectedPropertyId,
            name: formData.name.trim(),
            season_type: formData.seasonType,
            start_date: formData.startDate,
            end_date: formData.endDate,
            impact_level: formData.impactLevel,
            color: formData.color || DEFAULT_SEASON_COLOR,
            priority: Number(formData.priority) || 100,
            note: formData.note.trim() || null,
            is_active: true,
            pricing_operation: formData.pricingOperation,
            pricing_adjustment_type: formData.pricingAdjustmentType,
            pricing_adjustment_value: Number(formData.pricingAdjustmentValue || 0),
          });
        }
      }

      await loadPropertyData(selectedPropertyId);
      resetForm(mode);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el registro");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!selectedPropertyId) return;

    try {
      setDeletingId(id);
      setError("");
      await deleteEvent(id);
      await loadPropertyData(selectedPropertyId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el evento");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteSeason = async (id: string) => {
    if (!selectedPropertyId) return;

    try {
      setDeletingId(id);
      setError("");
      await deleteSeason(id);
      await loadPropertyData(selectedPropertyId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la temporada");
    } finally {
      setDeletingId(null);
    }
  };

  const getImpactColor = (impact: ImpactLevel | null) => {
    switch (impact) {
      case "HIGH":
        return "bg-rose-100 text-rose-700 border-rose-200";
      case "MEDIUM":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "LOW":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const getPricingLabel = (
    operation: PricingOperation | null,
    adjustmentType: PricingAdjustmentType | null,
    adjustmentValue: number | null
  ) => {
    if (!operation || !adjustmentType || adjustmentValue == null) return "-";

    const value =
      adjustmentType === "PERCENT"
        ? `${adjustmentValue}%`
        : `${adjustmentValue} €`;

    if (operation === "INCREASE") return `+ ${value}`;
    if (operation === "DECREASE") return `- ${value}`;
    if (operation === "SET") return `Fijar ${value}`;
    return "-";
  };

  const renderEmpty = (label: string) => (
    <tr>
      <td colSpan={8} className="px-8 py-12 text-center text-gray-400">
        <CalendarDays size={42} className="mx-auto mb-4 opacity-20" />
        <p className="font-bold">No hay {label} configuradas para esta propiedad</p>
      </td>
    </tr>
  );

  if (!selectedPropertyId) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-500">
        Selecciona una propiedad para gestionar eventos y temporadas.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Eventos y Temporadas</h1>
          <p className="text-gray-500">
            Gestión de fechas relevantes para {selectedPropertyName ?? "la propiedad seleccionada"}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleOpenForm}
            className="flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 font-bold text-white shadow-lg shadow-blue-200 transition-all hover:bg-blue-700"
          >
            <Plus size={20} />
            Añadir registro
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {showForm && (
        <div className="rounded-3xl border border-blue-100 bg-white p-8 shadow-sm">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {editingItem ? "Editar Evento / Temporada" : "Nuevo Evento / Temporada"}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                El calendario de precios usará estos datos como contexto real.
              </p>
            </div>

            <div className="inline-flex rounded-2xl bg-gray-100 p-1">
              <button
                type="button"
                onClick={() => handleModeChange("EVENT")}
                className={`rounded-2xl px-4 py-2 text-sm font-bold transition-all ${
                  mode === "EVENT"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Evento
              </button>
              <button
                type="button"
                onClick={() => handleModeChange("SEASON")}
                className={`rounded-2xl px-4 py-2 text-sm font-bold transition-all ${
                  mode === "SEASON"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Temporada
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-bold text-gray-700">Nombre</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={
                  mode === "EVENT"
                    ? "Ej: Feria de Abril, Puente de Mayo..."
                    : "Ej: Temporada Alta Verano, Temporada Baja..."
                }
                className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition-all focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">
                {mode === "EVENT" ? "Tipo de evento" : "Tipo de temporada"}
              </label>

              {mode === "EVENT" ? (
                <select
                  value={formData.eventType}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, eventType: e.target.value as EventType }))
                  }
                  className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none transition-all focus:ring-2 focus:ring-blue-500"
                >
                  <option value="FAIR">Feria</option>
                  <option value="BRIDGE">Puente</option>
                  <option value="HOLIDAY">Festivo</option>
                  <option value="CONGRESS">Congreso</option>
                  <option value="OTHER">Otro</option>
                </select>
              ) : (
                <select
                  value={formData.seasonType}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, seasonType: e.target.value as SeasonType }))
                  }
                  className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none transition-all focus:ring-2 focus:ring-blue-500"
                >
                  <option value="LOW_SEASON">Temporada Baja</option>
                  <option value="MID_SEASON">Temporada Media</option>
                  <option value="HIGH_SEASON">Temporada Alta</option>
                  <option value="PEAK_SEASON">Temporada Pico</option>
                  <option value="OTHER">Otra</option>
                </select>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">Fecha Inicio</label>
              <input
                type="date"
                required
                value={formData.startDate}
                onChange={(e) => setFormData((prev) => ({ ...prev, startDate: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition-all focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">Fecha Fin</label>
              <input
                type="date"
                required
                value={formData.endDate}
                onChange={(e) => setFormData((prev) => ({ ...prev, endDate: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition-all focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">Impacto</label>
              <select
                value={formData.impactLevel}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    impactLevel: e.target.value as ImpactLevel,
                  }))
                }
                className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none transition-all focus:ring-2 focus:ring-blue-500"
              >
                <option value="HIGH">Alto</option>
                <option value="MEDIUM">Medio</option>
                <option value="LOW">Bajo</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">Color</label>
              <input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData((prev) => ({ ...prev, color: e.target.value }))}
                className="h-[50px] w-full rounded-xl border border-gray-200 bg-white p-2"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">Prioridad</label>
              <input
                type="number"
                min={1}
                value={formData.priority}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    priority: Number(e.target.value || 0),
                  }))
                }
                className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition-all focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">Operación precio</label>
              <select
                value={formData.pricingOperation}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    pricingOperation: e.target.value as PricingOperation,
                    pricingAdjustmentType:
                      e.target.value === "SET" ? "FIXED" : prev.pricingAdjustmentType,
                  }))
                }
                className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none transition-all focus:ring-2 focus:ring-blue-500"
              >
                <option value="INCREASE">Subir</option>
                <option value="DECREASE">Bajar</option>
                <option value="SET">Fijar</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">Tipo ajuste</label>
              <select
                value={formData.pricingAdjustmentType}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    pricingAdjustmentType: e.target.value as PricingAdjustmentType,
                  }))
                }
                disabled={formData.pricingOperation === "SET"}
                className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none transition-all focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-50"
              >
                <option value="PERCENT">%</option>
                <option value="FIXED">Importe fijo</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">Valor ajuste</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={formData.pricingAdjustmentValue}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    pricingAdjustmentValue: Number(e.target.value || 0),
                  }))
                }
                className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition-all focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="md:col-span-3">
              <label className="mb-2 block text-sm font-bold text-gray-700">Notas (Opcional)</label>
              <textarea
                value={formData.note}
                onChange={(e) => setFormData((prev) => ({ ...prev, note: e.target.value }))}
                className="h-24 w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition-all focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="md:col-span-3 flex justify-end gap-4">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm(mode);
                  setError("");
                }}
                className="rounded-2xl px-6 py-3 font-bold text-gray-500 transition-all hover:bg-gray-100"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-2xl bg-gray-900 px-8 py-3 font-bold text-white transition-all hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                {editingItem ? "Actualizar" : "Guardar"} {mode === "EVENT" ? "Evento" : "Temporada"}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center rounded-3xl border border-gray-100 bg-white p-10 shadow-sm">
          <div className="inline-flex items-center gap-3 text-slate-500">
            <Loader2 size={18} className="animate-spin" />
            Cargando eventos y temporadas...
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-8 py-5">
              <h3 className="text-lg font-bold text-gray-900">Temporadas</h3>
              <p className="text-sm text-gray-500">
                Bloques temporales que contextualizan el calendario y el pricing.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-8 py-5">Temporada</th>
                    <th className="px-6 py-5">Tipo</th>
                    <th className="px-6 py-5">Desde</th>
                    <th className="px-6 py-5">Hasta</th>
                    <th className="px-6 py-5">Impacto</th>
                    <th className="px-6 py-5">Pricing</th>
                    <th className="px-6 py-5">Prioridad</th>
                    <th className="px-8 py-5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {seasons.length === 0
                    ? renderEmpty("temporadas")
                    : [...seasons]
                        .sort((a, b) => a.startDate.localeCompare(b.startDate))
                        .map((season) => (
                          <tr key={season.id} className="group transition-colors hover:bg-gray-50">
                            <td className="px-8 py-5">
                              <div className="flex items-center gap-3">
                                <div
                                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                                  style={{ backgroundColor: `${season.color}20`, color: season.color }}
                                >
                                  <CalendarIcon size={18} />
                                </div>
                                <div>
                                  <p className="font-bold text-gray-900">{season.name}</p>
                                  {season.note && (
                                    <p className="text-xs text-gray-400">{season.note}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <span className="rounded-lg bg-gray-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-600">
                                {season.seasonType?.replaceAll("_", " ") ?? "SEASON"}
                              </span>
                            </td>
                            <td className="px-6 py-5 font-medium text-gray-600">{season.startDate}</td>
                            <td className="px-6 py-5 font-medium text-gray-600">{season.endDate}</td>
                            <td className="px-6 py-5">
                              <span
                                className={`rounded-lg border px-3 py-1 text-[10px] font-bold ${getImpactColor(
                                  season.impactLevel
                                )}`}
                              >
                                {season.impactLevel ?? "-"}
                              </span>
                            </td>
                            <td className="px-6 py-5 font-medium text-gray-600">
                              {getPricingLabel(
                                season.pricingOperation,
                                season.pricingAdjustmentType,
                                season.pricingAdjustmentValue
                              )}
                            </td>
                            <td className="px-6 py-5 font-medium text-gray-600">{season.priority}</td>
                            <td className="px-8 py-5 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleEditSeason(season)}
                                  className="rounded-xl p-2 text-slate-400 opacity-0 transition-all hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100"
                                >
                                  <Pencil size={18} />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => void handleDeleteSeason(season.id)}
                                  disabled={deletingId === season.id}
                                  className="rounded-xl p-2 text-rose-400 opacity-0 transition-all hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 disabled:opacity-50"
                                >
                                  {deletingId === season.id ? (
                                    <Loader2 size={18} className="animate-spin" />
                                  ) : (
                                    <Trash2 size={18} />
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-8 py-5">
              <h3 className="text-lg font-bold text-gray-900">Eventos</h3>
              <p className="text-sm text-gray-500">
                Eventos externos o internos con impacto en demanda, precio u ocupación.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-8 py-5">Evento</th>
                    <th className="px-6 py-5">Tipo</th>
                    <th className="px-6 py-5">Desde</th>
                    <th className="px-6 py-5">Hasta</th>
                    <th className="px-6 py-5">Impacto</th>
                    <th className="px-6 py-5">Pricing</th>
                    <th className="px-6 py-5">Prioridad</th>
                    <th className="px-8 py-5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {events.length === 0
                    ? renderEmpty("eventos")
                    : [...events]
                        .sort((a, b) => a.startDate.localeCompare(b.startDate))
                        .map((event) => (
                          <tr key={event.id} className="group transition-colors hover:bg-gray-50">
                            <td className="px-8 py-5">
                              <div className="flex items-center gap-3">
                                <div
                                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                                  style={{ backgroundColor: `${event.color}20`, color: event.color }}
                                >
                                  <CalendarIcon size={18} />
                                </div>
                                <div>
                                  <p className="font-bold text-gray-900">{event.name}</p>
                                  {event.note && (
                                    <p className="text-xs text-gray-400">{event.note}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <span className="rounded-lg bg-gray-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-600">
                                {event.eventType.replaceAll("_", " ")}
                              </span>
                            </td>
                            <td className="px-6 py-5 font-medium text-gray-600">{event.startDate}</td>
                            <td className="px-6 py-5 font-medium text-gray-600">{event.endDate}</td>
                            <td className="px-6 py-5">
                              <span
                                className={`rounded-lg border px-3 py-1 text-[10px] font-bold ${getImpactColor(
                                  event.impactLevel
                                )}`}
                              >
                                {event.impactLevel}
                              </span>
                            </td>
                            <td className="px-6 py-5 font-medium text-gray-600">
                              {getPricingLabel(
                                event.pricingOperation,
                                event.pricingAdjustmentType,
                                event.pricingAdjustmentValue
                              )}
                            </td>
                            <td className="px-6 py-5 font-medium text-gray-600">{event.priority}</td>
                            <td className="px-8 py-5 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleEditEvent(event)}
                                  className="rounded-xl p-2 text-slate-400 opacity-0 transition-all hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100"
                                >
                                  <Pencil size={18} />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => void handleDeleteEvent(event.id)}
                                  disabled={deletingId === event.id}
                                  className="rounded-xl p-2 text-rose-400 opacity-0 transition-all hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 disabled:opacity-50"
                                >
                                  {deletingId === event.id ? (
                                    <Loader2 size={18} className="animate-spin" />
                                  ) : (
                                    <Trash2 size={18} />
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      <div className="flex items-start gap-4 rounded-3xl border border-amber-100 bg-amber-50 p-6">
        <div className="rounded-xl bg-amber-100 p-2 text-amber-600">
          <AlertTriangle size={20} />
        </div>
        <div>
          <h4 className="mb-1 font-bold text-amber-900">Importante</h4>
          <p className="text-sm leading-relaxed text-amber-800">
            Los eventos y temporadas configurados aquí se reflejarán automáticamente en el
            <span className="font-bold"> Price Calendar</span> y servirán como contexto para
            posteriores pantallas de <span className="font-bold">Día x Día</span>,
            <span className="font-bold"> Mensual</span> y
            <span className="font-bold"> Pickup Avanzado</span>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default EventsSeasonsPage;