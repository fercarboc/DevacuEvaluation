// src/pages/Login.tsx
import React, { useState } from "react";
import { evalLogin } from "@/services/evalApi";
import type { User } from "@/types/types";
import { Lock, User as UserIcon, Loader2 } from "lucide-react";
import { supabase } from "@/services/supabaseClient";
import { useEvalAuth } from "@/context/EvalAuthContext";

export interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const { signIn } = useEvalAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { authEmail, session_token, user } = await evalLogin(username, password);

      localStorage.setItem(
        "debacu_eval_session_token",
        String(session_token || "")
      );

      const { data, error: authError } =
        await supabase.auth.signInWithPassword({
          email: authEmail,
          password,
        });

      if (authError || !data?.session) {
        localStorage.removeItem("debacu_eval_session_token");
        throw new Error("Usuario o contraseña incorrectos");
      }

      const auth_token = data.session.access_token ?? "";
      localStorage.setItem("debacu_eval_auth_token", auth_token);

      const email = String((user as any)?.email ?? authEmail ?? "")
        .toLowerCase()
        .trim();
      const id = String((user as any)?.id ?? "").toUpperCase().trim();
      const uname = String((user as any)?.username ?? username ?? "")
        .toLowerCase()
        .trim();

      const isAdmin =
        email === "admin@debacu.com" ||
        id === "ADMIN_DEBACU" ||
        uname === "admin";

      const userWithAdmin: User = { ...(user as User), isAdmin };

      signIn(auth_token, userWithAdmin);
      onLoginSuccess(userWithAdmin);
    } catch (err: unknown) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Usuario o contraseña incorrectos"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Fondo azul corporativo */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#06213f] via-[#0b3a6f] to-[#0e4f8a]" />

      {/* Decoración sutil */}
      <div className="absolute -top-40 -right-40 w-[520px] h-[520px] rounded-full bg-white/5 blur-3xl" />
      <div className="absolute -bottom-40 -left-40 w-[520px] h-[520px] rounded-full bg-black/10 blur-3xl" />

      {/* Card Login */}
      <div className="relative z-10 w-full max-w-md p-8 bg-white rounded-2xl shadow-2xl border border-slate-200">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
            <Lock className="h-7 w-7" />
          </div>

          <h1 className="text-2xl font-bold text-slate-900">
            DebacuEvaluation360
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Plataforma profesional de evaluación y control operativo
          </p>

          <p className="mt-3 text-xs text-slate-400">
            Acceso restringido · Uso profesional · No es una plataforma pública
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Usuario
            </label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="usuario"
                autoComplete="username"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Contraseña
            </label>
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
        </form>
      </div>
    </div>
  );
};