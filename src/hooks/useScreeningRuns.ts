import { useCallback, useEffect, useState } from "react";
import { listScreeningRuns } from "@/services/screeningCsv.service";
import type { ScreeningRun } from "@/types/screeningCsv.types";

type UseScreeningRunsParams = {
  orgId?: string;
  propertyId?: string;
  limit?: number;
  autoLoad?: boolean;
};

type UseScreeningRunsState = {
  runs: ScreeningRun[];
  loading: boolean;
  error: string | null;
};

export function useScreeningRuns(params: UseScreeningRunsParams) {
  const { orgId, propertyId, limit = 50, autoLoad = true } = params;

  const [state, setState] = useState<UseScreeningRunsState>({
    runs: [],
    loading: false,
    error: null,
  });

  const loadRuns = useCallback(async () => {
    if (!orgId || !propertyId) {
      setState((s) => ({
        ...s,
        runs: [],
      }));
      return;
    }

    try {
      setState((s) => ({
        ...s,
        loading: true,
        error: null,
      }));

      const data = await listScreeningRuns({
        orgId,
        propertyId,
        limit,
      });

      setState({
        runs: data,
        loading: false,
        error: null,
      });
    } catch (err: any) {
      setState({
        runs: [],
        loading: false,
        error: err?.message || "failed_to_load_runs",
      });
    }
  }, [orgId, propertyId, limit]);

  useEffect(() => {
    if (!autoLoad) return;
    loadRuns();
  }, [autoLoad, loadRuns]);

  const refresh = useCallback(() => {
    return loadRuns();
  }, [loadRuns]);

  return {
    runs: state.runs,
    loading: state.loading,
    error: state.error,
    refresh,
  };
}