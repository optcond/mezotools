import { createPublicClient, http } from "viem";
import { createSupabase, EnvironmentType, MezoChain } from "@mtools/shared";
import {
  ApprovalEventParser,
  APPROVAL_FOR_ALL_TOPIC,
  APPROVAL_TOPIC,
} from "./approvalEvents";
import { BlockscoutClient } from "./blockscoutClient";
import type { RevokerConfig } from "./config";
import { buildApprovalStateKey, RevokerRepository } from "./repository";
import type { ApprovalState, IndexerCheckpoint } from "./types";

interface RevokerDependencies {
  repository?: RevokerRepository;
  blockscout: BlockscoutClient;
  parser: ApprovalEventParser;
  getCurrentBlock: () => Promise<number>;
}

export interface RevokerRunOptions {
  noDbRun?: boolean;
}

interface RangeScanResult {
  latestStates: Map<string, ApprovalState>;
  approvalLogs: number;
  approvalForAllLogs: number;
  totalLogs: number;
  parsedEvents: number;
}

interface RunStats {
  ranges: number;
  approvalLogs: number;
  approvalForAllLogs: number;
  totalLogs: number;
  parsedEvents: number;
  uniqueStates: number;
  upserted: number;
}

export interface RevokerStatus {
  currentBlock: number;
  safeBlock: number;
  historyStartBlock: number;
  checkpoint: IndexerCheckpoint | null;
  approvalStateCount: number | null;
  backfillComplete: boolean;
}

export interface ForwardFillStats extends RunStats {
  fromBlock: number;
  toBlock: number;
  flushedStates: number;
}

const emptyStats = (): RunStats => ({
  ranges: 0,
  approvalLogs: 0,
  approvalForAllLogs: 0,
  totalLogs: 0,
  parsedEvents: 0,
  uniqueStates: 0,
  upserted: 0,
});

const isNewerApproval = (next: ApprovalState, prev: ApprovalState) =>
  next.lastBlockNumber > prev.lastBlockNumber ||
  (next.lastBlockNumber === prev.lastBlockNumber &&
    next.lastLogIndex > prev.lastLogIndex);

const addLatestApprovalState = (
  cache: Map<string, ApprovalState>,
  approval: ApprovalState,
) => {
  const key = buildApprovalStateKey(approval);
  const existing = cache.get(key);
  if (!existing || isNewerApproval(approval, existing)) {
    cache.set(key, approval);
  }
};

const sortedLatestStates = (items: Iterable<ApprovalState>) =>
  [...items].sort((a, b) => {
    if (a.lastBlockNumber !== b.lastBlockNumber) {
      return a.lastBlockNumber - b.lastBlockNumber;
    }
    return a.lastLogIndex - b.lastLogIndex;
  });

export class Revoker {
  constructor(
    private readonly config: RevokerConfig,
    private readonly deps: RevokerDependencies,
  ) {}

  static createFromEnvConfig(
    config: RevokerConfig,
    options: RevokerRunOptions = {},
  ): Revoker {
    const client = createPublicClient({
      chain: { ...MezoChain, id: config.chainId },
      transport: http(config.mezoRpcUrl),
    });

    const repository =
      options.noDbRun || !config.supabaseUrl || !config.supabaseServiceKey
        ? undefined
        : new RevokerRepository(
            createSupabase({
              url: config.supabaseUrl,
              serviceKey: config.supabaseServiceKey,
            }),
          );

    return new Revoker(config, {
      repository,
      blockscout: new BlockscoutClient({
        baseUrl: config.blockscoutApiBaseUrl,
        cooldownMs: config.requestCooldownMs,
        timeoutMs: config.requestTimeoutMs,
      }),
      parser: new ApprovalEventParser(client, config.chainId),
      getCurrentBlock: async () => Number(await client.getBlockNumber()),
    });
  }

