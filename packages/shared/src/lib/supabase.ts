import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  SupabaseOptions,
  TroveRow,
  LiquidationRow,
  RedemptionRow,
  PriceBlockRow,
  SystemSnapshotPriceRow,
  PriceRow,
  IndexerStateRow,
  SystemSnapshot,
  DailyMetricsRow,
  BridgeAssetRow,
  GaugeStateRow,
  GaugeRow,
  GaugeBribeRow,
} from "../supabase.types";
import type {
  FTroveData,
  TroveLiquidationEvent,
  TroveRedemptionEvent,
} from "../trove.types";
import type { BridgeAssetBalance } from "../bridge.types";
import type { GaugeIncentive } from "./gaugesFetcher";

export function createSupabase(options: SupabaseOptions): SupabaseClient {
  return createClient(options.url, options.serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        "X-MezoTools": "indexer",
      },
    },
  });
}

type QueryClient = Pick<SupabaseClient, "from">;

export class SupabaseRepository {
  private readonly queryClient: QueryClient;

  constructor(client: SupabaseClient, schema?: string) {
    this.queryClient = schema
      ? (client.schema(schema) as unknown as QueryClient)
      : client;
  }

  private from(table: string) {
    return this.queryClient.from(table);
  }

  async upsertTroves(troves: FTroveData[]): Promise<void> {
    if (troves.length === 0) {
      await this.clearTroves();
      return;
    }

    const now = new Date().toISOString();
    const owners = new Set<string>();
    const rows: TroveRow[] = troves.map((trove) => {
      const owner = trove.owner.toLowerCase();
      owners.add(owner);
      return {
        owner,
        collateral: trove.collateral,
        principal_debt: trove.principal_debt,
        interest: trove.interest,
        collaterization_ratio: Number.isFinite(trove.collaterizationRatio)
          ? trove.collaterizationRatio
          : 0,
        updated_at: now,
      };
    });

    const { error } = await this.from("troves").upsert(rows, {
      onConflict: "owner",
    });

    if (error) {
      throw new Error(`Failed to upsert troves: ${error.message}`);
    }

    await this.removeMissingTroves(Array.from(owners));
  }

  private async clearTroves(): Promise<void> {
    const { data, error } = await this.from("troves")
      .select("owner")
      .returns<{ owner: string | null }[]>();
    if (error) {
      throw new Error(
        `Failed to load troves before clearing: ${error.message}`
      );
    }
    const owners = data?.map((row) => row.owner) ?? [];
    if (owners.length === 0) {
      return;
    }

    const { error: deleteError } = await this.from("troves")
      .delete()
      .in("owner", owners);
    if (deleteError) {
      throw new Error(`Failed to clear troves: ${deleteError.message}`);
    }
  }

  private async removeMissingTroves(currentOwners: string[]): Promise<void> {
    const { data, error } = await this.from("troves")
      .select("owner")
      .returns<{ owner: string | null }[]>();
    if (error) {
      throw new Error(`Failed to load troves for pruning: ${error.message}`);
    }

    const ownerSet = new Set(currentOwners.map((owner) => owner.toLowerCase()));
    const staleOwners = (data ?? [])
      .map((row) => row.owner?.toLowerCase())
      .filter((owner): owner is string => !!owner && !ownerSet.has(owner));

    if (staleOwners.length === 0) {
      return;
    }

    const { error: deleteError } = await this.from("troves")
      .delete()
      .in("owner", staleOwners);
    if (deleteError) {
      throw new Error(`Failed to prune stale troves: ${deleteError.message}`);
    }
  }

  async getLatestEventBlock(
    table: "liquidations" | "redemptions"
  ): Promise<number | null> {
    const { data, error } = await this.from(table)
      .select("block_number")
      .order("block_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      throw new Error(
        `Failed to fetch latest block for ${table}: ${error.message}`
      );
    }

