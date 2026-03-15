import React, { useEffect, useMemo, useState } from "react";
import { Plus, AlertTriangle, Building2, Crown, Loader2 } from "lucide-react";
import type { User, PlanCode } from "@/types/types";
import { planTypeToPlanCode } from "@/types/types";

import PropertiesList from "../components/PropertiesList";
import { LS_KEYS } from "@/services/storageKeys";
import PropertyForm, { PropertyFormValues } from "../components/PropertyForm";

import {
  getProperties,
  createProperty,
  updateProperty,
  togglePropertyActive,
  deleteProperty,
  RevenueProperty,
} from "../services/revenueProperties.service";

type SettingsPropertiesProps = {
  user: User;
};

type PlanMeta = {
  planCode: string | null;
  maxProperties: number | null;
  usedProperties: number;
};

const VISUAL_PLAN_LIMITS: Record<PlanCode, number> = {
  FREE: 1,
  BASIC: 1,
  MEDIUM: 2,
  PREMIUM: 4,
};

const ACTIVE_PROPERTY_STORAGE_KEY = LS_KEYS.ACTIVE_PROPERTY_ID;
const PROPERTIES_CHANGED_EVENT = "revenue:properties-changed";
const ACTIVE_PROPERTY_CHANGED_EVENT = "revenue:active-property-changed";

