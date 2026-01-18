import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
} from "react";
import {
  Loader2,
  AlertTriangle,
  MoreHorizontal,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { Header } from "@/components/Header";
import { BridgedAssetsSheet } from "@/components/BridgedAssetsSheet";
import { DebtCalculatorSheet } from "@/components/DebtCalculatorSheet";
import { RedemptionSheet } from "@/components/RedemptionSheet";
import { BribesSheet } from "@/components/BribesSheet";
// import { SwapDialog } from "@/components/SwapDialog";
import { AllTrovesPreview } from "@/components/AllTrovesPreview";
import { AllTrovesSheet } from "@/components/AllTrovesSheet";
import { LatestActivitySheet } from "@/components/LatestActivitySheet";
import { CustomizeSheet } from "@/components/CustomizeSheet";
import { useMonitorData } from "@/hooks/useMonitorData";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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

const PersonalWalletStatsFallback = () => (
  <div className="glass-card p-6 space-y-4">
    <div className="h-6 w-56 rounded bg-muted/30" />
    <div className="h-32 rounded-xl bg-muted/30" />
    <div className="h-32 rounded-xl bg-muted/30" />
  </div>
);

const WIDGET_STORAGE_KEY = "mezo-dashboard-widgets";
const WIDGET_ORDER_STORAGE_KEY = "mezo-dashboard-widget-order";
const dashboardWidgets = [
  { key: "wallet", label: "Personal wallet" },
  { key: "system-state", label: "System state" },
  { key: "risk", label: "Risk analysis" },
  { key: "price-feed", label: "Price feed" },
  { key: "latest-activity", label: "Latest activity" },
  { key: "troves-summary", label: "Highest-Risk Troves" },
] as const;

type DashboardWidgetKey = (typeof dashboardWidgets)[number]["key"];

const normalizeWidgetOrder = (order: DashboardWidgetKey[]) => {
  const validKeys = new Set(dashboardWidgets.map((widget) => widget.key));
  const unique = order.filter(
    (key, index) => validKeys.has(key) && order.indexOf(key) === index
  );
  const defaults = dashboardWidgets.map((widget) => widget.key);
  const missing = defaults.filter((key) => !unique.includes(key));
  return [...unique, ...missing];
};

const Dashboard = () => {
  const {
    troves,
    liquidations,
    redemptions,
    dailyMetrics,
    indexerState,
    isLoading,
    isFetching,
    error,
    refetch,
    lastUpdatedAt,
  } = useMonitorData();
  const wallet = useWallet();
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [draggingWidget, setDraggingWidget] =
    useState<DashboardWidgetKey | null>(null);
  const [widgetVisibility, setWidgetVisibility] = useState<
    Record<DashboardWidgetKey, boolean>
  >(() => {
    const defaults = dashboardWidgets.reduce(
      (acc, widget) => ({ ...acc, [widget.key]: true }),
      {} as Record<DashboardWidgetKey, boolean>
    );
    if (typeof window === "undefined") {
      return defaults;
    }
    try {
      const stored = window.localStorage.getItem(WIDGET_STORAGE_KEY);
      if (!stored) {
        return defaults;
      }
      const parsed = JSON.parse(stored) as Partial<
        Record<DashboardWidgetKey, boolean>
      >;
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  });
  const [widgetOrder, setWidgetOrder] = useState<DashboardWidgetKey[]>(() => {
    const defaults = dashboardWidgets.map((widget) => widget.key);
    if (typeof window === "undefined") {
      return defaults;
    }
    try {
      const stored = window.localStorage.getItem(WIDGET_ORDER_STORAGE_KEY);
      if (!stored) {
        return defaults;
      }
      const parsed = JSON.parse(stored) as DashboardWidgetKey[];
      return normalizeWidgetOrder(parsed);
    } catch {
      return defaults;
    }
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const sheetParam = searchParams.get("panel");
  const activeSheet =
    sheetParam === "bridged-assets" ||
    sheetParam === "debt-calculator" ||
    sheetParam === "redemption" ||
    sheetParam === "bribes" ||
    sheetParam === "all-troves" ||
    sheetParam === "latest-activity" ||
    sheetParam === "customize"
      ? sheetParam
      : null;

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
  const setSheetParam = (nextSheet: string | null, replace = false) => {
    const nextParams = new URLSearchParams(searchParams);
    if (nextSheet) {
      nextParams.set("panel", nextSheet);
    } else {
      nextParams.delete("panel");
    }
    setSearchParams(nextParams, { replace });
  };

  const handleSheetOpenChange =
    (sheet: string) => (open: boolean) => {
      setSheetParam(open ? sheet : null, !open);
    };

  useEffect(() => {
    try {
      window.localStorage.setItem(
        WIDGET_STORAGE_KEY,
        JSON.stringify(widgetVisibility)
      );
    } catch {
      // Ignore storage failures (private mode or disabled storage).
    }
  }, [widgetVisibility]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        WIDGET_ORDER_STORAGE_KEY,
        JSON.stringify(widgetOrder)
      );
    } catch {
      // Ignore storage failures (private mode or disabled storage).
    }
  }, [widgetOrder]);

  const toggleWidget = (key: DashboardWidgetKey) => {
    setWidgetVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const moveWidget = (fromKey: DashboardWidgetKey, toKey: DashboardWidgetKey) => {
    if (fromKey === toKey) {
      return;
    }
    setWidgetOrder((prev) => {
      const fromIndex = prev.indexOf(fromKey);
      const toIndex = prev.indexOf(toKey);
      if (fromIndex === -1 || toIndex === -1) {
        return prev;
      }
      const next = [...prev];
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, fromKey);
      return next;
    });
  };

  const moveWidgetByOffset = (key: DashboardWidgetKey, offset: number) => {
    if (!offset) {
      return;
    }
    setWidgetOrder((prev) => {
      const fromIndex = prev.indexOf(key);
      const toIndex = fromIndex + offset;
      if (fromIndex === -1 || toIndex < 0 || toIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, key);
      return next;
    });
  };

  const handleDragStart =
    (key: DashboardWidgetKey) => (event: DragEvent<HTMLDivElement>) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", key);
      setDraggingWidget(key);
    };

  const handleDragOver =
    (key: DashboardWidgetKey) => (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (draggingWidget && draggingWidget !== key) {
        moveWidget(draggingWidget, key);
        setDraggingWidget(key);
      }
    };

  const handleDrop =
    (key: DashboardWidgetKey) => (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const sourceKey = event.dataTransfer.getData(
        "text/plain"
      ) as DashboardWidgetKey;
      if (sourceKey) {
        moveWidget(sourceKey, key);
      }
      setDraggingWidget(null);
    };

  const handleDragEnd = () => {
    setDraggingWidget(null);
  };

  const widgetContent: Record<DashboardWidgetKey, JSX.Element> = {
    wallet: (
      <Suspense fallback={<PersonalWalletStatsFallback />}>
        <PersonalWalletStatsSection
          troves={troves}
          liquidations={liquidations}
          redemptions={redemptions}
          isLoading={isLoading}
          wallet={wallet}
            onDebtCalculatorClick={() => setSheetParam("debt-calculator")}
        />
      </Suspense>
    ),
    "system-state": (
      <Suspense fallback={<SystemStateFallback />}>
        <SystemStateSection
          tcr={systemMetrics.tcr}
          tcrMinus10={systemMetrics.tcrMinus10}
          totalCollateral={systemMetrics.totalCollateral}
          totalDebt={systemMetrics.totalDebt}
          totalTroves={systemMetrics.totalTroves}
          chartData={chartData}
          isLoading={isLoading}
        />
      </Suspense>
    ),
    "price-feed": (
      <Suspense fallback={<PriceFeedHistoryFallback />}>
        <PriceFeedHistorySection />
      </Suspense>
    ),
    risk: (
      <Suspense fallback={<RiskAnalysisFallback />}>
        <RiskAnalysisSection
          critical={riskBuckets.critical}
          high={riskBuckets.high}
          elevated={riskBuckets.elevated}
          safe={riskBuckets.safe}
          isLoading={isLoading}
        />
      </Suspense>
    ),
    "latest-activity": (
      <Suspense fallback={<LatestActivityFallback />}>
        <LatestActivitySection
          liquidations={liquidations}
          redemptions={redemptions}
          isLoading={isLoading}
          onOpenFullTable={() => setSheetParam("latest-activity")}
        />
      </Suspense>
    ),
    "troves-summary": (
      <AllTrovesPreview
        troves={troves}
        onOpenFullTable={() => setSheetParam("all-troves")}
      />
    ),
  };

  return (
    <div className="min-h-screen">
      <Header
        blockNumber={blockNumber}
        blockTimestamp={blockTimestamp}
        lastUpdatedAt={effectiveLastUpdated}
        btcPrice={systemMetrics.btcPrice}
        isSyncing={isRefreshing}
        onBridgedAssetsClick={() => setSheetParam("bridged-assets")}
        onDebtCalculatorClick={() => setSheetParam("debt-calculator")}
        onRedeemClick={() => setSheetParam("redemption")}
        onBribesClick={() => setSheetParam("bribes")}
        onTrovesClick={() => setSheetParam("all-troves")}
        onCustomizeClick={() => setSheetParam("customize")}
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

        {widgetOrder
          .filter((key) => widgetVisibility[key])
          .map((key) => (
            <div key={key}>{widgetContent[key]}</div>
          ))}
      </main>

      <div className="fixed bottom-6 right-4 z-40 sm:hidden">
        <Button
          type="button"
          size="lg"
          className="h-14 w-14 rounded-full p-0 shadow-xl shadow-primary/30"
          onClick={() => setIsActionsOpen(true)}
          aria-label="Actions"
        >
          <MoreHorizontal className="h-6 w-6" />
          <span className="sr-only">Actions</span>
        </Button>
      </div>

      <BridgedAssetsSheet
        open={activeSheet === "bridged-assets"}
        onOpenChange={handleSheetOpenChange("bridged-assets")}
      />
      <DebtCalculatorSheet
        open={activeSheet === "debt-calculator"}
        onOpenChange={handleSheetOpenChange("debt-calculator")}
        btcPrice={systemMetrics.btcPrice}
        troves={troves}
        walletAccount={wallet.account}
      />
      <RedemptionSheet
        open={activeSheet === "redemption"}
        onOpenChange={handleSheetOpenChange("redemption")}
        wallet={wallet}
      />
      <BribesSheet
        open={activeSheet === "bribes"}
        onOpenChange={handleSheetOpenChange("bribes")}
        btcPrice={systemMetrics.btcPrice}
      />
      <AllTrovesSheet
        open={activeSheet === "all-troves"}
        onOpenChange={handleSheetOpenChange("all-troves")}
        troves={troves}
        isLoading={isLoading}
      />
      <LatestActivitySheet
        open={activeSheet === "latest-activity"}
        onOpenChange={handleSheetOpenChange("latest-activity")}
        liquidations={liquidations}
        redemptions={redemptions}
        isLoading={isLoading}
      />
      <CustomizeSheet
        open={activeSheet === "customize"}
        onOpenChange={handleSheetOpenChange("customize")}
        widgets={dashboardWidgets}
        widgetOrder={widgetOrder}
        widgetVisibility={widgetVisibility}
        draggingWidget={draggingWidget}
        onToggleWidget={toggleWidget}
        onMoveWidgetByOffset={moveWidgetByOffset}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
      />
      <Sheet open={isActionsOpen} onOpenChange={setIsActionsOpen}>
        <SheetContent
          side="bottom"
          className="flex w-full flex-col gap-4 rounded-t-2xl border-x-0 border-b-0"
          enableSwipeClose
          onSwipeClose={() => setIsActionsOpen(false)}
        >
          <SheetHeader>
            <SheetTitle>Actions</SheetTitle>
            <SheetDescription>
              Quick access to dashboard tools.
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsActionsOpen(false);
                setSheetParam("bridged-assets");
              }}
            >
              Bridged assets
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsActionsOpen(false);
                setSheetParam("redemption");
              }}
            >
              Redeem
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsActionsOpen(false);
                setSheetParam("customize");
              }}
            >
              Customize
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      {/* <SwapDialog open={isSwapDialogOpen} onOpenChange={setIsSwapDialogOpen} /> */}
    </div>
  );
};

export default Dashboard;
