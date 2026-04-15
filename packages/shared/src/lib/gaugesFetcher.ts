import { Abi, PublicClient } from "viem";
import {
  BribeVotingRewardAbi,
  PoolAbi,
  VoterAbi,
  VotingEscrowAbi,
} from "../abi/Gauges";
import { ERC20MetaAbi, PoolMarketAbi } from "../abi/PoolMarket";
import { AppContracts, MezoTokens } from "../types";

const DEFAULT_MULTICALL_BATCH_SIZE = 250;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MEZO_TOKEN_ADDRESS = "0x7B7c000000000000000000000000000000000001";

const KNOWN_TOKEN_SYMBOLS = new Map<string, string>([
  [MEZO_TOKEN_ADDRESS.toLowerCase(), "MEZO"],
  ...Object.entries(MezoTokens).map(([symbol, token]) => [
    token.address.toLowerCase(),
    symbol,
  ] as const),
]);

interface PoolTokenPair {
  token0: `0x${string}`;
  token1: `0x${string}`;
}

const shortAddress = (value: string) => `${value.slice(0, 6)}...${value.slice(-4)}`;

export interface GaugeBribeTokenReward {
  token: `0x${string}`;
  amount: bigint;
  epochStart: bigint;
  previousEpochAmount?: bigint;
  nextEpochAmount?: bigint;
}

export interface GaugeIncentive {
  pool: `0x${string}`;
  poolName?: string;
  gauge: `0x${string}`;
  bribe: `0x${string}`;
  fee: `0x${string}`;
  votes: bigint;
  duration: bigint;
  epochStart: bigint;
  rewards: GaugeBribeTokenReward[];
  fees: GaugeBribeTokenReward[];
}

export interface GaugesFetcherConfig {
  poolFactoryAddress?: `0x${string}`;
  voterAddress?: `0x${string}`;
  veAddress?: `0x${string}`;
  multicallBatchSize?: number;
  probeAdjacentEpochs?: boolean;
}

export interface GaugesFetchOptions {
  multicallBatchSize?: number;
  probeAdjacentEpochs?: boolean;
}

interface GaugeEntry {
  pool: `0x${string}`;
  poolName?: string;
  gauge: `0x${string}`;
  votes: bigint;
  bribe: `0x${string}`;
  fee: `0x${string}`;
}

interface BribeMeta {
  duration: bigint;
  epochStart: bigint;
  rewardCount: number;
  rewards: `0x${string}`[];
}

interface BribeRewards {
  duration: bigint;
  epochStart: bigint;
  rewards: GaugeBribeTokenReward[];
}

type MulticallContract = {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
};
type MulticallResult = {
  status: "success" | "failure";
  result?: unknown;
};

export class GaugesFetcher {
  constructor(
    private readonly client: PublicClient,
    private readonly config: GaugesFetcherConfig = {}
  ) {}