  async run(options: RevokerRunOptions = {}): Promise<RunStats> {
    const currentBlock = await this.deps.getCurrentBlock();
    const historyStartBlock = this.getHistoryStartBlock(currentBlock);
    if (options.noDbRun) {
      return this.runNoDbDryRun(historyStartBlock, currentBlock);
    }

    if (!this.deps.repository) {
      throw new Error("Revoker repository is not configured");
    }

    const safeBlock = Math.max(0, currentBlock - this.config.confirmationBlocks);
    let checkpoint = await this.deps.repository.getCheckpoint(
      this.config.indexerName,
    );

    if (!checkpoint) {
      checkpoint = {
        indexerName: this.config.indexerName,
        lastIndexedBlock: safeBlock,
        lastSafeBlock: safeBlock,
      };
      await this.deps.repository.upsertCheckpoint(checkpoint);
      console.log(
        `Initialized checkpoint at safe block ${safeBlock} for ${this.config.indexerName}`,
      );
    }

    console.log(
      `Current block ${currentBlock}, safe block ${safeBlock}, checkpoint last_indexed=${checkpoint.lastIndexedBlock}, last_safe=${checkpoint.lastSafeBlock}`,
    );

    if (checkpoint.lastIndexedBlock > historyStartBlock) {
      return this.runBackfill(checkpoint, historyStartBlock);
    }

    return this.runIncremental(checkpoint, safeBlock);
  }

  async getStatus(): Promise<RevokerStatus> {
    const currentBlock = await this.deps.getCurrentBlock();
    const safeBlock = Math.max(0, currentBlock - this.config.confirmationBlocks);
    const historyStartBlock = this.getHistoryStartBlock(currentBlock);
    const checkpoint = this.deps.repository
      ? await this.deps.repository.getCheckpoint(this.config.indexerName)
      : null;
    const approvalStateCount = this.deps.repository
      ? await this.deps.repository.getApprovalStateCount()
      : null;

    return {
      currentBlock,
      safeBlock,
      historyStartBlock,
      checkpoint,
      approvalStateCount,
      backfillComplete: Boolean(
        checkpoint && checkpoint.lastIndexedBlock <= historyStartBlock,
      ),
    };
  }

  async runForwardFillUntilDone(): Promise<ForwardFillStats> {
    if (!this.deps.repository) {
      throw new Error("Revoker repository is not configured");
    }

    const currentBlock = await this.deps.getCurrentBlock();
    const safeBlock = Math.max(0, currentBlock - this.config.confirmationBlocks);
    const historyStartBlock = this.getHistoryStartBlock(currentBlock);
    const fillCheckpointName = `${this.config.indexerName}:forward-fill`;
    let checkpoint = await this.deps.repository.getCheckpoint(fillCheckpointName);

    if (!checkpoint) {
      checkpoint = {
        indexerName: fillCheckpointName,
        lastIndexedBlock: historyStartBlock - 1,
        lastSafeBlock: safeBlock,
      };
      await this.deps.repository.upsertCheckpoint(checkpoint);
      console.log(
        `Initialized forward-fill checkpoint ${fillCheckpointName} at ${checkpoint.lastIndexedBlock}, target safe block ${safeBlock}`,
      );
    }

    const targetBlock = checkpoint.lastSafeBlock;
    const stats: ForwardFillStats = {
      ...emptyStats(),
      fromBlock: historyStartBlock,
      toBlock: targetBlock,
      flushedStates: 0,
    };
    const latestStates = new Map<string, ApprovalState>();
    let fromBlock = Math.max(historyStartBlock, checkpoint.lastIndexedBlock + 1);

    while (fromBlock <= targetBlock) {
      const toBlock = Math.min(
        targetBlock,
        fromBlock + this.config.blockRangeSize - 1,
      );
      const result = await this.fetchLatestApprovalStates(fromBlock, toBlock);

      for (const approval of result.latestStates.values()) {
        addLatestApprovalState(latestStates, approval);
      }

      this.addRangeStats(stats, result, 0);
      this.logRange("Forward-filled", fromBlock, toBlock, result, 0);
      console.log(
        `Forward-fill cache states=${latestStates.size}, checkpoint next=${toBlock}`,
      );

      if (latestStates.size >= this.config.forwardFillFlushSize) {
        stats.flushedStates += await this.flushForwardFillStates(latestStates);
      }

      await this.deps.repository.upsertCheckpoint({
        ...checkpoint,
        lastIndexedBlock: toBlock,
      });

      checkpoint = {
        ...checkpoint,
        lastIndexedBlock: toBlock,
      };
      fromBlock = toBlock + 1;
    }

    if (latestStates.size > 0) {
      stats.flushedStates += await this.flushForwardFillStates(latestStates);
    }

    await this.deps.repository.upsertCheckpoint({
      indexerName: this.config.indexerName,
      lastIndexedBlock: historyStartBlock,
      lastSafeBlock: targetBlock,
    });

    this.logSummary("Forward-fill summary", stats);
    console.log(
      `Forward-fill completed through ${targetBlock}. Main checkpoint last_indexed=${historyStartBlock}, last_safe=${targetBlock}`,
    );

    return stats;
  }

