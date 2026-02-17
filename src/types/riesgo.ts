
export enum RiskLevel {
  LOW = 'Bajo',
  MEDIUM = 'Medio',
  HIGH = 'Alto',
  INCONCLUSIVE = 'Inconcluso'
}

export enum IngestionStatus {
  DRAFT = 'DRAFT',
  UPLOADED = 'UPLOADED',
  VALIDATING = 'VALIDATING',
  PROCESSING = 'PROCESSING',
  READY = 'READY',
  FAILED = 'FAILED'
}

export interface FieldMapping {
  internalField: string;
  csvColumnName: string;
  isRequired: boolean;
}

export interface ChannelMapping {
  rawName: string;
  canonicalName: string;
}

export interface ChannelPolicy {
  canonicalName: string;
  commissionPct: number;
  fixedFee: number;
}

export type ViewType = 'overview' | 'channels' | 'risk' | 'leaks' | 'data' | 'strategy' | 'settings';

export type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6;

export interface IngestionRun {
  id: string;
  org_id: string;
  app_id: string;
  source_type: 'CSV' | 'API';
  status: IngestionStatus;
  row_count: number;
  created_at: string;
}

/**
 * Interface representing channel performance data
 * Used for mock data in constants.tsx
 */
export interface ChannelData {
  channel: string;
  revenue: number;
  incidents: number;
  avgCost: number;
  realMargin: number;
}

/**
 * Interface representing risk segment performance data
 * Used for mock data in constants.tsx
 */
export interface RiskSegmentData {
  level: RiskLevel;
  revenuePct: number;
  lossPct: number;
  avgCostPerStay: number;
}
