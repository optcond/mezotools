import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Vote } from "lucide-react";
import type { GaugeIncentive } from "@mtools/shared";
import { MezoTokens } from "@mtools/shared";
import { formatUnits } from "viem";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
const EPOCHS_PER_YEAR = 52n;

const formatDecimalString = (value?: string | null, fractionDigits = 4) => {
  if (!value) return "—";
  const [whole, fraction = ""] = value.split(".");
  const trimmedFraction = fraction.slice(0, fractionDigits);
  const normalizedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return trimmedFraction.length
    ? `${normalizedWhole}.${trimmedFraction}`
    : normalizedWhole;
};

const formatVeBtc = (value?: bigint | null, fractionDigits = 4) => {
  if (value === null || value === undefined) return "—";
  return formatDecimalString(formatUnits(value, 18), fractionDigits);
};

const truncateAddress = (address: string) => {
  if (!address) return "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
};

const sumBribes = (rewards: GaugeIncentive["rewards"]) =>
  rewards.reduce((acc, reward) => acc + reward.amount, 0n);

type GaugeRow = Tables<"gauges">;
type GaugeStateRow = Tables<"gauge_state">;

interface BribesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  btcPrice: number;
}

export const BribesDialog = ({
  open,
  onOpenChange,
  btcPrice,
}: BribesDialogProps) => {
  const toBigInt = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return 0n;
    if (typeof value === "number") return BigInt(Math.trunc(value));
    if (value === "") return 0n;
    return BigInt(value);
  };

  const parseBribes = (
    bribes: GaugeRow["bribes"],
    epochStart: bigint
  ): GaugeIncentive["rewards"] => {
    if (!Array.isArray(bribes)) return [];
    const rewards: GaugeIncentive["rewards"] = [];
    for (const item of bribes) {
      if (!item || typeof item !== "object") continue;
      const token =
        "token" in item && typeof item.token === "string"
          ? item.token
          : null;
      const amountValue =
        "amount" in item ? (item as { amount?: unknown }).amount : null;
      const amount =
        typeof amountValue === "string"
          ? amountValue
          : typeof amountValue === "number"
            ? Math.trunc(amountValue).toString()
            : null;
      if (!token || amount === null) continue;
      rewards.push({
        token: token as `0x${string}`,
        amount: toBigInt(amount),
        epochStart,
      });
    }
    return rewards;
  };

  const query = useQuery({
    queryKey: ["bribes-data"],
    enabled: open,
    refetchInterval: open ? 60_000 : false,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
    queryFn: async () => {
      const [{ data: gaugeState, error: gaugeStateError }, gaugesRes] =
        await Promise.all([
          supabase
            .from("gauge_state")
            .select("*")
            .eq("key", "current")
            .maybeSingle<GaugeStateRow>(),
          supabase.from("gauges").select("*").order("votes", {
            ascending: false,
          }),
        ]);

      if (gaugeStateError) {
        throw new Error(gaugeStateError.message);
      }

      if (gaugesRes.error) {
        throw new Error(gaugesRes.error.message);
      }

      return {
        gaugeState,
        gauges: gaugesRes.data ?? [],
      };
    },
  });

  const gaugeState = query.data?.gaugeState ?? null;
  const gaugeRows = query.data?.gauges ?? [];
  const now = BigInt(Math.floor(Date.now() / 1000));
  const epochTiming = gaugeState
    ? {
        now,
        epochEnd: toBigInt(gaugeState.epoch_end),
        voteEnd: toBigInt(gaugeState.vote_end),
      }
    : null;
  const totalVeSupply = gaugeState
    ? toBigInt(gaugeState.ve_supply_live)
    : null;
  const totalVotingPower = gaugeState
    ? toBigInt(gaugeState.total_votes_snapshot)
    : null;
  const totalVotesTracked = gaugeState
    ? toBigInt(gaugeState.total_votes_tracked)
    : null;
  const epochStartSupply = gaugeState
    ? toBigInt(gaugeState.ve_supply_epoch_start)
    : null;

  const gauges = useMemo(() => {
    return gaugeRows.map((row) => {
      const epochStart = toBigInt(row.epoch_start);
      return {
        pool: row.pool as `0x${string}`,
        poolName: row.pool_name ?? undefined,
        gauge: row.gauge as `0x${string}`,
        bribe: row.bribe as `0x${string}`,
        votes: toBigInt(row.votes),
        duration: toBigInt(row.duration),
        epochStart,
        rewards: parseBribes(row.bribes, epochStart),
      };
    });
  }, [gaugeRows]);

  const tokenSymbolMap = useMemo(() => {
    const entries: Array<[string, string]> = Object.entries(MezoTokens).map(
      ([symbol, token]) => [token.address.toLowerCase(), symbol]
    );
    return new Map<string, string>(entries);
  }, []);

  const gaugesWithTotals = useMemo(() => {
    const toNumber = (value: bigint, decimals = 18) => {
      const parsed = Number.parseFloat(formatUnits(value, decimals));
      return Number.isFinite(parsed) ? parsed : 0;
    };

    return [...gauges]
      .map((gauge) => {
        const totalBribes = sumBribes(gauge.rewards);
        const votesBtc = toNumber(gauge.votes, 18);
        const bribeValueUsd = gauge.rewards.reduce((acc, reward) => {
          const tokenAddress = reward.token.toLowerCase();
          if (tokenAddress === MezoTokens.BTC.address.toLowerCase()) {
            return acc + toNumber(reward.amount, 18) * btcPrice;
          }
          if (tokenAddress === MezoTokens.MUSD.address.toLowerCase()) {
            return acc + toNumber(reward.amount, 18);
          }
          return acc;
        }, 0);
        const annualBribeUsd = bribeValueUsd * Number(EPOCHS_PER_YEAR);
        const aprPercent =
          votesBtc > 0 && btcPrice > 0
            ? (annualBribeUsd / (votesBtc * btcPrice)) * 100
            : 0;
        return {
          ...gauge,
          totalBribes,
          aprPercent,
        };
      })
      .sort((a, b) => {
        if (a.votes === b.votes) return 0;
        return a.votes > b.votes ? -1 : 1;
      });
  }, [btcPrice, gauges]);

  const totalVotesCast = totalVotesTracked;

  const formatEpochStartSupply = () => {
    if (epochStartSupply === null) return "—";
    return formatVeBtc(epochStartSupply);
  };

  const formatCountdown = (seconds: bigint) => {
    if (seconds <= 0n) return "0m";
    const totalSeconds = Number(seconds);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  const epochEndsIn =
    epochTiming && epochTiming.epochEnd > epochTiming.now
      ? formatCountdown(epochTiming.epochEnd - epochTiming.now)
      : "—";

  const voteClosesAt =
    epochTiming && epochTiming.voteEnd > epochTiming.now
      ? formatCountdown(epochTiming.voteEnd - epochTiming.now)
      : "—";

  const refreshLabel = query.dataUpdatedAt
    ? new Date(query.dataUpdatedAt).toLocaleTimeString()
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-5xl flex-col gap-4 overflow-hidden sm:w-full sm:max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Vote className="h-5 w-5 text-primary" />
            Gauge bribes
          </DialogTitle>
          <DialogDescription className="space-y-2 text-sm">
            <p>
              Bribes and vote weights refresh every minute while this dialog is open
              {refreshLabel ? (
                <span className="text-foreground">
                  {" "}
                  · Updated {refreshLabel}
                </span>
              ) : null}
              .
            </p>
            <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1 rounded-lg border border-card-border/60 bg-muted/20 p-3">
                <div className="text-sm font-semibold text-foreground">
                  {formatVeBtc(totalVeSupply)}
                </div>
                <div className="font-medium text-foreground">
                  Total veBTC supply (live)
                </div>
                <p>Current decayed voting power across all locks.</p>
              </div>
              <div className="space-y-1 rounded-lg border border-card-border/60 bg-muted/20 p-3">
                <div className="text-sm font-semibold text-foreground">
                  {epochEndsIn}
                </div>
                <div className="font-medium text-foreground">
                  Epoch ends in
                </div>
                <p>Time remaining until the current epoch ends.</p>
              </div>
              <div className="space-y-1 rounded-lg border border-card-border/60 bg-muted/20 p-3">
                <div className="text-sm font-semibold text-foreground">
                  {voteClosesAt}
                </div>
                <div className="font-medium text-foreground">
                  Voting closes
                </div>
                <p>Snapshot voting window cutoff time.</p>
              </div>
              <div className="space-y-1 rounded-lg border border-card-border/60 bg-muted/20 p-3">
                <div className="text-sm font-semibold text-foreground">
                  {formatVeBtc(totalVotingPower)}
                </div>
                <div className="font-medium text-foreground">
                  Total votes cast (snapshot)
                </div>
                <p>Snapshot voting power used for the epoch.</p>
              </div>
              <div className="space-y-1 rounded-lg border border-card-border/60 bg-muted/20 p-3">
                <div className="text-sm font-semibold text-foreground">
                  {formatVeBtc(totalVotesCast)}
                </div>
                <div className="font-medium text-foreground">
                  Votes cast (tracked pools)
                </div>
                <p>Sum of weights for pools we index.</p>
              </div>
              <div className="space-y-1 rounded-lg border border-card-border/60 bg-muted/20 p-3">
                <div className="text-sm font-semibold text-foreground">
                  {formatEpochStartSupply()}
                </div>
                <div className="font-medium text-foreground">
                  veBTC supply (epoch start)
                </div>
                <p>Voting power at the start of the current epoch.</p>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          {query.isLoading && gauges.length === 0 ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, idx) => (
                <Skeleton key={idx} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : query.error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {query.error instanceof Error
                ? query.error.message
                : "Failed to load gauge bribes."}
            </div>
          ) : gaugesWithTotals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-card-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              No gauges found yet. Try again after the next indexer sync.
            </div>
          ) : (
            <ScrollArea className="flex-1 pr-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gauge</TableHead>
                    <TableHead>Bribes (epoch)</TableHead>
                    <TableHead>APR</TableHead>
                    <TableHead className="text-right">Votes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gaugesWithTotals.map((gauge) => (
                    <TableRow key={gauge.gauge}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-semibold text-foreground">
                            {gauge.poolName ?? "Unknown pool"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Pool{" "}
                            <a
                              href={`https://explorer.mezo.org/address/${gauge.pool}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-foreground underline-offset-2 hover:underline"
                            >
                              {truncateAddress(gauge.pool)}
                            </a>{" "}
                            · Gauge{" "}
                            <a
                              href={`https://explorer.mezo.org/address/${gauge.gauge}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-foreground underline-offset-2 hover:underline"
                            >
                              {truncateAddress(gauge.gauge)}
                            </a>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2">
                          {gauge.rewards.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              No active bribes
                            </span>
                          ) : (
                            gauge.rewards.map((reward) => (
                              <div
                                key={`${gauge.gauge}-${reward.token}`}
                                className="flex flex-wrap items-center gap-2 text-xs"
                              >
                                <Badge variant="outline" className="p-0">
                                  <a
                                    href={`https://explorer.mezo.org/address/${reward.token}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-2 py-0.5 underline-offset-2 hover:underline"
                                  >
                                    {tokenSymbolMap.get(
                                      reward.token.toLowerCase()
                                    ) ?? truncateAddress(reward.token)}
                                  </a>
                                </Badge>
                                <span className="font-mono text-foreground">
                                  {formatDecimalString(
                                    formatUnits(reward.amount, 18),
                                    4
                                  )}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-xs">
                          <div className="font-semibold text-foreground">
                            {Number.isFinite(gauge.aprPercent)
                              ? `${gauge.aprPercent.toFixed(2)}%`
                              : "—"}
                          </div>
                          <div className="text-muted-foreground">
                            annualized vs BTC value
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="text-sm font-semibold text-foreground">
                          {formatVeBtc(gauge.votes)}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
