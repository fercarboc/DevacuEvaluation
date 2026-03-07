import React from "react";
import { Edit, Trash2, Power, Building2, MapPin, Clock3, Hash } from "lucide-react";
import type { RevenueProperty } from "../services/revenueProperties.service";

interface PropertiesListProps {
  properties: RevenueProperty[];
  onEdit: (property: RevenueProperty) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string) => void;
}

function formatCategory(category: number | null) {
  if (category == null) return "Sin categoría";
  return `${category}★`;
}

const PropertiesList: React.FC<PropertiesListProps> = ({
  properties,
  onEdit,
  onDelete,
  onToggleActive,
}) => {
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-400 font-bold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="px-8 py-5">Propiedad</th>
              <th className="px-6 py-5">Código / Categoría</th>
              <th className="px-6 py-5">Ubicación</th>
              <th className="px-6 py-5">Timezone</th>
              <th className="px-6 py-5 text-center">Estado</th>
              <th className="px-8 py-5 text-right">Acciones</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {properties.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors group">
                <td className="px-8 py-5">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-50 p-2 rounded-xl text-blue-600">
                      <Building2 size={20} />
                    </div>
                    <div>
                      <div className="font-bold text-gray-900">{p.name}</div>
                      <div className="text-xs text-gray-400 font-medium truncate max-w-[260px]">
                        {p.address || "Sin dirección"}
                      </div>
                    </div>
                  </div>
                </td>

                <td className="px-6 py-5">
                  <div className="flex items-center gap-1.5 text-gray-700 font-semibold">
                    <Hash size={14} className="text-gray-400" />
                    {p.code}
                  </div>
                  <div className="text-xs text-gray-400">{formatCategory(p.category)}</div>
                </td>

                <td className="px-6 py-5">
                  <div className="flex items-center gap-1.5 text-gray-600 font-medium">
                    <MapPin size={14} className="text-gray-400" />
                    {p.city || "Sin ciudad"}
                  </div>
                  <div className="text-xs text-gray-400">{p.country || "Sin país"}</div>
                </td>

                <td className="px-6 py-5">
                  <div className="flex items-center gap-1.5 text-gray-600 font-medium">
                    <Clock3 size={14} className="text-gray-400" />
                    {p.timezone || "Sin timezone"}
                  </div>
                </td>

                <td className="px-6 py-5 text-center">
                  <span
                    className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter border ${
                      p.isActive
                        ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                        : "bg-gray-100 text-gray-400 border-gray-200"
                    }`}
                  >
                    {p.isActive ? "Activa" : "Inactiva"}
                  </span>
                </td>

                <td className="px-8 py-5 text-right">
                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onToggleActive(p.id)}
                      className={`p-2 rounded-lg transition-colors ${
                        p.isActive
                          ? "text-amber-600 hover:bg-amber-50"
                          : "text-emerald-600 hover:bg-emerald-50"
                      }`}
                      title={p.isActive ? "Desactivar" : "Activar"}
                    >
                      <Power size={18} />
                    </button>

                    <button
                      onClick={() => onEdit(p)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Edit size={18} />
                    </button>

                    <button
                      onClick={() => onDelete(p.id)}
                      className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PropertiesList;