  private async flushForwardFillStates(
    latestStates: Map<string, ApprovalState>,
  ): Promise<number> {
    if (!this.deps.repository) {
      throw new Error("Revoker repository is not configured");
    }

    const rows = sortedLatestStates(latestStates.values());
    const upserted = await this.deps.repository.upsertApprovalStates(
      rows,
      this.config.upsertBatchSize,
    );
    console.log(
      `Forward-fill flushed ${rows.length} cached states, upserted=${upserted}`,
    );
    latestStates.clear();
    return upserted;
  }

  private async runBackfill(
    checkpoint: IndexerCheckpoint,
    historyStartBlock: number,
  ): Promise<RunStats> {
    if (!this.deps.repository) {
      throw new Error("Revoker repository is not configured");
    }

    const stats = emptyStats();
    let cursor = checkpoint.lastIndexedBlock;

    for (
      let range = 0;
      range < this.config.maxRangesPerRun && cursor > historyStartBlock;
      range++
    ) {
      const toBlock = cursor;
      const fromBlock = Math.max(
        historyStartBlock,
        toBlock - this.config.blockRangeSize + 1,
      );
      const result = await this.fetchLatestApprovalStates(fromBlock, toBlock);
      const parsed = sortedLatestStates(result.latestStates.values());
      const upserted = await this.deps.repository.upsertApprovalStates(
        parsed,
        this.config.upsertBatchSize,
      );
      const nextCursor = fromBlock > historyStartBlock ? fromBlock - 1 : 0;

      await this.deps.repository.upsertCheckpoint({
        ...checkpoint,
        lastIndexedBlock: nextCursor,
      });

      this.addRangeStats(stats, result, upserted);
      this.logRange("Backfilled", fromBlock, toBlock, result, upserted);
      console.log(`Backfill checkpoint next=${nextCursor}`);

      cursor = nextCursor;
    }

    this.logSummary("Backfill summary", stats);
    return stats;
  }

  private async runIncremental(
    checkpoint: IndexerCheckpoint,
    safeBlock: number,
  ): Promise<RunStats> {
    if (!this.deps.repository) {
      throw new Error("Revoker repository is not configured");
    }

    const stats = emptyStats();

    if (checkpoint.lastSafeBlock >= safeBlock) {
      console.log("No new safe blocks to scan");
      this.logSummary("Incremental summary", stats);
      return stats;
    }

    let fromBlock = checkpoint.lastSafeBlock + 1;
    for (
      let range = 0;
      range < this.config.maxRangesPerRun && fromBlock <= safeBlock;
      range++
    ) {
      const toBlock = Math.min(
        safeBlock,
        fromBlock + this.config.blockRangeSize - 1,
      );
      const result = await this.fetchLatestApprovalStates(fromBlock, toBlock);
      const parsed = sortedLatestStates(result.latestStates.values());
      const upserted = await this.deps.repository.upsertApprovalStates(
        parsed,
        this.config.upsertBatchSize,
      );

      await this.deps.repository.upsertCheckpoint({
        ...checkpoint,
        lastIndexedBlock: 0,
        lastSafeBlock: toBlock,
      });

      this.addRangeStats(stats, result, upserted);
      this.logRange("Indexed", fromBlock, toBlock, result, upserted);

      fromBlock = toBlock + 1;
    }

    this.logSummary("Incremental summary", stats);
    return stats;
  }

