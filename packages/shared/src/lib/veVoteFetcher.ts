import { formatUnits, PublicClient } from "viem";
import { BribeVotingRewardAbi, VoterAbi, VotingEscrowAbi } from "../abi/Gauges";
import { AppContracts } from "../types";
import { GaugeIncentive, GaugesFetcher } from "./gaugesFetcher";

const DEFAULT_MAX_POOLS = 8;
const SCORE_SCALE = 10n ** 18n;
const APPROX_MAX_LOCK_SECONDS = 4n * 365n * 24n * 60n * 60n;
const EPSILON = 1e-12;
const DEFAULT_ACTIVATION_WEIGHT = 10n ** 14n;

export interface VeLockSummary {
  tokenId: bigint;
  lockedAmount: bigint;
  unlockTime: bigint;
  isPermanent: boolean;
  votingPower: bigint;
  baseVotingPower: bigint;
  hasVoted: boolean;
  lastVotedAt: bigint;
}

export interface GaugeVoteOpportunity extends GaugeIncentive {
  currentVote: bigint;
  rewardSignal: bigint;
  currentRewardSignal: bigint;
  rewardSignalSource: "current" | "none";
  score: bigint;
}

export interface GaugeVoteAllocation {
  pool: `0x${string}`;
  gauge: `0x${string}`;
  score: bigint;
  weight: bigint;
  weightBps: number;
}

export interface VoteRewardProjectionRow {
  pool: `0x${string}`;
  gauge: `0x${string}`;
  vote: bigint;
  projectedReward: bigint;
}

export interface VoteRewardProjection {
  rows: VoteRewardProjectionRow[];
  totalProjectedReward: bigint;
}

export interface ClaimableReward {
  bribe: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
  source?: "bribe" | "fee";
}

export interface ClaimableRewardsSummary {
  tokenId: bigint;
  rewards: ClaimableReward[];
  totalAmount: bigint;
}

export interface VotePlannerOptions {
  maxPools?: number;
  minProjectedReward?: number;
  rewardSignalByPool?: Record<string, number>;
  activationWeight?: bigint;
  allowZeroVoteActivation?: boolean;
  allocationMode?: "selfOptimizing" | "averageYield";
}

type LockTupleObject = {
  amount: bigint;
  end: bigint;
  isPermanent: boolean;
};
type LockTupleArray = readonly [bigint, bigint, boolean];

type VoteCandidate = {
  item: GaugeVoteOpportunity;
  reward: number;
  votes: number;
  initialDerivative: number;
};

type ContinuousVoteAllocation = {
  candidate: VoteCandidate;
  allocationHuman: number;
  projectedRewardHuman: number;
};

export class VeVoteFetcher {
  private readonly gaugesFetcher: GaugesFetcher;
  private readonly voterAddress: `0x${string}`;
  private readonly veAddress: `0x${string}`;

  constructor(
    private readonly client: PublicClient,
    config?: {
      gaugesFetcher?: GaugesFetcher;
      voterAddress?: `0x${string}`;
      veAddress?: `0x${string}`;
    },
  ) {
    this.gaugesFetcher = config?.gaugesFetcher ?? new GaugesFetcher(client);
    this.voterAddress = config?.voterAddress ?? AppContracts.MEZO_VOTER;
    this.veAddress = config?.veAddress ?? AppContracts.MEZO_VE;
  }

