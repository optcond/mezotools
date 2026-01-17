import { Vault } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/formatNumber";
import type { Trove } from "@/hooks/useMonitorData";

interface AllTrovesPreviewProps {
  troves: Trove[];
  onOpenFullTable?: () => void;
}

const truncateAddress = (address: string) => {
  if (address.length <= 12) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
};

const getCrColor = (cr: number) => {
  if (cr < 1.2) return "text-critical";
  if (cr < 1.6) return "text-high";
  if (cr < 2.0) return "text-elevated";
  return "text-safe";
};

export const AllTrovesPreview = ({
  troves,
  onOpenFullTable,
}: AllTrovesPreviewProps) => {
  const riskiestTroves = [...troves]
    .sort((a, b) => a.collaterization_ratio - b.collaterization_ratio)
    .slice(0, 5);

  return (
    <Card className="glass-card p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-primary">
          <Vault className="h-5 w-5 text-primary" />
          Highest-Risk Troves
        </h2>
        {onOpenFullTable ? (
          <Button size="sm" variant="outline" onClick={onOpenFullTable}>
            Open full table
          </Button>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        {riskiestTroves.length === 0 ? (
          <div className="rounded-xl border border-dashed border-card-border/50 bg-muted/20 p-4 text-sm text-muted-foreground">
            No troves available yet.
          </div>
        ) : (
          riskiestTroves.map((trove) => (
            <div
              key={trove.id}
              className="flex flex-col gap-2 rounded-xl border border-card-border/40 bg-card/30 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <span className="text-xs uppercase text-muted-foreground">
                  Owner
                </span>
                <span className="font-mono text-sm">
                  {truncateAddress(trove.owner)}
                </span>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">CR</div>
                  <div className={`font-semibold ${getCrColor(trove.collaterization_ratio)}`}>
                    {formatNumber(trove.collaterization_ratio * 100, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                    %
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Collateral</div>
                  <div className="font-semibold">
                    {formatNumber(trove.collateral, {
                      minimumFractionDigits: 4,
                      maximumFractionDigits: 4,
                    })}{" "}
                    BTC
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Debt</div>
                  <div className="font-semibold">
                    {formatNumber(trove.principal_debt + trove.interest, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    MUSD
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
};