  private async runNoDbDryRun(
    historyStartBlock: number,
    currentBlock: number,
  ): Promise<RunStats> {
    console.log(
      `Running revoker with -nodbrun: scanning block ${historyStartBlock}-${currentBlock}, no Supabase reads or writes`,
    );

    const stats = emptyStats();
    const latestStates = new Map<string, ApprovalState>();
    let fromBlock = historyStartBlock;

    while (fromBlock <= currentBlock) {
      const toBlock = Math.min(
        currentBlock,
        fromBlock + this.config.blockRangeSize - 1,
      );
      const result = await this.fetchLatestApprovalStates(fromBlock, toBlock);

      for (const approval of result.latestStates.values()) {
        addLatestApprovalState(latestStates, approval);
      }

      this.addRangeStats(stats, result, 0);
      stats.uniqueStates = latestStates.size;
      this.logRange("Dry-run scanned", fromBlock, toBlock, result, 0);
      console.log(`Dry-run latest approval states cached=${latestStates.size}`);

      fromBlock = toBlock + 1;
    }

    stats.uniqueStates = latestStates.size;
    this.logSummary("Dry-run summary", stats);
    console.log(
      `Dry-run would write ${latestStates.size} approval state rows to approvals_state`,
    );

    return stats;
  }

  private async fetchLatestApprovalStates(
    fromBlock: number,
    toBlock: number,
  ): Promise<RangeScanResult> {
    const approvalLogs = await this.deps.blockscout.getLogs({
      fromBlock,
      toBlock,
      topic0: APPROVAL_TOPIC,
    });
    const approvalForAllLogs = await this.deps.blockscout.getLogs({
      fromBlock,
      toBlock,
      topic0: APPROVAL_FOR_ALL_TOPIC,
    });
    const latestStates = new Map<string, ApprovalState>();
    let parsedEvents = 0;

    const logs = [...approvalLogs, ...approvalForAllLogs];
    for (const log of logs) {
      const approval = await this.deps.parser.parse(log);
      if (!approval) continue;
      parsedEvents++;
      addLatestApprovalState(latestStates, approval);
    }

    return {
      latestStates,
      approvalLogs: approvalLogs.length,
      approvalForAllLogs: approvalForAllLogs.length,
      totalLogs: logs.length,
      parsedEvents,
    };
  }

  private addRangeStats(
    stats: RunStats,
    result: RangeScanResult,
    upserted: number,
  ) {
    stats.ranges++;
    stats.approvalLogs += result.approvalLogs;
    stats.approvalForAllLogs += result.approvalForAllLogs;
    stats.totalLogs += result.totalLogs;
    stats.parsedEvents += result.parsedEvents;
    stats.uniqueStates += result.latestStates.size;
    stats.upserted += upserted;
  }

  private logRange(
    prefix: string,
    fromBlock: number,
    toBlock: number,
    result: RangeScanResult,
    upserted: number,
  ) {
    console.log(
      `${prefix} approvals ${fromBlock}-${toBlock}: logs=${result.totalLogs}, approval=${result.approvalLogs}, approvalForAll=${result.approvalForAllLogs}, parsed=${result.parsedEvents}, latestStates=${result.latestStates.size}, upserted=${upserted}`,
    );
  }

  private logSummary(label: string, stats: RunStats) {
    console.log(
      `${label}: ranges=${stats.ranges}, logs=${stats.totalLogs}, approvalLogs=${stats.approvalLogs}, approvalForAllLogs=${stats.approvalForAllLogs}, parsed=${stats.parsedEvents}, latestStates=${stats.uniqueStates}, upserted=${stats.upserted}`,
    );
  }

  private getHistoryStartBlock(currentBlock: number): number {
    if (this.config.environment !== EnvironmentType.DEV) {
      return 0;
    }

    const startBlock = Math.max(
      0,
      currentBlock - this.config.devHistoryBlockLimit,
    );
    console.log(
      `Dev revoker run: limiting approval event history to last ${this.config.devHistoryBlockLimit} blocks, start=${startBlock}`,
    );
    return startBlock;
  }
}
