import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import PublicLanding from "@/pages/public/PublicLanding";
import ProductPage from "@/pages/public/ProductPage";
import TechnologyPage from "@/pages/public/TechnologyPage";
import ArchitecturePage from "@/pages/public/ArchitecturePage";
import TechnicalDocsPage from "@/pages/public/TechnicalDocsPage";
import PlanesPage from "@/pages/public/PlanesPage";
import ContactoPage from "@/pages/public/ContactoPage";

import { SolicitudEnviadaPage } from "@/pages/public/SolicitudEnviadaPage";
import SolicitarAccesoPage from "@/pages/public/SolicitarAccesoPage";

import LoginPage from "@/pages/auth/LoginPage";
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage";
import ActivateAccountPage from "@/pages/auth/ActivateAccountPage";

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
import AdminChangesPage from "@/pages/admin/AdminChangesPage";
import AdminSettingsPage from "@/pages/admin/AdminSettingsPage";
import AdminChangesSaasPage from "@/pages/admin/AdminChangesSaasPage";

import { AdminSolicitudesAccesoPage } from "@/pages/admin/AdminSolicitudesAccesoPage";
import { RequireAuth } from "@/components/auth/RequiereAuth";
import { RequireAdmin } from "@/components/auth/RequireAdmin";

export function AppRoutes() {
  return (
    <Routes>
      {/* =========================================================
          WEB PÚBLICA
      ========================================================== */}
      <Route path="/" element={<PublicLanding />} />
      <Route path="/producto" element={<ProductPage />} />
      <Route path="/tecnologia" element={<TechnologyPage />} />
      <Route path="/arquitectura" element={<ArchitecturePage />} />
      <Route path="/documentacion" element={<TechnicalDocsPage />} />
      <Route path="/planes" element={<PlanesPage />} />
      <Route path="/contacto" element={<ContactoPage />} />

      {/* Alias por compatibilidad si quieres mantener enlaces antiguos/hash */}
      <Route path="/pricing" element={<Navigate to="/planes" replace />} />
      <Route path="/contact" element={<Navigate to="/contacto" replace />} />
      <Route path="/docs" element={<Navigate to="/documentacion" replace />} />
      <Route path="/technology" element={<Navigate to="/tecnologia" replace />} />
      <Route path="/architecture" element={<Navigate to="/arquitectura" replace />} />
      <Route path="/product" element={<Navigate to="/producto" replace />} />

      {/* =========================================================
          PÚBLICAS AUTH
      ========================================================== */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/solicitar-acceso" element={<SolicitarAccesoPage />} />
      <Route path="/solicitud-enviada" element={<SolicitudEnviadaPage />} />

      {/* Reset */}
      <Route path="/auth/reset" element={<ResetPasswordPage />} />
      <Route path="/reset-password" element={<Navigate to="/auth/reset" replace />} />

      {/* Activate / Invite */}
      <Route path="/auth/activate" element={<ActivateAccountPage />} />

      {/* =========================================================
          APP PROTEGIDA
      ========================================================== */}
      <Route
        path="/app/*"
        element={
          <RequireAuth>
            <AuthedApp />
          </RequireAuth>
        }
      />

      {/* =========================================================
          ADMIN PROTEGIDO
      ========================================================== */}
      <Route
        path="/app/admin/*"
        element={
          <RequireAuth>
            <RequireAdmin redirectNonAdminTo="/app">
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
        <Route path="cambios" element={<AdminChangesPage />} />
        <Route path="cambios-saas" element={<AdminChangesSaasPage />} />
        <Route path="configuracion" element={<AdminSettingsPage />} />
        <Route path="*" element={<Navigate to="/app/admin/dashboard" replace />} />
      </Route>

      {/* =========================================================
          FALLBACK GLOBAL
      ========================================================== */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}