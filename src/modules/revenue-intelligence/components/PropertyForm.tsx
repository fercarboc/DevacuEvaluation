import React, { useEffect, useState } from "react";
import { X, Save, Building2, MapPin, Globe, Clock3, Hash } from "lucide-react";

export type PropertyFormValues = {
  code: string;
  name: string;
  category: number | null;
  address: string | null;
  city: string | null;
  country: string | null;
  timezone: string | null;
};

type PropertyFormProps = {
  property?: Partial<PropertyFormValues> & { id?: string };
  onSave: (data: PropertyFormValues) => void | Promise<void>;
  onClose: () => void;
};

const DEFAULT_FORM: PropertyFormValues = {
  code: "",
  name: "",
  category: null,
  address: null,
  city: null,
  country: "España",
  timezone: "Europe/Madrid",
};

const baseInputClass =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 outline-none transition-all focus:ring-2 focus:ring-blue-500";

const forcedInputStyle: React.CSSProperties = {
  color: "#111827",
  caretColor: "#111827",
  WebkitTextFillColor: "#111827",
  opacity: 1,
};

const forcedPlaceholderClass = "placeholder:text-gray-400";

const PropertyForm: React.FC<PropertyFormProps> = ({ property, onSave, onClose }) => {
  const [formData, setFormData] = useState<PropertyFormValues>(DEFAULT_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!property) {
      setFormData(DEFAULT_FORM);
      return;
    }

    setFormData({
      code: property.code ?? "",
      name: property.name ?? "",
      category: property.category ?? null,
      address: property.address ?? null,
      city: property.city ?? null,
      country: property.country ?? "España",
      timezone: property.timezone ?? "Europe/Madrid",
    });
  }, [property]);

  const validate = () => {
    const nextErrors: Record<string, string> = {};

    if (!formData.code.trim()) nextErrors.code = "Código obligatorio";
    if (!formData.name.trim()) nextErrors.name = "Nombre obligatorio";

    if (
      formData.category !== null &&
      (!Number.isInteger(formData.category) || formData.category < 1 || formData.category > 5)
    ) {
      nextErrors.category = "La categoría debe estar entre 1 y 5";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!validate()) return;

    try {
      setSubmitting(true);

      await onSave({
        code: formData.code.trim(),
        name: formData.name.trim(),
        category: formData.category ?? null,
        address: formData.address?.trim() ? formData.address.trim() : null,
        city: formData.city?.trim() ? formData.city.trim() : null,
        country: formData.country?.trim() ? formData.country.trim() : null,
        timezone: formData.timezone?.trim() ? formData.timezone.trim() : null,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-600 p-2 text-white">
              <Building2 size={24} />
            </div>
            <h2 className="text-xl font-bold text-gray-900">
              {property?.id ? "Editar Propiedad" : "Alta de Nueva Propiedad"}
            </h2>
          </div>

          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-full p-2 transition-colors hover:bg-gray-200 disabled:opacity-50"
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-8 overflow-y-auto p-8">
          <section>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-400">
              <Building2 size={16} /> Información general
            </h3>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">Código</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-3 text-gray-400" size={18} />
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        code: e.target.value
                          .toUpperCase()
                          .replace(/\s+/g, "_")
                          .replace(/[^A-Z0-9_-]/g, ""),
                      }))
                    }
                    className={`pl-10 ${baseInputClass} ${forcedPlaceholderClass} ${
                      errors.code ? "border-rose-500" : "border-gray-200"
                    }`}
                    style={forcedInputStyle}
                    placeholder="Ej: HOTEL_SANTANDER"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                {errors.code && (
                  <span className="mt-1 block text-xs text-rose-500">{errors.code}</span>
                )}
                <p className="mt-2 text-xs text-gray-500">
                  Código interno para diferenciar propiedades. Usa algo corto, estable y único.
                  Ejemplos: <span className="font-semibold text-gray-700">HOTEL_4</span>,{" "}
                  <span className="font-semibold text-gray-700">CUS_MADRID_CENTRO</span>,{" "}
                  <span className="font-semibold text-gray-700">PLAYA_NORTE</span>.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">Nombre</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  className={`${baseInputClass} ${forcedPlaceholderClass} ${
                    errors.name ? "border-rose-500" : "border-gray-200"
                  }`}
                  style={forcedInputStyle}
                  placeholder="Ej: Hotel Costa Norte"
                  autoComplete="off"
                  spellCheck={false}
                />
                {errors.name && (
                  <span className="mt-1 block text-xs text-rose-500">{errors.name}</span>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">Categoría</label>
                <select
                  value={formData.category ?? ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      category: e.target.value === "" ? null : Number(e.target.value),
                    }))
                  }
                  className={`${baseInputClass} appearance-none ${
                    errors.category ? "border-rose-500" : "border-gray-200"
                  }`}
                  style={forcedInputStyle}
                >
                  <option value="">Sin categoría</option>
                  <option value="1">1 estrella</option>
                  <option value="2">2 estrellas</option>
                  <option value="3">3 estrellas</option>
                  <option value="4">4 estrellas</option>
                  <option value="5">5 estrellas</option>
                </select>
                {errors.category && (
                  <span className="mt-1 block text-xs text-rose-500">{errors.category}</span>
                )}
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-400">
              <MapPin size={16} /> Ubicación
            </h3>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="md:col-span-3">
                <label className="mb-1 block text-sm font-semibold text-gray-700">Dirección</label>
                <input
                  type="text"
                  value={formData.address ?? ""}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, address: e.target.value || null }))
                  }
                  className={`${baseInputClass} ${forcedPlaceholderClass}`}
                  style={forcedInputStyle}
                  placeholder="Calle, número..."
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">Ciudad</label>
                <input
                  type="text"
                  value={formData.city ?? ""}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, city: e.target.value || null }))
                  }
                  className={`${baseInputClass} ${forcedPlaceholderClass}`}
                  style={forcedInputStyle}
                  placeholder="Ej: Santander"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">País</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-3 text-gray-400" size={18} />
                  <input
                    type="text"
                    value={formData.country ?? ""}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, country: e.target.value || null }))
                    }
                    className={`pl-10 ${baseInputClass} ${forcedPlaceholderClass}`}
                    style={forcedInputStyle}
                    placeholder="España"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">Timezone</label>
                <div className="relative">
                  <Clock3 className="absolute left-3 top-3 text-gray-400" size={18} />
                  <input
                    type="text"
                    value={formData.timezone ?? ""}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, timezone: e.target.value || null }))
                    }
                    className={`pl-10 ${baseInputClass} ${forcedPlaceholderClass}`}
                    style={forcedInputStyle}
                    placeholder="Europe/Madrid"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </div>
            </div>
          </section>
        </form>

        <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 p-6">
          <button
            onClick={onClose}
            type="button"
            disabled={submitting}
            className="rounded-xl px-6 py-2.5 font-bold text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-50"
          >
            Cancelar
          </button>

          <button
            onClick={() => void handleSubmit()}
            type="button"
            disabled={submitting}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-2.5 font-bold text-white shadow-lg shadow-blue-200 transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={18} />
            {submitting
              ? "Guardando..."
              : property?.id
              ? "Guardar Cambios"
              : "Crear Propiedad"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PropertyForm;