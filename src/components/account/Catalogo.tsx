// src/components/account/Catalogo.tsx
import React from "react";
import type { User } from "@/types/types";

export const Catalogo: React.FC<{ user: User }> = () => {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm">
      <div className="p-6 space-y-3">
        <h3 className="text-lg font-semibold text-slate-900">Catálogo de objetos</h3>
        <p className="text-xs text-slate-500">
          Aquí irá la tabla de objetos (código, nombre, precio, activo) y guardar cambios.
        </p>

        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-sm text-slate-700">
            Siguiente paso: mover aquí tu componente actual de catálogo y sus Edge Functions,
            pero sin mezclarlo con Planes/Perfil.
          </p>
        </div>
      </div>
    </section>
  );
};
