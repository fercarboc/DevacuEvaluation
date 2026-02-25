// src/hooks/useImportProfiles.ts
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ImportProfile } from "@/types/screeningCsv.types";
import { listImportProfiles } from "@/services/screeningCsv.service";

type State = {
  loading: boolean;
  error: string | null;
  profiles: ImportProfile[];
};

export function useImportProfiles(orgId: string) {
  const [state, setState] = useState<State>({
    loading: false,
    error: null,
    profiles: [],
  });

  const canLoad = useMemo(() => String(orgId || "").trim().length > 0, [orgId]);

  const reload = useCallback(async () => {
    if (!canLoad) {
      setState((s) => ({ ...s, loading: false, error: null, profiles: [] }));
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const profiles = await listImportProfiles(orgId);
      setState({ loading: false, error: null, profiles });
    } catch (e: any) {
      setState({ loading: false, error: String(e?.message || e), profiles: [] });
    }
  }, [orgId, canLoad]);

  useEffect(() => {
    // auto-load
    reload();
  }, [reload]);

  return {
    ...state,
    reload,
  };
}