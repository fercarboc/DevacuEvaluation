import React from "react";
import { Navigate, useNavigate, useLocation } from "react-router-dom";

import { SearchRatings } from "@/components/SearchRatings";
import { RatingForm } from "@/components/RatingForm";
import { MiCuenta } from "@/components/account/MiCuenta";
import AppShell, { type AuthedView, type NavItem } from "@/components/layout/AppShell";
import DashboardHome from "@/pages/DashboardHome";
import { useEvalAuth } from "@/context/EvalAuthContext";

// Revenue Intelligence
import AlarmasPage from "@/views/AlarmasPage";
import ChannelAnalysis from "@/views/ChannelAnalysis";
import RiskAnalysis from "@/views/RiskAnalysis";
import Leaks from "@/views/Leaks";
import DayByDay from "@/modules/revenue-intelligence/pages/DayByDay";
import MonthlyComparison from "@/modules/revenue-intelligence/pages/MonthlyComparison";
import RevenueChannelsSegments from "@/modules/revenue-intelligence/pages/RevenueChannelsSegments";
import PickupAdvanced from "@/modules/revenue-intelligence/pages/PickupAdvanced";
import SettingsProperties from "@/modules/revenue-intelligence/pages/SettingsProperties";
import RoomTypesPage from "@/modules/revenue-intelligence/pages/RoomTypesPage";
import PriceCalendarPage from "@/modules/revenue-intelligence/pages/PriceCalendarPage";
import EventsSeasonsPage from "@/modules/revenue-intelligence/pages/EventsSeasonsPage";
import PropertySelector from "@/modules/revenue-intelligence/components/PropertySelector";
import {
  getProperties,
  type RevenueProperty,
} from "@/modules/revenue-intelligence/services/revenueProperties.service";
import RevenueImportData from "@/modules/revenue-intelligence/pages/RevenueImportData";

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
  CalendarDays,
  LineChart,
  CalendarClock,
  Layers3,
  Upload,
  TrendingUp,
  AlertCircle,
} from "lucide-react";

import { PlanType } from "@/types/types";
import { LS_KEYS } from "@/services/storageKeys";
import { PlanTier } from "../../../auditor";

const ACTIVE_PROPERTY_STORAGE_KEY = LS_KEYS.ACTIVE_PROPERTY_ID;
const PROPERTIES_CHANGED_EVENT = "revenue:properties-changed";
const ACTIVE_PROPERTY_CHANGED_EVENT = "revenue:active-property-changed";

const VIEW_PATHS: Record<AuthedView, string> = {
  dashboard:             "/app",
  alarmas:               "/app/alarmas",
  search:                "/app/buscar",
  add:                   "/app/registrar",
  account:               "/app/cuenta",
  admin:                 "/app/admin/dashboard",
  aud_screening_csv:     "/app/screening",
  rev_channels:          "/app/revenue/canales",
  rev_risk:              "/app/revenue/riesgo",
  rev_leakage:           "/app/revenue/fugas",
  rev_import:            "/app/revenue/importar",
  rev_day_by_day:        "/app/revenue/dia-x-dia",
  rev_monthly:           "/app/revenue/mensual",
  rev_channels_segments: "/app/revenue/canales-segmentos",
  rev_pickup_advanced:   "/app/revenue/pickup",
  rev_properties:        "/app/revenue/propiedades",
  rev_room_types:        "/app/revenue/tipos-habitacion",
  rev_price_calendar:    "/app/revenue/calendario-precios",
  rev_events_seasons:    "/app/revenue/eventos-temporadas",
  aud_summary:           "/app/auditoria/resumen",
  aud_risk:              "/app/auditoria/riesgo",
  aud_stats:             "/app/auditoria/estadisticas",
  aud_history:           "/app/auditoria/historico",
  aud_exports:           "/app/auditoria/exportaciones",
  aud_config:            "/app/auditoria/configuracion",
};

const PATH_TO_VIEW = Object.fromEntries(
  Object.entries(VIEW_PATHS).map(([v, p]) => [p, v as AuthedView])
) as Record<string, AuthedView>;

function viewFromPath(pathname: string): AuthedView {
  return PATH_TO_VIEW[pathname] ?? "dashboard";
}

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

function usesPropertySelector(v: AuthedView) {
  return (
    v === "aud_screening_csv" ||
    v === "search" ||
    v === "add" ||
    v === "rev_channels" ||
    v === "rev_risk" ||
    v === "rev_leakage" ||
    v === "rev_import" ||
    v === "rev_day_by_day" ||
    v === "rev_monthly" ||
    v === "rev_channels_segments" ||
    v === "rev_pickup_advanced" ||
    v === "rev_properties" ||
    v === "rev_room_types" ||
    v === "rev_price_calendar" ||
    v === "rev_events_seasons"
  );
}

