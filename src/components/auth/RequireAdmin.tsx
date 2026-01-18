import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const ADMIN_EMAILS = (import.meta.env.VITE_DEBACU_EVAL_ADMIN_EMAILS ?? "")
  .split(",")
  .map((s: string) => s.trim().toLowerCase())
  .filter(Boolean);

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;

  const email = (user?.email ?? "").toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) return <Navigate to="/app" replace />;

  return <>{children}</>;
}
