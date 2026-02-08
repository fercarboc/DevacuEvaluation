// src/components/account/Seguridad.tsx
import React, { useState } from "react";
import { supabase } from "@/services/supabaseClient";
import type { User } from "@/types/types";
import { Eye, EyeOff } from "lucide-react";

export const Seguridad: React.FC<{ user: User }> = () => {
  const [changing, setChanging] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const change = async () => {
    if (!newPassword || newPassword.length < 8) {
      setMsg("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setChanging(true);
    setMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setMsg("Contraseña actualizada.");
      setNewPassword("");
    } catch (e) {
      console.error(e);
      setMsg("No se pudo actualizar la contraseña.");
    } finally {
      setChanging(false);
    }
  };

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm">
      <div className="p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Seguridad</h3>
          <p className="text-xs text-slate-500">Cambia tu contraseña y configura opciones avanzadas.</p>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600">Nueva contraseña</label>
          <div className="mt-1 relative">
            <input
              type={showNew ? "text" : "password"}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowNew((p) => !p)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"
            >
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={change}
            disabled={changing}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-60"
          >
            {changing ? "Actualizando..." : "Cambiar contraseña"}
          </button>
          {msg && <p className="text-sm text-slate-500">{msg}</p>}
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs text-slate-600">
            API / Integraciones: se mostrará aquí solo si el plan lo permite (pendiente).
          </p>
        </div>
      </div>
    </section>
  );
};
