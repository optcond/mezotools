import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type PriceFeedRow = Tables<"price_feeds">;

const MS_IN_HOUR = 60 * 60 * 1000;
const DEFAULT_QUERY_LIMIT = 5000;

interface FetchPriceFeedHistoryOptions {
  source: string;
  hours: number;
  limit?: number;
}

const fetchPriceFeedHistory = async ({
  source,
  hours,
  limit,
}: FetchPriceFeedHistoryOptions): Promise<PriceFeedRow[]> => {
  const windowStart = new Date(Date.now() - hours * MS_IN_HOUR).toISOString();

  const { data, error } = await supabase
    .from("price_feeds")
    .select("*")
    .eq("source", source)
    .gte("recorded_at", windowStart)
    .order("recorded_at", { ascending: true })
    .limit(limit ?? DEFAULT_QUERY_LIMIT);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
};

interface PricePoint {
  timestamp: string;
  blockNumber: number;
  price: number;
}

interface PriceFeedStats {
  latestPrice: number | null;
  change: number | null;
  percentChange: number | null;
  high: number | null;
  low: number | null;
  latestBlockNumber: number | null;
  lastUpdated: string | null;
}

export interface UsePriceFeedHistoryOptions {
  source: string;
  hours: number;
  limit?: number;
}

export const usePriceFeedHistory = ({
  source,
  hours,
  limit,
}: UsePriceFeedHistoryOptions) => {
  const query = useQuery<PriceFeedRow[]>({
    queryKey: ["price-feed-history", source, hours, limit],
    queryFn: () => fetchPriceFeedHistory({ source, hours, limit }),
    refetchInterval: 600000,
    staleTime: 30000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const { points, stats } = useMemo(() => {
    const pricePoints: PricePoint[] =
      query.data?.map((row) => ({
        timestamp: row.recorded_at,
        blockNumber: row.block_number,
        price: row.price,
      })) ?? [];

    if (pricePoints.length === 0) {
      return {
        points: pricePoints,
        stats: {
          latestPrice: null,
          change: null,
          percentChange: null,
          high: null,
          low: null,
          latestBlockNumber: null,
          lastUpdated: null,
        } satisfies PriceFeedStats,
      };
    }

    const firstPoint = pricePoints[0];
    const latestPoint = pricePoints[pricePoints.length - 1];

    const prices = pricePoints.map((point) => point.price);
    const high = Math.max(...prices);
    const low = Math.min(...prices);

    const change = latestPoint.price - firstPoint.price;
    const percentChange =
      firstPoint.price !== 0 ? (change / firstPoint.price) * 100 : null;

    return {
      points: pricePoints,
      stats: {
        latestPrice: latestPoint.price,
        change,
        percentChange,
        high,
        low,
        latestBlockNumber: latestPoint.blockNumber,
        lastUpdated: latestPoint.timestamp,
      } satisfies PriceFeedStats,
    };
  }, [query.data]);

  return {
    ...query,
    pricePoints: points,
    stats,
  };
};
