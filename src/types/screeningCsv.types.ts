export type ImportJobStatus =
  | "UPLOADED"
  | "VALIDATED"
  | "COMMITTED"
  | "FAILED";

export type RunType =
  | "INHOUSE_TODAY"
  | "FUTURE_BOOKINGS"
  | "HISTORICAL_STAYS"
  | "HISTORICAL_BOOKINGS"
  | string;

export type RiskBand = "HIGH" | "MEDIUM" | "LOW" | string;

export type ImportProfile = {
  id: string;
  org_id: string;
  name: string;
  source_type: string;
  delimiter?: string | null;
  date_format?: string | null;
  decimal_separator?: string | null;
  encoding?: string | null;
  identity_strategy: string;
  mapping: Record<string, string>;
  disabled_fields?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ImportJob = {
  id: string;
  org_id: string;
  user_id: string;
  profile_id?: string | null;
  file_path: string;
  file_hash?: string | null;
  run_type: string;
  total_rows?: number | null;
  valid_rows?: number | null;
  invalid_rows?: number | null;
  status: ImportJobStatus;
  summary?: any;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ScreeningRun = {
  id: string;
  org_id: string;
  import_job_id?: string | null;
  run_type: RunType;
  total_analyzed?: number | null;
  high_count?: number | null;
  medium_count?: number | null;
  low_count?: number | null;
  created_at?: string | null;
};

export type ScreeningResult = {
  id: string;
  run_id: string;
  org_id: string;
  identity_key: string;
  row_number?: number | null;
  checkin_date?: string | null;

  risk_band: RiskBand;
  prev_risk_band?: RiskBand | null;
  risk_band_changed?: boolean | null;

  incidents_count?: number | null;
  total_net_loss?: number | null;
  last_incident_date?: string | null;
  days_since_last?: number | null;

  delta_incidents_count?: number | null;
  delta_total_net_loss?: number | null;

  match_confidence?: string | null;
  match_basis?: string | null;

  computed_at?: string | null;
};

export type ScreeningAlert = {
  id: string;
  org_id: string;
  run_id: string;
  identity_key: string;
  row_number?: number | null;
  alert_type: string;
  message?: string | null;
  created_at?: string | null;
  resolved_at?: string | null;
};

export type ImportValidateCommitDryRunResponse = {
  ok: boolean;
  mode: "DRY_RUN";
  import_job_id: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  errors: Array<{ row: number; field?: string; error: string }>;
  preview: any[];
};

export type ImportValidateCommitCommitResponse = {
  ok: boolean;
  mode: "COMMIT";
  import_job_id: string;
  run_id: string;
  prev_run_id?: string | null;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  consolidated_rows?: number;
  high: number;
  medium: number;
  low: number;
  errors: Array<{ row: number; field?: string; error: string }>;
};