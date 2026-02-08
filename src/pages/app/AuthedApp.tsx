import React from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { SearchRatings } from "@/components/SearchRatings";
import { RatingForm } from "@/components/RatingForm";
 
import { MiCuenta } from "@/components/account/MiCuenta";
import AppShell, { type AuthedView, type NavItem } from "@/components/layout/AppShell";
import DashboardHome from "@/pages/DashboardHome";
import { useEvalAuth } from "@/context/EvalAuthContext";

// Auditoría
import SummaryViewAuditor from "@/views/SummaryViewAuditor";
import RiskAuditViewAuditor from "@/views/RiskAuditViewAuditor";
import StatsViewAuditor from "@/views/StatsViewAuditor";
import HistoryViewAuditor from "@/views/HistoryViewAuditor";
import ExportsViewAuditor from "@/views/ExportsViewAuditor";
import ConfigViewAuditor from "@/views/ConfigViewAuditor";

import {
  LayoutDashboard,
  Search,
  PlusCircle,
  ClipboardList,
  ShieldAlert,
  BarChart3,
  History,
  Download,
  Settings,
} from "lucide-react";

import { PlanType } from "@/types/types";
import { PlanTier } from "../../../auditor";

/* ---------------- utils ---------------- */

function toPlanTier(planLike: any): PlanTier {
  const s = String(planLike ?? "").toUpperCase();
  if (s === "FREE") return PlanTier.FREE;
  if (s === "BASIC") return PlanTier.BASIC;
  if (s === "MEDIUM") return PlanTier.MEDIUM;
  if (s === "PREMIUM") return PlanTier.PREMIUM;

  switch (planLike as PlanType) {
    case PlanType.INACTIVE:
      return PlanTier.FREE;
    case PlanType.BASIC:
      return PlanTier.BASIC;
    case PlanType.PROFESSIONAL:
      return PlanTier.MEDIUM;
    case PlanType.ENTERPRISE:
      return PlanTier.PREMIUM;
    default:
      return PlanTier.BASIC;
  }
}

/* ---------------- component ---------------- */

export default function AuthedApp() {
  const { user, loading, signOut } = useEvalAuth();
  const navigate = useNavigate();

  // ✅ OJO: ahora account es la vista de “Mi cuenta”
  const [currentView, setCurrentView] = React.useState<AuthedView>("dashboard");

  const handleLogout = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  /* ---------- admin shortcut ---------- */
  const isAdmin =
    !!(user as any).isAdmin ||
    String((user as any).email ?? "").toLowerCase() === "admin@debacu.com" ||
    String((user as any).username ?? "").toLowerCase() === "admin";

  React.useEffect(() => {
    if (isAdmin) navigate("/app/admin/solicitudes-acceso", { replace: true });
  }, [isAdmin, navigate]);

  if (isAdmin) return null;

  /* ---------- plan ---------- */
  const planLike =
    (user as any).currentPlan ??
    (user as any).plan ??
    (user as any).planType ??
    PlanType.BASIC;

  const currentPlan = toPlanTier(planLike);

  /* ---------- navegación ---------- */
  const navItems: NavItem[] = React.useMemo(
    () => [
      { view: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { view: "search", label: "Consultar", icon: Search },
      { view: "add", label: "Registrar incidencia", icon: PlusCircle },

      { view: "aud_summary", label: "Resumen", icon: ClipboardList },
      { view: "aud_risk", label: "Auditoría de riesgo", icon: ShieldAlert },
      { view: "aud_stats", label: "Estadísticas operativas", icon: BarChart3 },
      { view: "aud_history", label: "Histórico de consultas", icon: History },
      { view: "aud_exports", label: "Exportaciones", icon: Download },
      { view: "aud_config", label: "Configuración / Avisos", icon: Settings },
    ],
    []
  );

  const title = React.useMemo(() => {
    switch (currentView) {
      case "dashboard":
        return "Dashboard";
      case "search":
        return "Consultar";
      case "add":
        return "Registrar incidencia";
      case "account":
        return "Mi cuenta";

      case "aud_summary":
        return "Resumen";
      case "aud_risk":
        return "Auditoría de riesgo";
      case "aud_stats":
        return "Estadísticas operativas";
      case "aud_history":
        return "Histórico de consultas";
      case "aud_exports":
        return "Exportaciones";
      case "aud_config":
        return "Configuración / Avisos";

      default:
        return "Dashboard";
    }
  }, [currentView]);

  const subtitle = React.useMemo(() => {
    switch (currentView) {
      case "account":
        return "Planes, perfil del hotel, catálogo, seguridad y datos bancarios.";
      case "search":
        return "Consulta por documento, email, teléfono o nombre.";
      case "add":
        return "Registro estructurado de incidencias.";
      default:
        return "";
    }
  }, [currentView]);

  /* ---------------- render ---------------- */

  return (
    <AppShell
      userEmail={(user as any).email}
      userName={(user as any).fullName}
      activeView={currentView}
      onNavigate={setCurrentView}   // 🔑 AQUÍ YA FUNCIONA
      onLogout={handleLogout}
      title={title}
      subtitle={subtitle}
      navItems={navItems}
    >
      {/* Operativa */}
      {currentView === "dashboard" && <DashboardHome />}
      {currentView === "search" && <SearchRatings currentUser={user as any} />}
      {currentView === "add" && (
        <RatingForm
          currentCustomerId={(user as any).id}
          currentCustomerName={(user as any).fullName}
        />
      )}

      {/* ✅ MI CUENTA (CONTENEDOR LIMPIO) */}
      {currentView === "account" && <MiCuenta user={user as any} />}

      {/* Auditoría */}
      {currentView === "aud_summary" && <SummaryViewAuditor currentPlan={currentPlan} />}
      {currentView === "aud_risk" && <RiskAuditViewAuditor currentPlan={currentPlan} />}
      {currentView === "aud_stats" && <StatsViewAuditor currentPlan={currentPlan} />}
      {currentView === "aud_history" && <HistoryViewAuditor currentPlan={currentPlan} />}
      {currentView === "aud_exports" && <ExportsViewAuditor currentPlan={currentPlan} />}
      {currentView === "aud_config" && <ConfigViewAuditor currentPlan={currentPlan} />}
    </AppShell>
  );
}