  async fetchGaugeIncentives(
    options: GaugesFetchOptions = {}
  ): Promise<GaugeIncentive[]> {
    const voterAddress = this.config.voterAddress ?? AppContracts.MEZO_VOTER;
    const multicallBatchSize =
      options.multicallBatchSize ??
      this.config.multicallBatchSize ??
      DEFAULT_MULTICALL_BATCH_SIZE;
    const probeAdjacentEpochs =
      options.probeAdjacentEpochs ?? this.config.probeAdjacentEpochs ?? false;

    // Enumerate pools from the voter (includes MUSD Savings and other non-factory pools)
    const poolCount = (await this.client.readContract({
      address: voterAddress,
      abi: VoterAbi,
      functionName: "length",
    })) as bigint;

    const poolCalls: MulticallContract[] = [];
    for (let i = 0n; i < poolCount; i++) {
      poolCalls.push({
        address: voterAddress,
        abi: VoterAbi,
        functionName: "pools",
        args: [i],
      } as const);
    }

    const poolResults = await this.multicallInChunks(
      poolCalls,
      multicallBatchSize
    );

    const pools: `0x${string}`[] = [];
    for (const result of poolResults) {
      if (
        result.status === "success" &&
        result.result &&
        result.result !== "0x"
      ) {
        pools.push(result.result as `0x${string}`);
      }
    }

    // Try to get pool name via the PoolAbi "name()" function
    const poolNameCalls: MulticallContract[] = pools.map((pool) => ({
      address: pool,
      abi: PoolAbi,
      functionName: "name",
    }));

    const poolNameResults = await this.multicallInChunks(
      poolNameCalls,
      multicallBatchSize
    );

    // For pools without a name, try fetching token0/token1 to build a fallback name
    const missingPoolNameIndexes = pools
      .map((pool, index) => {
        const result = poolNameResults[index];
        return result?.status === "success" && result.result ? null : index;
      })
      .filter((index): index is number => index !== null);

    const poolPairCalls = missingPoolNameIndexes.flatMap((index) => [
      { address: pools[index], abi: PoolMarketAbi, functionName: "token0" },
      { address: pools[index], abi: PoolMarketAbi, functionName: "token1" },
    ]);
    const poolPairResults = await this.multicallInChunks(
      poolPairCalls,
      multicallBatchSize
    );
    const poolPairsByPool = new Map<string, PoolTokenPair>();
    const tokenAddresses = new Set<`0x${string}`>();
    let poolPairIdx = 0;
    for (const index of missingPoolNameIndexes) {
      const token0Result = poolPairResults[poolPairIdx++];
      const token1Result = poolPairResults[poolPairIdx++];
      if (
        token0Result?.status !== "success" ||
        token1Result?.status !== "success" ||
        !token0Result.result ||
        !token1Result.result
      ) {
        continue;
      }
      const token0 = token0Result.result as `0x${string}`;
      const token1 = token1Result.result as `0x${string}`;
      poolPairsByPool.set(pools[index].toLowerCase(), { token0, token1 });
      tokenAddresses.add(token0);
      tokenAddresses.add(token1);
    }

    const unknownTokenAddresses = Array.from(tokenAddresses).filter(
      (token) => !KNOWN_TOKEN_SYMBOLS.has(token.toLowerCase())
    );
    const tokenSymbolResults = await this.multicallInChunks(
      unknownTokenAddresses.map((token) => ({
        address: token,
        abi: ERC20MetaAbi,
        functionName: "symbol",
      })),
      multicallBatchSize
    );
    const tokenSymbolsByAddress = new Map<string, string>(KNOWN_TOKEN_SYMBOLS);
    for (let i = 0; i < unknownTokenAddresses.length; i++) {
      const result = tokenSymbolResults[i];
      if (result?.status === "success" && typeof result.result === "string") {
        tokenSymbolsByAddress.set(
          unknownTokenAddresses[i].toLowerCase(),
          result.result
        );
      }
    }

    const fallbackPoolNamesByPool = new Map<string, string>();
    for (const [pool, pair] of poolPairsByPool.entries()) {
      const token0Symbol =
        tokenSymbolsByAddress.get(pair.token0.toLowerCase()) ??
        shortAddress(pair.token0);
      const token1Symbol =
        tokenSymbolsByAddress.get(pair.token1.toLowerCase()) ??
        shortAddress(pair.token1);
      fallbackPoolNamesByPool.set(pool, `${token0Symbol} / ${token1Symbol}`);
    }

    const gaugeCalls = pools.flatMap((pool) => [
      {
        address: voterAddress,
        abi: VoterAbi,
        functionName: "gauges",
        args: [pool],
      } as const,
      {
        address: voterAddress,
        abi: VoterAbi,
        functionName: "weights",
        args: [pool],
      } as const,
    ]);

    const gaugeResults = await this.multicallInChunks(
      gaugeCalls,
      multicallBatchSize
    );

    const gaugeEntries: GaugeEntry[] = [];
    let gaugeIdx = 0;
    for (let i = 0; i < pools.length; i++) {
      const pool = pools[i];
      const gaugeResult = gaugeResults[gaugeIdx++];
      const weightResult = gaugeResults[gaugeIdx++];
      const poolNameResult = poolNameResults[i];
      if (
        gaugeResult?.status !== "success" ||
        !gaugeResult.result ||
        gaugeResult.result === ZERO_ADDRESS
      ) {
        continue;
      }
      const votes =
        weightResult?.status === "success" && weightResult.result
          ? (weightResult.result as bigint)
          : 0n;
      const poolName =
        poolNameResult?.status === "success" && poolNameResult.result
          ? (poolNameResult.result as string)
          : fallbackPoolNamesByPool.get(pool.toLowerCase());
      gaugeEntries.push({
        pool,
        poolName,
        gauge: gaugeResult.result as `0x${string}`,
        votes,
        bribe: ZERO_ADDRESS,
        fee: ZERO_ADDRESS,
      });
    }

    const bribeCalls = gaugeEntries.map((entry) => ({
      address: voterAddress,
      abi: VoterAbi,
      functionName: "gaugeToBribe",
      args: [entry.gauge],
    }));

    const bribeResults = await this.multicallInChunks(
      bribeCalls,
      multicallBatchSize
    );

    for (let i = 0; i < gaugeEntries.length; i++) {
      const bribeResult = bribeResults[i];
      if (
        bribeResult?.status === "success" &&
        bribeResult.result &&
        bribeResult.result !== ZERO_ADDRESS
      ) {
        gaugeEntries[i].bribe = bribeResult.result as `0x${string}`;
      }
    }

    const feeCalls = gaugeEntries.map((entry) => ({
      address: voterAddress,
      abi: VoterAbi,
      functionName: "gaugeToFees",
      args: [entry.gauge],
    }));

    const feeResults = await this.multicallInChunks(
      feeCalls,
      multicallBatchSize
    );

    for (let i = 0; i < gaugeEntries.length; i++) {
      const feeResult = feeResults[i];
      if (
        feeResult?.status === "success" &&
        feeResult.result &&
        feeResult.result !== ZERO_ADDRESS
      ) {
        gaugeEntries[i].fee = feeResult.result as `0x${string}`;
      }
    }

    // Collect unique reward-contract addresses (both bribe and fee share the same ABI)
    const bribeAddresses = Array.from(
      new Set(
        [
          ...gaugeEntries.map((entry) => entry.bribe),
          ...gaugeEntries.map((entry) => entry.fee),
        ].filter((address) => address !== ZERO_ADDRESS)
      )
    );

    const bribeMetaCalls = bribeAddresses.flatMap((bribe) => [
      {
        address: bribe,
        abi: BribeVotingRewardAbi,
        functionName: "rewardsListLength",
      } as const,
      {
        address: bribe,
        abi: BribeVotingRewardAbi,
        functionName: "duration",
      } as const,
    ]);

    const bribeMetaResults = await this.multicallInChunks(
      bribeMetaCalls,
      multicallBatchSize
    );

    const bribeMeta = new Map<string, BribeMeta>();
    let bribeMetaIdx = 0;
    const block = await this.client.getBlock();
    for (const bribe of bribeAddresses) {
      const lengthResult = bribeMetaResults[bribeMetaIdx++];
      const durationResult = bribeMetaResults[bribeMetaIdx++];
      if (
        lengthResult?.status !== "success" ||
        durationResult?.status !== "success" ||
        !lengthResult.result ||
        !durationResult.result
      ) {
        continue;
      }
      const duration = durationResult.result as bigint;
      const epochStart =
        duration > 0n ? (block.timestamp / duration) * duration : 0n;
      bribeMeta.set(bribe, {
        duration,
        epochStart,
        rewardCount: Number(lengthResult.result as bigint),
        rewards: [],
      });
    }

    const rewardTokenCalls: MulticallContract[] = [];
    const rewardTokenMeta: Array<{ bribe: `0x${string}` }> = [];
    for (const [bribe, meta] of bribeMeta.entries()) {
      for (let i = 0; i < meta.rewardCount; i++) {
        rewardTokenCalls.push({
          address: bribe as `0x${string}`,
          abi: BribeVotingRewardAbi,
          functionName: "rewards",
          args: [BigInt(i)],
        });
        rewardTokenMeta.push({ bribe: bribe as `0x${string}` });
      }
      meta.rewards = [];
    }

    const rewardTokenResults = await this.multicallInChunks(
      rewardTokenCalls,
      multicallBatchSize
    );

    for (let i = 0; i < rewardTokenResults.length; i++) {
      const result = rewardTokenResults[i];
      if (result?.status !== "success" || !result.result) continue;
      const token = result.result as `0x${string}`;
      const bribe = rewardTokenMeta[i].bribe;
      const meta = bribeMeta.get(bribe);
      if (!meta) continue;
      meta.rewards.push(token);
    }

    const rewardAmountCalls: MulticallContract[] = [];
    const rewardAmountMeta: Array<{
      bribe: `0x${string}`;
      token: `0x${string}`;
    }> = [];
    for (const [bribe, meta] of bribeMeta.entries()) {
      for (const token of meta.rewards) {
        rewardAmountCalls.push({
          address: bribe as `0x${string}`,
          abi: BribeVotingRewardAbi,
          functionName: "tokenRewardsPerEpoch",
          args: [token, meta.epochStart],
        });
        rewardAmountMeta.push({ bribe: bribe as `0x${string}`, token });
      }
    }

    const rewardAmountResults = await this.multicallInChunks(
      rewardAmountCalls,
      multicallBatchSize
    );

    const rewardAmounts = new Map<string, bigint>();
    for (let i = 0; i < rewardAmountResults.length; i++) {
      const result = rewardAmountResults[i];
      const meta = rewardAmountMeta[i];
      const key = `${meta.bribe}:${meta.token}`;
      if (result?.status === "success" && result.result) {
        rewardAmounts.set(key, result.result as bigint);
      } else {
        rewardAmounts.set(key, 0n);
      }
    }

    const previousEpochAmounts = new Map<string, bigint>();
    const nextEpochAmounts = new Map<string, bigint>();
    if (probeAdjacentEpochs) {
      const fallbackCalls: MulticallContract[] = [];
      const fallbackMeta: Array<{
        key: string;
        direction: "previous" | "next";
      }> = [];

      for (const [bribe, meta] of bribeMeta.entries()) {
        if (meta.duration === 0n) continue;
        for (const token of meta.rewards) {
          const key = `${bribe}:${token}`;
          if (rewardAmounts.get(key) !== 0n) continue;
          if (meta.epochStart >= meta.duration) {
            fallbackCalls.push({
              address: bribe as `0x${string}`,
              abi: BribeVotingRewardAbi,
              functionName: "tokenRewardsPerEpoch",
              args: [token, meta.epochStart - meta.duration],
            });
            fallbackMeta.push({ key, direction: "previous" });
          }
          fallbackCalls.push({
            address: bribe as `0x${string}`,
            abi: BribeVotingRewardAbi,
            functionName: "tokenRewardsPerEpoch",
            args: [token, meta.epochStart + meta.duration],
          });
          fallbackMeta.push({ key, direction: "next" });
        }
      }

      const fallbackResults = await this.multicallInChunks(
        fallbackCalls,
        multicallBatchSize
      );

      for (let i = 0; i < fallbackResults.length; i++) {
        const result = fallbackResults[i];
        const meta = fallbackMeta[i];
        if (result?.status !== "success" || !result.result) continue;
        const amount = result.result as bigint;
        if (meta.direction === "previous") {
          previousEpochAmounts.set(meta.key, amount);
        } else {
          nextEpochAmounts.set(meta.key, amount);
        }
      }
    }

    const bribeRewards = new Map<string, BribeRewards>();
    for (const [bribe, meta] of bribeMeta.entries()) {
      const rewards = meta.rewards.map((token) => {
        const key = `${bribe}:${token}`;
        return {
          token,
          amount: rewardAmounts.get(key) ?? 0n,
          epochStart: meta.epochStart,
          previousEpochAmount: previousEpochAmounts.get(key),
          nextEpochAmount: nextEpochAmounts.get(key),
        };
      });
      bribeRewards.set(bribe, {
        duration: meta.duration,
        epochStart: meta.epochStart,
        rewards,
      });
    }

    return gaugeEntries.map((entry) => {
      const bribeMeta = bribeRewards.get(entry.bribe);
      const feeMeta = bribeRewards.get(entry.fee);
      return {
        pool: entry.pool,
        poolName: entry.poolName,
        gauge: entry.gauge,
        bribe: entry.bribe,
        fee: entry.fee,
        votes: entry.votes,
        duration: bribeMeta?.duration ?? feeMeta?.duration ?? 0n,
        epochStart: bribeMeta?.epochStart ?? feeMeta?.epochStart ?? 0n,
        rewards: bribeMeta?.rewards ?? [],
        fees: feeMeta?.rewards ?? [],
      };
    });
  }

