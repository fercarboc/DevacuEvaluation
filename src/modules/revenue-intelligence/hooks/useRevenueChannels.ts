import { useEffect, useState } from "react";
import { getRevenueChannelSummary } from "../services/revenueSales.service";

export type RevenueChannelSummary = {
  channel: string;
  totalSales: number;
  totalRevenue: number;
  adr: number;
};

export function useRevenueChannels(
  orgId: string,
  propertyId: string,
  from: string,
  to: string
) {

  const [data, setData] = useState<RevenueChannelSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {

    async function load() {

      if (!orgId || !propertyId) {
        setData([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {

        const result = await getRevenueChannelSummary(
          orgId,
          from,
          to,
          propertyId
        );

        setData(result);

      } catch (e) {

        console.error("RevenueChannels error", e);
        setError("No se pudieron cargar los canales");

      } finally {

        setLoading(false);

      }

    }

    load();

  }, [orgId, propertyId, from, to]);

  return {
    data,
    loading,
    error
  };

}