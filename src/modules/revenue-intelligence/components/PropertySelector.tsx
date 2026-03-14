import React, { useEffect, useMemo } from "react";
import { Building2, ChevronDown } from "lucide-react";

export type PropertySelectorItem = {
  id: string;
  name: string;
};

interface PropertySelectorProps {
  properties: PropertySelectorItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  storageKey?: string;
  disabled?: boolean;
  className?: string;
}

const DEFAULT_STORAGE_KEY = "revenue_active_property_id";
const ACTIVE_PROPERTY_CHANGED_EVENT = "revenue:active-property-changed";

const PropertySelector: React.FC<PropertySelectorProps> = ({
  properties,
  selectedId,
  onSelect,
  storageKey = DEFAULT_STORAGE_KEY,
  disabled = false,
  className = "",
}) => {
  const selected = useMemo(() => {
    if (!properties.length) return null;
    return properties.find((p) => p.id === selectedId) || properties[0];
  }, [properties, selectedId]);

  useEffect(() => {
    if (!properties.length) return;

    if (selectedId && properties.some((p) => p.id === selectedId)) {
      localStorage.setItem(storageKey, selectedId);
      return;
    }

    const savedId = localStorage.getItem(storageKey);
    if (savedId && properties.some((p) => p.id === savedId)) {
      onSelect(savedId);
      return;
    }

    onSelect(properties[0].id);
  }, [properties, selectedId, onSelect, storageKey]);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ propertyId?: string }>;
      const nextId = customEvent.detail?.propertyId;

      if (!nextId) return;
      if (!properties.some((p) => p.id === nextId)) return;

      localStorage.setItem(storageKey, nextId);
      onSelect(nextId);
    };

    window.addEventListener(ACTIVE_PROPERTY_CHANGED_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(ACTIVE_PROPERTY_CHANGED_EVENT, handler as EventListener);
    };
  }, [properties, onSelect, storageKey]);

  const handleChange = (id: string) => {
    localStorage.setItem(storageKey, id);
    onSelect(id);
  };

  if (!properties.length) {
    return (
      <div
        className={`inline-flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2 text-gray-400 shadow-sm ${className}`}
      >
        <div className="rounded-lg bg-gray-100 p-2 text-gray-400">
          <Building2 size={20} />
        </div>
        <span className="font-medium">Sin propiedades</span>
      </div>
    );
  }

  return (
    <div className={`relative inline-block text-left ${className}`}>
      <div
        className={`flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2 shadow-sm transition-colors ${
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-gray-50"
        }`}
      >
        <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
          <Building2 size={20} />
        </div>

        <select
          value={selected?.id ?? ""}
          onChange={(e) => handleChange(e.target.value)}
          disabled={disabled}
          className="cursor-pointer appearance-none bg-transparent pr-8 font-semibold text-gray-800 focus:outline-none disabled:cursor-not-allowed"
          aria-label="Seleccionar propiedad activa"
        >
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <div className="pointer-events-none absolute right-4 text-gray-400">
          <ChevronDown size={16} />
        </div>
      </div>
    </div>
  );
};

export default PropertySelector;