    return data?.block_number ?? null;
  }

  async getLastProcessedBlock(): Promise<number> {
    const { data, error } = await this.from("indexer_state")
      .select("block_number")
      .eq("key", "latest_block")
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to fetch last processed block: ${error.message}`);
    }

    return data?.block_number ?? -1;
  }

  async upsertLiquidations(events: TroveLiquidationEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    const rows: LiquidationRow[] = events.map((event) => ({
      id: `${event.txHash}:${event.logIndex}`,
      borrower: event.borrower.toLowerCase(),
      debt: event.debt,
      collateral: event.collateral,
      operation: event.operation,
      tx_hash: event.txHash,
      block_number: event.blockNumber,
      log_index: event.logIndex,
      block_timestamp: new Date(event.timestamp * 1000).toISOString(),
      tx_status: event.status,
    }));

    const { error } = await this.from("liquidations").upsert(rows, {
      onConflict: "id",
    });

    if (error) {
      throw new Error(`Failed to upsert liquidations: ${error.message}`);
    }
  }

  async upsertRedemptions(events: TroveRedemptionEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    const rows: RedemptionRow[] = events.map((event) => ({
      id: `${event.txHash}:${event.logIndex}`,
      attempted_amount: event.attemptedAmount,
      actual_amount: event.actualAmount,
      collateral_sent: event.collateralSent,
      collateral_fee: event.collateralFee,
      affected_borrowers:
        event.affectedBorrowers && event.affectedBorrowers.length > 0
          ? event.affectedBorrowers
          : null,
      tx_hash: event.txHash,
      block_number: event.blockNumber,
      log_index: event.logIndex,
      block_timestamp: new Date(event.timestamp * 1000).toISOString(),
      tx_status: event.status,
    }));

    const { error } = await this.from("redemptions").upsert(rows, {
      onConflict: "id",
    });

    if (error) {
      throw new Error(`Failed to upsert redemptions: ${error.message}`);
    }
  }

  async getLastPriceFeedBlock(source: string): Promise<number | null> {
    const { data, error } = await this.from("price_feeds")
      .select("block_number")
      .eq("source", source)
      .order("block_number", { ascending: false })
      .limit(1)
      .maybeSingle<PriceBlockRow>();

    if (error && error.code !== "PGRST116") {
      throw new Error(
        `Failed to fetch last price feed block for ${source}: ${error.message}`
      );
    }

    return data?.block_number ?? null;
  }

  async getAverageMusdToUsdcPriceSince(since: Date): Promise<number | null> {
    const { data, error } = await this.from("system_snapshots")
      .select("musd_to_usdc_price")
      .gte("recorded_at", since.toISOString())
      .returns<SystemSnapshotPriceRow[]>();

    if (error) {
      throw new Error(
        `Failed to fetch system snapshots for average price: ${error.message}`
      );
    }

    const rows = data ?? [];
    const prices = rows
      .map((row) => row.musd_to_usdc_price)
      .filter((price): price is number => price !== null);

    if (prices.length === 0) {
      return null;
    }

    const total = prices.reduce((acc, price) => acc + price, 0);
    return total / prices.length;
  }

  async recordPrice(
    price: number,
    source: string,
    blockNumber: number
  ): Promise<void> {
    const row: PriceRow = {
      id: crypto.randomUUID(),
      price,
      source,
      block_number: blockNumber,
      recorded_at: new Date().toISOString(),
    };

    const { error } = await this.from("price_feeds").upsert(row, {
      onConflict: "id",
    });

    if (error) {
      throw new Error(`Failed to record price: ${error.message}`);
    }
  }

  async updateIndexerState(blockNumber: number): Promise<void> {
    const row: IndexerStateRow = {
      key: "latest_block",
      block_number: blockNumber,
      updated_at: new Date().toISOString(),
    };

    const { error } = await this.from("indexer_state").upsert(row, {
      onConflict: "key",
    });

    if (error) {
      throw new Error(`Failed to update indexer state: ${error.message}`);
    }
  }

  async storeSystemSnapshot(snapshot: SystemSnapshot): Promise<void> {
    const row = {
      id: `${Date.now()}`,
      collateral: snapshot.collateral,
      debt: snapshot.debt,
      tcr: snapshot.ratio,
      btc_price: snapshot.btcPrice,
      musd_to_usdc_price: snapshot.musdToUsdcPrice,
      recorded_at: new Date().toISOString(),
    };

    const { error } = await this.from("system_snapshots").insert(row);

    if (error) {
      throw new Error(`Failed to store system snapshot: ${error.message}`);
    }
  }

  async storeDailyMetrics(
    snapshot: SystemSnapshot,
    troveCount: number
  ): Promise<void> {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    const dayKey = day.toISOString().slice(0, 10);

    const row: DailyMetricsRow = {
      day: dayKey,
      trove_count: troveCount,
      collateral: snapshot.collateral,
      debt: snapshot.debt,
      tcr: snapshot.ratio,
      btc_price: snapshot.btcPrice,
      updated_at: new Date().toISOString(),
    };

    const { error } = await this.from("system_metrics_daily").upsert(row, {
      onConflict: "day",
    });

    if (error) {
      throw new Error(`Failed to upsert daily metrics: ${error.message}`);
    }
  }

  async upsertBridgeAssets(assets: BridgeAssetBalance[]): Promise<void> {
    if (assets.length === 0) {
      return;
    }

    const updatedAt = new Date().toISOString();
    const rows: BridgeAssetRow[] = assets.map((asset) => ({
      token_symbol: asset.tokenSymbol,
      token_name: asset.tokenSymbol,
      ethereum_symbol: asset.ethereumSymbol,
      mezo_address: asset.mezoAddress,
      ethereum_address: asset.ethereumAddress,
      bridge_address: asset.bridgeAddress,
      balance_raw: asset.balanceRaw,
      balance_formatted: asset.balanceFormatted,
      decimals: asset.decimals,
      updated_at: updatedAt,
    }));

    const { error } = await this.from("bridge_assets").upsert(rows, {
      onConflict: "token_symbol",
    });

    if (error) {
      throw new Error(`Failed to upsert bridge assets: ${error.message}`);
    }
  }

  async upsertGaugeState(state: {
    epochEnd: bigint;
    voteEnd: bigint;
    veSupplyLive: bigint;
    totalVotesSnapshot: bigint;
    totalVotesTracked: bigint;
    veSupplyEpochStart: bigint;
  }): Promise<void> {
    const row: GaugeStateRow = {
      key: "current",
      epoch_end: Number(state.epochEnd),
      vote_end: Number(state.voteEnd),
      ve_supply_live: state.veSupplyLive.toString(),
      total_votes_snapshot: state.totalVotesSnapshot.toString(),
      total_votes_tracked: state.totalVotesTracked.toString(),
      ve_supply_epoch_start: state.veSupplyEpochStart.toString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await this.from("gauge_state").upsert(row, {
      onConflict: "key",
    });

    if (error) {
      throw new Error(`Failed to upsert gauge state: ${error.message}`);
    }
  }

  async upsertGauges(gauges: GaugeIncentive[]): Promise<void> {
    if (gauges.length === 0) {
      return;
    }

    const updatedAt = new Date().toISOString();
    const rows: GaugeRow[] = gauges.map((gauge) => {
      const bribes: GaugeBribeRow[] = gauge.rewards.map((reward) => ({
        token: reward.token.toLowerCase(),
        amount: reward.amount.toString(),
      }));

      return {
        gauge: gauge.gauge.toLowerCase(),
        pool: gauge.pool.toLowerCase(),
        pool_name: gauge.poolName ?? null,
        bribe: gauge.bribe.toLowerCase(),
        votes: gauge.votes.toString(),
        duration: Number(gauge.duration),
        epoch_start: Number(gauge.epochStart),
        bribes,
        updated_at: updatedAt,
      };
    });

    const { error } = await this.from("gauges").upsert(rows, {
      onConflict: "gauge",
    });

    if (error) {
      throw new Error(`Failed to upsert gauges: ${error.message}`);
    }
  }
}
