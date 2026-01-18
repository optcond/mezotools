import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableCard, TableShell } from "@/components/TableShell";
import { formatNumber } from "@/lib/formatNumber";

interface Liquidation {
  id: string;
  borrower: string;
  debt: number;
  collateral: number;
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

interface LiquidationsRedemptionsTableProps {
  liquidations: Liquidation[];
  redemptions: Redemption[];
  limit?: number;
  defaultTab?: "liquidations" | "redemptions";
}

const truncateAddress = (address: string) => {
  if (!address) return "—";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
};

export const LiquidationsRedemptionsTable = ({
  liquidations,
  redemptions,
  limit,
  defaultTab = "redemptions",
}: LiquidationsRedemptionsTableProps) => {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const slicedLiquidations = useMemo(
    () => (limit ? liquidations.slice(0, limit) : liquidations),
    [liquidations, limit]
  );
  const slicedRedemptions = useMemo(
    () => (limit ? redemptions.slice(0, limit) : redemptions),
    [redemptions, limit]
  );

  const renderBorrowers = (borrowers: string[] | null) => {
    if (!borrowers || borrowers.length === 0) return "—";
    return (
      <div className="flex flex-col gap-1">
        {borrowers.map((borrower, idx) => (
          <a
            key={`${borrower}-${idx}`}
            href={`https://explorer.mezo.org/address/${borrower}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-sm text-red-600 underline-offset-2 hover:text-red-500 hover:underline"
          >
            {truncateAddress(borrower.toLowerCase())}
          </a>
        ))}
      </div>
    );
  };

  const EmptyState = ({ label }: { label: string }) => (
    <div className="rounded-xl border border-dashed border-card-border/50 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
      No recent {label}. Confirm the indexer is running.
    </div>
  );

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TabsList className="flex w-full flex-wrap gap-2 bg-transparent p-0 sm:w-auto sm:flex-nowrap sm:bg-muted/10 sm:p-1">
          <TabsTrigger
            value="redemptions"
            className="flex-1 min-w-[140px] sm:flex-none"
          >
            Redemptions
            <Badge variant="secondary" className="ml-2">
              {formatNumber(redemptions.length)}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="liquidations"
            className="flex-1 min-w-[140px] sm:flex-none"
          >
            Liquidations
            <Badge variant="secondary" className="ml-2">
              {formatNumber(liquidations.length)}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="liquidations">
        {slicedLiquidations.length === 0 ? (
          <EmptyState label="liquidations" />
        ) : (
          <>
            <TableShell className="hidden md:block">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Borrower</TableHead>
                    <TableHead className="text-right">Debt</TableHead>
                    <TableHead className="text-right">Collateral</TableHead>
                    <TableHead className="text-right">Tx</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slicedLiquidations.map((liq) => (
                    <TableRow key={liq.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatTimestamp(liq.block_timestamp)}
                      </TableCell>
                      <TableCell>
                        <a
                          href={`https://explorer.mezo.org/address/${liq.borrower}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-sm text-red-600 underline-offset-2 hover:text-red-500 hover:underline"
                        >
                          {truncateAddress(liq.borrower)}
                        </a>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatNumber(liq.debt, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        MUSD
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(liq.collateral, {
                          minimumFractionDigits: 4,
                          maximumFractionDigits: 4,
                        })}{" "}
                        BTC
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-sm"
                          onClick={() =>
                            window.open(
                              `https://explorer.mezo.org/tx/${liq.tx_hash}`,
                              "_blank"
                            )
                          }
                        >
                          <ExternalLink className="h-3 w-3" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableShell>

            <div className="space-y-3 md:hidden">
              {slicedLiquidations.map((liq) => (
                <TableCard key={liq.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(liq.block_timestamp)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() =>
                        window.open(
                          `https://explorer.mezo.org/tx/${liq.tx_hash}`,
                          "_blank"
                        )
                      }
                    >
                      <ExternalLink className="h-3 w-3" />
                      View
                    </Button>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Borrower:</span>{" "}
                      <a
                        href={`https://explorer.mezo.org/address/${liq.borrower}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-sm text-red-600 underline-offset-2 hover:text-red-500 hover:underline"
                      >
                        {truncateAddress(liq.borrower)}
                      </a>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Debt:</span>{" "}
                      <span className="font-medium">
                        {formatNumber(liq.debt, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        MUSD
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Collateral:</span>{" "}
                      <span className="font-medium">
                        {formatNumber(liq.collateral, {
                          minimumFractionDigits: 4,
                          maximumFractionDigits: 4,
                        })}{" "}
                        BTC
                      </span>
                    </div>
                  </div>
                </TableCard>
              ))}
            </div>
          </>
        )}
      </TabsContent>

      <TabsContent value="redemptions">
        {slicedRedemptions.length === 0 ? (
          <EmptyState label="redemptions" />
        ) : (
          <>
            <TableShell className="hidden md:block">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Borrowers</TableHead>
                    <TableHead className="text-right">Attempted</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Collateral</TableHead>
                    <TableHead className="text-right">Tx</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slicedRedemptions.map((red) => (
                    <TableRow key={red.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatTimestamp(red.block_timestamp)}
                      </TableCell>
                      <TableCell>
                        {renderBorrowers(red.affected_borrowers)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatNumber(red.attempted_amount, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        MUSD
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(red.actual_amount, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        MUSD
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(red.collateral_sent, {
                          minimumFractionDigits: 4,
                          maximumFractionDigits: 4,
                        })}{" "}
                        BTC
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-sm"
                          onClick={() =>
                            window.open(
                              `https://explorer.mezo.org/tx/${red.tx_hash}`,
                              "_blank"
                            )
                          }
                        >
                          <ExternalLink className="h-3 w-3" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableShell>

            <div className="space-y-3 md:hidden">
              {slicedRedemptions.map((red) => (
                <TableCard key={red.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(red.block_timestamp)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() =>
                        window.open(
                          `https://explorer.mezo.org/tx/${red.tx_hash}`,
                          "_blank"
                        )
                      }
                    >
                      <ExternalLink className="h-3 w-3" />
                      View
                    </Button>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Borrowers:</span>
                      <div className="mt-1">
                        {renderBorrowers(red.affected_borrowers)}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Attempted:</span>{" "}
                      <span className="font-medium">
                        {formatNumber(red.attempted_amount, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        MUSD
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Actual:</span>{" "}
                      <span className="font-medium">
                        {formatNumber(red.actual_amount, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        MUSD
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Collateral:</span>{" "}
                      <span className="font-medium">
                        {formatNumber(red.collateral_sent, {
                          minimumFractionDigits: 4,
                          maximumFractionDigits: 4,
                        })}{" "}
                        BTC
                      </span>
                    </div>
                  </div>
                </TableCard>
              ))}
            </div>
          </>
        )}
      </TabsContent>
    </Tabs>
  );
};
