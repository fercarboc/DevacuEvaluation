import React, { useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import AppShell, { type AuthedView, type NavItem } from "@/components/layout/AppShell";
import { useEvalAuth } from "@/context/EvalAuthContext";
import { AdminSolicitudesAccesoPage } from "./AdminSolicitudesAccesoPage";

export default function AdminLayout() {
  const { user, loading, signOut } = useEvalAuth();
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<AuthedView>("admin");

  const navItems: NavItem[] = useMemo(
    () => [{ view: "admin", label: "Solicitudes de acceso", icon: ClipboardList }],
    []
  );

  const handleLogout = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <AppShell
      userEmail={user.email}
      userName={user.fullName}
      activeView={activeView}
      onNavigate={setActiveView}
      onLogout={handleLogout}
      title="Panel de administración"
      subtitle="Solicitudes de acceso"
      navItems={navItems}
      showAccountActions={false}
    >
      <AdminSolicitudesAccesoPage />
    </AppShell>
  );
}
