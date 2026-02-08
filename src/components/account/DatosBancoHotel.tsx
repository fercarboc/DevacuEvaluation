// src/components/account/DatosBancoHotel.tsx
import React, { useState } from "react";
import type { User } from "@/types/types";

export const DatosBancoHotel: React.FC<{ user: User }> = () => {
  const [enabled, setEnabled] = useState(false);

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm">
      <div className="p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Datos bancarios (SEPA)</h3>
          <p className="text-xs text-slate-500">
            Actualmente el pago es por tarjeta (Stripe). No guardamos datos de tarjeta.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="text-sm text-slate-700">Activar domiciliación bancaria SEPA</span>
        </div>

        {!enabled ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-sm text-slate-700">
              Esta funcionalidad está <b>desactivada</b>. Si tu hotel necesita SEPA, solicítalo y lo activamos bajo petición.
            </p>
            <button
              type="button"
              className="mt-3 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold"
              onClick={() => alert("Solicitud registrada (pendiente de implementar)")}
            >
              Solicitar activación SEPA
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-900">
              Aún no disponible: activaste el switch, pero la captura/validación SEPA se implementará después.
            </p>
          </div>
        )}
      </div>
    </section>
  );
};
