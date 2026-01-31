// src/routes/RequireAdmin.tsx
import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useEvalAuth } from "@/context/EvalAuthContext";
import { admin_whoami } from "@/services/adminService";

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useEvalAuth();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const cacheKey = "debacu_eval_is_admin";
        const cached = sessionStorage.getItem(cacheKey);
        if (cached === "true") {
          if (!cancelled) {
            setIsAdmin(true);
            setChecking(false);
          }
          return;
        }
        if (cached === "false") {
          if (!cancelled) {
            setIsAdmin(false);
            setChecking(false);
          }
          return;
        }

        const me = await admin_whoami();
        const ok = !!me?.is_admin;

        sessionStorage.setItem(cacheKey, ok ? "true" : "false");

        if (!cancelled) {
          setIsAdmin(ok);
          setChecking(false);
        }
      } catch {
        sessionStorage.setItem("debacu_eval_is_admin", "false");
        if (!cancelled) {
          setIsAdmin(false);
          setChecking(false);
        }
      }
    }

    if (!loading && user) void run();
    if (!loading && !user) setChecking(false);

    return () => {
      cancelled = true;
    };
  }, [loading, user]);

  if (loading || checking) return null;
  if (!user) return <Navigate to="/login" replace />;

  if (!isAdmin) return <Navigate to="/solicitar-acceso" replace />;

  return <>{children}</>;
}
