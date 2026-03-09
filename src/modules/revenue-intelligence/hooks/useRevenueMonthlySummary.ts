import { useEffect, useState } from "react";
import {
  getRevenueMonthlySummary,
  type RevenueMonthlySummary,
} from "../services/revenueMonthly.service";

type Params = {
  orgId: string | null;
  propertyId: string | null;
  from: string;
  to: string;
  compareFrom?: string;
  compareTo?: string;
};

const EMPTY_DATA: RevenueMonthlySummary = {
  property: null,
  totals: {
    occ: 0,
    rn: 0,
    adr: 0,
    revenue: 0,
    revpar: 0,
    days: 0,
    months: 0,
  },
  months: [],
  compareTotals: null,
  compareMonths: [],
  comparisonRows: [],
};

export function useRevenueMonthlySummary({
  orgId,
  propertyId,
  from,
  to,
  compareFrom,
  compareTo,
}: Params) {
  const [data, setData] = useState<RevenueMonthlySummary>(EMPTY_DATA);
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
        const result = await getRevenueMonthlySummary({
          orgId,
          propertyId,
          from,
          to,
          compareFrom,
          compareTo,
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
  }, [orgId, propertyId, from, to, compareFrom, compareTo]);

  return {
    data,
    property: data.property,
    totals: data.totals,
    months: data.months,
    compareTotals: data.compareTotals,
    compareMonths: data.compareMonths,
    comparisonRows: data.comparisonRows,
    loading,
    error,
  };
}