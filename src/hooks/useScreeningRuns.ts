// src/hooks/useScreeningRuns.ts
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ScreeningRun } from "@/types/screeningCsv.types";
import { listScreeningRuns } from "@/services/screeningCsv.service";

type State = {
  loading: boolean;
  error: string | null;
  runs: ScreeningRun[];
};

export function useScreeningRuns(orgId: string, limit = 50) {
  const [state, setState] = useState<State>({
    loading: false,
    error: null,
    runs: [],
  });

  const canLoad = useMemo(() => String(orgId || "").trim().length > 0, [orgId]);

  const reload = useCallback(async () => {
    if (!canLoad) {
      setState((s) => ({ ...s, loading: false, error: null, runs: [] }));
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const runs = await listScreeningRuns(orgId, limit);
      setState({ loading: false, error: null, runs });
    } catch (e: any) {
      setState({ loading: false, error: String(e?.message || e), runs: [] });
    }
  }, [orgId, limit, canLoad]);

  useEffect(() => {
    reload();
  }, [reload]);

  return {
    ...state,
    reload,
  };
}