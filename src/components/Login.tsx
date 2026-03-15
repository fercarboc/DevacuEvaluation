// src/pages/Login.tsx
import React, { useEffect, useMemo, useState } from "react";
import { EvalApiError, evalPostLogin } from "@/services/evalApi";
import type { User } from "@/types/types";
import { planCodeToPlanType, PlanType } from "@/types/types";
import {
  ArrowLeft,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  TrendingUp,
  Zap,
  LayoutDashboard,
  Loader2,
} from "lucide-react";
import { supabase } from "@/services/supabaseClient";
import { useEvalAuth } from "@/context/EvalAuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";

import PaywallPlansModal from "./PaywallPlansModal";
import { setEvalOrgId } from "@/services/callEvalFn";

export interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

type PaywallReason = "EXPIRED" | "NONE" | null;

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const { signIn } = useEvalAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [emailInput, setEmailInput] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [error, setError] = useState("");
  const [info, setInfo] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallReason, setPaywallReason] = useState<PaywallReason>(null);

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
    if (!email || !email.includes("@")) {
      throw new Error("Introduce un email válido.");
    }
    return email;
  }

  function buildUserForUI(post: any): User {
    const authUser = post?.user ?? null;
    const customer = post?.customer ?? null;
    const membership = post?.membership ?? null;
    const entitlement = post?.entitlement ?? null;

    if (!customer?.id) {
      throw new Error("Login incompleto: falta customer.id en postlogin");
    }

    const planCode = (entitlement?.plan_code ?? null) as any;
    const plan: PlanType = planCodeToPlanType(planCode);

    const role = String(membership?.role ?? "");
    const isAdmin = role === "OWNER" || role === "ADMIN";
    const isPlatformAdmin = role === "PLATFORM_ADMIN";

    const email = String(authUser?.email ?? customer?.email ?? "")
      .trim()
      .toLowerCase();

    if (!email) {
      throw new Error("Login incompleto: falta email");
    }

    const fullName = String(customer?.name ?? email);
    const username = String(customer?.service_username ?? email);

    const u: User = {
      id: String(customer.id),
      customerId: String(customer.id),
      username,
      fullName,
      email,
      plan,
      isAdmin,
      isPlatformAdmin,
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

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !data?.session) {
        throw new Error("Usuario o contraseña incorrectos");
      }

      const accessToken = data.session.access_token ?? "";

      const post = await evalPostLogin(accessToken);

      const orgId =
        (post as any)?.data?.membership?.org_id ??
        (post as any)?.membership?.org_id ??
        (post as any)?.data?.org_id ??
        (post as any)?.org_id ??
        "";

      if (typeof orgId === "string" && orgId.trim()) {
        setEvalOrgId(orgId.trim());
      }

      localStorage.setItem(
        "debacu_eval_session_token",
        String((post as any)?.session_token ?? "")
      );

      const userForApp = buildUserForUI(post);

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

        setError(err.message || "Acceso denegado");
        return;
      }

      setError(err instanceof Error ? err.message : "Usuario o contraseña incorrectos");
    } finally {
      setLoading(false);
    }
  };

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

      const { error: e } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (e) throw e;

      setInfo(
        "Si el email existe, recibirás un enlace para restablecer la contraseña en unos minutos."
      );
    } catch (e: any) {
      setInfo(
        "Si el email existe, recibirás un enlace para restablecer la contraseña en unos minutos."
      );
      console.warn("resetPasswordForEmail failed:", e?.message ?? e);
    } finally {
      setLoading(false);
    }
  };

  const showPlansButton = paywallReason !== null;

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col lg:flex-row">
      {/* Left Side: Login Form */}
      <div className="flex-1 flex flex-col justify-center px-6 py-16 lg:px-24">
        <div className="max-w-md w-full mx-auto">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors mb-10 group"
          >
            <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
            Volver
          </button>

          <div className="mb-10">
            <h1 className="text-4xl font-display font-bold text-white mb-4">
              Acceso a Debacu
            </h1>
            <p className="text-slate-400">
              Inicia sesión para acceder a tu entorno de análisis e inteligencia operativa.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {info && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                {info}
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Mail size={18} />
                </div>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  required
                  autoComplete="username"
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-3 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 transition-colors"
                  placeholder="tu@email.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center gap-4">
                <label className="text-xs font-bold text-slate-500 uppercase">
                  Contraseña
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={loading}
                  className="text-xs text-blue-500 hover:underline disabled:opacity-50"
                >
                  ¿Has olvidado tu contraseña?
                </button>
              </div>

              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Lock size={18} />
                </div>

                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-10 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 transition-colors"
                  placeholder="••••••••"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

          

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-4 text-base flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-5 w-5 animate-spin" />}
              Iniciar sesión
            </button>

            {showPlansButton && (
              <button
                type="button"
                onClick={() => setPaywallOpen(true)}
                className="w-full rounded-lg border border-white/10 bg-white/5 py-3 text-sm font-semibold text-slate-200 hover:bg-white/10 transition-colors"
              >
                Ver planes
              </button>
            )}
          </form>

          <div className="mt-10 text-center">
            <p className="text-sm text-slate-500">
              ¿Todavía no tienes acceso?{" "}
              <button
                type="button"
                onClick={() => navigate("/solicitar-acceso")}
                className="text-blue-500 font-bold hover:underline"
              >
                Solicitar acceso
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Right Side: Visual Content */}
      <div className="hidden lg:flex flex-1 bg-blue-600/5 border-l border-white/[0.05] relative overflow-hidden items-center justify-center p-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-600/10 via-transparent to-transparent" />

        <div className="max-w-md w-full relative z-10">
          <div className="mb-12">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-600/40 mb-8">
              <div className="w-8 h-8 bg-white rounded-md" />
            </div>

            <h2 className="text-4xl font-display font-bold text-white mb-6 leading-tight">
              Inteligencia operativa para hospitality
            </h2>

            <p className="text-slate-400 text-lg leading-relaxed">
              La plataforma líder en análisis de riesgo, revenue intelligence y toma de decisiones basada en datos para el sector hotelero.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: <ShieldCheck size={20} />, label: "Análisis de riesgo" },
              { icon: <TrendingUp size={20} />, label: "Revenue intelligence" },
              { icon: <Zap size={20} />, label: "Alertas operativas" },
              { icon: <LayoutDashboard size={20} />, label: "Decisiones con datos" },
            ].map((item, i) => (
              <div
                key={i}
                className="p-4 bg-white/[0.03] border border-white/[0.05] rounded-xl flex flex-col gap-3"
              >
                <div className="text-blue-500">{item.icon}</div>
                <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">
                  {item.label}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-12 glass-card p-6 border-white/[0.05] bg-slate-950/50">
            <div className="flex items-center justify-between mb-6">
              <div className="h-2 w-24 bg-white/10 rounded-full" />
              <div className="h-2 w-12 bg-blue-500/40 rounded-full" />
            </div>

            <div className="space-y-3">
              <div className="h-1.5 w-full bg-white/5 rounded-full" />
              <div className="h-1.5 w-4/5 bg-white/5 rounded-full" />
              <div className="h-1.5 w-2/3 bg-white/5 rounded-full" />
            </div>

            <div className="mt-6 flex gap-2 items-end h-16">
              {[40, 70, 45, 90, 65, 80].map((h, i) => (
                <div
                  key={i}
                  style={{ height: `${h}%` }}
                  className="flex-1 bg-blue-600/20 rounded-t-sm"
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {paywallOpen && (
        <PaywallPlansModal
          open={paywallOpen}
          onClose={closePaywall}
          reason={paywallReason}
        />
      )}
    </div>
  );
};