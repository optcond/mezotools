import { useQuery } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";

import { supabase } from "../integrations/supabase/client";
import type { Tables } from "../integrations/supabase/types";

export type Trove = Tables<"troves">;
export type Liquidation = Tables<"liquidations">;
export type Redemption = Tables<"redemptions"> & {
  affected_borrowers: string[] | null;
};
export type DailyMetric = Tables<"system_metrics_daily">;
export type IndexerState = Tables<"indexer_state"> | null;
export type BridgeAsset = Tables<"bridge_assets">;

interface MonitorDataResponse {
  troves: Trove[];
  liquidations: Liquidation[];
  redemptions: Redemption[];
  dailyMetrics: DailyMetric[];
  indexerState: IndexerState;
  bridgeAssets: BridgeAsset[];
}

const throwIfError = <T>(result: {
  data: T | null;
  error: PostgrestError | null;
}): T => {
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.data ?? ([] as T);
};

const handleMaybeSingle = <T>(result: {
  data: T | null;
  error: PostgrestError | null;
}): T | null => {
  if (result.error && result.error.code !== "PGRST116") {
    throw new Error(result.error.message);
  }
  return result.data ?? null;
};

const fetchMonitorData = async (): Promise<MonitorDataResponse> => {
  const [
    trovesRes,
    liqsRes,
    redsRes,
    metricsRes,
    indexerRes,
    bridgeAssetsRes,
  ] = await Promise.all([
      supabase
        .from("troves")
        .select("*")
        .order("collaterization_ratio", { ascending: true }),
      supabase
        .from("liquidations")
        .select("*")
        .order("block_timestamp", { ascending: false })
        .limit(50),
      supabase
        .from("redemptions")
        .select("*")
        .order("block_timestamp", { ascending: false })
        .limit(50),
      supabase
        .from("system_metrics_daily")
        .select("*")
        .order("day", { ascending: false })
        .limit(30),
      supabase
        .from("indexer_state")
        .select("*")
        .eq("key", "latest_block")
        .maybeSingle(),
      supabase
        .from("bridge_assets")
        .select("*")
        .order("token_symbol", { ascending: true }),
    ]);

  const troves = throwIfError<Trove[]>(trovesRes);
  const liquidations = throwIfError<Liquidation[]>(liqsRes);
  const redemptions = throwIfError<Redemption[]>(redsRes);
  const dailyMetrics = throwIfError<DailyMetric[]>(metricsRes);
  const indexerState = handleMaybeSingle(indexerRes);
  const bridgeAssets = throwIfError<BridgeAsset[]>(bridgeAssetsRes);

  return {
    troves,
    liquidations,
    redemptions,
    dailyMetrics,
    indexerState,
    bridgeAssets,
  };
};

export const useMonitorData = () => {
  const { data, error, isLoading, isFetching, refetch, dataUpdatedAt } =
    useQuery<MonitorDataResponse>({
      queryKey: ["monitor-data"],
      queryFn: fetchMonitorData,
      refetchInterval: 60000,
      staleTime: 30000,
      refetchOnWindowFocus: true,
      retry: 1,
    });

  return {
    troves: data?.troves ?? [],
    liquidations: data?.liquidations ?? [],
    redemptions: data?.redemptions ?? [],
    dailyMetrics: data?.dailyMetrics ?? [],
    indexerState: data?.indexerState ?? null,
    bridgeAssets: data?.bridgeAssets ?? [],
    isLoading,
    isFetching,
    error: error instanceof Error ? error.message : null,
    refetch,
    lastUpdatedAt: data ? new Date(dataUpdatedAt).toISOString() : null,
  };
};
