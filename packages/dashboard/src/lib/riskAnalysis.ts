import type { Trove } from "@/hooks/useMonitorData";

const LIQUIDATION_CLOSE_RATIO = 1.2;
const REDEMPTION_CLOSE_PERCENTILE = 0.2;

export type RiskBucketKey =
  | "doubleRisk"
  | "redemptionRisk"
  | "safeZone";

export type RiskBucket = {
  count: number;
  collateral: number;
};

export type RiskProfile = {
  trove: Trove;
  score: number;
  redemptionRank: number;
  redemptionPercentile: number;
  collateralAhead: number;
  isNearRedemption: boolean;
  isNearLiquidation: boolean;
  bucket: RiskBucketKey;
};

export type RiskAnalysisSummary = Record<RiskBucketKey, RiskBucket> & {
  topExposures: RiskProfile[];
};

const createBucket = (): RiskBucket => ({
  count: 0,
  collateral: 0,
});

const sortByRedemptionOrder = (troves: Trove[]) =>
  [...troves].sort((a, b) => {
    if (a.collaterization_ratio !== b.collaterization_ratio) {
      return a.collaterization_ratio - b.collaterization_ratio;
    }

    const aUpdated = new Date(a.updated_at).getTime();
    const bUpdated = new Date(b.updated_at).getTime();
    if (aUpdated !== bUpdated) {
      return aUpdated - bUpdated;
    }

    return a.id.localeCompare(b.id);
  });

const getRiskBucket = (
  isNearRedemption: boolean,
  isNearLiquidation: boolean
): RiskBucketKey => {
  if (isNearRedemption && isNearLiquidation) {
    return "doubleRisk";
  }
  if (isNearRedemption) {
    return "redemptionRisk";
  }
  return "safeZone";
};

export const buildRiskAnalysis = (troves: Trove[]): RiskAnalysisSummary => {
  const buckets: RiskAnalysisSummary = {
    doubleRisk: createBucket(),
    redemptionRisk: createBucket(),
    safeZone: createBucket(),
    topExposures: [],
  };

  const sortedTroves = sortByRedemptionOrder(troves);
  const lastIndex = Math.max(sortedTroves.length - 1, 1);
  let collateralAhead = 0;

  const profiles = sortedTroves.map((trove, index) => {
    const redemptionPercentile = index / lastIndex;
    const redemptionProximity = 1 - redemptionPercentile;
    const isNearRedemption =
      redemptionPercentile <= REDEMPTION_CLOSE_PERCENTILE;
    const isNearLiquidation =
      trove.collaterization_ratio < LIQUIDATION_CLOSE_RATIO;
    const bucket = getRiskBucket(isNearRedemption, isNearLiquidation);
    const profile: RiskProfile = {
      trove,
      score: Math.round(
        redemptionProximity * 70 +
          (isNearRedemption && isNearLiquidation ? 30 : 0)
      ),
      redemptionRank: index + 1,
      redemptionPercentile,
      collateralAhead,
      isNearRedemption,
      isNearLiquidation,
      bucket,
    };

    buckets[bucket].count += 1;
    buckets[bucket].collateral += trove.collateral;
    collateralAhead += trove.collateral;

    return profile;
  });

  buckets.topExposures = profiles
    .sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      return a.redemptionRank - b.redemptionRank;
    })
    .slice(0, 5);

  return buckets;
};
