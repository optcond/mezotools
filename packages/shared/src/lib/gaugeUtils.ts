import { ZERO_ADDRESS } from "./poolMarketNodeReads";
import type { GaugeBribeTokenReward, GaugeIncentive } from "./gaugesFetcher";
import type { GaugeVoteOpportunity } from "./veVoteFetcher";
import type { GaugeBribeRow, GaugeRow } from "../supabase.types";

const SCORE_SCALE = 10n ** 18n;

/**
 * Merge reward rows with the same token by summing amounts.
 */
export const mergeRewardRows = (
  rows: GaugeBribeTokenReward[],
): GaugeBribeTokenReward[] =>
  Object.values(
    rows.reduce<Record<string, GaugeBribeTokenReward>>((acc, row) => {
      const key = row.token.toLowerCase();
      const current = acc[key] ?? { ...row, amount: 0n };
      return { ...acc, [key]: { ...current, amount: current.amount + row.amount } };
    }, {}),
  );

/**
 * Project the bribe rewards a voter would receive by contributing `vote`
 * to a gauge that already has `totalVotes` (before this voter's addition).
 *
 * Formula: reward_i * vote / (totalVotes + vote)
 */
export const projectGaugeBribeRewards = (
  rows: GaugeBribeTokenReward[],
  vote: bigint,
  totalVotes: bigint,
): GaugeBribeTokenReward[] => {
  if (vote <= 0n) return [];
  const denominator = totalVotes + vote;
  if (denominator <= 0n) return [];
  return mergeRewardRows(rows)
    .map((row) => ({ ...row, amount: (row.amount * vote) / denominator }))
    .filter((row) => row.amount > 0n);
};

/**
 * Distribute `votingPower` proportionally across pools according to `weightsByPool`,
 * using integer arithmetic with remainder distribution to ensure the sum equals
 * `votingPower` exactly.
 */
export const normalizeWeightsToVotingPower = (
  weightsByPool: Record<string, bigint>,
  votingPower: bigint,
): Record<string, bigint> => {
  if (votingPower <= 0n) return {};
  const entries = Object.entries(weightsByPool).filter(([, w]) => w > 0n);
  if (!entries.length) return {};
  const totalWeight = entries.reduce((acc, [, w]) => acc + w, 0n);
  if (totalWeight <= 0n) return {};

  const normalized: Record<string, bigint> = {};
  const remainders: { pool: string; remainder: bigint }[] = [];
  let assigned = 0n;

  for (const [pool, weight] of entries) {
    const precise = weight * votingPower;
    const vote = precise / totalWeight;
    normalized[pool] = vote;
    assigned += vote;
    remainders.push({ pool, remainder: precise % totalWeight });
  }

  let left = votingPower - assigned;
  if (left > 0n) {
    remainders.sort((a, b) => (a.remainder > b.remainder ? -1 : 1));
    let idx = 0;
    while (left > 0n) {
      const row = remainders[idx % remainders.length];
      normalized[row.pool] = (normalized[row.pool] ?? 0n) + 1n;
      left -= 1n;
      idx++;
    }
  }

  return normalized;
};

const toBribeTokenReward = (
  b: GaugeBribeRow,
  epochStart: bigint,
): GaugeBribeTokenReward => ({
  token: b.token as `0x${string}`,
  amount: BigInt(b.amount),
  epochStart,
  previousEpochAmount: b.previous_epoch_amount
    ? BigInt(b.previous_epoch_amount)
    : undefined,
  nextEpochAmount: b.next_epoch_amount
    ? BigInt(b.next_epoch_amount)
    : undefined,
});

/**
 * Convert a Supabase `gauges` table row to a `GaugeIncentive` domain object.
 */
export const gaugeRowToIncentive = (row: GaugeRow): GaugeIncentive => {
  const epochStart = BigInt(row.epoch_start);
  return {
    pool: row.pool as `0x${string}`,
    poolName: row.pool_name ?? undefined,
    gauge: row.gauge as `0x${string}`,
    bribe: row.bribe as `0x${string}`,
    fee: (row.fee ?? ZERO_ADDRESS) as `0x${string}`,
    votes: BigInt(row.votes),
    duration: BigInt(row.duration),
    epochStart,
    rewards: ((row.bribes ?? []) as GaugeBribeRow[]).map((b) =>
      toBribeTokenReward(b, epochStart),
    ),
    fees: ((row.fees ?? []) as GaugeBribeRow[]).map((b) =>
      toBribeTokenReward(b, epochStart),
    ),
  };
};

/**
 * Build `GaugeVoteOpportunity[]` from incentives without a wallet/tokenId.
 * All `currentVote` values are 0. Scores are computed from reward signal.
 */
export const incentivesToOpportunities = (
  incentives: GaugeIncentive[],
): GaugeVoteOpportunity[] =>
  incentives.map((gauge) => {
    const currentRewardSignal = [...gauge.rewards, ...gauge.fees].reduce(
      (acc, r) => acc + r.amount,
      0n,
    );
    const rewardSignal = currentRewardSignal;
    const rewardSignalSource =
      rewardSignal > 0n ? ("current" as const) : ("none" as const);
    const denominator = gauge.votes > 0n ? gauge.votes : 1n;
    const score =
      rewardSignal === 0n ? 0n : (rewardSignal * SCORE_SCALE) / denominator;
    return {
      ...gauge,
      currentVote: 0n,
      rewardSignal,
      currentRewardSignal,
      rewardSignalSource,
      score,
    };
  });
