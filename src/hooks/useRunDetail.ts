// src/hooks/useRunDetail.ts
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ScreeningRun,
  ScreeningResult,
  ScreeningAlert,
} from "@/types/screeningCsv.types";
import {
  getScreeningRun,
  listRunResults,
  listRunAlerts,
} from "@/services/screeningCsv.service";

type Filters = {
  riskBand?: string;
  onlyChanged?: boolean;
  unresolvedAlertsOnly?: boolean;
};

type State = {
  loading: boolean;
  error: string | null;

  run: ScreeningRun | null;
  results: ScreeningResult[];
  alerts: ScreeningAlert[];
};

export function useRunDetail(runId: string | null, filters?: Filters) {
  const [state, setState] = useState<State>({
    loading: false,
    error: null,
    run: null,
    results: [],
    alerts: [],
  });

  const canLoad = useMemo(() => {
    return String(runId || "").trim().length > 0;
  }, [runId]);

  const reload = useCallback(async () => {
    if (!canLoad || !runId) {
      setState((s) => ({
        ...s,
        loading: false,
        error: null,
        run: null,
        results: [],
        alerts: [],
      }));
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const [run, results, alerts] = await Promise.all([
        getScreeningRun(runId),
        listRunResults({
          runId,
          limit: 500,
          riskBand: filters?.riskBand,
          onlyChanged: filters?.onlyChanged,
        }),
        listRunAlerts({
          runId,
          limit: 300,
          unresolvedOnly: filters?.unresolvedAlertsOnly,
        }),
      ]);

      setState({
        loading: false,
        error: null,
        run,
        results,
        alerts,
      });
    } catch (e: any) {
      setState({
        loading: false,
        error: String(e?.message || e),
        run: null,
        results: [],
        alerts: [],
      });
    }
  }, [runId, canLoad, filters?.riskBand, filters?.onlyChanged, filters?.unresolvedAlertsOnly]);

  useEffect(() => {
    reload();
  }, [reload]);

  return {
    ...state,
    reload,
  };
}