  async getLocks(owner: `0x${string}`): Promise<VeLockSummary[]> {
    const block = await this.client.getBlock();
    const now = block.timestamp;

    const balance = (await this.client.readContract({
      address: this.veAddress,
      abi: VotingEscrowAbi,
      functionName: "balanceOf",
      args: [owner],
    })) as bigint;

    if (balance === 0n) {
      return [];
    }

    const lockIdCalls = Array.from({ length: Number(balance) }, (_, index) => ({
      address: this.veAddress,
      abi: VotingEscrowAbi,
      functionName: "ownerToNFTokenIdList",
      args: [owner, BigInt(index)],
    }));

    const lockIdResults = (await this.client.multicall({
      contracts: lockIdCalls,
    })) as { status: "success" | "failure"; result?: unknown }[];

    const tokenIds = lockIdResults
      .filter((result): result is { status: "success"; result: unknown } => {
        return result.status === "success" && typeof result.result === "bigint";
      })
      .map((result) => result.result as bigint);

    if (tokenIds.length === 0) {
      return [];
    }

    const lockCalls = tokenIds.flatMap((tokenId) => [
      {
        address: this.veAddress,
        abi: VotingEscrowAbi,
        functionName: "locked",
        args: [tokenId],
      },
      {
        address: this.veAddress,
        abi: VotingEscrowAbi,
        functionName: "votingPowerOfNFT",
        args: [tokenId],
      },
      {
        address: this.veAddress,
        abi: VotingEscrowAbi,
        functionName: "balanceOfNFT",
        args: [tokenId],
      },
      {
        address: this.veAddress,
        abi: VotingEscrowAbi,
        functionName: "balanceOfNFTAt",
        args: [tokenId, now],
      },
      {
        address: this.veAddress,
        abi: VotingEscrowAbi,
        functionName: "getPastVotes",
        args: [tokenId, now],
      },
      {
        address: this.voterAddress,
        abi: VoterAbi,
        functionName: "lastVoted",
        args: [tokenId],
      },
      {
        address: this.veAddress,
        abi: VotingEscrowAbi,
        functionName: "voted",
        args: [tokenId],
      },
    ]);

    const lockResults = (await this.client.multicall({
      contracts: lockCalls,
    })) as { status: "success" | "failure"; result?: unknown }[];

    const locks: VeLockSummary[] = [];
    const parseLockTuple = (value: unknown): LockTupleObject | null => {
      if (Array.isArray(value) && value.length >= 3) {
        const [amount, end, isPermanent] = value as unknown as LockTupleArray;
        if (
          typeof amount === "bigint" &&
          typeof end === "bigint" &&
          typeof isPermanent === "boolean"
        ) {
          return { amount, end, isPermanent };
        }
        return null;
      }

      if (value && typeof value === "object") {
        const candidate = value as Partial<LockTupleObject>;
        if (
          typeof candidate.amount === "bigint" &&
          typeof candidate.end === "bigint" &&
          typeof candidate.isPermanent === "boolean"
        ) {
          return {
            amount: candidate.amount,
            end: candidate.end,
            isPermanent: candidate.isPermanent,
          };
        }
      }

      return null;
    };

    for (let index = 0; index < tokenIds.length; index++) {
      const base = index * 7;
      const lockResult = lockResults[base];
      const votingPowerOfNftResult = lockResults[base + 1];
      const powerResult = lockResults[base + 2];
      const powerAtResult = lockResults[base + 3];
      const pastVotesResult = lockResults[base + 4];
      const lastVotedResult = lockResults[base + 5];
      const votedResult = lockResults[base + 6];

      if (lockResult?.status !== "success" || !lockResult.result) continue;
      const lockTuple = parseLockTuple(lockResult.result);
      if (!lockTuple) continue;
      const directVotingPowerOfNft =
        votingPowerOfNftResult?.status === "success" &&
        typeof votingPowerOfNftResult.result === "bigint"
          ? votingPowerOfNftResult.result
          : 0n;
      const directVotingPower =
        powerResult?.status === "success" && typeof powerResult.result === "bigint"
          ? powerResult.result
          : 0n;
      const votingPowerAt =
        powerAtResult?.status === "success" && typeof powerAtResult.result === "bigint"
          ? powerAtResult.result
          : 0n;
      const delegatedVotingPower =
        pastVotesResult?.status === "success" && typeof pastVotesResult.result === "bigint"
          ? pastVotesResult.result
          : 0n;
      let votingPower = directVotingPowerOfNft;
      if (directVotingPower > votingPower) votingPower = directVotingPower;
      if (votingPowerAt > votingPower) votingPower = votingPowerAt;
      if (delegatedVotingPower > votingPower) votingPower = delegatedVotingPower;
      const lockedAmount = lockTuple.amount >= 0n ? lockTuple.amount : -lockTuple.amount;
      let baseVotingPower = lockedAmount;

      // Fallback approximation when contract voting power reads are unavailable/zero.
      if (votingPower === 0n) {
        if (lockTuple.isPermanent) {
          votingPower = lockedAmount;
        } else if (lockTuple.end > now && APPROX_MAX_LOCK_SECONDS > 0n) {
          votingPower = (lockedAmount * (lockTuple.end - now)) / APPROX_MAX_LOCK_SECONDS;
        }
      }
      if (baseVotingPower === 0n) {
        baseVotingPower = votingPower;
      }
      const hasVoted =
        votedResult?.status === "success" && typeof votedResult.result === "boolean"
          ? votedResult.result
          : false;
      const lastVotedAt =
        lastVotedResult?.status === "success" &&
        typeof lastVotedResult.result === "bigint"
          ? lastVotedResult.result
          : 0n;

      locks.push({
        tokenId: tokenIds[index],
        lockedAmount,
        unlockTime: lockTuple.end,
        isPermanent: lockTuple.isPermanent,
        votingPower,
        baseVotingPower,
        hasVoted,
        lastVotedAt,
      });
    }

    return locks.sort((a, b) => {
      if (a.votingPower === b.votingPower) return 0;
      return a.votingPower > b.votingPower ? -1 : 1;
    });
  }

