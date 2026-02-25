// src/services/screeningCsv.service.ts
import { supabase } from "@/services/supabaseClient";
import type {
  ImportProfile,
  ScreeningRun,
  ScreeningResult,
  ScreeningAlert,
  ImportValidateCommitDryRunResponse,
  ImportValidateCommitCommitResponse,
} from "@/types/screeningCsv.types";

/**
 * Bucket donde se suben CSVs.
 * - Puedes fijarlo en env VITE_DEBACU_IMPORT_BUCKET
 * - Default: customer-exports (según tu backend actual)
 */
const IMPORT_BUCKET =
  (import.meta as any).env?.VITE_DEBACU_IMPORT_BUCKET || "customer-exports";

function mustOrgId(orgId: string) {
  const v = String(orgId || "").trim();
  if (!v) throw new Error("missing_org_id");
  return v;
}

function pickErrorMessage(e: any, fallback = "request_failed") {
  return (
    e?.message ||
    e?.error_description ||
    e?.error?.message ||
    e?.error ||
    fallback
  );
}

// -----------------------------
// Profiles
// -----------------------------
export async function listImportProfiles(orgId: string): Promise<ImportProfile[]> {
  const org_id = mustOrgId(orgId);

  const { data, error } = await supabase
    .from("import_profiles")
    .select("*")
    .eq("org_id", org_id)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(pickErrorMessage(error));
  return (data || []) as ImportProfile[];
}

// -----------------------------
// Runs
// -----------------------------
export async function listScreeningRuns(orgId: string, limit = 50): Promise<ScreeningRun[]> {
  const org_id = mustOrgId(orgId);

  const { data, error } = await supabase
    .from("screening_runs")
    .select("*")
    .eq("org_id", org_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(pickErrorMessage(error));
  return (data || []) as ScreeningRun[];
}

export async function getScreeningRun(runId: string): Promise<ScreeningRun | null> {
  const id = String(runId || "").trim();
  if (!id) return null;

  const { data, error } = await supabase
    .from("screening_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(pickErrorMessage(error));
  return (data || null) as ScreeningRun | null;
}

// -----------------------------
// Results + Alerts
// -----------------------------
export async function listRunResults(params: {
  runId: string;
  limit?: number;
  offset?: number;
  riskBand?: string; // "HIGH" | "MEDIUM" | "LOW"
  onlyChanged?: boolean;
}): Promise<ScreeningResult[]> {
  const run_id = String(params.runId || "").trim();
  if (!run_id) return [];

  const limit = Math.min(Math.max(Number(params.limit ?? 200), 1), 1000);
  const offset = Math.max(Number(params.offset ?? 0), 0);

  let q = supabase
    .from("screening_results")
    .select("*")
    .eq("run_id", run_id)
    .order("risk_band", { ascending: true }) // HIGH/MEDIUM/LOW no ordena perfecto, pero vale para empezar
    .order("delta_total_net_loss", { ascending: false })
    .order("delta_incidents_count", { ascending: false })
    .range(offset, offset + limit - 1);

  if (params.riskBand) q = q.eq("risk_band", params.riskBand);
  if (params.onlyChanged === true) q = q.eq("risk_band_changed", true);

  const { data, error } = await q;
  if (error) throw new Error(pickErrorMessage(error));
  return (data || []) as ScreeningResult[];
}

export async function listRunAlerts(params: {
  runId: string;
  limit?: number;
  offset?: number;
  unresolvedOnly?: boolean;
}): Promise<ScreeningAlert[]> {
  const run_id = String(params.runId || "").trim();
  if (!run_id) return [];

  const limit = Math.min(Math.max(Number(params.limit ?? 200), 1), 1000);
  const offset = Math.max(Number(params.offset ?? 0), 0);

  let q = supabase
    .from("screening_alerts")
    .select("*")
    .eq("run_id", run_id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (params.unresolvedOnly === true) q = q.is("resolved_at", null);

  const { data, error } = await q;
  if (error) throw new Error(pickErrorMessage(error));
  return (data || []) as ScreeningAlert[];
}

// -----------------------------
// Storage upload helper
// -----------------------------
export async function uploadScreeningCsvToStorage(orgId: string, file: File): Promise<string> {
  const org_id = mustOrgId(orgId);

  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `screening/${org_id}/${Date.now()}_${safeName}`;

  const { error } = await supabase.storage
    .from(IMPORT_BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: file.type || "text/csv",
    });

  if (error) throw new Error(pickErrorMessage(error));
  return path;
}

// -----------------------------
// Edge Function: import_validate_commit
// -----------------------------
export async function importValidateCommit(params: {
  orgId: string;
  profileId: string;
  runType?: string;
  dryRun: boolean;
  filePath?: string;
  csvText?: string;
}): Promise<ImportValidateCommitDryRunResponse | ImportValidateCommitCommitResponse> {
  const payload: any = {
    org_id: params.orgId,
    profile_id: params.profileId,
    run_type: params.runType,
    dry_run: params.dryRun,
  };

  if (params.filePath) payload.file_path = params.filePath;
  if (params.csvText) payload.csv_text = params.csvText;

  const { data, error } = await supabase.functions.invoke("import_validate_commit", {
    body: payload,
  });

  if (error) throw new Error(pickErrorMessage(error));
  if (!data?.ok) throw new Error(String(data?.detail || data?.error || "request_failed"));

  return data as any;
}