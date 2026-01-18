import { Vault } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/formatNumber";
import { TableCard, TableShell } from "@/components/TableShell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Trove } from "@/hooks/useMonitorData";

interface AllTrovesPreviewProps {
  troves: Trove[];
  onOpenFullTable?: () => void;
}

const riskBadgeClass = "h-5 px-2 text-[10px] font-semibold uppercase";

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
  if (cr < 1.2) {
    return (
      <Badge variant="destructive" className={riskBadgeClass}>
        Critical
      </Badge>
    );
  }
  if (cr < 1.6) {
    return <Badge className={`${riskBadgeClass} bg-high text-white`}>High</Badge>;
  }
  if (cr < 2.0) {
    return (
      <Badge className={`${riskBadgeClass} bg-elevated text-black`}>
        Elevated
      </Badge>
    );
  }
  return <Badge className={`${riskBadgeClass} bg-safe text-white`}>Safe</Badge>;
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
            <TableShell className="hidden md:block">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow>
                    <TableHead>Address</TableHead>
                    <TableHead className="text-right">Collateral</TableHead>
                    <TableHead className="text-right">Debt</TableHead>
                    <TableHead className="text-right">CR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {riskiestTroves.map((trove) => (
                    <TableRow key={trove.id}>
                      <TableCell>
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
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatNumber(trove.collateral, {
                          minimumFractionDigits: 4,
                          maximumFractionDigits: 4,
                        })}{" "}
                        BTC
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatNumber(trove.principal_debt + trove.interest, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        MUSD
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold ${getCrColor(
                          trove.collaterization_ratio
                        )}`}
                      >
                        {formatNumber(trove.collaterization_ratio * 100, {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}
                        %
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableShell>

            <div className="space-y-3 md:hidden">
              {riskiestTroves.map((trove) => (
                <TableCard key={trove.id}>
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
                </TableCard>
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
