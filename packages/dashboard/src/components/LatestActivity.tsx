import { useState } from "react";
import { Activity, ExternalLink, History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatNumber } from "@/lib/formatNumber";

interface Liquidation {
  id: string;
  borrower: string;
  debt: number;
  collateral: number;
  operation: string;
  tx_hash: string;
  block_number: number;
  block_timestamp: string;
}

interface Redemption {
  id: string;
  attempted_amount: number;
  actual_amount: number;
  collateral_sent: number;
  collateral_fee: number;
  affected_borrowers: string[] | null;
  tx_hash: string;
  block_number: number;
  block_timestamp: string;
}

interface LatestActivityProps {
  liquidations: Liquidation[];
  redemptions: Redemption[];
  isLoading: boolean;
}

const truncateAddress = (address: string) => {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const ActivityItem = ({
  type,
  data,
  txHash,
  renderBorrowers,
}: {
  type: "liquidation" | "redemption";
  data: any;
  txHash: string;
  renderBorrowers?: (borrowers: string[]) => JSX.Element | null;
}) => (
  <div className="p-4 rounded-lg bg-card/30 border border-card-border/40 hover:bg-card/50 transition-smooth">
    <div className="flex items-start justify-between mb-2">
      <div>
        <span className="text-sm font-semibold capitalize">{type}</span>
        {type === "liquidation" && (
          <span className="ml-2 text-xs text-muted-foreground font-mono">
            {truncateAddress(data.borrower)}
          </span>
        )}
      </div>
      <Badge variant="outline" className="text-xs font-mono">
        #{formatNumber(data.block_number)}
      </Badge>
    </div>

    <div className="grid grid-cols-1 gap-2 mb-2 text-sm sm:grid-cols-2">
      {type === "liquidation" ? (
        <>
          <div>
            <span className="text-muted-foreground">Debt:</span>{" "}
            <span className="font-medium">
              {formatNumber(data.debt, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              MUSD
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Collateral:</span>{" "}
            <span className="font-medium">
              {formatNumber(data.collateral, {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
              })}{" "}
              BTC
            </span>
          </div>
        </>
      ) : (
        <>
          <div>
            <span className="text-muted-foreground">Attempted:</span>{" "}
            <span className="font-medium">
              {formatNumber(data.attempted_amount, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              MUSD
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Actual:</span>{" "}
            <span className="font-medium">
              {formatNumber(data.actual_amount, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              MUSD
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Collateral:</span>{" "}
            <span className="font-medium">
              {formatNumber(data.collateral_sent, {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
              })}{" "}
              BTC
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Fee:</span>{" "}
            <span className="font-medium">
              {formatNumber(data.collateral_fee, {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
              })}{" "}
              BTC
            </span>
          </div>
        </>
      )}
    </div>

    {type === "redemption" &&
      renderBorrowers &&
      Array.isArray(data.affected_borrowers) &&
      data.affected_borrowers.length > 0 && (
        <div className="mb-3 text-xs">
          {renderBorrowers(data.affected_borrowers)}
        </div>
      )}

    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">
        {new Date(data.block_timestamp).toLocaleString()}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1"
        onClick={() =>
          window.open(`https://explorer.mezo.org/tx/${txHash}`, "_blank")
        }
      >
        <ExternalLink className="h-3 w-3" />
        View
      </Button>
    </div>
  </div>
);

const EmptyState = ({ type }: { type: string }) => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <Activity className="h-12 w-12 text-muted-foreground/40 mb-3" />
    <p className="text-muted-foreground">
      No recent {type}. Confirm the indexer is running.
    </p>
  </div>
);

export const LatestActivity = ({
  liquidations,
  redemptions,
  isLoading,
}: LatestActivityProps) => {
  const [activeTab, setActiveTab] = useState("liquidations");

  const renderBorrowers = (borrowers: string[]) => {
    if (borrowers.length === 0) return null;
    const maxDisplay = 4;
    const visibleBorrowers = borrowers.slice(0, maxDisplay);
    const remaining = borrowers.length - visibleBorrowers.length;

    return (
      <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
        <span className="text-[11px] uppercase tracking-wide font-semibold">
          Borrowers:
        </span>
        {visibleBorrowers.map((borrower, idx) => (
          <Button
            key={`${borrower}-${idx}`}
            variant="link"
            className="h-auto p-0 text-xs font-mono"
            onClick={() =>
              window.open(
                `https://explorer.mezo.org/address/${borrower}`,
                "_blank"
              )
            }
          >
            {truncateAddress(borrower.toLowerCase())}
          </Button>
        ))}
        {remaining > 0 && (
          <span className="text-[11px] text-muted-foreground">
            +{formatNumber(remaining)} more
          </span>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card className="glass-card p-6">
        <h2 className="text-lg font-semibold mb-4">Latest Activity</h2>
        <div className="h-64 bg-muted/20 animate-pulse rounded-xl" />
      </Card>
    );
  }

  return (
    <Card className="glass-card p-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-primary">
            <History className="h-5 w-5 text-primary" />
            Latest Activity
          </h2>
          <TabsList className="flex w-full flex-wrap gap-2 bg-transparent p-0 sm:w-auto sm:flex-nowrap sm:bg-muted/10 sm:p-1">
            <TabsTrigger
              value="liquidations"
              className="flex-1 min-w-[140px] sm:flex-none"
            >
              Liquidations
              <Badge variant="secondary" className="ml-2">
                {formatNumber(liquidations.length)}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="redemptions"
              className="flex-1 min-w-[140px] sm:flex-none"
            >
              Redemptions
              <Badge variant="secondary" className="ml-2">
                {formatNumber(redemptions.length)}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="liquidations">
          {liquidations.length === 0 ? (
            <EmptyState type="liquidations" />
          ) : (
            <ScrollArea className="h-[360px] pr-2 md:pr-4">
              <div className="space-y-3">
                {liquidations.map((liq) => (
                  <ActivityItem
                    key={liq.id}
                    type="liquidation"
                    data={liq}
                    txHash={liq.tx_hash}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="redemptions">
          {redemptions.length === 0 ? (
            <EmptyState type="redemptions" />
          ) : (
            <ScrollArea className="h-[360px] pr-2 md:pr-4">
              <div className="space-y-3">
                {redemptions.map((red) => (
                  <ActivityItem
                    key={red.id}
                    type="redemption"
                    data={red}
                    txHash={red.tx_hash}
                    renderBorrowers={(borrowers) => renderBorrowers(borrowers)}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>
    </Card>
  );
};
