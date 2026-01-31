
export enum PlanTier {
  FREE = 'FREE',
  BASIC = 'BASIC',
  MEDIUM = 'MEDIUM',
  PREMIUM = 'PREMIUM'
}

export enum TabId {
  RESUMEN = 'resumen',
  RIESGO = 'riesgo',
  ESTADISTICAS = 'estadisticas',
  HISTORICO = 'historico',
  EXPORTACIONES = 'exportaciones',
  CONFIGURACION = 'configuracion'
}

export interface TabConfig {
  id: TabId;
  label: string;
  minTier: PlanTier;
}

export interface KPI {
  label: string;
  value: string | number;
  variation: number;
  type: 'total' | 'risk-low' | 'risk-medium' | 'risk-high';
}

export interface HistoryEntry {
  id: string;
  date: string;
  type: string;
  risk: 'Bajo' | 'Medio' | 'Alto';
  userRole: string;
}
