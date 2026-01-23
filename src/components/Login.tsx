// src/pages/Login.tsx  (o donde lo tengas)
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
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // 0) Login "negocio" (customers/subscriptions) + crea session_token (debacu_eval_sessions)
      const { authEmail, session_token, user } = await evalLogin(username, password);

      // Guardar SIEMPRE el session_token de negocio (Edge Functions)
      localStorage.setItem("debacu_eval_session_token", String(session_token || ""));

      // 1) Login Supabase Auth (para tener session/access_token y RLS en el cliente)
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password,
      });

      if (authError || !data?.session) {
        // Si falla Auth, borra session_token para evitar estado raro
        localStorage.removeItem("debacu_eval_session_token");
        throw new Error("Usuario o contraseña incorrectos");
      }

      // Guardar auth token (opcional, pero útil si lo usas en algún sitio)
      const auth_token = data.session.access_token ?? "";
      localStorage.setItem("debacu_eval_auth_token", auth_token);

      // Admin flag (regla local, sin tocar Edge)
      const email = String((user as any)?.email ?? authEmail ?? "").toLowerCase().trim();
      const id = String((user as any)?.id ?? "").toUpperCase().trim();
      const uname = String((user as any)?.username ?? username ?? "").toLowerCase().trim();

      const isAdmin =
        email === "admin@debacu.com" ||
        id === "ADMIN_DEBACU" ||
        uname === "admin";

      const userWithAdmin: User = { ...(user as User), isAdmin };

      // Si tu context signIn solo acepta 1 token, pásale el auth_token
      signIn(auth_token, userWithAdmin);

      onLoginSuccess(userWithAdmin);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Usuario o contraseña incorrectos";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md border border-slate-200">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 mb-4">
            <Lock className="w-6 h-6" />
          </div>

          <h1 className="text-2xl font-bold text-slate-800">DebacuEvaluation360</h1>
          <p className="text-slate-500 mt-2">Plataforma de gestión y evaluación integral</p>

          <p className="text-xs text-slate-400 mt-3">
            Acceso restringido para uso profesional. No es una plataforma pública.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-100">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Usuario</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <UserIcon className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="usuario"
                autoComplete="username"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="password"
                placeholder="••••••••"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                autoComplete="current-password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center items-center py-2.5 px-4 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Acceder"}
          </button>
        </form>
      </div>
    </div>
  );
};
