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
  property_id?: string | null;
};

export type ImportJobsFilters = {
  from?: string; // ISO inclusive
  to?: string;   // ISO inclusive
  status?: string;
  runType?: string;
  limit?: number;
};

type State = {
  loading: boolean;
  error: string | null;
  jobs: ImportJobRow[];
};

function clean(v?: string | null) {
  const s = String(v || "").trim();
  return s.length > 0 ? s : "";
}

export function useImportJobs(
  orgId: string,
  propertyId: string | null,
  filters: ImportJobsFilters,
) {
  const [state, setState] = useState<State>({
    loading: false,
    error: null,
    jobs: [],
  });

  const stableFilters = useMemo(() => {
    return {
      from: clean(filters?.from),
      to: clean(filters?.to),
      status: clean(filters?.status),
      runType: clean(filters?.runType),
      limit: Math.min(Math.max(Number(filters?.limit ?? 200), 1), 500),
    };
  }, [filters?.from, filters?.to, filters?.status, filters?.runType, filters?.limit]);

  const cleanOrgId = useMemo(() => clean(orgId), [orgId]);
  const cleanPropertyId = useMemo(() => clean(propertyId), [propertyId]);

  const canLoad = useMemo(() => {
    return cleanOrgId.length > 0 && cleanPropertyId.length > 0;
  }, [cleanOrgId, cleanPropertyId]);

  const load = useCallback(async () => {
    if (!canLoad) {
      setState({
        loading: false,
        error: null,
        jobs: [],
      });
      return;
    }

    setState((s) => ({
      ...s,
      loading: true,
      error: null,
    }));

    try {
      // Usamos cast a any porque el tipado Database puede no incluir estas tablas/columnas
      let q = (supabase as any)
        .from("import_jobs")
        .select(
          "id, created_at, run_type, status, file_path, total_rows, valid_rows, invalid_rows, summary, property_id",
        )
        .eq("org_id", cleanOrgId)
        .eq("property_id", cleanPropertyId)
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

      setState({
        loading: false,
        error: null,
        jobs: (data || []) as ImportJobRow[],
      });
    } catch (e: any) {
      setState({
        loading: false,
        error: String(e?.message || e || "failed_to_load_import_jobs"),
        jobs: [],
      });
    }
  }, [canLoad, cleanOrgId, cleanPropertyId, stableFilters]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    loading: state.loading,
    error: state.error,
    jobs: state.jobs,
    reload: load,
  };
}