  async getGaugeVoteOpportunities(
    tokenId: bigint,
    incentives?: GaugeIncentive[],
  ): Promise<GaugeVoteOpportunity[]> {
    const gaugeList =
      incentives ?? (await this.gaugesFetcher.fetchGaugeIncentives({ probeAdjacentEpochs: true }));
    if (gaugeList.length === 0) return [];

    const voteCalls = gaugeList.map((gauge) => ({
      address: this.voterAddress,
      abi: VoterAbi,
      functionName: "votes",
      args: [tokenId, gauge.pool],
    }));

    const voteResults = (await this.client.multicall({
      contracts: voteCalls,
    })) as { status: "success" | "failure"; result?: unknown }[];

    return gaugeList.map((gauge, index) => {
      const voteResult = voteResults[index];
      const currentVote =
        voteResult?.status === "success" && typeof voteResult.result === "bigint"
          ? voteResult.result
          : 0n;
      const currentRewardSignal = [...gauge.rewards, ...gauge.fees].reduce(
        (acc, reward) => acc + reward.amount,
        0n,
      );
      const rewardSignal = currentRewardSignal;
      const rewardSignalSource = rewardSignal > 0n ? ("current" as const) : ("none" as const);
      const denominator = gauge.votes > 0n ? gauge.votes : 1n;
      const score = rewardSignal === 0n ? 0n : (rewardSignal * SCORE_SCALE) / denominator;

      return {
        ...gauge,
        currentVote,
        rewardSignal,
        currentRewardSignal,
        rewardSignalSource,
        score,
      };
    });
  }