const SettingsProperties: React.FC<SettingsPropertiesProps> = ({ user }) => {
  const [properties, setProperties] = useState<RevenueProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<RevenueProperty | undefined>(undefined);

  const [planMeta, setPlanMeta] = useState<PlanMeta | null>(null);

  useEffect(() => {
    void loadProperties();
  }, []);

  const notifyPropertiesChanged = () => {
    window.dispatchEvent(new CustomEvent(PROPERTIES_CHANGED_EVENT));
  };

  const setActiveProperty = (propertyId: string) => {
    localStorage.setItem(ACTIVE_PROPERTY_STORAGE_KEY, propertyId);
    window.dispatchEvent(
      new CustomEvent(ACTIVE_PROPERTY_CHANGED_EVENT, {
        detail: { propertyId },
      }),
    );
  };

  async function loadProperties() {
    try {
      setLoading(true);
      setError(null);

      const rows = await getProperties();
      setProperties(rows);

      const fallbackPlanCode = planTypeToPlanCode(user.plan);
      const fallbackMax = VISUAL_PLAN_LIMITS[fallbackPlanCode] ?? 1;

      setPlanMeta({
        planCode: fallbackPlanCode,
        maxProperties: fallbackMax,
        usedProperties: rows.length,
      });
    } catch (e: any) {
      setError(e?.message ?? "No se pudieron cargar las propiedades");
    } finally {
      setLoading(false);
    }
  }

  const currentPlanCode = useMemo(() => {
    return (planMeta?.planCode as PlanCode | null) ?? planTypeToPlanCode(user.plan);
  }, [planMeta?.planCode, user.plan]);

  const maxProperties = useMemo(() => {
    if (planMeta?.maxProperties != null) return planMeta.maxProperties;
    return VISUAL_PLAN_LIMITS[currentPlanCode] ?? 1;
  }, [planMeta?.maxProperties, currentPlanCode]);

  const usedProperties = useMemo(() => {
    if (typeof planMeta?.usedProperties === "number") return planMeta.usedProperties;
    return properties.length;
  }, [planMeta?.usedProperties, properties.length]);

  const isLimitReached = useMemo(() => {
    if (maxProperties == null) return false;
    return usedProperties >= maxProperties;
  }, [usedProperties, maxProperties]);

  const usagePercent = useMemo(() => {
    if (!maxProperties || maxProperties <= 0) return 0;
    return Math.min(100, (usedProperties / maxProperties) * 100);
  }, [usedProperties, maxProperties]);

  const handleAdd = () => {
    if (isLimitReached || loading || saving) return;
    setEditingProperty(undefined);
    setIsFormOpen(true);
  };

  const handleEdit = (property: RevenueProperty) => {
    setEditingProperty(property);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    const ok = window.confirm("¿Estás seguro de eliminar esta propiedad?");
    if (!ok) return;

    try {
      setError(null);

      const res = await deleteProperty({ id });

      const updated = properties.filter((p) => p.id !== id);
      setProperties(updated);

      const currentActiveId = localStorage.getItem(ACTIVE_PROPERTY_STORAGE_KEY);
      if (currentActiveId === id) {
        if (updated.length > 0) {
          setActiveProperty(updated[0].id);
        } else {
          localStorage.removeItem(ACTIVE_PROPERTY_STORAGE_KEY);
          notifyPropertiesChanged();
        }
      } else {
        notifyPropertiesChanged();
      }

      if (res.meta) {
        setPlanMeta({
          planCode: res.meta.planCode,
          maxProperties: res.meta.maxProperties,
          usedProperties: res.meta.usedProperties,
        });
      } else {
        setPlanMeta((prev) => ({
          planCode: prev?.planCode ?? currentPlanCode,
          maxProperties: prev?.maxProperties ?? maxProperties,
          usedProperties: Math.max(0, usedProperties - 1),
        }));
      }
    } catch (e: any) {
      setError(e?.message ?? "No se pudo eliminar la propiedad");
    }
  };

  const handleToggleActive = async (id: string) => {
    const current = properties.find((p) => p.id === id);
    if (!current) return;

    try {
      setError(null);

      const res = await togglePropertyActive({
        id,
        is_active: !current.isActive,
      });

      if (res.data) {
        setProperties((prev) => prev.map((p) => (p.id === res.data!.id ? res.data! : p)));
      }

      notifyPropertiesChanged();

      if (res.meta) {
        setPlanMeta({
          planCode: res.meta.planCode,
          maxProperties: res.meta.maxProperties,
          usedProperties: res.meta.usedProperties,
        });
      }
    } catch (e: any) {
      setError(e?.message ?? "No se pudo cambiar el estado de la propiedad");
    }
  };

  const handleSave = async (data: PropertyFormValues) => {
    try {
      setSaving(true);
      setError(null);

      if (editingProperty) {
        const res = await updateProperty({
          id: editingProperty.id,
          code: data.code.trim(),
          name: data.name.trim(),
          category: data.category ?? null,
          address: data.address ?? null,
          city: data.city ?? null,
          country: data.country ?? null,
          timezone: data.timezone ?? null,
        });

        if (res.data) {
          setProperties((prev) => prev.map((p) => (p.id === res.data!.id ? res.data! : p)));
        }

        notifyPropertiesChanged();

        if (res.meta) {
          setPlanMeta({
            planCode: res.meta.planCode,
            maxProperties: res.meta.maxProperties,
            usedProperties: res.meta.usedProperties,
          });
        }
      } else {
        const res = await createProperty({
          code: data.code.trim(),
          name: data.name.trim(),
          category: data.category ?? null,
          address: data.address ?? null,
          city: data.city ?? null,
          country: data.country ?? null,
          timezone: data.timezone ?? null,
        });

        if (res.data) {
          setProperties((prev) => [...prev, res.data!]);

          // dejar la nueva propiedad seleccionada arriba
          setActiveProperty(res.data.id);
        } else {
          notifyPropertiesChanged();
        }

        if (res.meta) {
          setPlanMeta({
            planCode: res.meta.planCode,
            maxProperties: res.meta.maxProperties,
            usedProperties: res.meta.usedProperties,
          });
        }
      }

      setIsFormOpen(false);
      setEditingProperty(undefined);
    } catch (e: any) {
      const msg = String(e?.message ?? "No se pudo guardar la propiedad");

      if (msg.includes("PROPERTY_LIMIT_REACHED")) {
        setError("Has alcanzado el límite de propiedades permitido por tu plan.");
      } else if (msg.includes("PROPERTY_CODE_ALREADY_EXISTS")) {
        setError("Ya existe una propiedad con ese código.");
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const formProperty = useMemo(() => {
    if (!editingProperty) return undefined;

    return {
      id: editingProperty.id,
      code: editingProperty.code,
      name: editingProperty.name,
      category: editingProperty.category,
      address: editingProperty.address,
      city: editingProperty.city,
      country: editingProperty.country,
      timezone: editingProperty.timezone,
    };
  }, [editingProperty]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuración de Propiedades</h1>
          <p className="text-gray-500">Gestiona las propiedades de Revenue Intelligence</p>
        </div>

        <button
          onClick={handleAdd}
          disabled={isLimitReached || loading || saving}
          className={`flex items-center gap-2 rounded-2xl px-6 py-3 font-bold transition-all shadow-lg ${
            isLimitReached || loading || saving
              ? "cursor-not-allowed bg-gray-100 text-gray-400"
              : "bg-blue-600 text-white shadow-blue-200 hover:bg-blue-700"
          }`}
        >
          {saving ? <Loader2 size={20} className="animate-spin" /> : <Plus size={20} />}
          Añadir Propiedad
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-rose-700">
          <AlertTriangle size={18} />
          <span className="text-sm font-semibold">{error}</span>
        </div>
      )}

      <div className="flex flex-col justify-between gap-6 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          <div className="rounded-2xl bg-indigo-100 p-3 text-indigo-600">
            <Crown size={24} />
          </div>

          <div>
            <div className="text-sm font-bold uppercase tracking-wider text-gray-400">
              Uso del Plan {currentPlanCode}
            </div>

            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold text-gray-900">{usedProperties}</span>
              <span className="pb-1 font-medium text-gray-400">/ {maxProperties} propiedades</span>
            </div>
          </div>
        </div>

        <div className="max-w-md flex-1">
          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full transition-all duration-500 ${
                isLimitReached ? "bg-rose-500" : "bg-indigo-600"
              }`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>
        </div>

        {isLimitReached && (
          <div className="flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-rose-700">
            <AlertTriangle size={18} />
            <span className="text-sm font-bold">Límite alcanzado. Actualiza tu plan.</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center rounded-3xl border border-gray-100 bg-white p-12 text-center">
          <Loader2 size={32} className="mb-4 animate-spin text-blue-600" />
          <p className="font-medium text-gray-500">Cargando propiedades...</p>
        </div>
      ) : properties.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <div className="mb-4 rounded-full bg-gray-50 p-6 text-gray-300">
            <Building2 size={48} />
          </div>
          <h3 className="mb-2 text-lg font-bold text-gray-900">No hay propiedades configuradas</h3>
          <p className="mb-8 max-w-sm text-gray-500">
            Comienza añadiendo tu primera propiedad para empezar a analizar tus datos de revenue.
          </p>
          <button
            onClick={handleAdd}
            disabled={isLimitReached || saving}
            className={`rounded-2xl px-8 py-3 font-bold transition-all shadow-lg ${
              isLimitReached || saving
                ? "cursor-not-allowed bg-gray-100 text-gray-400"
                : "bg-blue-600 text-white shadow-blue-200 hover:bg-blue-700"
            }`}
          >
            Añadir mi primera propiedad
          </button>
        </div>
      ) : (
        <PropertiesList
          properties={properties}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onToggleActive={handleToggleActive}
        />
      )}

      {isFormOpen && (
        <PropertyForm
          property={formProperty}
          onSave={handleSave}
          onClose={() => {
            if (saving) return;
            setIsFormOpen(false);
            setEditingProperty(undefined);
          }}
        />
      )}
    </div>
  );
};

export default SettingsProperties;