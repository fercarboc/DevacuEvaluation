import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/services/supabase";
import { orgInviteFinalize } from "@/services/orgInviteFinalize.service";
import { LS_KEYS } from "@/services/storageKeys";

// ✅ Ajusta la ruta real donde guardes el cartel
import cartel3 from "@/img/cartel3.png";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function pickOrgIdFromQuery(sp: URLSearchParams) {
  const a = (sp.get("org_id") ?? "").trim();
  const b = (sp.get("orgId") ?? "").trim();
  const v = a || b;
  return v && isUuid(v) ? v : "";
}


export default function ResetPasswordPage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();

  const orgIdFromLink = useMemo(() => pickOrgIdFromQuery(sp), [sp]);

  const [sessionOk, setSessionOk] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Permitir reenviar desde aquí
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

      if (s.user?.email) setRecoverEmail(s.user.email);
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
      // 1) Guardar password en Supabase Auth
      const { error } = await supabase.auth.updateUser({ password: p1 });
      if (error) throw error;

      // 2) FINALIZAR INVITED → ACTIVE (si procede)
      //    Requiere org_id. Lo intentamos desde:
      //    - URL (?org_id=... o ?orgId=...)
      //    - localStorage (debacu_eval_org_id)
      const orgIdCandidate = (orgIdFromLink || localStorage.getItem(LS_KEYS.ORG_ID) || "").trim();

      if (orgIdCandidate && isUuid(orgIdCandidate)) {
        try {
          await orgInviteFinalize(orgIdCandidate);
        } catch (e: any) {
          console.error("orgInviteFinalize failed:", e);
          // No bloqueamos el reset por esto, pero lo mostramos claro.
          setErr(
            `Contraseña guardada, pero no se pudo activar la membresía del hotel: ${
              e?.message ?? "error"
            }`,
          );
        }
      } else {
        // No es un error fatal: el reset debe funcionar igual.
        console.warn("orgInviteFinalize skipped: missing org_id in link/localStorage");
      }

      setOk("Contraseña actualizada. Ya puedes iniciar sesión.");

      // Recomendable: cerrar sesión tras el cambio
      await supabase.auth.signOut();

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
      // Si tienes org_id disponible, lo metemos en el redirect para poder finalizar membership
      const redirectBase = `${window.location.origin}/auth/reset`;
      const redirectTo = orgIdFromLink ? `${redirectBase}?org_id=${encodeURIComponent(orgIdFromLink)}` : redirectBase;

      const { error } = await supabase.auth.resetPasswordForEmail(to, { redirectTo });
      if (error) throw error;

      setOk("Email de recuperación enviado. Revisa tu bandeja de entrada.");
    } catch (e: any) {
      setErr(e?.message ?? "No se pudo enviar el email de recuperación.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto min-h-screen max-w-6xl px-4 py-10 flex items-center">
        <div className="w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm grid md:grid-cols-2">
          {/* LEFT: panel azul + imagen */}
          <aside className="relative hidden md:block bg-slate-900">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/70 via-slate-900 to-slate-900" />
            <div className="relative h-full w-full p-10 flex items-center justify-center">
              <img
                src={cartel3}
                alt="Debacu Evaluation360"
                className="w-full max-w-[520px] rounded-2xl shadow-xl ring-1 ring-white/10"
                loading="eager"
              />
            </div>
            <div className="absolute bottom-6 left-8 right-8 text-xs text-white/70">
              Debacu Evaluation360 · Acceso restringido · Auditoría y trazabilidad
            </div>
          </aside>

          {/* RIGHT: formulario */}
          <main className="p-6 sm:p-10">
            <div className="max-w-md">
              <h1 className="text-2xl font-bold text-slate-900">Restablecer contraseña</h1>
              <p className="mt-2 text-sm text-slate-600">
                Establece una nueva contraseña segura para acceder a tu cuenta.
              </p>

              {sessionOk === null ? (
                <p className="text-sm text-slate-600 mt-6">Comprobando enlace…</p>
              ) : sessionOk ? (
                <>
                  <p className="text-sm text-slate-600 mt-6">
                    Usuario: <span className="font-semibold">{email ?? "—"}</span>
                  </p>

                  <div className="mt-6 space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-600">Nueva contraseña</label>
                      <input
                        type="password"
                        value={p1}
                        onChange={(e) => setP1(e.target.value)}
                        className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Mínimo 8 caracteres"
                        autoComplete="new-password"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-600">Repetir contraseña</label>
                      <input
                        type="password"
                        value={p2}
                        onChange={(e) => setP2(e.target.value)}
                        className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Repite la contraseña"
                        autoComplete="new-password"
                      />
                    </div>

                    {err ? (
                      <div className="text-sm text-red-600 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                        {err}
                      </div>
                    ) : null}

                    {ok ? (
                      <div className="text-sm text-emerald-700 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                        {ok}
                      </div>
                    ) : null}

                    <button
                      onClick={submitNewPassword}
                      disabled={loading}
                      className="w-full mt-1 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-50 hover:bg-slate-800 transition-colors"
                    >
                      {loading ? "Guardando…" : "Guardar contraseña"}
                    </button>

                    <button
                      onClick={() => nav("/login")}
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm hover:bg-slate-50 transition-colors"
                    >
                      Volver al login
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-600 mt-6">
                    El enlace no es válido o ha caducado. Puedes reenviar la recuperación.
                  </p>

                  <div className="mt-6 space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-600">Email</label>
                      <input
                        value={recoverEmail}
                        onChange={(e) => setRecoverEmail(e.target.value)}
                        className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="tuemail@dominio.com"
                        autoComplete="email"
                      />
                    </div>

                    {err ? (
                      <div className="text-sm text-red-600 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                        {err}
                      </div>
                    ) : null}

                    {ok ? (
                      <div className="text-sm text-emerald-700 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                        {ok}
                      </div>
                    ) : null}

                    <button
                      onClick={resendRecovery}
                      disabled={loading}
                      className="w-full px-4 py-2 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-50 hover:bg-slate-800 transition-colors"
                    >
                      {loading ? "Enviando…" : "Reenviar email de recuperación"}
                    </button>

                    <button
                      onClick={() => nav("/login")}
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm hover:bg-slate-50 transition-colors"
                    >
                      Volver al login
                    </button>
                  </div>
                </>
              )}

              {sp.get("debug") === "1" ? (
                <pre className="mt-6 text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto">
                  origin: {window.location.origin}
                  {"\n"}reset_redirect: {`${window.location.origin}/auth/reset`}
                  {"\n"}org_id_from_link: {orgIdFromLink || "—"}
                  {"\n"}org_id_from_ls: {localStorage.getItem(LS_KEYS.ORG_ID) || "—"}
                </pre>
              ) : null}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}