  buildOptimalVoteAllocation(
    opportunities: GaugeVoteOpportunity[],
    votingPower: bigint,
    options: VotePlannerOptions = {},
  ): GaugeVoteAllocation[] {
    const maxPools = Math.max(1, options.maxPools ?? DEFAULT_MAX_POOLS);
    if (votingPower <= 0n || opportunities.length === 0) {
      return [];
    }

    const totalVotesHuman = this.toHuman(votingPower);
    if (!Number.isFinite(totalVotesHuman) || totalVotesHuman <= 0) {
      return [];
    }

    const minProjectedReward = Math.max(0, options.minProjectedReward ?? 0);
    const activationWeight = options.activationWeight ?? DEFAULT_ACTIVATION_WEIGHT;
    const allowZeroVoteActivation = options.allowZeroVoteActivation ?? true;
    const candidates = this.buildVoteCandidates(
      opportunities,
      options.rewardSignalByPool,
    );
    if (candidates.length === 0) {
      return [];
    }

    const searchWidth = Math.max(maxPools, Math.min(candidates.length, maxPools * 3));
    const shortlisted = candidates.slice(0, searchWidth);
    const continuous =
      options.allocationMode === "averageYield"
        ? this.solveAverageYieldAllocation({
            candidates: shortlisted,
            totalVotesHuman,
            minProjectedReward,
          })
        : this.solveContinuousVoteAllocation({
            candidates: shortlisted,
            totalVotesHuman,
            minProjectedReward,
            activationWeightHuman: this.toHuman(activationWeight),
            allowZeroVoteActivation,
          });

    const trimmed = continuous
      .filter((row) => row.allocationHuman > EPSILON)
      .sort(
        (a, b) =>
          b.allocationHuman - a.allocationHuman ||
          b.projectedRewardHuman - a.projectedRewardHuman,
      )
      .slice(0, maxPools);

    if (trimmed.length === 0) {
      return [];
    }

    const weights = this.allocateBigIntProportionally(
      trimmed.map((row) => row.allocationHuman),
      votingPower,
    );
    const assigned = weights.reduce((acc, weight) => acc + weight, 0n);
    if (assigned <= 0n) {
      return [];
    }

    return trimmed
      .map((row, index) => {
        const weight = weights[index];
        const weightBps = Number((weight * 10_000n) / assigned);

        return {
          pool: row.candidate.item.pool,
          gauge: row.candidate.item.gauge,
          score: row.candidate.item.score,
          weight,
          weightBps,
        };
      })
      .filter((row) => row.weight > 0n)
      .sort((a, b) => (a.weight === b.weight ? 0 : a.weight > b.weight ? -1 : 1));
  }

  previewContinuousAllocation(
    opportunities: GaugeVoteOpportunity[],
    votingPower: bigint,
    options: VotePlannerOptions = {},
  ): Array<{
    pool: `0x${string}`;
    gauge: `0x${string}`;
    currentVotesHuman: number;
    rewardHuman: number;
    allocationHuman: number;
    projectedRewardHuman: number;
    marginalAfterAllocation: number;
  }> {
    const totalVotesHuman = this.toHuman(votingPower);
    if (!Number.isFinite(totalVotesHuman) || totalVotesHuman <= 0) return [];

    const candidates = this.buildVoteCandidates(
      opportunities,
      options.rewardSignalByPool,
    );
    if (candidates.length === 0) return [];

    const maxPools = Math.max(1, options.maxPools ?? DEFAULT_MAX_POOLS);
    const searchWidth = Math.max(maxPools, Math.min(candidates.length, maxPools * 3));
    const shortlisted = candidates.slice(0, searchWidth);
    const minProjectedReward = Math.max(0, options.minProjectedReward ?? 0);
    const continuous =
      options.allocationMode === "averageYield"
        ? this.solveAverageYieldAllocation({
            candidates: shortlisted,
            totalVotesHuman,
            minProjectedReward,
          })
        : this.solveContinuousVoteAllocation({
            candidates: shortlisted,
            totalVotesHuman,
            minProjectedReward,
            activationWeightHuman: this.toHuman(
              options.activationWeight ?? DEFAULT_ACTIVATION_WEIGHT,
            ),
            allowZeroVoteActivation: options.allowZeroVoteActivation ?? true,
          });

    return continuous
      .filter((row) => row.allocationHuman > EPSILON)
      .sort(
        (a, b) =>
          b.allocationHuman - a.allocationHuman ||
          b.projectedRewardHuman - a.projectedRewardHuman,
      )
      .slice(0, maxPools)
      .map((row) => {
        const votes = row.candidate.votes;
        const reward = row.candidate.reward;
        const allocation = row.allocationHuman;
        const marginalAfterAllocation =
          votes + allocation > EPSILON
            ? (reward * votes) / ((votes + allocation) * (votes + allocation))
            : Number.POSITIVE_INFINITY;

        return {
          pool: row.candidate.item.pool,
          gauge: row.candidate.item.gauge,
          currentVotesHuman: votes,
          rewardHuman: reward,
          allocationHuman: allocation,
          projectedRewardHuman: row.projectedRewardHuman,
          marginalAfterAllocation,
        };
      });
  }

