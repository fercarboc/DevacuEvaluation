import React from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { SearchRatings } from "@/components/SearchRatings";
import { RatingForm } from "@/components/RatingForm";
import { SubscriptionManager2 as SubscriptionManager } from "@/components/SubscriptionManager2";
import AppShell, { type AuthedView, type NavItem } from "@/components/layout/AppShell";
import DashboardHome from "@/pages/DashboardHome";
import { useEvalAuth } from "@/context/EvalAuthContext";

// ✅ Vistas auditoría (ya existen en src/views)
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

// ✅ Importa PlanTier desde tu auditor.ts
import { PlanTier } from "../../../auditor";
// Si no tienes alias @ configurado, usa esto:
// import { PlanTier } from "./auditor";

function toPlanTier(planLike: any): PlanTier {
  // Si ya viene como PlanTier (FREE/BASIC/MEDIUM/PREMIUM), lo devolvemos
  if (
    planLike === PlanTier.FREE ||
    planLike === PlanTier.BASIC ||
    planLike === PlanTier.MEDIUM ||
    planLike === PlanTier.PREMIUM
  ) {
    return planLike;
  }

  // Si viene como string (por ejemplo "PREMIUM")
  const s = String(planLike ?? "").toUpperCase();
  if (s === "FREE") return PlanTier.FREE;
  if (s === "BASIC") return PlanTier.BASIC;
  if (s === "MEDIUM") return PlanTier.MEDIUM;
  if (s === "PREMIUM") return PlanTier.PREMIUM;

  // Si viene como PlanType (INACTIVE/BASIC/PROFESSIONAL/ENTERPRISE)
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
      // fallback razonable
      return PlanTier.BASIC;
  }
}

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
    !!(user as any).isAdmin ||
    String((user as any).email ?? "").toLowerCase() === "admin@debacu.com" ||
    String((user as any).id ?? "").toUpperCase() === "ADMIN_DEBACU" ||
    String((user as any).username ?? "").toLowerCase() === "admin";

  React.useEffect(() => {
    if (isAdmin) navigate("/app/admin/solicitudes-acceso", { replace: true });
  }, [isAdmin, navigate]);

  if (isAdmin) return null;

  /**
   * ✅ AQUÍ ESTÁ EL FIX:
   * Convertimos el plan del user a PlanTier (lo que esperan las views).
   *
   * Ajusta el orden de campos cuando confirmes cuál es el bueno en tu user:
   * - currentPlan / plan / planType / subscriptionPlan etc.
   */
  const planLike =
    (user as any).currentPlan ??
    (user as any).plan ??
    (user as any).planType ??
    (user as any).subscriptionPlan ??
    PlanType.BASIC;

  const currentPlan: PlanTier = toPlanTier(planLike);

  /**
   * ✅ Menú único: Operativa + Auditoría al mismo nivel
   * (más adelante podrás poner disabled según plan)
   */
  const navItems: NavItem[] = React.useMemo(
    () => [
      { view: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { view: "search", label: "Consultar", icon: Search },
      { view: "add", label: "Registrar incidencia", icon: PlusCircle },

      // --- Auditoría (mismo nivel) ---
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
      case "subscription":
        return "Mi cuenta & plan";

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
      case "dashboard":
        return "Resumen operativo y actividad reciente.";
      case "search":
        return "Consulta por documento, email, teléfono o nombre.";
      case "add":
        return "Registro estructurado. Campos controlados y trazables.";
      case "subscription":
        return "Gestión de plan, facturación y preferencias.";

      case "aud_summary":
        return "Indicadores clave y alertas del día.";
      case "aud_risk":
        return "Hallazgos, señales y análisis agregado (no identificable).";
      case "aud_stats":
        return "Métricas de uso, tendencias y límites.";
      case "aud_history":
        return "Registro completo de consultas realizadas por tu hotel.";
      case "aud_exports":
        return "Histórico y estado de exportaciones (PDF/CSV) y descargas.";
      case "aud_config":
        return "Umbrales, avisos y preferencias de auditoría.";

      default:
        return "";
    }
  }, [currentView]);

  return (
    <AppShell
      userEmail={(user as any).email}
      userName={(user as any).fullName}
      activeView={currentView}
      onNavigate={setCurrentView}
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

      {currentView === "subscription" && (
        <SubscriptionManager user={user as any} onUserUpdate={updateUser as any} />
      )}

      {/* Auditoría: páginas reales (todas con PlanTier) */}
      {currentView === "aud_summary" && <SummaryViewAuditor currentPlan={currentPlan} />}

      {currentView === "aud_risk" && <RiskAuditViewAuditor currentPlan={currentPlan} />}

      {currentView === "aud_stats" && <StatsViewAuditor currentPlan={currentPlan} />}

      {currentView === "aud_history" && <HistoryViewAuditor currentPlan={currentPlan} />}

      {currentView === "aud_exports" && <ExportsViewAuditor currentPlan={currentPlan} />}

      {currentView === "aud_config" && <ConfigViewAuditor currentPlan={currentPlan} />}
    </AppShell>
  );
}
