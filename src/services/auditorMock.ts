import { PlanType } from "@/types/types";

export type AuditorPlanTier = "FREE" | "BASIC" | "MEDIUM" | "PREMIUM";

export const AUDITOR_VIEW_KEYS = [
  "summary",
  "risk",
  "stats",
  "history",
  "exports",
  "config",
] as const;

export type AuditorViewKey = typeof AUDITOR_VIEW_KEYS[number];

export const PLAN_PERMISSIONS: Record<AuditorPlanTier, AuditorViewKey[]> = {
  FREE: ["summary"],
  BASIC: ["summary", "history"],
  MEDIUM: ["summary", "risk", "stats", "history", "exports"],
  PREMIUM: ["summary", "risk", "stats", "history", "exports", "config"],
};

export const MENU_LABELS: Record<AuditorViewKey, { label: string; description: string; cta: string }> = {
  summary: {
    label: "Resumen",
    description: "Indicadores clave y alertas del día",
    cta: "Ver indicadores",
  },
  risk: {
    label: "Auditoría de riesgo",
    description: "Hallazgos y anomalias detectadas",
    cta: "Análisis avanzado",
  },
  stats: {
    label: "Estadísticas operativas",
    description: "Tendencias y métricas de uso",
    cta: "Profundizar",
  },
  history: {
    label: "Histórico de consultas",
    description: "Registro completo de consultas realizadas",
    cta: "Ver histórico",
  },
  exports: {
    label: "Exportaciones",
    description: "Descargas y envíos programados",
    cta: "Descargar",
  },
  config: {
    label: "Configuración / Avisos",
    description: "Umbrales, alertas y notificaciones",
    cta: "Actualizar",
  },
};

export function getPlanTierFromUserPlan(plan?: PlanType): AuditorPlanTier {
  if (!plan) return "BASIC";
  switch (plan) {
    case PlanType.INACTIVE:
      return "FREE";
    case PlanType.BASIC:
      return "BASIC";
    case PlanType.PROFESSIONAL:
      return "MEDIUM";
    case PlanType.ENTERPRISE:
      return "PREMIUM";
    default:
      return "BASIC";
  }
}