  projectRewards(
    opportunities: GaugeVoteOpportunity[],
    votesByPool: Record<string, bigint>,
  ): VoteRewardProjection {
    const rows: VoteRewardProjectionRow[] = opportunities.map((item) => {
      const key = item.pool.toLowerCase();
      const vote = votesByPool[key] ?? 0n;
      if (vote <= 0n || item.rewardSignal <= 0n) {
        return {
          pool: item.pool,
          gauge: item.gauge,
          vote,
          projectedReward: 0n,
        };
      }

      const denominator = item.votes + vote;
      const projectedReward =
        denominator > 0n ? (item.rewardSignal * vote) / denominator : 0n;

      return {
        pool: item.pool,
        gauge: item.gauge,
        vote,
        projectedReward,
      };
    });

    return {
      rows,
      totalProjectedReward: rows.reduce(
        (acc, row) => acc + row.projectedReward,
        0n,
      ),
    };
  }

  private buildVoteCandidates(
    opportunities: GaugeVoteOpportunity[],
    rewardSignalByPool?: Record<string, number>,
  ): VoteCandidate[] {
    return opportunities
      .filter((item) => item.gauge !== "0x0000000000000000000000000000000000000000")
      .map((item) => {
        const reward =
          rewardSignalByPool?.[item.pool.toLowerCase()] ??
          this.toHuman(item.rewardSignal);
        const votes = this.toHuman(item.votes);
        const initialDerivative =
          votes > EPSILON ? reward / votes : Number.POSITIVE_INFINITY;

        return {
          item,
          reward,
          votes,
          initialDerivative,
        };
      })
      .filter(
        (row) =>
          Number.isFinite(row.reward) &&
          row.reward > 0 &&
          Number.isFinite(row.votes) &&
          row.votes >= 0,
      )
      .sort((a, b) => {
        if (a.initialDerivative === b.initialDerivative) return 0;
        if (a.initialDerivative === Number.POSITIVE_INFINITY) return -1;
        if (b.initialDerivative === Number.POSITIVE_INFINITY) return 1;
        return b.initialDerivative - a.initialDerivative;
      });
  }

  private solveContinuousVoteAllocation(params: {
    candidates: VoteCandidate[];
    totalVotesHuman: number;
    minProjectedReward: number;
    activationWeightHuman: number;
    allowZeroVoteActivation: boolean;
  }): ContinuousVoteAllocation[] {
    const {
      candidates,
      totalVotesHuman,
      minProjectedReward,
      activationWeightHuman,
      allowZeroVoteActivation,
    } = params;

    if (candidates.length === 0 || totalVotesHuman <= 0) {
      return [];
    }

    const zeroVote = candidates.filter((candidate) => candidate.votes <= EPSILON);
    const positiveVote = candidates.filter((candidate) => candidate.votes > EPSILON);
    const zeroAllocations = new Map<string, number>();
    let consumed = 0;

    if (allowZeroVoteActivation && zeroVote.length > 0 && activationWeightHuman > 0) {
      const eligibleZero = zeroVote
        .filter((candidate) => candidate.reward >= minProjectedReward)
        .sort((a, b) => b.reward - a.reward);

      for (const candidate of eligibleZero) {
        if (consumed + activationWeightHuman > totalVotesHuman + EPSILON) break;
        zeroAllocations.set(candidate.item.pool.toLowerCase(), activationWeightHuman);
        consumed += activationWeightHuman;
      }
    }

    const positiveAllocations = this.solvePositiveVoteCurves(
      positiveVote,
      Math.max(0, totalVotesHuman - consumed),
    );

    const merged: ContinuousVoteAllocation[] = candidates.map((candidate) => {
      const key = candidate.item.pool.toLowerCase();
      const activation = zeroAllocations.get(key) ?? 0;
      const curve = positiveAllocations.get(key) ?? 0;
      const allocationHuman = activation + curve;
      const projectedRewardHuman =
        allocationHuman <= EPSILON
          ? 0
          : candidate.votes <= EPSILON
            ? candidate.reward
            : (candidate.reward * allocationHuman) /
              (candidate.votes + allocationHuman);

      return {
        candidate,
        allocationHuman,
        projectedRewardHuman,
      };
    });

    if (minProjectedReward > 0) {
      const rejectedPools = new Set(
        merged
          .filter(
            (row) =>
              row.allocationHuman > EPSILON &&
              row.projectedRewardHuman + EPSILON < minProjectedReward,
          )
          .map((row) => row.candidate.item.pool.toLowerCase()),
      );

      if (rejectedPools.size > 0 && rejectedPools.size < candidates.length) {
        return this.solveContinuousVoteAllocation({
          candidates: candidates.filter(
            (candidate) => !rejectedPools.has(candidate.item.pool.toLowerCase()),
          ),
          totalVotesHuman,
          minProjectedReward,
          activationWeightHuman,
          allowZeroVoteActivation,
        });
      }
    }

    return merged;
  }

