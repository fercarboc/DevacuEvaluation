// supabase/functions/_shared/risk.ts

export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type RiskLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH";

export function severityWeight(severity: Severity): number {
  switch (String(severity).toUpperCase()) {
    case "LOW":
      return 10;
    case "MEDIUM":
      return 25;
    case "HIGH":
      return 50;
    case "CRITICAL":
      return 80;
    default:
      return 0;
  }
}

export function computeRiskLevel(score: number): RiskLevel {
  if (score >= 80) return "HIGH";
  if (score >= 35) return "MEDIUM";
  if (score > 0) return "LOW";
  return "NONE";
}
