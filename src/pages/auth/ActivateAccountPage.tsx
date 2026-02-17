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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      // Si el usuario llegó por link de invite, normalmente ya habrá sesión/usuario.
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        setMsg("No hay sesión activa. Abre este enlace desde el email de invitación.");
      }
      setLoading(false);
    })();
  }, []);

  const submit = async () => {
    setMsg(null);

    if (pw1.length < 8) {
      setMsg("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (pw1 !== pw2) {
      setMsg("Las contraseñas no coinciden.");
      return;
    }

    setSaving(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password: pw1 });
      if (updErr) throw updErr;

      // Activa la membresía INVITED → ACTIVE
      await orgInviteFinalize();

      setMsg("Cuenta activada. Ya puedes entrar.");
      setTimeout(() => nav("/login"), 800);
    } catch (e: any) {
      setMsg(e?.message ?? "Error activando cuenta.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border rounded-2xl p-6">
        <h1 className="text-xl font-bold text-slate-900">Activar cuenta</h1>
        <p className="text-sm text-slate-600 mt-1">
          Define tu contraseña para acceder a Debacu Evaluation360.
        </p>

        {loading ? (
          <div className="mt-6 text-sm text-slate-500">Cargando...</div>
        ) : (
          <>
            <div className="mt-6 space-y-3">
              <div>
                <label className="text-sm text-slate-700">Nueva contraseña</label>
                <input
                  type="password"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={pw1}
                  onChange={(e) => setPw1(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm text-slate-700">Repetir contraseña</label>
                <input
                  type="password"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                />
              </div>
            </div>

            {msg ? <div className="mt-4 text-sm text-slate-700">{msg}</div> : null}

            <button
              onClick={submit}
              disabled={saving}
              className="mt-6 w-full px-4 py-2 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar contraseña"}
            </button>

            <button
              onClick={() => nav("/login")}
              className="mt-3 w-full px-4 py-2 rounded-lg border text-sm"
            >
              Ir al login
            </button>
          </>
        )}
      </div>
    </div>
  );
}