  private solveAverageYieldAllocation(params: {
    candidates: VoteCandidate[];
    totalVotesHuman: number;
    minProjectedReward: number;
  }): ContinuousVoteAllocation[] {
    const { candidates, totalVotesHuman, minProjectedReward } = params;
    if (candidates.length === 0 || totalVotesHuman <= 0) {
      return [];
    }

    const viable = candidates.filter(
      (candidate) =>
        candidate.reward >= minProjectedReward &&
        candidate.reward > 0 &&
        candidate.votes >= 0,
    );
    if (viable.length === 0) return [];

    const allocationAtYield = (yieldPerVote: number) =>
      viable.reduce((acc, candidate) => {
        if (yieldPerVote <= 0) return acc;
        return acc + Math.max(0, candidate.reward / yieldPerVote - candidate.votes);
      }, 0);

    let low = 0;
    let high = Math.max(
      ...viable.map((candidate) =>
        candidate.votes > EPSILON
          ? candidate.reward / candidate.votes
          : candidate.reward / Math.max(totalVotesHuman, EPSILON),
      ),
      EPSILON,
    );

    while (allocationAtYield(high) > totalVotesHuman && high < Number.MAX_SAFE_INTEGER) {
      high *= 2;
    }

    for (let i = 0; i < 100; i++) {
      const mid = (low + high) / 2;
      if (mid <= 0) {
        low = mid;
        continue;
      }

      if (allocationAtYield(mid) > totalVotesHuman) {
        low = mid;
      } else {
        high = mid;
      }
    }

    const clearingYield = high;
    const allocations = viable.map((candidate) => ({
      candidate,
      allocationHuman: Math.max(
        0,
        candidate.reward / clearingYield - candidate.votes,
      ),
    }));
    const allocated = allocations.reduce((acc, row) => acc + row.allocationHuman, 0);
    if (allocated <= EPSILON) return [];
    const scale = totalVotesHuman / allocated;
    const allocationByPool = new Map(
      allocations.map((row) => [
        row.candidate.item.pool.toLowerCase(),
        row.allocationHuman * scale,
      ]),
    );

    return candidates.map((candidate) => {
      const allocationHuman =
        allocationByPool.get(candidate.item.pool.toLowerCase()) ?? 0;
      const projectedRewardHuman =
        allocationHuman <= EPSILON
          ? 0
          : candidate.votes <= EPSILON
            ? candidate.reward
            : (candidate.reward * allocationHuman) /
              (candidate.votes + allocationHuman);

      return {
        candidate,
        allocationHuman,
        projectedRewardHuman,
      };
    });
  }

