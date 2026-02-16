import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/services/supabase";

export default function ResetPasswordPage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();

  const [sessionOk, setSessionOk] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Si quieres: permitir reenviar desde aquí
  const [recoverEmail, setRecoverEmail] = useState("");

  useEffect(() => {
    (async () => {
      setErr(null);
      const { data } = await supabase.auth.getSession();
      const s = data.session;

      if (!s) {
        setSessionOk(false);
        return;
      }

      setSessionOk(true);
      setEmail(s.user?.email ?? null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitNewPassword = async () => {
    setErr(null);
    setOk(null);

    if (p1.length < 8) {
      setErr("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (p1 !== p2) {
      setErr("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: p1 });
      if (error) throw error;

      setOk("Contraseña actualizada. Ya puedes iniciar sesión.");
      // recomendable: cerrar sesión tras el cambio
      await supabase.auth.signOut();

      // manda al login con flag
      setTimeout(() => nav("/login?pw=ok"), 800);
    } catch (e: any) {
      setErr(e?.message ?? "No se pudo actualizar la contraseña.");
    } finally {
      setLoading(false);
    }
  };

  const resendRecovery = async () => {
    setErr(null);
    setOk(null);

    const to = recoverEmail.trim();
    if (!to || !to.includes("@")) {
      setErr("Introduce un email válido.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(to, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;

      setOk("Email de recuperación enviado. Revisa tu bandeja de entrada.");
    } catch (e: any) {
      setErr(e?.message ?? "No se pudo enviar el email de recuperación.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white border rounded-2xl p-6">
        <h1 className="text-xl font-bold text-slate-900">Restablecer contraseña</h1>

        {sessionOk === null ? (
          <p className="text-sm text-slate-600 mt-3">Comprobando enlace…</p>
        ) : sessionOk ? (
          <>
            <p className="text-sm text-slate-600 mt-3">
              Usuario: <span className="font-semibold">{email ?? "—"}</span>
            </p>

            <div className="mt-5 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Nueva contraseña</label>
                <input
                  type="password"
                  value={p1}
                  onChange={(e) => setP1(e.target.value)}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="Mínimo 8 caracteres"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Repetir contraseña</label>
                <input
                  type="password"
                  value={p2}
                  onChange={(e) => setP2(e.target.value)}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="Repite la contraseña"
                />
              </div>

              {err ? <div className="text-sm text-red-600">{err}</div> : null}
              {ok ? <div className="text-sm text-green-700">{ok}</div> : null}

              <button
                onClick={submitNewPassword}
                disabled={loading}
                className="w-full mt-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-50"
              >
                {loading ? "Guardando…" : "Guardar contraseña"}
              </button>

              <button
                onClick={() => nav("/login")}
                className="w-full px-4 py-2 rounded-lg border text-sm"
              >
                Volver al login
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600 mt-3">
              El enlace no es válido o ha caducado. Puedes reenviar la recuperación.
            </p>

            <div className="mt-5 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Email</label>
                <input
                  value={recoverEmail}
                  onChange={(e) => setRecoverEmail(e.target.value)}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="tuemail@dominio.com"
                />
              </div>

              {err ? <div className="text-sm text-red-600">{err}</div> : null}
              {ok ? <div className="text-sm text-green-700">{ok}</div> : null}

              <button
                onClick={resendRecovery}
                disabled={loading}
                className="w-full px-4 py-2 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-50"
              >
                {loading ? "Enviando…" : "Reenviar email de recuperación"}
              </button>

              <button
                onClick={() => nav("/login")}
                className="w-full px-4 py-2 rounded-lg border text-sm"
              >
                Volver al login
              </button>
            </div>
          </>
        )}

        {/* si quieres leer flags del login */}
        {sp.get("debug") === "1" ? (
          <pre className="mt-4 text-xs bg-slate-50 border rounded p-2 overflow-auto">
            origin: {window.location.origin}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
