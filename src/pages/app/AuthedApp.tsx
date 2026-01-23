import React from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { SearchRatings } from "@/components/SearchRatings";
import { RatingForm } from "@/components/RatingForm";
import { SubscriptionManager2 as SubscriptionManager } from "@/components/SubscriptionManager2";
import AppShell, { type AuthedView } from "@/components/layout/AppShell";
import DashboardHome from "@/pages/DashboardHome";
import { useEvalAuth } from "@/context/EvalAuthContext";

export default function AuthedApp() {
  const { user, loading, signOut, updateUser } = useEvalAuth();
  const navigate = useNavigate();
  const [currentView, setCurrentView] = React.useState<AuthedView>("dashboard");

  const handleLogout = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  // ✅ regla admin SIN Edge (coherente con Login)
  const isAdmin =
    !!user.isAdmin ||
    String(user.email ?? "").toLowerCase() === "admin@debacu.com" ||
    String(user.id ?? "").toUpperCase() === "ADMIN_DEBACU" ||
    String(user.username ?? "").toLowerCase() === "admin";

  // ✅ si es admin => fuera del dashboard normal
  React.useEffect(() => {
    if (isAdmin) navigate("/app/admin/solicitudes-acceso", { replace: true });
  }, [isAdmin, navigate]);

  if (isAdmin) return null; // deja que el router pinte la ruta admin

  const title =
    currentView === "dashboard"
      ? "Dashboard"
      : currentView === "search"
      ? "Consultar"
      : currentView === "add"
      ? "Registrar incidencia"
      : "Mi cuenta & plan";

  const subtitle =
    currentView === "dashboard"
      ? "Resumen operativo y actividad reciente."
      : currentView === "search"
      ? "Consulta por documento, email, teléfono o nombre."
      : currentView === "add"
      ? "Registro estructurado. Campos controlados y trazables."
      : "Gestión de plan, facturación y preferencias.";

  return (
    <AppShell
      userEmail={user.email}
      userName={user.fullName}
      activeView={currentView}
      onNavigate={setCurrentView}
      onLogout={handleLogout}
      title={title}
      subtitle={subtitle}
    >
      {currentView === "dashboard" && <DashboardHome />}

      {currentView === "search" && <SearchRatings currentUser={user} />}

      {currentView === "add" && (
        <RatingForm currentCustomerId={user.id} currentCustomerName={user.fullName} />
      )}

      {currentView === "subscription" && (
        <SubscriptionManager user={user} onUserUpdate={updateUser} />
      )}
    </AppShell>
  );
}
