// src/pages/app/AuthedApp.tsx
import React from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { SearchRatings } from "@/components/SearchRatings";
import { RatingForm } from "@/components/RatingForm";

import { MiCuenta } from "@/components/account/MiCuenta";
import AppShell, { type AuthedView, type NavItem } from "@/components/layout/AppShell";
import DashboardHome from "@/pages/DashboardHome";
import { useEvalAuth } from "@/context/EvalAuthContext";

// ✅ Revenue Intelligence
import ChannelAnalysis from "@/views/ChannelAnalysis";
import RiskAnalysis from "@/views/RiskAnalysis";
import Leaks from "@/views/Leaks";

// ✅ Demo/PAYWALL Revenue
import RevenueLockedDemo from "@/components/revenue/RevenueLockedDemo";

// ✅ Auditoría
import StatsViewAuditor from "@/views/StatsViewAuditor";
import HistoryViewAuditor from "@/views/HistoryViewAuditor";
import ExportsViewAuditor from "@/views/ExportsViewAuditor";

// ✅ Screening CSV
import ScreeningCsv from "@/pages/app/ScreeningCsv";

import {
  LayoutDashboard,
  Search,
  PlusCircle,
  BarChart3,
  ShieldAlert,
  TrendingDown,
  Activity,
  Clock,
  Download,
  CreditCard,
  FileUp,
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

function toPlanCode(plan: PlanTier): "FREE" | "BASIC" | "MEDIUM" | "PREMIUM" {
  switch (plan) {
    case PlanTier.FREE:
      return "FREE";
    case PlanTier.BASIC:
      return "BASIC";
    case PlanTier.MEDIUM:
      return "MEDIUM";
    case PlanTier.PREMIUM:
      return "PREMIUM";
    default:
      return "BASIC";
  }
}

function isRevenueView(v: AuthedView) {
  return v === "rev_channels" || v === "rev_risk" || v === "rev_leakage";
}

/* ---------------- component ---------------- */

export default function AuthedApp() {
  const { user, loading, signOut } = useEvalAuth();
  const navigate = useNavigate();

  // ✅ Vistas controladas por AppShell
  const [currentView, setCurrentView] = React.useState<AuthedView>("dashboard");

  const handleLogout = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  /* =========================================================
   * PLATFORM ADMIN vs HOTEL OWNER/STAFF (NO MEZCLAR)
   * ========================================================= */
  const email = String((user as any).email ?? "").toLowerCase();
  const isPlatformAdmin = email === "admin@debacu.com";
  if (isPlatformAdmin) return <Navigate to="/app/admin/solicitudes-acceso" replace />;

  /* ---------- plan ---------- */
  const planLike =
    (user as any).currentPlan ??
    (user as any).plan ??
    (user as any).planType ??
    PlanType.BASIC;

  const currentPlan = toPlanTier(planLike);
  const currentPlanCode = toPlanCode(currentPlan);
  const canAccessRevenue = currentPlan === PlanTier.MEDIUM || currentPlan === PlanTier.PREMIUM;

  /* ---------- navegación (ORDEN NUEVO) ---------- */
  const navItems: NavItem[] = React.useMemo(
    () => [
      // Operativa (orden pedido)
      { view: "dashboard", label: "Dashboard", icon: LayoutDashboard, section: "OPERATIVA" },

      // ✅ 2) Consulta automática (Screening CSV)
      { view: "aud_screening_csv", label: "Consulta automática (CSV)", icon: FileUp, section: "OPERATIVA" },

      // ✅ 3) Consulta manual
      { view: "search", label: "Consulta manual", icon: Search, section: "OPERATIVA" },

      // ✅ 4) Registrar incidencia manual
      { view: "add", label: "Registrar incidencia", icon: PlusCircle, section: "OPERATIVA" },

      // Revenue Intelligence
      { view: "rev_channels", label: "Análisis por Canal", icon: BarChart3, section: "REVENUE" },
      { view: "rev_risk", label: "Nivel de Riesgo", icon: ShieldAlert, section: "REVENUE" },
      { view: "rev_leakage", label: "Fugas de Revenue", icon: TrendingDown, section: "REVENUE" },

      // Auditoría
      { view: "aud_stats", label: "Estadísticas operativas", icon: Activity, section: "AUDITORIA" },
      { view: "aud_history", label: "Histórico", icon: Clock, section: "AUDITORIA" },
      { view: "aud_exports", label: "Exportaciones", icon: Download, section: "AUDITORIA" },

      // Cuenta
      { view: "account", label: "Mi cuenta", icon: CreditCard, section: "CUENTA" },
    ],
    []
  );

  const title = React.useMemo(() => {
    switch (currentView) {
      case "dashboard":
        return "Dashboard";

      case "aud_screening_csv":
        return "Consulta automática (CSV)";

      case "search":
        return "Consulta manual";

      case "add":
        return "Registrar incidencia";

      case "account":
        return "Mi cuenta";

      case "rev_channels":
        return "Análisis por Canal";
      case "rev_risk":
        return "Análisis por Nivel de Riesgo";
      case "rev_leakage":
        return "Fugas de Revenue";

      case "aud_stats":
        return "Estadísticas operativas";
      case "aud_history":
        return "Histórico";
      case "aud_exports":
        return "Exportaciones";

      default:
        return "Dashboard";
    }
  }, [currentView]);

  const subtitle = React.useMemo(() => {
    switch (currentView) {
      case "aud_screening_csv":
        return "Importa CSV, valida (dry-run) y ejecuta screening (persona + fecha).";

      case "search":
        return "Consulta por documento, email, teléfono o nombre.";

      case "add":
        return "Registro estructurado de incidencias.";

      case "account":
        return "Planes, perfil del hotel, catálogo, seguridad y datos bancarios.";

      case "rev_channels":
        return "Comparativa por canal/plataforma y su impacto económico (net loss).";
      case "rev_risk":
        return "Segmentación del impacto económico real (net loss) y volumen de incidencias por nivel.";
      case "rev_leakage":
        return "Ranking de fugas de margen: net loss y cuota sobre el total.";

      case "aud_stats":
        return "KPIs operativos y métricas agregadas.";
      case "aud_history":
        return "Trazabilidad y registro de acciones.";
      case "aud_exports":
        return "Exportación de informes y descargas.";

      default:
        return "Resumen ejecutivo del uso del plan y del impacto económico (mes actual).";
    }
  }, [currentView]);

  const handleNavigate = React.useCallback((view: AuthedView) => {
    setCurrentView(view);
  }, []);

  return (
    <AppShell
      userEmail={(user as any).email}
      userName={(user as any).fullName}
      activeView={currentView}
      onNavigate={handleNavigate}
      onLogout={handleLogout}
      title={title}
      subtitle={subtitle}
      navItems={navItems}
      currentPlanCode={currentPlanCode}
    >
      {/* Operativa */}
      {currentView === "dashboard" && (
        <DashboardHome
          onNavigate={(v) => {
            handleNavigate(v as any);
          }}
        />
      )}

      {/* ✅ 2) Consulta automática */}
      {currentView === "aud_screening_csv" && <ScreeningCsv />}

      {/* ✅ 3) Consulta manual */}
      {currentView === "search" && <SearchRatings currentUser={user as any} />}

      {/* ✅ 4) Registrar incidencia */}
      {currentView === "add" && (
        <RatingForm
          currentCustomerId={(user as any).id}
          currentCustomerName={(user as any).fullName}
        />
      )}

      {/* Mi cuenta */}
      {currentView === "account" && <MiCuenta user={user as any} />}

      {/* Revenue Intelligence (bloqueado por plan => DEMO) */}
      {isRevenueView(currentView) && !canAccessRevenue && (
        <RevenueLockedDemo currentPlan={currentPlan} onGoPlans={() => setCurrentView("account")} />
      )}

      {currentView === "rev_channels" && canAccessRevenue && <ChannelAnalysis />}
      {currentView === "rev_risk" && canAccessRevenue && <RiskAnalysis />}
      {currentView === "rev_leakage" && canAccessRevenue && <Leaks />}

      {/* Auditoría */}
      {currentView === "aud_stats" && <StatsViewAuditor currentPlan={currentPlan} />}
      {currentView === "aud_history" && <HistoryViewAuditor />}
      {currentView === "aud_exports" && <ExportsViewAuditor currentPlan={currentPlan} />}
    </AppShell>
  );
}