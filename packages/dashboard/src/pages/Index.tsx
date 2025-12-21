import { lazy, Suspense, useMemo, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";

import { Header } from "@/components/Header";
import { BridgedAssetsDialog } from "@/components/BridgedAssetsDialog";
import { DebtCalculatorDialog } from "@/components/DebtCalculatorDialog";
import { RedemptionDialog } from "@/components/RedeemDialog";
// import { SwapDialog } from "@/components/SwapDialog";
import { useMonitorData } from "@/hooks/useMonitorData";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/useWallet";

const SystemStateSection = lazy(() =>
  import("@/components/SystemState").then((module) => ({
    default: module.SystemState,
  }))
);
const PriceFeedHistorySection = lazy(() =>
  import("@/components/PriceFeedHistory").then((module) => ({
    default: module.PriceFeedHistory,
  }))
);
const RiskAnalysisSection = lazy(() =>
  import("@/components/RiskAnalysis").then((module) => ({
    default: module.RiskAnalysis,
  }))
);
const LatestActivitySection = lazy(() =>
  import("@/components/LatestActivity").then((module) => ({
    default: module.LatestActivity,
  }))
);
const AllTrovesSection = lazy(() =>
  import("@/components/AllTroves").then((module) => ({
    default: module.AllTroves,
  }))
);
const PersonalWalletStatsSection = lazy(() =>
  import("@/components/PersonalWalletStats").then((module) => ({
    default: module.PersonalWalletStats,
  }))
);

const SystemStateFallback = () => (
  <div className="glass-card p-6 space-y-4">
    <div className="h-6 w-40 rounded bg-muted/30" />
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-20 rounded-xl bg-muted/30" />
      ))}
    </div>
    <div className="h-64 rounded-xl bg-muted/30" />
  </div>
);

const PriceFeedHistoryFallback = () => (
  <div className="glass-card p-6 space-y-6">
    <div className="h-5 w-2/5 rounded bg-muted/30" />
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-20 rounded-xl bg-muted/30" />
      ))}
    </div>
    <div className="h-64 rounded-xl bg-muted/30" />
  </div>
);

const RiskAnalysisFallback = () => (
  <div className="glass-card p-6 space-y-4">
    <div className="h-6 w-36 rounded bg-muted/30" />
    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-24 rounded-xl bg-muted/30" />
      ))}
    </div>
    <div className="h-64 rounded-xl bg-muted/30" />
  </div>
);

const LatestActivityFallback = () => (
  <div className="glass-card p-6 space-y-4">
    <div className="h-6 w-48 rounded bg-muted/30" />
    <div className="h-48 rounded-xl bg-muted/30" />
  </div>
);

const AllTrovesFallback = () => (
  <div className="glass-card p-6 space-y-4">
    <div className="h-6 w-32 rounded bg-muted/30" />
    <div className="h-64 rounded-xl bg-muted/30" />
  </div>
);
const PersonalWalletStatsFallback = () => (
  <div className="glass-card p-6 space-y-4">
    <div className="h-6 w-56 rounded bg-muted/30" />
    <div className="h-32 rounded-xl bg-muted/30" />
    <div className="h-32 rounded-xl bg-muted/30" />
  </div>
);