  private solvePositiveVoteCurves(
    candidates: VoteCandidate[],
    totalVotesHuman: number,
  ): Map<string, number> {
    const allocations = new Map<string, number>();
    if (candidates.length === 0 || totalVotesHuman <= 0) {
      return allocations;
    }

    const viable = candidates.filter(
      (candidate) =>
        candidate.votes > EPSILON &&
        candidate.reward > 0 &&
        Number.isFinite(candidate.reward) &&
        Number.isFinite(candidate.votes),
    );
    if (viable.length === 0) {
      return allocations;
    }

    const maxDerivative = Math.max(
      ...viable.map((candidate) => candidate.reward / candidate.votes),
      0,
    );
    if (!Number.isFinite(maxDerivative) || maxDerivative <= 0) {
      return allocations;
    }

    let low = 0;
    let high = maxDerivative;
    for (let i = 0; i < 100; i++) {
      const mid = (low + high) / 2;
      if (mid <= 0) {
        high = mid;
        continue;
      }

      const allocated = viable.reduce((acc, candidate) => {
        const target =
          Math.sqrt((candidate.reward * candidate.votes) / mid) -
          candidate.votes;
        return acc + Math.max(0, target);
      }, 0);

      if (allocated > totalVotesHuman) {
        low = mid;
      } else {
        high = mid;
      }
    }

    for (const candidate of viable) {
      const allocation = Math.max(
        0,
        Math.sqrt((candidate.reward * candidate.votes) / high) - candidate.votes,
      );
      if (allocation > EPSILON) {
        allocations.set(candidate.item.pool.toLowerCase(), allocation);
      }
    }

    return allocations;
  }

  private allocateBigIntProportionally(
    allocationsHuman: number[],
    totalWeight: bigint,
  ): bigint[] {
    if (allocationsHuman.length === 0 || totalWeight <= 0n) {
      return allocationsHuman.map(() => 0n);
    }

    const cleaned = allocationsHuman.map((allocation) =>
      Number.isFinite(allocation) && allocation > 0 ? allocation : 0,
    );
    const sum = cleaned.reduce((acc, allocation) => acc + allocation, 0);
    if (sum <= EPSILON) {
      return cleaned.map(() => 0n);
    }

    const scale = 1_000_000_000_000n;
    const scaledShares = cleaned.map((allocation) =>
      BigInt(Math.max(0, Math.floor((allocation / sum) * Number(scale)))),
    );
    let scaledSum = scaledShares.reduce((acc, share) => acc + share, 0n);

    if (scaledSum < scale) {
      const deficits = cleaned
        .map((allocation, index) => ({
          index,
          fraction:
            (allocation / sum) * Number(scale) - Number(scaledShares[index]),
        }))
        .sort((a, b) => b.fraction - a.fraction);
      let left = scale - scaledSum;
      let index = 0;
      while (left > 0n) {
        scaledShares[deficits[index % deficits.length].index] += 1n;
        left -= 1n;
        index++;
      }
      scaledSum = scale;
    } else if (scaledSum > scale) {
      const surpluses = cleaned
        .map((allocation, index) => ({
          index,
          fraction:
            Number(scaledShares[index]) - (allocation / sum) * Number(scale),
        }))
        .sort((a, b) => b.fraction - a.fraction);
      let extra = scaledSum - scale;
      let index = 0;
      while (extra > 0n) {
        const target = surpluses[index % surpluses.length].index;
        if (scaledShares[target] > 0n) {
          scaledShares[target] -= 1n;
          extra -= 1n;
        }
        index++;
      }
      scaledSum = scale;
    }

    const weights = scaledShares.map((share) => (totalWeight * share) / scale);
    let assigned = weights.reduce((acc, weight) => acc + weight, 0n);
    let leftover = totalWeight - assigned;

    if (leftover > 0n) {
      const remainders = scaledShares
        .map((share, index) => ({
          index,
          remainder: (totalWeight * share) % scale,
        }))
        .sort((a, b) =>
          a.remainder === b.remainder ? 0 : a.remainder > b.remainder ? -1 : 1,
        );

      let index = 0;
      while (leftover > 0n) {
        weights[remainders[index % remainders.length].index] += 1n;
        leftover -= 1n;
        index++;
      }
      assigned = totalWeight;
    }

    if (assigned > totalWeight) {
      let extra = assigned - totalWeight;
      let index = weights.length - 1;
      while (extra > 0n && weights.length > 0) {
        if (weights[index] > 0n) {
          weights[index] -= 1n;
          extra -= 1n;
        }
        index = index === 0 ? weights.length - 1 : index - 1;
      }
    }

    return weights;
  }

