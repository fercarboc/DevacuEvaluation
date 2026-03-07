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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl text-white">
              <Building2 size={24} />
            </div>
            <h2 className="text-xl font-bold text-gray-900">
              {property?.id ? "Editar Propiedad" : "Alta de Nueva Propiedad"}
            </h2>
          </div>

          <button
            onClick={onClose}
            disabled={submitting}
            className="p-2 hover:bg-gray-200 rounded-full transition-colors disabled:opacity-50"
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-8">
          <section>
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Building2 size={16} /> Información general
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Código</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-3 text-gray-400" size={18} />
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value }))}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border ${
                      errors.code ? "border-rose-500" : "border-gray-200"
                    } focus:ring-2 focus:ring-blue-500 outline-none transition-all`}
                    placeholder="Ej: HOTEL_SANTANDER"
                  />
                </div>
                {errors.code && <span className="text-xs text-rose-500 mt-1">{errors.code}</span>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  className={`w-full px-4 py-2.5 rounded-xl border ${
                    errors.name ? "border-rose-500" : "border-gray-200"
                  } focus:ring-2 focus:ring-blue-500 outline-none transition-all`}
                  placeholder="Ej: Hotel Costa Norte"
                />
                {errors.name && <span className="text-xs text-rose-500 mt-1">{errors.name}</span>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Categoría</label>
                <select
                  value={formData.category ?? ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      category: e.target.value === "" ? null : Number(e.target.value),
                    }))
                  }
                  className={`w-full px-4 py-2.5 rounded-xl border ${
                    errors.category ? "border-rose-500" : "border-gray-200"
                  } focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none bg-white`}
                >
                  <option value="">Sin categoría</option>
                  <option value="1">1 estrella</option>
                  <option value="2">2 estrellas</option>
                  <option value="3">3 estrellas</option>
                  <option value="4">4 estrellas</option>
                  <option value="5">5 estrellas</option>
                </select>
                {errors.category && (
                  <span className="text-xs text-rose-500 mt-1">{errors.category}</span>
                )}
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <MapPin size={16} /> Ubicación
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-3">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Dirección</label>
                <input
                  type="text"
                  value={formData.address ?? ""}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, address: e.target.value || null }))
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="Calle, número..."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Ciudad</label>
                <input
                  type="text"
                  value={formData.city ?? ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value || null }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">País</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-3 text-gray-400" size={18} />
                  <input
                    type="text"
                    value={formData.country ?? ""}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, country: e.target.value || null }))
                    }
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Timezone</label>
                <div className="relative">
                  <Clock3 className="absolute left-3 top-3 text-gray-400" size={18} />
                  <input
                    type="text"
                    value={formData.timezone ?? ""}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, timezone: e.target.value || null }))
                    }
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder="Europe/Madrid"
                  />
                </div>
              </div>
            </div>
          </section>
        </form>

        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            type="button"
            disabled={submitting}
            className="px-6 py-2.5 rounded-xl font-bold text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>

          <button
            onClick={() => void handleSubmit()}
            type="button"
            disabled={submitting}
            className="px-8 py-2.5 bg-blue-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 disabled:opacity-50"
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