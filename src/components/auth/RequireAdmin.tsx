import React from "react";
import { Navigate } from "react-router-dom";
import { useEvalAuth } from "@/context/EvalAuthContext";

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useEvalAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  const isAdmin =
    !!user.isAdmin ||
    String(user.email ?? "").toLowerCase() === "admin@debacu.com" ||
    String(user.id ?? "").toUpperCase() === "ADMIN_DEBACU" ||
    String(user.username ?? "").toLowerCase() === "admin";

  if (!isAdmin) return <Navigate to="/solicitar-acceso" replace />;

  return <>{children}</>;
}
