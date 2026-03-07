import React from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { SearchRatings } from "@/components/SearchRatings";
import { RatingForm } from "@/components/RatingForm";

import { MiCuenta } from "@/components/account/MiCuenta";
import AppShell, { type AuthedView, type NavItem } from "@/components/layout/AppShell";
import DashboardHome from "@/pages/DashboardHome";
import { useEvalAuth } from "@/context/EvalAuthContext";

// Revenue Intelligence
import ChannelAnalysis from "@/views/ChannelAnalysis";
import RiskAnalysis from "@/views/RiskAnalysis";
import Leaks from "@/views/Leaks";
import SettingsProperties from "@/modules/revenue-intelligence/pages/SettingsProperties";
import RoomTypesPage from "@/modules/revenue-intelligence/pages/RoomTypesPage";
import PriceCalendarPage from "@/modules/revenue-intelligence/pages/PriceCalendarPage";
import PropertySelector from "@/modules/revenue-intelligence/components/PropertySelector";
import {
  getProperties,
  type RevenueProperty,
} from "@/modules/revenue-intelligence/services/revenueProperties.service";

// Demo/PAYWALL Revenue
import RevenueLockedDemo from "@/components/revenue/RevenueLockedDemo";

// Auditoría
import StatsViewAuditor from "@/views/StatsViewAuditor";
import HistoryViewAuditor from "@/views/HistoryViewAuditor";
import ExportsViewAuditor from "@/views/ExportsViewAuditor";

// Screening CSV
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
  FileSpreadsheet,
  Building2,
  BedDouble,
  CalendarRange,
} from "lucide-react";

import { PlanType } from "@/types/types";
import { PlanTier } from "../../../auditor";

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
  return (
    v === "rev_channels" ||
    v === "rev_risk" ||
    v === "rev_leakage" ||
    v === "rev_properties" ||
    v === "rev_room_types" ||
    v === "rev_price_calendar"
  );
}

