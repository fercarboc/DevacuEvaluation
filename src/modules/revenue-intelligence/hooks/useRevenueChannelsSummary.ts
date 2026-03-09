import { useEffect, useState } from "react";
import {
  getRevenueChannelsSummary,
  type RevenueChannelsSummary,
} from "../services/revenueChannels.service";

type Params = {
  orgId: string | null;
  propertyId: string | null;
  from: string;
  to: string;
};

const EMPTY_DATA: RevenueChannelsSummary = {
  summary: {
    totalRevenue: 0,
    totalSales: 0,
    adr: 0,
    topChannel: null,
  },
  channels: [],
};

export function useRevenueChannelsSummary({
  orgId,
  propertyId,
  from,
  to,
}: Params) {
  const [data, setData] = useState<RevenueChannelsSummary>(EMPTY_DATA);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!orgId || !propertyId || !from || !to) {
        setData(EMPTY_DATA);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await getRevenueChannelsSummary({
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
    summary: data.summary,
    channels: data.channels,
    loading,
    error,
  };
}