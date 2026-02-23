// src/pages/auth/ActivateAccountPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "@/services/supabaseClient";
import { orgInviteFinalize } from "@/services/orgInviteFinalize.service";

/**
 * ActivateAccountPage
 * Soporta:
 *  A) ?type=invite&token_hash=...   -> verifyOtp (RECOMENDADO en emails Supabase)
 *  B) ?code=...                     -> exchangeCodeForSession (PKCE)
 *  C) #access_token=...&refresh_token=... -> setSession (implicit)
 *
 * Luego:
 *  - updateUser(password)
 *  - orgInviteFinalize(org_id) (Edge con JWT)
 */
export default function ActivateAccountPage() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const qs = useMemo(() => new URLSearchParams(window.location.search), []);
  const orgIdFromUrl = useMemo(() => qs.get("org_id") || "", [qs]);

  const submit = async (resolvedOrgId: string) => {
    setMsg(null);

    if (!resolvedOrgId) {
      setMsg("Falta org_id. Reenvía la invitación desde Admin.");
      return;
    }
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
      // 0) Asegura sesión real antes de tocar nada
      const { data: s0 } = await supabase.auth.getSession();
      const jwt0 = s0?.session?.access_token || "";
      if (!jwt0) {
        throw new Error(
          "No hay sesión activa. Abre el enlace desde el email (no desde un marcador) o reenvía la invitación."
        );
      }

      // 1) Set password (usuario ya autenticado por el invite)
      const { error: updErr } = await supabase.auth.updateUser({ password: pw1 });
      if (updErr) throw updErr;

      // 2) Finaliza: INVITED -> ACTIVE, claim por email/auth_user_id, etc.
      await orgInviteFinalize(resolvedOrgId);

      setMsg("Cuenta activada. Ya puedes entrar.");
      setTimeout(() => nav("/login"), 800);
    } catch (e: any) {
      const detail = e?.message || e?.detail || e?.error || "Error activando cuenta.";
      setMsg(detail);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        setMsg(null);

        const url = new URL(window.location.href);

        // -----------------------------------------
        // 1) Establecer sesión desde URL (3 casos)
        // -----------------------------------------

        // Caso A: Supabase email links modernos: type + token_hash (invite / recovery / magiclink)
        const type = url.searchParams.get("type") || "";
        const token_hash = url.searchParams.get("token_hash") || "";

        if (type && token_hash) {
          // ✅ CLAVE: esto crea la sesión en el navegador
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

          // Limpia token_hash/type de la URL (mantén org_id)
          url.searchParams.delete("type");
          url.searchParams.delete("token_hash");
          window.history.replaceState({}, "", url.toString());
        }

        // Caso B: PKCE code en query
        const code = url.searchParams.get("code") || "";
        if (!type && !token_hash && code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setMsg(
              "El enlace de activación no es válido o ha caducado. Reenvía la invitación desde Admin."
            );
            setLoading(false);
            return;
          }

          // Limpia code de la URL (mantén org_id)
          url.searchParams.delete("code");
          window.history.replaceState({}, "", url.toString());
        }

        // Caso C: access_token en hash
        if (!type && !token_hash && !code && window.location.hash) {
          const hash = window.location.hash.replace(/^#/, "");
          const hp = new URLSearchParams(hash);

          const access_token = hp.get("access_token") || "";
          const refresh_token = hp.get("refresh_token") || "";
          const error_description = hp.get("error_description") || hp.get("error") || "";

          if (error_description) setMsg(decodeURIComponent(error_description));

          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (error) {
              setMsg(
                "No se pudo establecer sesión con el enlace. Reenvía la invitación desde Admin."
              );
              setLoading(false);
              return;
            }

            // Limpia hash
            window.history.replaceState({}, "", window.location.pathname + window.location.search);
          }
        }

        // -----------------------------------------
        // 2) Validar sesión
        // -----------------------------------------
        const { data: sess } = await supabase.auth.getSession();
        const jwt = sess?.session?.access_token || "";
        if (!jwt) {
          setMsg("No hay sesión activa. Abre este enlace desde el email de invitación.");
          setLoading(false);
          return;
        }

        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user ?? null;
        if (!user) {
          setMsg("No se pudo leer el usuario. Reenvía la invitación desde Admin.");
          setLoading(false);
          return;
        }

        // -----------------------------------------
        // 3) Resolver org_id
        // -----------------------------------------
        const orgIdFromMeta =
          (user.user_metadata as any)?.org_id || (user.user_metadata as any)?.orgId || "";
        const resolvedOrgId = String(orgIdFromUrl || orgIdFromMeta || "").trim();

        if (!resolvedOrgId) {
          setMsg("Falta org_id en el enlace. Reenvía la invitación desde Admin.");
          setLoading(false);
          return;
        }

        // -----------------------------------------
        // 4) OK: mostrar formulario
        // -----------------------------------------
        setMsg(null);
        setLoading(false);
      } catch (e: any) {
        setMsg(e?.message ?? "Error preparando la activación.");
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgIdFromUrl]);

  const resolvedOrgIdForSubmit = useMemo(() => orgIdFromUrl.trim(), [orgIdFromUrl]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Topbar */}
      <div className="w-full px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img
            src="/img/debacu-logo.png"
            alt="Debacu"
            className="h-8 w-auto"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          <span className="text-sm font-semibold text-slate-900">Debacu Evaluation360</span>
        </div>
        <button onClick={() => nav("/login")} className="text-sm text-slate-600 hover:text-slate-900">
          Ir al login
        </button>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-6xl px-4 pb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 overflow-hidden rounded-3xl border bg-white shadow-sm">
          {/* LEFT BRANDING */}
          <div className="hidden md:flex relative p-10 text-white bg-gradient-to-br from-[#0B1F3A] to-[#163E73]">
            <div className="relative z-10 flex flex-col justify-between w-full">
              <div className="flex items-center gap-3">
                <img
                  src="/img/debacu-logo-white.png"
                  alt="Debacu"
                  className="h-10 w-auto"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
                <div>
                  <div className="text-lg font-semibold leading-tight">Debacu Evaluation</div>
                  <div className="text-xs text-blue-200">Herramienta profesional para hoteles</div>
                </div>
              </div>

              <div className="mt-10">
                <h2 className="text-3xl font-semibold leading-tight">
                  Más control operativo.
                  <br />
                  Menos incidencias repetidas.
                </h2>
                <p className="mt-3 text-sm text-blue-100 max-w-md">
                  Activa tu acceso en menos de un minuto y empieza a trabajar con tu equipo.
                </p>

                <img
                  src="/img/activate-hero.png"
                  alt="Debacu"
                  className="mt-10 w-full max-w-lg rounded-2xl shadow-lg border border-white/10"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>

              <div className="text-xs text-blue-200">Uso profesional · Gestión interna · Apoyo operativo</div>
            </div>

            <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_top,white,transparent_55%)]" />
          </div>

          {/* RIGHT FORM */}
          <div className="p-6 sm:p-10">
            <h1 className="text-2xl font-semibold text-slate-900">Activa tu cuenta</h1>
            <p className="text-sm text-slate-600 mt-2">
              Inserta tu contraseña para activar el servicio y acceder a Debacu Evaluation360.
            </p>

            {loading ? (
              <div className="mt-8 text-sm text-slate-500">Cargando...</div>
            ) : (
              <>
                {msg ? (
                  <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
                    {msg}
                  </div>
                ) : null}

                <div className="mt-6 space-y-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700">Nueva contraseña</label>
                    <input
                      type="password"
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-900/20"
                      placeholder="Mínimo 8 caracteres"
                      value={pw1}
                      onChange={(e) => setPw1(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">Repetir contraseña</label>
                    <input
                      type="password"
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-900/20"
                      value={pw2}
                      onChange={(e) => setPw2(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  onClick={() => submit(resolvedOrgIdForSubmit)}
                  disabled={saving || !resolvedOrgIdForSubmit}
                  className="mt-7 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Guardar contraseña"}
                </button>

                <button
                  onClick={() => nav("/login")}
                  className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 hover:bg-slate-50"
                >
                  Ir al login
                </button>

                <div className="mt-6 text-xs text-slate-500">
                  Si este enlace te devuelve error, reenvía la invitación desde Admin (no uses enlaces antiguos).
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}