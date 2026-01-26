import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import PublicLanding from "@/pages/public/PublicLanding";
 
import { SolicitudEnviadaPage } from "@/pages/public/SolicitudEnviadaPage";
import SolicitarAccesoPage from "@/pages/public/SolicitarAccesoPage";

import LoginPage from "@/pages/auth/LoginPage";
import AuthedApp from "@/pages/app/AuthedApp";
import AdminLayout from "@/pages/admin/AdminLayout";
import AdminDashboardPage from "@/pages/admin/AdminDashboardPage";
import AdminClientsPage from "@/pages/admin/AdminClientsPage";
import AdminPlansPage from "@/pages/admin/AdminPlansPage";
import AdminBillingPage from "@/pages/admin/AdminBillingPage";
import AdminAbusePage from "@/pages/admin/AdminAbusePage";
import AdminStatsPage from "@/pages/admin/AdminStatsPage";
import AdminAuditPage from "@/pages/admin/AdminAuditPage";
import AdminExportsPage from "@/pages/admin/AdminExportsPage";

import AdminSettingsPage from "@/pages/admin/AdminSettingsPage";
import { AdminSolicitudesAccesoPage } from "@/pages/admin/AdminSolicitudesAccesoPage";
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
        path="/app/admin/*"
        element={
          <RequireAuth>
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          </RequireAuth>
        }
      >
        <Route path="dashboard" element={<AdminDashboardPage />} />
        <Route path="solicitudes-acceso" element={<AdminSolicitudesAccesoPage />} />
        <Route path="clientes" element={<AdminClientsPage />} />
        <Route path="planes" element={<AdminPlansPage />} />
        <Route path="facturacion" element={<AdminBillingPage />} />
        <Route path="abusos" element={<AdminAbusePage />} />
        <Route path="estadisticas" element={<AdminStatsPage />} />
        <Route path="auditoria" element={<AdminAuditPage />} />
        <Route path="exportaciones" element={<AdminExportsPage />} />

        <Route path="configuracion" element={<AdminSettingsPage />} />
        <Route path="*" element={<Navigate to="/app/admin/dashboard" replace />} />
      </Route>

      {/* fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