  private toHuman(value: bigint, decimals = 18): number {
    const output = Number(formatUnits(value, decimals));
    return Number.isFinite(output) ? output : 0;
  }

  async getClaimableBribes(
    tokenId: bigint,
    incentives?: GaugeIncentive[],
  ): Promise<ClaimableRewardsSummary> {
    const gaugeList =
      incentives ?? (await this.gaugesFetcher.fetchGaugeIncentives({ probeAdjacentEpochs: true }));

    const entries = gaugeList.flatMap((gauge) =>
      gauge.bribe !== "0x0000000000000000000000000000000000000000"
        ? gauge.rewards.map((reward) => ({
            bribe: gauge.bribe,
            token: reward.token,
          }))
        : [],
    );

    const uniqueEntries = entries.filter(
      (entry, index, array) =>
        array.findIndex(
          (candidate) =>
            candidate.bribe === entry.bribe && candidate.token === entry.token,
        ) === index,
    );

    if (uniqueEntries.length === 0) {
      return {
        tokenId,
        rewards: [],
        totalAmount: 0n,
      };
    }

    const results = (await this.client.multicall({
      contracts: uniqueEntries.map((entry) => ({
        address: entry.bribe,
        abi: BribeVotingRewardAbi,
        functionName: "earned",
        args: [entry.token, tokenId],
      })),
    })) as { status: "success" | "failure"; result?: unknown }[];

    const rewards = uniqueEntries
      .map((entry, index) => {
        const result = results[index];
        const amount =
          result?.status === "success" && typeof result.result === "bigint"
            ? result.result
            : 0n;
        return {
          bribe: entry.bribe,
          token: entry.token,
          amount,
          source: "bribe",
        } satisfies ClaimableReward;
      })
      .filter((reward) => reward.amount > 0n);

    return {
      tokenId,
      rewards,
      totalAmount: rewards.reduce((acc, reward) => acc + reward.amount, 0n),
    };
  }

  async getClaimableFees(
    tokenId: bigint,
    incentives?: GaugeIncentive[],
  ): Promise<ClaimableRewardsSummary> {
    const gaugeList =
      incentives ?? (await this.gaugesFetcher.fetchGaugeIncentives({ probeAdjacentEpochs: true }));

    const entries = gaugeList.flatMap((gauge) =>
      gauge.fee !== "0x0000000000000000000000000000000000000000"
        ? gauge.fees.map((reward) => ({
            bribe: gauge.fee,
            token: reward.token,
          }))
        : [],
    );

    const uniqueEntries = entries.filter(
      (entry, index, array) =>
        array.findIndex(
          (candidate) =>
            candidate.bribe === entry.bribe && candidate.token === entry.token,
        ) === index,
    );

    if (uniqueEntries.length === 0) {
      return {
        tokenId,
        rewards: [],
        totalAmount: 0n,
      };
    }

    const results = (await this.client.multicall({
      contracts: uniqueEntries.map((entry) => ({
        address: entry.bribe,
        abi: BribeVotingRewardAbi,
        functionName: "earned",
        args: [entry.token, tokenId],
      })),
    })) as { status: "success" | "failure"; result?: unknown }[];

    const rewards = uniqueEntries
      .map((entry, index) => {
        const result = results[index];
        const amount =
          result?.status === "success" && typeof result.result === "bigint"
            ? result.result
            : 0n;
        return {
          bribe: entry.bribe,
          token: entry.token,
          amount,
          source: "fee",
        } satisfies ClaimableReward;
      })
      .filter((reward) => reward.amount > 0n);

    return {
      tokenId,
      rewards,
      totalAmount: rewards.reduce((acc, reward) => acc + reward.amount, 0n),
    };
  }
}
