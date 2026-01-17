import { Vault } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const getCrBadge = (cr: number) => {
  if (cr < 1.2) return <Badge variant="destructive">Critical</Badge>;
  if (cr < 1.6) return <Badge className="bg-high text-white">High</Badge>;
  if (cr < 2.0) {
    return <Badge className="bg-elevated text-black">Elevated</Badge>;
  }
  return <Badge className="bg-safe text-white">Safe</Badge>;
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
      </div>

      <div className="mt-4 space-y-3">
        {riskiestTroves.length === 0 ? (
          <div className="rounded-xl border border-dashed border-card-border/50 bg-muted/20 p-4 text-sm text-muted-foreground">
            No troves available yet.
          </div>
        ) : (
          <>
            <div className="hidden md:block rounded-xl border border-card-border/60 overflow-hidden bg-card/20">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-card-border/60 bg-muted/20 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="p-3 font-medium">Address</th>
                    <th className="p-3 text-right font-medium">Collateral</th>
                    <th className="p-3 text-right font-medium">Debt</th>
                    <th className="p-3 text-right font-medium">CR</th>
                  </tr>
                </thead>
                <tbody>
                  {riskiestTroves.map((trove) => (
                    <tr
                      key={trove.id}
                      className="border-b border-card-border/40 last:border-b-0 hover:bg-muted/20"
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <a
                            href={`https://explorer.mezo.org/address/${trove.owner}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-sm text-primary hover:underline break-all"
                          >
                            {truncateAddress(trove.owner)}
                          </a>
                          {getCrBadge(trove.collaterization_ratio)}
                        </div>
                      </td>
                      <td className="p-3 text-right font-medium">
                        {formatNumber(trove.collateral, {
                          minimumFractionDigits: 4,
                          maximumFractionDigits: 4,
                        })}{" "}
                        BTC
                      </td>
                      <td className="p-3 text-right font-medium">
                        {formatNumber(trove.principal_debt + trove.interest, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        MUSD
                      </td>
                      <td
                        className={`p-3 text-right font-semibold ${getCrColor(
                          trove.collaterization_ratio
                        )}`}
                      >
                        {formatNumber(trove.collaterization_ratio * 100, {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}
                        %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {riskiestTroves.map((trove) => (
                <div
                  key={trove.id}
                  className="rounded-xl border border-card-border/40 bg-card/30 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <a
                      href={`https://explorer.mezo.org/address/${trove.owner}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sm text-primary hover:underline break-all"
                    >
                      {truncateAddress(trove.owner)}
                    </a>
                    {getCrBadge(trove.collaterization_ratio)}
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Collateral:</span>{" "}
                      <span className="font-medium">
                        {formatNumber(trove.collateral, {
                          minimumFractionDigits: 4,
                          maximumFractionDigits: 4,
                        })}{" "}
                        BTC
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Debt:</span>{" "}
                      <span className="font-medium">
                        {formatNumber(trove.principal_debt + trove.interest, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        MUSD
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">CR:</span>{" "}
                      <span
                        className={`font-semibold ${getCrColor(
                          trove.collaterization_ratio
                        )}`}
                      >
                        {formatNumber(trove.collaterization_ratio * 100, {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}
                        %
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {onOpenFullTable ? (
        <div className="mt-4 flex justify-end">
          <Button
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={onOpenFullTable}
          >
            Open full table
          </Button>
        </div>
      ) : null}
    </Card>
  );
};
