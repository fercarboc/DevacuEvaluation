import React, { useState } from "react";
import { supabase } from "@/services/supabaseClient";
import { useNavigate } from "react-router-dom";

export function PrimerAccesoPage() {
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const setNewPassword = async () => {
    if (password.length < 8) {
      alert("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // aquí puedes redirigir a completar perfil / app
      nav("/app", { replace: true });
    } catch (e: any) {
      alert(e?.message ?? "Error actualizando contraseña");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Primer acceso</h1>
        <p className="text-slate-600 mt-2">
          Por seguridad, establece una contraseña nueva para tu cuenta.
        </p>

        <div className="mt-6">
          <label className="text-xs font-medium text-slate-600">Nueva contraseña</label>
          <input
            type="password"
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
          />
        </div>

        <button
          onClick={setNewPassword}
          disabled={loading}
          className="mt-6 w-full px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          {loading ? "Guardando..." : "Guardar contraseña"}
        </button>
      </div>
    </div>
  );
}
