// src/pages/ActivateAccountPage.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "@/services/supabase";
import { orgInviteFinalize } from "@/services/orgInviteFinalize.service";
import { useNavigate } from "react-router-dom";

export default function ActivateAccountPage() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string>("");

  // ======================================================
  // 1️⃣ Verificar OTP de invitación
  // ======================================================
  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const type = url.searchParams.get("type");
        const token_hash = url.searchParams.get("token_hash");
        const org_id = url.searchParams.get("org_id") || "";

        if (!org_id) {
          setMsg("Enlace inválido (falta org_id).");
          setLoading(false);
          return;
        }

        setOrgId(org_id);

        // Si viene token_hash → verificar invitación
        if (type && token_hash) {
          const { error } = await supabase.auth.verifyOtp({
            type: type as any,
            token_hash,
          });

          if (error) {
            setMsg(
              "El enlace de activación no es válido o ha caducado. Reenvía la invitación desde Admin."
            );
            setLoading(false);
            return;
          }

          // Confirmar sesión creada
          const { data: sessionData } = await supabase.auth.getSession();

          if (!sessionData?.session?.access_token) {
            setMsg(
              "No se pudo establecer sesión con el enlace. Reenvía la invitación."
            );
            setLoading(false);
            return;
          }

          // 🔐 SOLO ahora limpiamos token_hash/type
          url.searchParams.delete("type");
          url.searchParams.delete("token_hash");
          window.history.replaceState({}, "", url.toString());
        }

        // Verificar que hay sesión activa
        const { data: s2 } = await supabase.auth.getSession();
        if (!s2?.session?.access_token) {
          setMsg("No hay sesión activa. Usa el enlace original del email.");
          setLoading(false);
          return;
        }

        setLoading(false);
      } catch (e) {
        console.error(e);
        setMsg("Error inesperado al procesar la activación.");
        setLoading(false);
      }
    })();
  }, []);

  // ======================================================
  // 2️⃣ Guardar contraseña + finalizar invitación
  // ======================================================
  const handleSubmit = async () => {
    setMsg(null);

    if (pw1.length < 8) {
      setMsg("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (pw1 !== pw2) {
      setMsg("Las contraseñas no coinciden.");
      return;
    }

    try {
      setLoading(true);

      // Actualizar contraseña
      const { error: updateError } = await supabase.auth.updateUser({
        password: pw1,
      });

      if (updateError) {
        setMsg("No se pudo actualizar la contraseña.");
        setLoading(false);
        return;
      }

      // Confirmar sesión antes de finalizar
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.access_token) {
        setMsg("Sesión no válida tras actualizar contraseña.");
        setLoading(false);
        return;
      }

      // Finalizar invitación (requiere sesión)
      await orgInviteFinalize(orgId);

      // Redirigir a login
      nav("/login");
    } catch (err: any) {
      console.error(err);
      setMsg(err?.message || "Error al finalizar la activación.");
      setLoading(false);
    }
  };

  // ======================================================
  // UI
  // ======================================================
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-6xl bg-white rounded-2xl shadow-lg flex overflow-hidden">
        {/* Panel izquierdo */}
        <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-blue-900 to-blue-700 text-white p-10 flex-col justify-center">
          <h2 className="text-2xl font-semibold mb-2">
            Debacu Evaluation
          </h2>
          <p className="text-lg opacity-90 mb-6">
            Herramienta profesional para hoteles
          </p>
          <h1 className="text-3xl font-bold mb-4">
            Más control operativo.
            <br />
            Menos incidencias repetidas.
          </h1>
          <p className="opacity-80">
            Activa tu acceso en menos de un minuto y empieza a trabajar con tu equipo.
          </p>
        </div>

        {/* Panel derecho */}
        <div className="w-full md:w-1/2 p-10">
          <h2 className="text-2xl font-semibold mb-2">Activa tu cuenta</h2>
          <p className="text-gray-600 mb-6">
            Inserta tu contraseña para activar el servicio y acceder a Debacu Evaluation360.
          </p>

          {msg && (
            <div className="mb-4 p-3 rounded bg-red-100 text-red-700 text-sm">
              {msg}
            </div>
          )}

          {!loading && (
            <>
              <div className="mb-4">
                <label className="block text-sm mb-1">Nueva contraseña</label>
                <input
                  type="password"
                  value={pw1}
                  onChange={(e) => setPw1(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Mínimo 8 caracteres"
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm mb-1">Repetir contraseña</label>
                <input
                  type="password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full bg-blue-900 hover:bg-blue-800 text-white py-2 rounded-lg transition"
              >
                Guardar contraseña
              </button>

              <button
                onClick={() => nav("/login")}
                className="w-full mt-3 border py-2 rounded-lg text-gray-700"
              >
                Ir al login
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}