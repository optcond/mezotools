import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ArrowDownLeft, ArrowUpRight, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EthTokens, MezoTokens } from "@mtools/shared";
import { formatUnits } from "viem";

interface BridgedAssetsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatBalance = (value: string) => {
  const asNumber = Number.parseFloat(value);
  if (Number.isFinite(asNumber)) {
    return asNumber.toLocaleString(undefined, {
      maximumFractionDigits: 4,
    });
  }
  return value;
};

const formatTokenAmount = (value: string, decimals: number) => {
  try {
    const formatted = formatUnits(BigInt(value), decimals);
    const asNumber = Number.parseFloat(formatted);
    if (Number.isFinite(asNumber)) {
      return asNumber.toFixed(5);
    }
    return formatted;
  } catch {
    return value;
  }
};

const truncateAddress = (address: string) => {
  if (!address) {
    return "—";
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
};

const isZeroAddress = (address: string) =>
  /^0x0{40}$/i.test(address.trim());

const truncateHash = (hash: string) => {
  if (!hash) {
    return "—";
  }
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
};

export const BridgedAssetsSheet = ({
  open,
  onOpenChange,
}: BridgedAssetsSheetProps) => {
  const query = useQuery({
    queryKey: ["bridge-assets"],
    enabled: open,
    refetchInterval: open ? 60_000 : false,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from("bridge_assets")
        .select("*")
        .order("token_name", { ascending: true });

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      return data ?? [];
    },
  });

  const transfersQuery = useQuery({
    queryKey: ["bridge-transfers"],
    enabled: open,
    refetchInterval: open ? 60_000 : false,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from("bridge_transfers")
        .select("*")
        .order("block_number", { ascending: false })
        .order("transaction_index", { ascending: false })
        .order("transfer_index", { ascending: false })
        .limit(50);

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      return data ?? [];
    },
  });

  const [directionFilter, setDirectionFilter] = useState<
    "all" | "in" | "out"
  >("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "success" | "failed"
  >("all");

  const assets = query.data ?? [];
  const sortedAssets = useMemo(
    () => [...assets].sort((a, b) => a.token_name.localeCompare(b.token_name)),
    [assets]
  );
  const transfers = transfersQuery.data ?? [];
  const filteredTransfers = useMemo(() => {
    return transfers.filter((transfer) => {
      if (directionFilter !== "all" && transfer.direction !== directionFilter) {
        return false;
      }
      if (statusFilter !== "all" && transfer.tx_status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [transfers, directionFilter, statusFilter]);

  const tokenMap = useMemo(() => {
    return new Map(
      Object.entries(MezoTokens).map(([symbol, token]) => [
        token.address.toLowerCase(),
        { symbol, decimals: token.decimals },
      ])
    );
  }, []);
  const ethTokenMap = useMemo(() => {
    return new Map(
      Object.entries(EthTokens).map(([symbol, token]) => [
        token.address.toLowerCase(),
        { symbol, decimals: token.decimals },
      ])
    );
  }, []);
  const bridgeAddress = assets.length > 0 ? assets[0].bridge_address : "0x—";
  const refreshLabel = query.dataUpdatedAt
    ? new Date(query.dataUpdatedAt).toLocaleTimeString()
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-4 overflow-y-auto sm:max-w-3xl"
        enableSwipeClose
        onSwipeClose={() => onOpenChange(false)}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Bridged assets
          </SheetTitle>
          <SheetDescription className="space-y-1 text-sm">
            <p>
              Live balances held by the Mezo bridge contract on Ethereum. Data
              refreshes every minute while this dialog is open
              {refreshLabel ? (
                <span className="text-foreground">
                  {" "}
                  · Updated {refreshLabel}
                </span>
              ) : null}
              .
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              Bridge contract:{" "}
              {bridgeAddress !== "0x—" ? (
                <a
                  href={`https://etherscan.io/address/${bridgeAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline-offset-2 hover:underline"
                >
                  {bridgeAddress}
                </a>
              ) : (
                "—"
              )}
            </p>
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-6">
          {query.isLoading && assets.length === 0 ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <Skeleton key={idx} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : query.error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {query.error instanceof Error
                ? query.error.message
                : "Failed to load bridged assets."}
            </div>
          ) : sortedAssets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-card-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              No bridged assets found yet. The indexer will populate this list
              after the next sync.
            </div>
          ) : (
            <div className="rounded-xl border border-card-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Token</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Mezo</TableHead>
                    <TableHead>Ethereum</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedAssets.map((asset) => (
                    <TableRow key={asset.token_symbol}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{asset.token_name}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {asset.ethereum_symbol}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-primary">
                        {formatBalance(asset.balance_formatted)}
                      </TableCell>
                      <TableCell>
                        <a
                          href={`https://explorer.mezo.org/token/${asset.mezo_address}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs text-foreground underline-offset-2 hover:underline"
                        >
                          {truncateAddress(asset.mezo_address)}
                        </a>
                      </TableCell>
                      <TableCell>
                        <a
                          href={`https://etherscan.io/token/${asset.ethereum_address}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs text-foreground underline-offset-2 hover:underline"
                        >
                          {truncateAddress(asset.ethereum_address)}
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="space-y-3 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Recent bridge transfers
                </h3>
                <p className="text-xs text-muted-foreground">
                  Last 50 transfers indexed by the bridge contract.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={directionFilter}
                  onValueChange={(value) =>
                    setDirectionFilter(value as "all" | "in" | "out")
                  }
                >
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue placeholder="Direction" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All directions</SelectItem>
                    <SelectItem value="in">Incoming</SelectItem>
                    <SelectItem value="out">Outgoing</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={statusFilter}
                  onValueChange={(value) =>
                    setStatusFilter(value as "all" | "success" | "failed")
                  }
                >
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {transfersQuery.isLoading && transfers.length === 0 ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : transfersQuery.error ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {transfersQuery.error instanceof Error
                  ? transfersQuery.error.message
                  : "Failed to load bridge transfers."}
              </div>
            ) : filteredTransfers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-card-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                No transfers matching the selected filters.
              </div>
            ) : (
              <div className="rounded-xl border border-card-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tx</TableHead>
                      <TableHead>Direction</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sender</TableHead>
                      <TableHead>Receiver</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Token</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransfers.map((transfer) => {
                      const tokenMeta =
                        transfer.direction === "in"
                          ? ethTokenMap.get(transfer.asset.toLowerCase())
                          : tokenMap.get(transfer.asset.toLowerCase());
                      const tokenSymbol =
                        tokenMeta?.symbol ?? truncateAddress(transfer.asset);
                      const decimals = tokenMeta?.decimals ?? 18;
                      const senderIsZero = isZeroAddress(transfer.sender);
                      const receiverIsZero = isZeroAddress(transfer.receiver);
                      return (
                        <TableRow key={transfer.id}>
                          <TableCell>
                            <a
                              href={`https://explorer.mezo.org/tx/${transfer.tx_hash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono underline-offset-2 hover:underline"
                            >
                              {truncateHash(transfer.tx_hash)}
                            </a>
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground">
                              {transfer.direction === "in" ? (
                                <>
                                  <ArrowDownLeft className="h-3 w-3 text-emerald-500" />
                                  in
                                </>
                              ) : (
                                <>
                                  <ArrowUpRight className="h-3 w-3 text-rose-500" />
                                  out
                                </>
                              )}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span
                              className={
                                transfer.tx_status === "success"
                                  ? "text-xs font-semibold text-emerald-500"
                                  : "text-xs font-semibold text-rose-500"
                              }
                            >
                              {transfer.tx_status}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {senderIsZero ? (
                              <span className="text-xs text-muted-foreground">
                                Mezo
                              </span>
                            ) : (
                              <a
                                href={`https://explorer.mezo.org/address/${transfer.sender}`}
                                target="_blank"
                                rel="noreferrer"
                                className="underline-offset-2 hover:underline"
                              >
                                {truncateAddress(transfer.sender)}
                              </a>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {receiverIsZero ? (
                              <span className="text-xs text-muted-foreground">
                                Mezo
                              </span>
                            ) : (
                              <a
                                href={`https://explorer.mezo.org/address/${transfer.receiver}`}
                                target="_blank"
                                rel="noreferrer"
                                className="underline-offset-2 hover:underline"
                              >
                                {truncateAddress(transfer.receiver)}
                              </a>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-emerald-500">
                            {formatTokenAmount(transfer.amount, decimals)}
                          </TableCell>
                          <TableCell className="text-xs">{tokenSymbol}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