function isRevenueFeatureView(v: AuthedView) {
  return (
    v === "rev_channels" ||
    v === "rev_risk" ||
    v === "rev_leakage" ||
    v === "rev_import" ||
    v === "rev_day_by_day" ||
    v === "rev_monthly" ||
    v === "rev_channels_segments" ||
    v === "rev_pickup_advanced" ||
    v === "rev_properties" ||
    v === "rev_room_types" ||
    v === "rev_price_calendar" ||
    v === "rev_events_seasons"
  );
}

export default function AuthedApp() {
  const { user, loading, signOut } = useEvalAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const currentView = viewFromPath(location.pathname);
  const [revenueProperties, setRevenueProperties] = React.useState<RevenueProperty[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = React.useState<string | null>(null);
  const [propertiesLoading, setPropertiesLoading] = React.useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  const isPlatformAdmin = (user as any).isPlatformAdmin === true;

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

  const loadRevenueProperties = React.useCallback(
    async (preferredPropertyId?: string | null) => {
      if (!canAccessRevenue) {
        setRevenueProperties([]);
        setSelectedPropertyId(null);
        localStorage.removeItem(ACTIVE_PROPERTY_STORAGE_KEY);
        return;
      }

      try {
        setPropertiesLoading(true);

        const rows = await getProperties();
        setRevenueProperties(rows);

        if (!rows.length) {
          setSelectedPropertyId(null);
          localStorage.removeItem(ACTIVE_PROPERTY_STORAGE_KEY);
          return;
        }

        const savedId = localStorage.getItem(ACTIVE_PROPERTY_STORAGE_KEY);
        const currentSelected = selectedPropertyId;

        const candidateId =
          preferredPropertyId ??
          currentSelected ??
          savedId ??
          null;

        if (candidateId && rows.some((p) => p.id === candidateId)) {
          setSelectedPropertyId(candidateId);
          localStorage.setItem(ACTIVE_PROPERTY_STORAGE_KEY, candidateId);
          return;
        }

        setSelectedPropertyId(rows[0].id);
        localStorage.setItem(ACTIVE_PROPERTY_STORAGE_KEY, rows[0].id);
      } catch (error) {
        console.error("loadRevenueProperties error:", error);
        setRevenueProperties([]);
        setSelectedPropertyId(null);
      } finally {
        setPropertiesLoading(false);
      }
    },
    [canAccessRevenue, selectedPropertyId],
  );

  React.useEffect(() => {
    void loadRevenueProperties();
  }, [loadRevenueProperties]);

  React.useEffect(() => {
    const handlePropertiesChanged = () => {
      const preferredId = localStorage.getItem(ACTIVE_PROPERTY_STORAGE_KEY);
      void loadRevenueProperties(preferredId);
    };

    const handleActivePropertyChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ propertyId?: string }>;
      const propertyId = customEvent.detail?.propertyId ?? null;

      if (propertyId) {
        setSelectedPropertyId(propertyId);
        localStorage.setItem(ACTIVE_PROPERTY_STORAGE_KEY, propertyId);
      }

      void loadRevenueProperties(propertyId);
    };

    window.addEventListener(PROPERTIES_CHANGED_EVENT, handlePropertiesChanged);
    window.addEventListener(
      ACTIVE_PROPERTY_CHANGED_EVENT,
      handleActivePropertyChanged as EventListener,
    );

    return () => {
      window.removeEventListener(PROPERTIES_CHANGED_EVENT, handlePropertiesChanged);
      window.removeEventListener(
        ACTIVE_PROPERTY_CHANGED_EVENT,
        handleActivePropertyChanged as EventListener,
      );
    };
  }, [loadRevenueProperties]);

  React.useEffect(() => {
    if (selectedPropertyId) {
      localStorage.setItem(ACTIVE_PROPERTY_STORAGE_KEY, selectedPropertyId);
    } else {
      localStorage.removeItem(ACTIVE_PROPERTY_STORAGE_KEY);
    }
  }, [selectedPropertyId]);

  const selectedProperty = React.useMemo(() => {
    return revenueProperties.find((p) => p.id === selectedPropertyId) ?? null;
  }, [revenueProperties, selectedPropertyId]);

  const navItems: NavItem[] = React.useMemo(
    () => [
      { view: "dashboard", path: VIEW_PATHS.dashboard, label: "Dashboard",          icon: LayoutDashboard, section: "OPERATIVA" },
      { view: "alarmas",   path: VIEW_PATHS.alarmas,   label: "Alarmas Detectadas", icon: AlertCircle,     section: "ALARMAS" },

      { view: "aud_screening_csv", path: VIEW_PATHS.aud_screening_csv, label: "Consulta automática (CSV)", icon: FileSpreadsheet, section: "CONSULTAS" },
      { view: "search",            path: VIEW_PATHS.search,            label: "Consulta manual",           icon: Search,          section: "CONSULTAS" },
      { view: "add",               path: VIEW_PATHS.add,               label: "Registrar incidencia",      icon: PlusCircle,      section: "CONSULTAS" },

      { view: "rev_channels", path: VIEW_PATHS.rev_channels, label: "Análisis por Canal", icon: BarChart3,    section: "REVENUE_RIESGO" },
      { view: "rev_risk",     path: VIEW_PATHS.rev_risk,     label: "Nivel de Riesgo",    icon: ShieldAlert,  section: "REVENUE_RIESGO" },
      { view: "rev_leakage",  path: VIEW_PATHS.rev_leakage,  label: "Fugas de Revenue",   icon: TrendingDown, section: "REVENUE_RIESGO" },

      { view: "rev_import",            path: VIEW_PATHS.rev_import,            label: "Importación Revenue",   icon: Upload,        section: "REVENUE" },
      { view: "rev_day_by_day",        path: VIEW_PATHS.rev_day_by_day,        label: "Día x Día",             icon: CalendarClock, section: "REVENUE" },
      { view: "rev_monthly",           path: VIEW_PATHS.rev_monthly,           label: "Mensual",               icon: LineChart,     section: "REVENUE" },
      { view: "rev_channels_segments", path: VIEW_PATHS.rev_channels_segments, label: "Canales & Segmentos",   icon: Layers3,       section: "REVENUE" },
      { view: "rev_pickup_advanced",   path: VIEW_PATHS.rev_pickup_advanced,   label: "Pickup Avanzado",       icon: TrendingUp,    section: "REVENUE" },
      { view: "rev_properties",        path: VIEW_PATHS.rev_properties,        label: "Propiedades",           icon: Building2,     section: "REVENUE" },
      { view: "rev_room_types",        path: VIEW_PATHS.rev_room_types,        label: "Tipos de habitación",   icon: BedDouble,     section: "REVENUE" },
      { view: "rev_price_calendar",    path: VIEW_PATHS.rev_price_calendar,    label: "Calendario de precios", icon: CalendarRange, section: "REVENUE" },
      { view: "rev_events_seasons",    path: VIEW_PATHS.rev_events_seasons,    label: "Eventos y temporadas",  icon: CalendarDays,  section: "REVENUE" },

      { view: "aud_stats",   path: VIEW_PATHS.aud_stats,   label: "Estadísticas operativas", icon: Activity, section: "AUDITORIA" },
      { view: "aud_history", path: VIEW_PATHS.aud_history, label: "Histórico",               icon: Clock,    section: "AUDITORIA" },
      { view: "aud_exports", path: VIEW_PATHS.aud_exports, label: "Exportaciones",           icon: Download, section: "AUDITORIA" },

      { view: "account", path: VIEW_PATHS.account, label: "Mi cuenta", icon: CreditCard, section: "CUENTA" },
    ],
    [],
  );

  const title = React.useMemo(() => {
    switch (currentView) {
      case "dashboard":
        return "Dashboard";
      case "alarmas":
        return "Alarmas Detectadas";
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
      case "rev_import":
        return "Importación Revenue";
      case "rev_day_by_day":
        return "Día x Día";
      case "rev_monthly":
        return "Mensual";
      case "rev_channels_segments":
        return "Canales & Segmentos";
      case "rev_pickup_advanced":
        return "Pickup Avanzado";
      case "rev_properties":
        return "Propiedades";
      case "rev_room_types":
        return "Tipos de habitación";
      case "rev_price_calendar":
        return "Calendario de precios";
      case "rev_events_seasons":
        return "Eventos y temporadas";
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
        return "Identifica cómo se reparte el riesgo por canal/plataforma.";
      case "rev_risk":
        return "Segmentación del impacto económico real y volumen de incidencias por nivel.";
      case "rev_leakage":
        return "Ranking de fugas de margen y desvíos sobre precio esperado.";
      case "rev_import":
        return "Valida e importa CSV reales del PMS a reservas, snapshots y stay nights.";
      case "rev_day_by_day":
        return "Detalle diario de ocupación, ADR, revenue y eventos operativos.";
      case "rev_monthly":
        return "Comparativa mensual de revenue, ADR, RN y evolución.";
      case "rev_channels_segments":
        return "Análisis de producción comercial por canal y estructura de ventas disponible.";
      case "rev_pickup_advanced":
        return "Ritmo de captación real por fecha de reserva y fecha de arribo para la propiedad activa.";
      case "rev_properties":
        return "Gestiona las propiedades y la configuración base de Revenue Intelligence.";
      case "rev_room_types":
        return "Gestiona el inventario base por categoría dentro de la propiedad activa.";
      case "rev_price_calendar":
        return "Configura precio diario, estancia mínima y cierres por tipo de habitación.";
      case "rev_events_seasons":
        return "Gestiona temporadas y eventos que contextualizan el calendario y el pricing.";
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
    navigate(VIEW_PATHS[view]);
  }, [navigate]);

  const headerLeft = React.useMemo(() => {
    if (!usesPropertySelector(currentView)) return null;
    if (propertiesLoading) return null;
    if (!revenueProperties.length) return null;

    return (
      <PropertySelector
        properties={revenueProperties}
        selectedId={selectedPropertyId}
        onSelect={setSelectedPropertyId}
      />
    );
  }, [currentView, propertiesLoading, revenueProperties, selectedPropertyId]);

  return (
    <AppShell
      userEmail={(user as any).email}
      userName={(user as any).fullName}
      onLogout={handleLogout}
      title={title}
      subtitle={subtitle}
      navItems={navItems}
      currentPlanCode={currentPlanCode}
      headerLeft={headerLeft}
    >
      {currentView === "dashboard" && <DashboardHome />}
      {currentView === "alarmas" && <AlarmasPage />}

      {currentView === "aud_screening_csv" && (
        <ScreeningCsv
          orgId={selectedProperty?.orgId ?? (user as any)?.orgId ?? ""}
          propertyId={selectedPropertyId}
          propertyName={selectedProperty?.name ?? null}
        />
      )}

      {currentView === "search" && (
        <SearchRatings
          currentUser={user as any}
          selectedPropertyId={selectedPropertyId}
          selectedPropertyName={selectedProperty?.name ?? null}
        />
      )}

      {currentView === "add" && (
        <RatingForm
          currentCustomerId={(user as any).id}
          currentCustomerName={(user as any).fullName}
          selectedPropertyId={selectedPropertyId}
          selectedPropertyName={selectedProperty?.name ?? null}
        />
      )}

      {currentView === "account" && <MiCuenta user={user as any} />}

      {isRevenueFeatureView(currentView) && !canAccessRevenue && (
        <RevenueLockedDemo
          currentPlan={currentPlan}
          onGoPlans={() => navigate(VIEW_PATHS.account)}
        />
      )}

      {currentView === "rev_channels" && canAccessRevenue && <ChannelAnalysis />}
      {currentView === "rev_risk" && canAccessRevenue && <RiskAnalysis />}
      {currentView === "rev_leakage" && canAccessRevenue && <Leaks />}

      {currentView === "rev_import" && canAccessRevenue && (
        <RevenueImportData
          orgId={selectedProperty?.orgId ?? null}
          selectedPropertyId={selectedPropertyId}
          selectedPropertyCode={selectedProperty?.code ?? null}
          selectedPropertyName={selectedProperty?.name ?? null}
        />
      )}

      {currentView === "rev_day_by_day" && canAccessRevenue && (
        <DayByDay
          orgId={selectedProperty?.orgId ?? null}
          selectedPropertyId={selectedPropertyId}
          properties={revenueProperties.map((p) => ({
            id: p.id,
            name: p.name,
            roomsCount: (p as any).roomsCount ?? (p as any).rooms_total ?? 0,
          }))}
        />
      )}

      {currentView === "rev_monthly" && canAccessRevenue && (
        <MonthlyComparison
          orgId={selectedProperty?.orgId ?? null}
          selectedPropertyId={selectedPropertyId}
          properties={revenueProperties.map((p) => ({
            id: p.id,
            name: p.name,
            roomsCount: (p as any).roomsCount ?? (p as any).rooms_total ?? 0,
          }))}
        />
      )}

      {currentView === "rev_channels_segments" && canAccessRevenue && (
        <RevenueChannelsSegments
          orgId={selectedProperty?.orgId ?? null}
          selectedPropertyId={selectedPropertyId}
          properties={revenueProperties.map((p) => ({
            id: p.id,
            name: p.name,
          }))}
        />
      )}

      {currentView === "rev_pickup_advanced" && canAccessRevenue && (
        <PickupAdvanced
          orgId={selectedProperty?.orgId ?? null}
          selectedPropertyId={selectedPropertyId}
          selectedPropertyName={selectedProperty?.name ?? null}
        />
      )}

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

      {currentView === "rev_events_seasons" && canAccessRevenue && (
  <EventsSeasonsPage
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