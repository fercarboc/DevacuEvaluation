import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import PublicLanding from "@/pages/public/PublicLanding";

import { SolicitudEnviadaPage } from "@/pages/public/SolicitudEnviadaPage";
import SolicitarAccesoPage from "@/pages/public/SolicitarAccesoPage";

import LoginPage from "@/pages/auth/LoginPage";
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage";
import ActivateAccountPage from "@/pages/auth/ActivateAccountPage"; // 👈 NUEVO

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
          LANDING
      ========================================================== */}
      <Route path="/" element={<PublicLanding />} />

      {/* =========================================================
          PÚBLICAS AUTH
      ========================================================== */}
      <Route path="/login" element={<LoginPage />} />

      {/* 🔹 NUEVA RUTA ESTÁNDAR RESET */}
      <Route path="/auth/reset" element={<ResetPasswordPage />} />

      {/* 🔹 NUEVA RUTA PARA INVITE (ACTIVATE) */}
      <Route path="/auth/activate" element={<ActivateAccountPage />} />

      {/* 🔹 Alias legacy por compatibilidad */}
      <Route path="/reset-password" element={<Navigate to="/auth/reset" replace />} />

      <Route path="/solicitar-acceso" element={<SolicitarAccesoPage />} />
      <Route path="/solicitud-enviada" element={<SolicitudEnviadaPage />} />

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
