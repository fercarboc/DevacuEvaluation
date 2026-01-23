import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useEvalAuth } from "@/context/EvalAuthContext";

export function RequireAuth({
  children,
  redirectTo = "/login",
}: {
  children: React.ReactNode;
  redirectTo?: string;
}) {
  const { user, loading } = useEvalAuth();
  const location = useLocation();

  if (loading) return null;

  if (!user) {
    return <Navigate to={redirectTo} replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
