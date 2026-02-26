// src/hooks/useImportJobs.ts
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/services/supabaseClient";

export type ImportJobRow = {
  id: string;
  created_at: string | null;
  run_type: string | null;
  status: string | null;
  file_path: string | null;
  total_rows: number | null;
  valid_rows: number | null;
  invalid_rows: number | null;
  summary: any | null;
};

export type ImportJobsFilters = {
  from?: string; // ISO (inclusive)
  to?: string;   // ISO (inclusive; usamos lte)
  status?: string;
  runType?: string;
  limit?: number;
};

export function useImportJobs(orgId: string, filters: ImportJobsFilters) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<ImportJobRow[]>([]);

  const stableFilters = useMemo(() => {
    return {
      from: filters?.from,
      to: filters?.to,
      status: filters?.status,
      runType: filters?.runType,
      limit: filters?.limit ?? 200,
    };
  }, [filters?.from, filters?.to, filters?.status, filters?.runType, filters?.limit]);

  const load = useCallback(async () => {
    const oid = String(orgId || "").trim();
    if (!oid) {
      setJobs([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 👇 Cast para saltar el typing cuando faltan tablas/columnas en Database types
      let q = (supabase as any)
        .from("import_jobs")
        .select("id, created_at, run_type, status, file_path, total_rows, valid_rows, invalid_rows, summary")
        .eq("org_id", oid)
        .order("created_at", { ascending: false })
        .limit(stableFilters.limit);

      if (stableFilters.from) q = q.gte("created_at", stableFilters.from);
      if (stableFilters.to) q = q.lte("created_at", stableFilters.to);

      if (stableFilters.status && stableFilters.status !== "ALL") {
        q = q.eq("status", stableFilters.status);
      }

      if (stableFilters.runType && stableFilters.runType !== "ALL") {
        q = q.eq("run_type", stableFilters.runType);
      }

      const { data, error } = await q;
      if (error) throw error;

      setJobs((data || []) as ImportJobRow[]);
    } catch (e: any) {
      setError(String(e?.message || e));
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, stableFilters]);

  useEffect(() => {
    load();
  }, [load]);

  return { loading, error, jobs, reload: load };
}