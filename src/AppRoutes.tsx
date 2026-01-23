import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import PublicLanding from "@/pages/public/PublicLanding";
import { SolicitarAccesoPage } from "@/pages/public/SolicitarAccesoPage";
import { SolicitudEnviadaPage } from "@/pages/public/SolicitudEnviadaPage";

import LoginPage from "@/pages/auth/LoginPage";
import AuthedApp from "@/pages/app/AuthedApp";
import AdminLayout from "@/pages/admin/AdminLayout";

import { RequireAuth } from "@/components/auth/RequiereAuth";
import { RequireAdmin } from "@/components/auth/RequireAdmin";

/**
 * IMPORTANTE:
 * - /app ahora SIEMPRE pasa por RequireAuth
 * - /app/admin/... se protege adicionalmente con RequireAdmin
 */
export function AppRoutes() {
  return (
    <Routes>
      {/* landing */}
      <Route path="/" element={<PublicLanding />} />

      {/* públicas */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/solicitar-acceso" element={<SolicitarAccesoPage />} />
      <Route path="/solicitud-enviada" element={<SolicitudEnviadaPage />} />

      {/* app (protegida) */}
      <Route
        path="/app/*"
        element={
          <RequireAuth>
            <AuthedApp />
          </RequireAuth>
        }
      />

      {/* admin (subruta protegida) */}
      <Route
        path="/app/admin/solicitudes-acceso"
        element={
          <RequireAuth>
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          </RequireAuth>
        }
      />

      {/* fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
