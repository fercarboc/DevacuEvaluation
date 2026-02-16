import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useEvalAuth } from "@/context/EvalAuthContext";
import { admin_whoami } from "@/services/adminService";

interface RequireAdminProps {
  children: React.ReactNode;
  redirectNonAdminTo?: string;
}

export function RequireAdmin({
  children,
  redirectNonAdminTo = "/app",
}: RequireAdminProps) {
  const { user, loading } = useEvalAuth();
  const location = useLocation();

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // Si no hay usuario autenticado
        if (!user) {
          if (!cancelled) {
            setIsAdmin(false);
            setChecking(false);
          }
          return;
        }

        // ✅ cache POR USUARIO (evita heredar admin entre cuentas)
        const cacheKey = `debacu_eval_is_admin:${user.id}`;
        const cached = sessionStorage.getItem(cacheKey);

        // Cache positivo
        if (cached === "true") {
          if (!cancelled) {
            setIsAdmin(true);
            setChecking(false);
          }
          return;
        }

        // Cache negativo
        if (cached === "false") {
          if (!cancelled) {
            setIsAdmin(false);
            setChecking(false);
          }
          return;
        }

        // Llamada real a backend
        const me = await admin_whoami();
        const ok = !!me?.is_admin;

        sessionStorage.setItem(cacheKey, ok ? "true" : "false");

        if (!cancelled) {
          setIsAdmin(ok);
          setChecking(false);
        }
      } catch {
        if (user) {
          sessionStorage.setItem(`debacu_eval_is_admin:${user.id}`, "false");
        }

        if (!cancelled) {
          setIsAdmin(false);
          setChecking(false);
        }
      }
    }

    if (!loading) {
      void run();
    }

    return () => {
      cancelled = true;
    };
  }, [loading, user?.id]);

  // Mientras carga auth o check admin
  if (loading || checking) return null;

  // No autenticado
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Autenticado pero no admin
  if (!isAdmin) {
    return <Navigate to={redirectNonAdminTo} replace />;
  }

  // Admin autorizado
  return <>{children}</>;
}
