import { useEffect, useState } from "react";
import {
  getRevenueDayByDaySummary,
  type RevenueDayByDaySummary,
} from "../services/revenueDayByDay.service";

type Params = {
  orgId: string | null;
  propertyId: string | null;
  from: string;
  to: string;
};

const EMPTY_DATA: RevenueDayByDaySummary = {
  property: null,
  totals: {
    occ: 0,
    adr: 0,
    revenue: 0,
    revpar: 0,
    roomsSold: 0,
    days: 0,
  },
  daily: [],
};

export function useRevenueDayByDaySummary({
  orgId,
  propertyId,
  from,
  to,
}: Params) {
  const [data, setData] = useState<RevenueDayByDaySummary>(EMPTY_DATA);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!orgId || !propertyId || !from || !to) {
        setData(EMPTY_DATA);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await getRevenueDayByDaySummary({
          orgId,
          propertyId,
          from,
          to,
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
  }, [orgId, propertyId, from, to]);

  return {
    data,
    property: data.property,
    totals: data.totals,
    daily: data.daily,
    loading,
    error,
  };
}