  async getTotalVotingPower(): Promise<bigint> {
    const voterAddress = this.config.voterAddress ?? AppContracts.MEZO_VOTER;
    return (await this.client.readContract({
      address: voterAddress,
      abi: VoterAbi,
      functionName: "totalWeight",
    })) as bigint;
  }

  async getTotalVeSupply(): Promise<bigint> {
    const veAddress = this.config.veAddress ?? AppContracts.MEZO_VE;
    return (await this.client.readContract({
      address: veAddress,
      abi: VotingEscrowAbi,
      functionName: "totalVotingPower",
    })) as bigint;
  }

  async getTotalVeSupplyAt(timestamp: bigint): Promise<bigint | null> {
    const veAddress = this.config.veAddress ?? AppContracts.MEZO_VE;
    try {
      return (await this.client.readContract({
        address: veAddress,
        abi: VotingEscrowAbi,
        functionName: "totalVotingPowerAt",
        args: [timestamp],
      })) as bigint;
    } catch {
      return null;
    }
  }

  async getTotalVeSupplyAtEpochStart(
    durationSeconds: bigint = 7n * 24n * 60n * 60n
  ): Promise<{ epochStart: bigint; supply: bigint } | null> {
    const block = await this.client.getBlock();
    const epochStart =
      durationSeconds > 0n
        ? (block.timestamp / durationSeconds) * durationSeconds
        : 0n;
    const supply = await this.getTotalVeSupplyAt(epochStart);
    if (supply === null) return null;
    return { epochStart, supply };
  }

