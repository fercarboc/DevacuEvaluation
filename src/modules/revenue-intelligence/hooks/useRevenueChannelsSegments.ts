import { useEffect, useState } from "react";
import { supabase } from "@/services/supabase";

export type RevenueChannelsSegmentsMode = "channel" | "segment" | "cross";

export type RevenueChannelsSegmentsRow = {
  label: string;
  channel: string | null;
  segment: string | null;
  totalSales: number;
  totalRevenue: number;
  adr: number;
  share: number;
};

export type RevenueChannelsSegmentsSummary = {
  totalRevenue: number;
  totalSales: number;
  adr: number;
  topLabel: string | null;
};

type Params = {
  orgId: string | null;
  propertyId: string | null;
  from: string;
  to: string;
  mode: RevenueChannelsSegmentsMode;
  enabled?: boolean;
};

type ResponseBody = {
  ok?: boolean;
  error?: string;
  detail?: string;
  data?: {
    summary?: RevenueChannelsSegmentsSummary;
    rows?: RevenueChannelsSegmentsRow[];
  };
};

const EMPTY_SUMMARY: RevenueChannelsSegmentsSummary = {
  totalRevenue: 0,
  totalSales: 0,
  adr: 0,
  topLabel: null,
};

export function useRevenueChannelsSegments({
  orgId,
  propertyId,
  from,
  to,
  mode,
  enabled = true,
}: Params) {
  const [summary, setSummary] = useState<RevenueChannelsSegmentsSummary>(EMPTY_SUMMARY);
  const [rows, setRows] = useState<RevenueChannelsSegmentsRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!enabled || !orgId || !propertyId || !from || !to) {
        setSummary(EMPTY_SUMMARY);
        setRows([]);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      const { data, error } = await supabase.functions.invoke<ResponseBody>(
        "revenue_channels_segments",
        {
          body: {
            org_id: orgId,
            property_id: propertyId,
            from,
            to,
            mode,
            app_id: "DEBACU_EVAL",
          },
        }
      );

      if (cancelled) return;

      if (error) {
        setSummary(EMPTY_SUMMARY);
        setRows([]);
        setError(error.message || "Error cargando canales y segmentos");
        setLoading(false);
        return;
      }

      if (!data?.ok) {
        setSummary(EMPTY_SUMMARY);
        setRows([]);
        setError(data?.detail || data?.error || "Error cargando canales y segmentos");
        setLoading(false);
        return;
      }

      setSummary(data?.data?.summary ?? EMPTY_SUMMARY);
      setRows(data?.data?.rows ?? []);
      setError(null);
      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [orgId, propertyId, from, to, mode, enabled]);

  return { summary, rows, loading, error };
}