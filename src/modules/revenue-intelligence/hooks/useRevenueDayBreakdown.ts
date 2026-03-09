import { useEffect, useState } from "react";
import {
  getRevenueDayBreakdown,
  type RevenueDayBreakdown,
} from "../services/revenueDayBreakdown.service";

type Params = {
  orgId: string | null;
  propertyId: string | null;
  date: string | null;
  enabled?: boolean;
};

const EMPTY_DATA: RevenueDayBreakdown = {
  totals: {
    roomsSold: 0,
    revenue: 0,
    adr: 0,
  },
  rows: [],
};

export function useRevenueDayBreakdown({
  orgId,
  propertyId,
  date,
  enabled = true,
}: Params) {
  const [data, setData] = useState<RevenueDayBreakdown>(EMPTY_DATA);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!enabled || !orgId || !propertyId || !date) {
        setData(EMPTY_DATA);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await getRevenueDayBreakdown({
          orgId,
          propertyId,
          date,
        });

        if (!cancelled) {
          setData(result);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(String(err?.message ?? "request_failed"));
          setData(EMPTY_DATA);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [orgId, propertyId, date, enabled]);

  return {
    data,
    totals: data.totals,
    rows: data.rows,
    loading,
    error,
  };
}