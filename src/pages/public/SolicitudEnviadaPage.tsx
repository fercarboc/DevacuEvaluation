import React from "react";
import { useSearchParams, Link } from "react-router-dom";

export function SolicitudEnviadaPage() {
  const [params] = useSearchParams();
  const id = params.get("id");

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-lg w-full bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Solicitud enviada</h1>
        <p className="text-slate-600 mt-2">
          Revisaremos tu solicitud. Si se aprueba, recibirás una invitación por email para crear tu contraseña.
        </p>

        {id && (
          <div className="mt-4 text-xs bg-slate-50 border rounded-lg p-3 text-slate-600">
            ID de solicitud: <span className="font-mono">{id}</span>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <Link to="/" className="px-4 py-2 rounded-lg border text-sm">Volver</Link>
          <Link to="/login" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold">
            Ir a login
          </Link>
        </div>
      </div>
    </div>
  );
}
