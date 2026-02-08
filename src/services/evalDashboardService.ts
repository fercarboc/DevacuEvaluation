// src/services/evalDashboardService.ts
import { callEvalFn } from "@/services/callEvalFn";

/**
 * Resumen global: plataformas + países
 * Usa Edge Function: debacu-eval-global-summary
 */
export function getGlobalSummary() {
  return callEvalFn<{
    platforms: { label: string; pct: number }[];
    nationalities: { label: string; pct: number }[];
  }>("debacu-eval-global-summary", {});
}

/**
 * Snapshot de riesgo (3 / 6 / 12 meses)
 */
export function getGlobalRiskSnapshot(months: 3 | 6 | 12) {
  return callEvalFn<{
    low: number;
    medium: number;
    high: number;
  }>("debacu-eval-global-risk-snapshot", { months });
}