export default function AuthedApp() {
  const { user, loading, signOut } = useEvalAuth();
  const navigate = useNavigate();

  const [currentView, setCurrentView] = React.useState<AuthedView>("dashboard");

  const [revenueProperties, setRevenueProperties] = React.useState<RevenueProperty[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = React.useState<string | null>(null);
  const [propertiesLoading, setPropertiesLoading] = React.useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  const email = String((user as any).email ?? "").toLowerCase();
  const isPlatformAdmin = email === "admin@debacu.com";

  if (isPlatformAdmin) {
    return <Navigate to="/app/admin/solicitudes-acceso" replace />;
  }

  const planLike =
    (user as any).currentPlan ??
    (user as any).plan ??
    (user as any).planType ??
    PlanType.BASIC;

  const currentPlan = toPlanTier(planLike);
  const currentPlanCode = toPlanCode(currentPlan);
  const canAccessRevenue = currentPlan === PlanTier.MEDIUM || currentPlan === PlanTier.PREMIUM;

  React.useEffect(() => {
    let cancelled = false;

    async function loadRevenueProperties() {
      if (!canAccessRevenue) {
        setRevenueProperties([]);
        setSelectedPropertyId(null);
        return;
      }

      try {
        setPropertiesLoading(true);
        const rows = await getProperties();

        if (cancelled) return;

        setRevenueProperties(rows);

        const savedId = localStorage.getItem("revenue_active_property_id");
        if (savedId && rows.some((p) => p.id === savedId)) {
          setSelectedPropertyId(savedId);
        } else if (rows.length > 0) {
          setSelectedPropertyId(rows[0].id);
        } else {
          setSelectedPropertyId(null);
        }
      } catch (error) {
        console.error("loadRevenueProperties error:", error);
        if (!cancelled) {
          setRevenueProperties([]);
          setSelectedPropertyId(null);
        }
      } finally {
        if (!cancelled) setPropertiesLoading(false);
      }
    }

    void loadRevenueProperties();

    return () => {
      cancelled = true;
    };
  }, [canAccessRevenue]);

  React.useEffect(() => {
    if (selectedPropertyId) {
      localStorage.setItem("revenue_active_property_id", selectedPropertyId);
    } else {
      localStorage.removeItem("revenue_active_property_id");
    }
  }, [selectedPropertyId]);

  const selectedProperty = React.useMemo(() => {
    return revenueProperties.find((p) => p.id === selectedPropertyId) ?? null;
  }, [revenueProperties, selectedPropertyId]);

  const navItems: NavItem[] = React.useMemo(
    () => [
      { view: "dashboard", label: "Dashboard", icon: LayoutDashboard, section: "OPERATIVA" },
      {
        view: "aud_screening_csv",
        label: "Consulta automática (CSV)",
        icon: FileSpreadsheet,
        section: "OPERATIVA",
      },
      { view: "search", label: "Consulta manual", icon: Search, section: "OPERATIVA" },
      { view: "add", label: "Registrar incidencia", icon: PlusCircle, section: "OPERATIVA" },

      { view: "rev_channels", label: "Análisis por Canal", icon: BarChart3, section: "REVENUE" },
      { view: "rev_risk", label: "Nivel de Riesgo", icon: ShieldAlert, section: "REVENUE" },
      { view: "rev_leakage", label: "Fugas de Revenue", icon: TrendingDown, section: "REVENUE" },
      { view: "rev_properties", label: "Propiedades", icon: Building2, section: "REVENUE" },
      { view: "rev_room_types", label: "Tipos de habitación", icon: BedDouble, section: "REVENUE" },
      {
        view: "rev_price_calendar",
        label: "Calendario de precios",
        icon: CalendarRange,
        section: "REVENUE",
      },

      { view: "aud_stats", label: "Estadísticas operativas", icon: Activity, section: "AUDITORIA" },
      { view: "aud_history", label: "Histórico", icon: Clock, section: "AUDITORIA" },
      { view: "aud_exports", label: "Exportaciones", icon: Download, section: "AUDITORIA" },

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
      case "rev_properties":
        return "Propiedades";
      case "rev_room_types":
        return "Tipos de habitación";
      case "rev_price_calendar":
        return "Calendario de precios";
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
        return "Importa un CSV, valida (dry-run) y ejecuta screening (persona + fecha).";
      case "account":
        return "Planes, perfil del hotel, catálogo, seguridad y datos bancarios.";
      case "search":
        return "Consulta por documento, email, teléfono o nombre.";
      case "add":
        return "Registro estructurado de incidencias.";
      case "rev_channels":
        return "Comparativa por canal/plataforma y su impacto económico (net loss).";
      case "rev_risk":
        return "Segmentación del impacto económico real (net loss) y volumen de incidencias por nivel.";
      case "rev_leakage":
        return "Ranking de fugas de margen: net loss y cuota sobre el total.";
      case "rev_properties":
        return "Gestiona las propiedades y la configuración base de Revenue Intelligence.";
      case "rev_room_types":
        return "Gestiona el inventario base por categoría dentro de la propiedad activa.";
      case "rev_price_calendar":
        return "Configura precio diario, estancia mínima y cierres por tipo de habitación.";
      case "aud_stats":
        return "KPIs operativos y métricas agregadas.";
      case "aud_history":
        return "Trazabilidad y registro de acciones.";
      case "aud_exports":
        return "Exportación de informes y descargas.";
      default:
        return "";
    }
  }, [currentView]);

  const handleNavigate = React.useCallback((view: AuthedView) => {
    setCurrentView(view);
  }, []);

  const headerLeft = React.useMemo(() => {
    if (!canAccessRevenue) return null;
    if (!isRevenueView(currentView)) return null;
    if (propertiesLoading) return null;
    if (!revenueProperties.length) return null;

    return (
      <PropertySelector
        properties={revenueProperties}
        selectedId={selectedPropertyId}
        onSelect={setSelectedPropertyId}
      />
    );
  }, [canAccessRevenue, currentView, propertiesLoading, revenueProperties, selectedPropertyId]);

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
      headerLeft={headerLeft}
    >
      {currentView === "dashboard" && (
        <DashboardHome
          onNavigate={(v) => {
            handleNavigate(v as any);
          }}
        />
      )}

      {currentView === "aud_screening_csv" && <ScreeningCsv />}
      {currentView === "search" && <SearchRatings currentUser={user as any} />}
      {currentView === "add" && (
        <RatingForm
          currentCustomerId={(user as any).id}
          currentCustomerName={(user as any).fullName}
        />
      )}

      {currentView === "account" && <MiCuenta user={user as any} />}

      {isRevenueView(currentView) && !canAccessRevenue && (
        <RevenueLockedDemo currentPlan={currentPlan} onGoPlans={() => setCurrentView("account")} />
      )}

      {currentView === "rev_channels" && canAccessRevenue && <ChannelAnalysis />}
      {currentView === "rev_risk" && canAccessRevenue && <RiskAnalysis />}
      {currentView === "rev_leakage" && canAccessRevenue && <Leaks />}

      {currentView === "rev_properties" && canAccessRevenue && (
        <SettingsProperties user={user as any} />
      )}

      {currentView === "rev_room_types" && canAccessRevenue && (
        <RoomTypesPage
          selectedPropertyId={selectedPropertyId}
          selectedPropertyName={selectedProperty?.name ?? null}
        />
      )}

      {currentView === "rev_price_calendar" && canAccessRevenue && (
        <PriceCalendarPage
          selectedPropertyId={selectedPropertyId}
          selectedPropertyName={selectedProperty?.name ?? null}
          selectedOrgId={selectedProperty?.orgId ?? null}
        />
      )}

      {currentView === "aud_stats" && <StatsViewAuditor currentPlan={currentPlan} />}
      {currentView === "aud_history" && <HistoryViewAuditor />}
      {currentView === "aud_exports" && <ExportsViewAuditor currentPlan={currentPlan} />}
    </AppShell>
  );
}