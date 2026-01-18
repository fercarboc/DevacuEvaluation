import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { SolicitarAccesoPage } from "@/pages/public/SolicitarAccesoPage";
import { SolicitudEnviadaPage } from "./pages/public/SolicitudEnviadaPage";
import { PrimerAccesoPage } from "./pages/auth/PrimerAccesoPage";
import { AdminSolicitudesAccesoPage } from "./pages/admin/AdminSolicitudesAccesoPage";
import { RequireAuth } from "./components/auth/RequiereAuth";

import { RequireAdmin } from "./components/auth/RequireAdmin";


export function AppRoutes() {
  return (
    <Routes>
      {/* públicas */}
      <Route path="/solicitar-acceso" element={<SolicitarAccesoPage />} />
      <Route path="/solicitud-enviada" element={<SolicitudEnviadaPage />} />

      {/* auth */}
      <Route path="/primer-acceso" element={<PrimerAccesoPage />} />

      {/* admin */}
      <Route
        path="/admin/solicitudes-acceso"
        element={
          <RequireAuth>
            <RequireAdmin>
              <AdminSolicitudesAccesoPage />
            </RequireAdmin>
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/solicitar-acceso" replace />} />
    </Routes>
  );
}
