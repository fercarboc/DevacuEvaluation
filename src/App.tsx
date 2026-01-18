import React, { useState } from "react";
import type { User } from "@/types/types";

import { Login } from "@/components/Login";
import { SearchRatings } from "@/components/SearchRatings";
import { RatingForm } from "@/components/RatingForm";
import { SubscriptionManager } from "@/components/SubscriptionManager";
import PublicLanding from "@/pages/public/PublicLanding";

import AppShell, { type AuthedView } from "@/components/layout/AppShell";
import DashboardHome from "@/pages/DashboardHome";

type PublicView = "landing" | "login";

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem("debacu_eval_user");
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(() => readStoredUser());
  const [currentView, setCurrentView] = useState<AuthedView>("dashboard");
  const [publicView, setPublicView] = useState<PublicView>("landing");

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
    setCurrentView("dashboard");
  };

  const handleLogout = async () => {
    localStorage.removeItem("debacu_eval_token");
    localStorage.removeItem("debacu_eval_user");
    setUser(null);
    setPublicView("landing");
  };

  // ---- PUBLIC ----
  if (!user) {
    if (publicView === "landing") {
      return <PublicLanding onGoLogin={() => setPublicView("login")} />;
    }
    return <Login onLoginSuccess={handleLogin} />;
  }

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
        <RatingForm
          currentCustomerId={user.id}
          currentCustomerName={user.fullName}
        />
      )}

      {currentView === "subscription" && (
        <SubscriptionManager user={user} onUserUpdate={setUser} />
      )}
    </AppShell>
  );
}