const Index = () => {
  const {
    troves,
    liquidations,
    redemptions,
    dailyMetrics,
    indexerState,
    bridgeAssets,
    isLoading,
    isFetching,
    error,
    refetch,
    lastUpdatedAt,
  } = useMonitorData();
  const wallet = useWallet();
  const [isBridgedAssetsOpen, setIsBridgedAssetsOpen] = useState(false);
  const [isDebtCalculatorOpen, setIsDebtCalculatorOpen] = useState(false);
  const [isRedemptionDialogOpen, setIsRedemptionDialogOpen] = useState(false);
  // const [isSwapDialogOpen, setIsSwapDialogOpen] = useState(false);

  const latestMetric = dailyMetrics[0];

  const systemMetrics = useMemo(() => {
    const totalCollateral = troves.reduce(
      (sum, trove) => sum + trove.collateral,
      0
    );
    const totalDebt = troves.reduce(
      (sum, trove) => sum + trove.principal_debt + trove.interest,
      0
    );
    const btcPrice = latestMetric?.btc_price ?? 0;

    const baseRatio =
      totalDebt > 0 ? (totalCollateral * btcPrice) / totalDebt : 0;

    return {
      tcr: baseRatio,
      tcrMinus10:
        totalDebt > 0 ? (totalCollateral * btcPrice * 0.9) / totalDebt : 0,
      tcrMinus20:
        totalDebt > 0 ? (totalCollateral * btcPrice * 0.8) / totalDebt : 0,
      totalCollateral,
      totalDebt,
      totalTroves: troves.length,
      btcPrice,
    };
  }, [troves, latestMetric]);

  const riskBuckets = useMemo(() => {
    const buckets = {
      critical: { count: 0, collateral: 0 },
      high: { count: 0, collateral: 0 },
      elevated: { count: 0, collateral: 0 },
      safe: { count: 0, collateral: 0 },
    };

    troves.forEach((trove) => {
      if (trove.collaterization_ratio < 1.2) {
        buckets.critical.count++;
        buckets.critical.collateral += trove.collateral;
      } else if (trove.collaterization_ratio < 1.6) {
        buckets.high.count++;
        buckets.high.collateral += trove.collateral;
      } else if (trove.collaterization_ratio < 2.0) {
        buckets.elevated.count++;
        buckets.elevated.collateral += trove.collateral;
      } else {
        buckets.safe.count++;
        buckets.safe.collateral += trove.collateral;
      }
    });

    return buckets;
  }, [troves]);

  const chartData = useMemo(
    () =>
      dailyMetrics
        .slice(0, 30)
        .reverse()
        .map((metric) => ({
          date: new Date(metric.day).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          tcr: metric.tcr,
          btcPrice: metric.btc_price,
        })),
    [dailyMetrics]
  );

  const blockNumber = indexerState?.block_number ?? null;
  const blockTimestamp =
    indexerState?.updated_at ?? latestMetric?.updated_at ?? null;
  const isRefreshing = isFetching && !isLoading;
  const showError = Boolean(error);
  const effectiveLastUpdated = lastUpdatedAt ?? blockTimestamp;

  return (
    <div className="min-h-screen">
      <Header
        blockNumber={blockNumber}
        blockTimestamp={blockTimestamp}
        lastUpdatedAt={effectiveLastUpdated}
        btcPrice={systemMetrics.btcPrice}
        isSyncing={isRefreshing}
        onBridgedAssetsClick={() => setIsBridgedAssetsOpen(true)}
        onDebtCalculatorClick={() => setIsDebtCalculatorOpen(true)}
        onRedeemClick={() => setIsRedemptionDialogOpen(true)}
        // onSwapClick={() => setIsSwapDialogOpen(true)}
      />

      <main className="max-w-[1280px] mx-auto px-4 py-6 space-y-6 sm:px-6">
        {showError && (
          <Alert
            variant="destructive"
            className="glass-card border border-destructive/30"
          >
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to sync data</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm">
                {error ?? "An unexpected error occurred."}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void refetch()}
                disabled={isFetching}
              >
                {isFetching && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Suspense fallback={<PersonalWalletStatsFallback />}>
          <PersonalWalletStatsSection
            troves={troves}
            liquidations={liquidations}
            redemptions={redemptions}
            isLoading={isLoading}
            wallet={wallet}
            onDebtCalculatorClick={() => setIsDebtCalculatorOpen(true)}
          />
        </Suspense>

        <Suspense fallback={<SystemStateFallback />}>
          <SystemStateSection
            tcr={systemMetrics.tcr}
            tcrMinus10={systemMetrics.tcrMinus10}
            tcrMinus20={systemMetrics.tcrMinus20}
            totalCollateral={systemMetrics.totalCollateral}
            totalDebt={systemMetrics.totalDebt}
            totalTroves={systemMetrics.totalTroves}
            chartData={chartData}
            isLoading={isLoading}
          />
        </Suspense>

        <Suspense fallback={<PriceFeedHistoryFallback />}>
          <PriceFeedHistorySection />
        </Suspense>

        <Suspense fallback={<RiskAnalysisFallback />}>
          <RiskAnalysisSection
            critical={riskBuckets.critical}
            high={riskBuckets.high}
            elevated={riskBuckets.elevated}
            safe={riskBuckets.safe}
            isLoading={isLoading}
          />
        </Suspense>

        <Suspense fallback={<LatestActivityFallback />}>
          <LatestActivitySection
            liquidations={liquidations}
            redemptions={redemptions}
            isLoading={isLoading}
          />
        </Suspense>

        <Suspense fallback={<AllTrovesFallback />}>
          <AllTrovesSection troves={troves} isLoading={isLoading} />
        </Suspense>
      </main>

      <BridgedAssetsDialog
        open={isBridgedAssetsOpen}
        onOpenChange={setIsBridgedAssetsOpen}
        assets={bridgeAssets}
        isLoading={isLoading}
      />
      <DebtCalculatorDialog
        open={isDebtCalculatorOpen}
        onOpenChange={setIsDebtCalculatorOpen}
        btcPrice={systemMetrics.btcPrice}
        troves={troves}
        walletAccount={wallet.account}
      />
      <RedemptionDialog
        open={isRedemptionDialogOpen}
        onOpenChange={setIsRedemptionDialogOpen}
        wallet={wallet}
      />
      {/* <SwapDialog open={isSwapDialogOpen} onOpenChange={setIsSwapDialogOpen} /> */}
    </div>
  );
};

export default Index;
