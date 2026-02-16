// src/pages/Login.tsx
import React, { useEffect, useMemo, useState } from "react";
import { EvalApiError, evalPostLogin } from "@/services/evalApi";
import type { User } from "@/types/types";
import { planCodeToPlanType, PlanType } from "@/types/types";
import { Lock, User as UserIcon, Loader2 } from "lucide-react";
import { supabase } from "@/services/supabaseClient";
import { useEvalAuth } from "@/context/EvalAuthContext";
import { useSearchParams } from "react-router-dom";

import PaywallPlansModal from "./PaywallPlansModal";

export interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

type PaywallReason = "EXPIRED" | "NONE" | null;

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const { signIn } = useEvalAuth();
  const [searchParams] = useSearchParams();

  // Email + password
  const [emailInput, setEmailInput] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [info, setInfo] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // Paywall
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallReason, setPaywallReason] = useState<PaywallReason>(null);

  // evita spamear el mensaje
  const pwOk = useMemo(() => searchParams.get("pw") === "ok", [searchParams]);

  useEffect(() => {
    if (pwOk) setInfo("Contraseña actualizada. Ya puedes iniciar sesión.");
  }, [pwOk]);

  const closePaywall = () => setPaywallOpen(false);

  const openPaywall = (reason: Exclude<PaywallReason, null>) => {
    setPaywallReason(reason);
    setPaywallOpen(true);
  };

  function normalizeEmailOrThrow(v: string) {
    const email = String(v ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) throw new Error("Introduce un email válido.");
    return email;
  }

  function buildUserForUI(post: any): User {
    // post = { user, customer, membership, entitlement }
    const authUser = post?.user ?? null;
    const customer = post?.customer ?? null;
    const membership = post?.membership ?? null;
    const entitlement = post?.entitlement ?? null;

    // Si falta customer.id, tu UI se rompe porque User.id es customerId.
    if (!customer?.id) {
      // En este caso, es inconsistencia (tu Edge debería devolver NO_CUSTOMER)
      throw new Error("Login incompleto: falta customer.id en postlogin");
    }

    const planCode = (entitlement?.plan_code ?? null) as any;
    const plan: PlanType = planCodeToPlanType(planCode);

    const role = String(membership?.role ?? "");
    const isAdmin = role === "OWNER" || role === "ADMIN";

    const email = String(authUser?.email ?? customer?.email ?? "").trim().toLowerCase();
    if (!email) throw new Error("Login incompleto: falta email");

    // ⚠️ En tu postlogin actual NO viene customers.name ni service_username.
    // Para no bloquear, ponemos placeholders razonables.
    // Cuando amplíes el postlogin, sustituyes esto por los campos reales.
    const fullName = String(customer?.name ?? email); // si algún día devuelves name, aquí lo aprovechas
    const username = String(customer?.service_username ?? email);

    const u: User = {
      id: String(customer.id),          // ✅ customerId
      customerId: String(customer.id),  // opcional (duplicado)
      username,
      fullName,
      email,
      plan,
      isAdmin,
      // Si más adelante postlogin devuelve start_date o monthlyFee, los rellenas aquí
      // planStartDate: post?.subscription?.start_date ?? undefined,
      // monthlyFee: post?.plan?.price_monthly ?? undefined,
    };

    return u;
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    try {
      const email = normalizeEmailOrThrow(emailInput);

      // 1) AUTH REAL: Supabase
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !data?.session) {
        throw new Error("Usuario o contraseña incorrectos");
      }

      const accessToken = data.session.access_token ?? "";
      localStorage.setItem("debacu_eval_auth_token", accessToken);

      // 2) Post-login AUTHZ (Edge Function): org/membership/plan/paywall
      const post = await evalPostLogin(accessToken);

      // compat: si no existe session_token interno, guardamos ""
      localStorage.setItem("debacu_eval_session_token", String((post as any)?.session_token ?? ""));

      // 3) Construir User para TU UI (customer-centric)
      const userForApp = buildUserForUI(post);

      // Extra: si tu guard decide por plan, aquí ya está.
      sessionStorage.removeItem("debacu_eval_is_admin");

      signIn(accessToken, userForApp);
      onLoginSuccess(userForApp);
    } catch (err: unknown) {
      console.error(err);

      if (err instanceof EvalApiError) {
        const code = err.error_obj?.code;
        const status = err.error_obj?.status;

        if (code === "SUBSCRIPTION_NOT_ACTIVE" && status === "EXPIRED") {
          openPaywall("EXPIRED");
          setError("Tu periodo de prueba ha finalizado. Para continuar, contrata un plan.");
          return;
        }

        if (code === "NO_SUBSCRIPTION") {
          openPaywall("NONE");
          setError("No tienes una suscripción activa. Elige un plan para continuar.");
          return;
        }

        // Si te llega NO_ORG_MEMBERSHIP, aquí NO deberías mandar a /solicitar-acceso desde Login.
        // Deja el error visible.
        setError(err.message || "Acceso denegado");
        return;
      }

      setError(err instanceof Error ? err.message : "Usuario o contraseña incorrectos");
    } finally {
      setLoading(false);
    }
  };

  // Recuperación contraseña vía Supabase (email-only)
  const handleForgotPassword = async () => {
    setError("");
    setInfo("");

    const raw = emailInput.trim();
    if (!raw) {
      setError("Introduce tu email para recuperar la contraseña.");
      return;
    }

    let email = "";
    try {
      email = normalizeEmailOrThrow(raw);
    } catch {
      setError("Introduce un email válido para recuperar la contraseña.");
      return;
    }

    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;

      const { error: e } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (e) throw e;

      // anti-enumeración
      setInfo("Si el email existe, recibirás un enlace para restablecer la contraseña en unos minutos.");
    } catch (e: any) {
      // anti-enumeración
      setInfo("Si el email existe, recibirás un enlace para restablecer la contraseña en unos minutos.");
      console.warn("resetPasswordForEmail failed:", e?.message ?? e);
    } finally {
      setLoading(false);
    }
  };

  const showPlansButton = paywallReason !== null;

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#06213f] via-[#0b3a6f] to-[#0e4f8a]" />
      <div className="absolute -top-40 -right-40 w-[520px] h-[520px] rounded-full bg-white/5 blur-3xl" />
      <div className="absolute -bottom-40 -left-40 w-[520px] h-[520px] rounded-full bg-black/10 blur-3xl" />

      <div className="relative z-10 w-full max-w-md p-8 bg-white rounded-2xl shadow-2xl border border-slate-200">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
            <Lock className="h-7 w-7" />
          </div>

          <h1 className="text-2xl font-bold text-slate-900">DebacuEvaluation360</h1>

          <p className="mt-2 text-sm text-slate-600">
            Plataforma profesional de evaluación y control operativo
          </p>

          <p className="mt-3 text-xs text-slate-400">
            Acceso restringido · Uso profesional · No es una plataforma pública
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {info && (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {info}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="tuemail@dominio.com"
                autoComplete="username"
              />
            </div>

            <div className="mt-2 flex items-center justify-end">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={loading}
                className="text-xs font-semibold text-indigo-700 hover:text-indigo-800 disabled:opacity-50"
                title="Envía un enlace de recuperación al email indicado"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-5 w-5 animate-spin" />}
            Acceder
          </button>

          {showPlansButton && (
            <button
              type="button"
              onClick={() => setPaywallOpen(true)}
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Ver planes
            </button>
          )}
        </form>
      </div>

      {/* Paywall Modal (JWT-only) */}
      {paywallOpen && (
        <PaywallPlansModal open={paywallOpen} onClose={closePaywall} reason={paywallReason} />
      )}
    </div>
  );
};