  async getEpochTiming(): Promise<{
    now: bigint;
    epochStart: bigint;
    epochEnd: bigint;
    voteEnd: bigint;
  }> {
    const voterAddress = this.config.voterAddress ?? AppContracts.MEZO_VOTER;
    const block = await this.client.getBlock();
    const now = block.timestamp;
    const [epochStart, epochEnd, voteEnd] = (await this.client.multicall({
      contracts: [
        {
          address: voterAddress,
          abi: VoterAbi,
          functionName: "epochStart",
          args: [now],
        },
        {
          address: voterAddress,
          abi: VoterAbi,
          functionName: "epochNext",
          args: [now],
        },
        {
          address: voterAddress,
          abi: VoterAbi,
          functionName: "epochVoteEnd",
          args: [now],
        },
      ],
    })) as {
      status: "success" | "failure";
      result?: unknown;
    }[];

    const toBigint = (value: unknown) =>
      typeof value === "bigint" ? value : 0n;

    return {
      now,
      epochStart: toBigint(epochStart?.result),
      epochEnd: toBigint(epochEnd?.result),
      voteEnd: toBigint(voteEnd?.result),
    };
  }

  private async multicallInChunks(
    contracts: MulticallContract[],
    batchSize: number
  ): Promise<MulticallResult[]> {
    const results: MulticallResult[] = [];
    const chunkSize = Math.max(1, batchSize);
    for (let i = 0; i < contracts.length; i += chunkSize) {
      const chunk = contracts.slice(i, i + chunkSize);
      const response = (await this.client.multicall({
        contracts: chunk,
      })) as MulticallResult[];
      results.push(...response);
    }
    return results;
  }
}
