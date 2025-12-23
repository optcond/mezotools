import { useMemo, useState } from "react";
import { useDashboardStore } from "@/stores/dashboardStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type {
  TroveLiquidationEvent,
  TroveRedemptionEvent,
} from "@mtools/shared";

const formatNumber = (value: number, decimals = 2) =>
  value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const formatTimestamp = (timestamp: number) => {
  if (!timestamp) return "Timestamp unavailable";
  const date = new Date(timestamp * 1000);
  return date.toLocaleString(undefined, {
    hour12: false,
  });
};

const formatAddress = (value: string) =>
  `${value.slice(0, 6)}…${value.slice(value.length - 4)}`;

const formatTxHash = (value: string) =>
  `${value.slice(0, 10)}…${value.slice(value.length - 6)}`;

const explorerTxUrl = (txHash: string) =>
  `https://explorer.mezo.org/tx/${txHash}`;

const StatusBadge = ({ status }: { status: "success" | "failed" }) => {
  const label = status === "success" ? "Success" : "Failed";
  const className =
    status === "success"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
      : "border-red-500/40 bg-red-500/10 text-red-400";

  return (
    <Badge
      variant="outline"
      className={`text-xs uppercase tracking-wide ${className}`}
    >
      {label}
    </Badge>
  );
};

export const ActivityPanel = () => {
  const { liquidations, redemptions } = useDashboardStore();

  const latestCounts = useMemo(
    () => ({
      liquidations: liquidations.length,
      redemptions: redemptions.length,
    }),
    [liquidations.length, redemptions.length]
  );

  const [activeTab, setActiveTab] = useState("liquidations");

  const renderLiquidationRow = (tx: TroveLiquidationEvent) => (
    <div
      key={`${tx.txHash}-${tx.logIndex}-${tx.blockNumber}`}
      className="border border-border/50 rounded-lg p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="text-sm text-foreground font-medium">Liquidation</div>
          <div className="text-sm text-muted-foreground">{tx.borrower}</div>
          {/* <div className="text-sm text-muted-foreground">{tx.operation}</div> */}
          <div className="text-sm text-muted-foreground">
            Block {tx.blockNumber}
          </div>
          {/* <Badge
            variant="secondary"
            className="bg-green-500/20 text-green-400 border-green-500/30"
          >
            {tx.status}
          </Badge> */}
        </div>
        <div className="text-right space-y-1">
          <div className="text-sm">
            <span className="text-muted-foreground">Debt</span>{" "}
            <span className="text-foreground font-medium">
              {formatNumber(tx.debt!)} MUSD
            </span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Collateral</span>{" "}
            <span className="text-foreground font-medium">
              {formatNumber(tx.collateral!, 4)} BTC
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>
          Tx{" "}
          <a
            href={explorerTxUrl(tx.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-primary hover:underline"
          >
            {formatTxHash(tx.txHash)}
          </a>
        </div>
        <div>{formatTimestamp(tx.timestamp)}</div>
      </div>
    </div>
  );

  const renderRedemptionRow = (tx: TroveRedemptionEvent) => (
    <div
      key={`${tx.txHash}-${tx.logIndex}-${tx.blockNumber}`}
      className="border border-border/50 rounded-lg p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="text-sm text-foreground font-medium">Redemption</div>
          <div className="text-sm text-muted-foreground">
            Block {tx.blockNumber}
          </div>
          {/* <Badge
            variant="secondary"
            className="bg-green-500/20 text-green-400 border-green-500/30"
          >
            {tx.status}
          </Badge> */}
        </div>
        <div className="text-right space-y-1">
          <div className="flex gap-6">
            <div className="text-sm">
              <span className="text-muted-foreground">Attempted</span>{" "}
              <span className="text-foreground font-medium">
                {formatNumber(tx.attemptedAmount!)} MUSD
              </span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Actual</span>{" "}
              <span className="text-foreground font-medium">
                {formatNumber(tx.actualAmount!)} MUSD
              </span>
            </div>
          </div>
          <div className="flex gap-6">
            <div className="text-sm">
              <span className="text-muted-foreground">Collateral Sent</span>{" "}
              <span className="text-foreground font-medium">
                {formatNumber(tx.collateralSent!, 4)} BTC
              </span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Collateral Fee</span>{" "}
              <span className="text-foreground font-medium">
                {formatNumber(tx.collateralFee!, 4)} BTC
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>
          Tx{" "}
          <a
            href={explorerTxUrl(tx.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-primary hover:underline"
          >
            {formatTxHash(tx.txHash)}
          </a>
        </div>
        <div>{formatTimestamp(tx.timestamp)}</div>
      </div>
    </div>
  );

  if (liquidations.length === 0 && redemptions.length === 0) {
    return (
      <div className="p-6">
        <Card className="w-full">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-semibold">
              Latest Protocol Activity (10k blocks, 50 events)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <p className="text-lg font-medium">
                Waiting for blockchain data...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  } else {
    return (
      <div className="p-6">
        <Card className="w-full">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-semibold">
                Latest Protocol Activity (10k blocks, 50 events)
              </CardTitle>
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>Liquidations: {latestCounts.liquidations}</span>
                <span>Redemptions: {latestCounts.redemptions}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="liquidations" className="text-sm">
                  Latest Liquidations
                </TabsTrigger>
                <TabsTrigger value="redemptions" className="text-sm">
                  Latest Redemptions
                </TabsTrigger>
              </TabsList>

              <TabsContent value="liquidations" className="mt-0">
                <div className="max-h-96 overflow-y-auto space-y-3 pr-2">
                  {liquidations.map(renderLiquidationRow)}
                </div>
              </TabsContent>

              <TabsContent value="redemptions" className="mt-0">
                <div className="max-h-96 overflow-y-auto space-y-3 pr-2">
                  {redemptions.map(renderRedemptionRow)}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    );
  }
};
