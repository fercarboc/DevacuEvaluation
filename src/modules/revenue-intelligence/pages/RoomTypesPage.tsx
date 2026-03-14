import React, { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  Hotel,
  AlertTriangle,
} from "lucide-react";
import {
  getRoomTypes,
  createRoomType,
  updateRoomType,
  toggleRoomTypeActive,
  deleteRoomType,
  RevenueRoomType,
} from "../services/revenueRoomTypes.service";

type RoomTypesPageProps = {
  selectedPropertyId: string | null;
  selectedPropertyName?: string | null;
};

type RoomTypeFormValues = {
  code: string;
  name: string;
  capacity: number;
  roomsCount: number;
  basePrice: number;
  isActive: boolean;
};

const DEFAULT_FORM: RoomTypeFormValues = {
  code: "",
  name: "",
  capacity: 2,
  roomsCount: 1,
  basePrice: 0,
  isActive: true,
};

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 caret-gray-900 placeholder:text-gray-400 outline-none transition-all focus:ring-2 focus:ring-blue-500";

const inputStyle: React.CSSProperties = {
  color: "#111827",
  caretColor: "#111827",
  WebkitTextFillColor: "#111827",
  opacity: 1,
};

const RoomTypesPage: React.FC<RoomTypesPageProps> = ({
  selectedPropertyId,
  selectedPropertyName,
}) => {
  const [roomTypes, setRoomTypes] = useState<RevenueRoomType[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingRoomType, setEditingRoomType] = useState<RevenueRoomType | null>(null);
  const [formData, setFormData] = useState<RoomTypeFormValues>(DEFAULT_FORM);

  useEffect(() => {
    void loadRoomTypes();
  }, [selectedPropertyId]);

  async function loadRoomTypes() {
    if (!selectedPropertyId) {
      setRoomTypes([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const rows = await getRoomTypes(selectedPropertyId);
      setRoomTypes(rows);
    } catch (e: any) {
      setError(e?.message ?? "No se pudieron cargar los tipos de habitación");
    } finally {
      setLoading(false);
    }
  }

  const handleOpenModal = (rt?: RevenueRoomType) => {
    if (rt) {
      setEditingRoomType(rt);
      setFormData({
        code: rt.code,
        name: rt.name,
        capacity: rt.capacity ?? 2,
        roomsCount: rt.roomsCount ?? 1,
        basePrice: rt.basePrice ?? 0,
        isActive: rt.isActive,
      });
    } else {
      setEditingRoomType(null);
      setFormData(DEFAULT_FORM);
    }

    setShowModal(true);
  };

  const closeModal = () => {
    if (saving) return;
    setShowModal(false);
    setEditingRoomType(null);
    setFormData(DEFAULT_FORM);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPropertyId) return;

    try {
      setSaving(true);
      setError(null);

      if (editingRoomType) {
        const res = await updateRoomType({
          id: editingRoomType.id,
          code: formData.code.trim().toUpperCase(),
          name: formData.name.trim(),
          capacity: formData.capacity,
          rooms_count: formData.roomsCount,
          base_price: formData.basePrice,
          is_active: formData.isActive,
        });

        if (res.data) {
          setRoomTypes((prev) => prev.map((rt) => (rt.id === res.data!.id ? res.data! : rt)));
        }
      } else {
        const res = await createRoomType({
          property_id: selectedPropertyId,
          code: formData.code.trim().toUpperCase(),
          name: formData.name.trim(),
          capacity: formData.capacity,
          rooms_count: formData.roomsCount,
          base_price: formData.basePrice,
          is_active: formData.isActive,
        });

        if (res.data) {
          setRoomTypes((prev) =>
            [...prev, res.data!].sort((a, b) => a.name.localeCompare(b.name)),
          );
        }
      }

      setShowModal(false);
      setEditingRoomType(null);
      setFormData(DEFAULT_FORM);
    } catch (e: any) {
      const msg = String(e?.message ?? "No se pudo guardar el tipo");
      if (msg.includes("ROOM_TYPE_CODE_ALREADY_EXISTS")) {
        setError("Ya existe un tipo de habitación con ese código en esta propiedad.");
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("¿Seguro que quieres eliminar este tipo de habitación?")) return;

    try {
      setError(null);
      await deleteRoomType({ id });
      setRoomTypes((prev) => prev.filter((rt) => rt.id !== id));
    } catch (e: any) {
      setError(e?.message ?? "No se pudo eliminar el tipo de habitación");
    }
  };

  const handleToggleActive = async (rt: RevenueRoomType) => {
    try {
      setError(null);
      const res = await toggleRoomTypeActive({
        id: rt.id,
        is_active: !rt.isActive,
      });

      if (res.data) {
        setRoomTypes((prev) => prev.map((x) => (x.id === res.data!.id ? res.data! : x)));
      }
    } catch (e: any) {
      setError(e?.message ?? "No se pudo cambiar el estado");
    }
  };

  const propertyTitle = useMemo(() => {
    return selectedPropertyName || "la propiedad seleccionada";
  }, [selectedPropertyName]);

  if (!selectedPropertyId) {
    return (
      <div className="rounded-3xl border border-gray-200 bg-white p-10 text-center text-gray-500">
        Selecciona una propiedad para gestionar sus tipos de habitación.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tipos de Habitación</h1>
          <p className="text-gray-500">
            Gestiona las categorías de alojamiento para {propertyTitle}
          </p>
        </div>

        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 font-bold text-white shadow-lg shadow-blue-200 transition-all hover:bg-blue-700"
        >
          <Plus size={20} />
          Añadir tipo
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-rose-700">
          <AlertTriangle size={18} />
          <span className="text-sm font-semibold">{error}</span>
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-8 py-5">Nombre</th>
                <th className="px-6 py-5">Código</th>
                <th className="px-6 py-5 text-center">Capacidad</th>
                <th className="px-6 py-5 text-center">Nº Habitaciones</th>
                <th className="px-6 py-5">Precio Base</th>
                <th className="px-6 py-5">Estado</th>
                <th className="px-8 py-5 text-right">Acciones</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {!loading && roomTypes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-8 py-12 text-center text-gray-400">
                    <Hotel size={48} className="mx-auto mb-4 opacity-20" />
                    <p className="font-bold">No hay tipos de habitación configurados</p>
                  </td>
                </tr>
              ) : (
                roomTypes.map((rt) => (
                  <tr key={rt.id} className="group transition-colors hover:bg-gray-50">
                    <td className="px-8 py-5">
                      <span className="font-bold text-gray-900">{rt.name}</span>
                    </td>

                    <td className="px-6 py-5">
                      <span className="rounded bg-gray-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-gray-500">
                        {rt.code}
                      </span>
                    </td>

                    <td className="px-6 py-5 text-center font-medium text-gray-600">
                      {rt.capacity ?? 0} pax
                    </td>

                    <td className="px-6 py-5 text-center font-medium text-gray-600">
                      {rt.roomsCount ?? 0}
                    </td>

                    <td className="px-6 py-5 font-bold text-gray-900">
                      {Number(rt.basePrice ?? 0).toFixed(2)} €
                    </td>

                    <td className="px-6 py-5">
                      {rt.isActive ? (
                        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                          <CheckCircle2 size={14} />
                          Activo
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                          <XCircle size={14} />
                          Inactivo
                        </span>
                      )}
                    </td>

                    <td className="px-8 py-5 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 transition-all group-hover:opacity-100">
                        <button
                          onClick={() => handleToggleActive(rt)}
                          className={`rounded-xl p-2 transition-all ${
                            rt.isActive
                              ? "text-amber-500 hover:bg-amber-50 hover:text-amber-600"
                              : "text-emerald-500 hover:bg-emerald-50 hover:text-emerald-600"
                          }`}
                          title={rt.isActive ? "Desactivar" : "Activar"}
                        >
                          {rt.isActive ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
                        </button>

                        <button
                          onClick={() => handleOpenModal(rt)}
                          className="rounded-xl p-2 text-gray-400 transition-all hover:bg-blue-50 hover:text-blue-600"
                        >
                          <Edit2 size={18} />
                        </button>

                        <button
                          onClick={() => handleDelete(rt.id)}
                          className="rounded-xl p-2 text-rose-400 transition-all hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            onClick={closeModal}
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
          />

          <div className="relative w-full max-w-lg overflow-hidden rounded-[32px] bg-white shadow-2xl">
            <div className="border-b border-gray-100 p-8">
              <h2 className="text-2xl font-bold text-gray-900">
                {editingRoomType ? "Editar Tipo" : "Nuevo Tipo de Habitación"}
              </h2>
              <p className="mt-1 text-gray-500">Configura los detalles de la categoría</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 p-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="ml-1 mb-2 block text-xs font-bold uppercase tracking-widest text-gray-400">
                    Nombre
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej: Doble Superior con Vistas"
                    className={inputClass}
                    style={inputStyle}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>

                <div>
                  <label className="ml-1 mb-2 block text-xs font-bold uppercase tracking-widest text-gray-400">
                    Código
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        code: e.target.value
                          .toUpperCase()
                          .replace(/\s+/g, "_")
                          .replace(/[^A-Z0-9_-]/g, ""),
                      })
                    }
                    placeholder="Ej: DSV"
                    className={`${inputClass} font-mono`}
                    style={inputStyle}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>

                <div>
                  <label className="ml-1 mb-2 block text-xs font-bold uppercase tracking-widest text-gray-400">
                    Capacidad (Pax)
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formData.capacity}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        capacity: parseInt(e.target.value, 10) || 1,
                      })
                    }
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label className="ml-1 mb-2 block text-xs font-bold uppercase tracking-widest text-gray-400">
                    Nº Habitaciones
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formData.roomsCount}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        roomsCount: parseInt(e.target.value, 10) || 1,
                      })
                    }
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label className="ml-1 mb-2 block text-xs font-bold uppercase tracking-widest text-gray-400">
                    Precio Base (€)
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.basePrice}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        basePrice: parseFloat(e.target.value) || 0,
                      })
                    }
                    className={`${inputClass} font-bold`}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-2xl bg-gray-50 p-4">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label
                  htmlFor="isActive"
                  className="cursor-pointer text-sm font-bold text-gray-700"
                >
                  Este tipo de habitación está activo y disponible
                </label>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 rounded-2xl px-6 py-4 font-bold text-gray-500 transition-all hover:bg-gray-100"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-2xl bg-gray-900 px-6 py-4 font-bold text-white shadow-lg shadow-gray-200 transition-all hover:bg-gray-800 disabled:opacity-60"
                >
                  {saving ? "Guardando..." : editingRoomType ? "Guardar Cambios" : "Crear Tipo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomTypesPage;