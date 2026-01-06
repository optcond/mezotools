import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Sparkles, Vote } from "lucide-react";
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

const formatUsd = (value?: number | null) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
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
  const [calculatorInput, setCalculatorInput] = useState("");
  const [calculatorVotes, setCalculatorVotes] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<"votes" | "apr">("votes");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

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
        "token" in item && typeof item.token === "string" ? item.token : null;
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
  const totalVeSupply = gaugeState ? toBigInt(gaugeState.ve_supply_live) : null;
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

    return [...gauges].map((gauge) => {
      const totalBribes = sumBribes(gauge.rewards);
      const votesBtc = toNumber(gauge.votes, 18);
      const bribeValueUsd = gauge.rewards.reduce((acc, reward) => {
        const tokenAddress = reward.token.toLowerCase();
        if (tokenAddress === MezoTokens.BTC.address.toLowerCase()) {
          return acc + toNumber(reward.amount, 18) * btcPrice;
        }
        if (
          tokenAddress === MezoTokens.MUSD.address.toLowerCase() ||
          tokenAddress === MezoTokens.mUSDT.address.toLowerCase() ||
          tokenAddress === MezoTokens.mUSDC.address.toLowerCase()
        ) {
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
        votesBtc,
        bribeValueUsd,
        annualBribeUsd,
        aprPercent,
      };
    });
  }, [btcPrice, gauges]);

  const sortedGauges = useMemo(() => {
    const sorted = [...gaugesWithTotals];
    const multiplier = sortOrder === "asc" ? 1 : -1;
    sorted.sort((a, b) => {
      if (sortKey === "votes") {
        if (a.votes === b.votes) return 0;
        return (a.votes > b.votes ? 1 : -1) * multiplier;
      }
      if (a.aprPercent === b.aprPercent) return 0;
      return (a.aprPercent > b.aprPercent ? 1 : -1) * multiplier;
    });
    return sorted;
  }, [gaugesWithTotals, sortKey, sortOrder]);

  const handleSort = (key: "votes" | "apr") => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortOrder("desc");
  };

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

  const parseVoteInput = (value: string) => {
    const trimmed = value.trim();
    const normalized = trimmed.includes(".")
      ? trimmed.replace(/,/g, "")
      : trimmed.replace(",", ".");
    if (!normalized) return null;
    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  };

  const calculatorAllocations = useMemo(() => {
    if (!calculatorVotes || calculatorVotes <= 0 || btcPrice <= 0) {
      return new Map<
        string,
        { allocation: number; proportion: number; newAprPercent: number | null }
      >();
    }

    const candidates = gaugesWithTotals.filter(
      (gauge) => gauge.annualBribeUsd > 0 && gauge.votesBtc >= 0
    );
    if (candidates.length === 0) {
      return new Map<
        string,
        { allocation: number; proportion: number; newAprPercent: number | null }
      >();
    }

    const maxDerivative = Math.max(
      ...candidates.map((gauge) => {
        const votes = Math.max(gauge.votesBtc, 1e-9);
        return gauge.annualBribeUsd / votes;
      })
    );

    if (!Number.isFinite(maxDerivative) || maxDerivative <= 0) {
      return new Map<
        string,
        { allocation: number; proportion: number; newAprPercent: number | null }
      >();
    }

    let low = 0;
    let high = maxDerivative;
    for (let i = 0; i < 80; i += 1) {
      const mid = (low + high) / 2;
      if (mid <= 0) {
        high = mid;
        continue;
      }
      const totalAllocated = candidates.reduce((acc, gauge) => {
        const target =
          Math.sqrt((gauge.annualBribeUsd * gauge.votesBtc) / mid) -
          gauge.votesBtc;
        return acc + Math.max(0, target);
      }, 0);
      if (totalAllocated > calculatorVotes) {
        low = mid;
      } else {
        high = mid;
      }
    }

    const allocationMap = new Map<
      string,
      { allocation: number; proportion: number; newAprPercent: number | null }
    >();
    const allocations = candidates.map((gauge) => {
      const target =
        Math.sqrt((gauge.annualBribeUsd * gauge.votesBtc) / high) -
        gauge.votesBtc;
      const allocation = Math.max(0, target);
      return { gauge, allocation };
    });

    allocations.forEach(({ gauge, allocation }) => {
      const newVotes = gauge.votesBtc + allocation;
      const newAprPercent =
        newVotes > 0
          ? (gauge.annualBribeUsd / (newVotes * btcPrice)) * 100
          : null;
      allocationMap.set(gauge.gauge, {
        allocation,
        proportion: allocation / calculatorVotes,
        newAprPercent,
      });
    });

    return allocationMap;
  }, [btcPrice, calculatorVotes, gaugesWithTotals]);

  const handleCalculate = () => {
    setCalculatorVotes(parseVoteInput(calculatorInput));
  };

  const handleReset = () => {
    setCalculatorInput("");
    setCalculatorVotes(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-5xl flex-col gap-4 overflow-y-auto sm:h-auto sm:w-full sm:max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Vote className="h-5 w-5 text-primary" />
            Gauge bribes
          </DialogTitle>
          <DialogDescription className="space-y-2 text-sm">
            <p>
              Bribes and vote weights refresh every minute while this dialog is
              open
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
                <div className="font-medium text-foreground">Epoch ends in</div>
                <p>Time remaining until the current epoch ends.</p>
              </div>
              <div className="space-y-1 rounded-lg border border-card-border/60 bg-muted/20 p-3">
                <div className="text-sm font-semibold text-foreground">
                  {voteClosesAt}
                </div>
                <div className="font-medium text-foreground">Voting closes</div>
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
          <div className="mb-4 rounded-xl border border-card-border/60 bg-muted/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-foreground">
                  Gauge bribes calculator
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter your veBTC balance to estimate the best vote split and
                  updated APRs.
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <Input
                  value={calculatorInput}
                  onChange={(event) => setCalculatorInput(event.target.value)}
                  placeholder="veBTC amount"
                  inputMode="decimal"
                  className="sm:w-48"
                />
                <Button onClick={handleCalculate} type="button">
                  Calculate
                </Button>
                <Button onClick={handleReset} type="button" variant="outline">
                  Reset
                </Button>
              </div>
            </div>
          </div>
          <Alert className="mb-4 border border-primary/40 bg-primary/5">
            <Sparkles className="h-4 w-4" />
            <AlertDescription>
              <p>
                We are using BTC, MUSD, mUSDT and mUSDC for APR calculation only
                and ignoring other tokens for now. This will be changed in
                future releases.
              </p>
              <p>Stablecoin values are assumed to be $1.</p>
            </AlertDescription>
          </Alert>
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
            <div className="space-y-4">
              <div className="hidden md:block pr-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Gauge</TableHead>
                      <TableHead>Bribes (epoch)</TableHead>
                      <TableHead>
                        <button
                          type="button"
                          onClick={() => handleSort("apr")}
                          className="flex items-center gap-1 text-left text-sm font-semibold text-foreground transition-smooth hover:text-primary"
                        >
                          APR
                          {sortKey === "apr"
                            ? sortOrder === "asc"
                              ? "↑"
                              : "↓"
                            : null}
                        </button>
                      </TableHead>
                      <TableHead className="text-right">
                        <button
                          type="button"
                          onClick={() => handleSort("votes")}
                          className="ml-auto flex items-center gap-1 text-right text-sm font-semibold text-foreground transition-smooth hover:text-primary"
                        >
                          Votes
                          {sortKey === "votes"
                            ? sortOrder === "asc"
                              ? "↑"
                              : "↓"
                            : null}
                        </button>
                      </TableHead>
                      <TableHead>Calculator</TableHead>
                      <TableHead>Bribes received</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedGauges.map((gauge) => {
                      const allocation = calculatorAllocations.get(gauge.gauge);
                      const allocationPercent =
                        allocation && Number.isFinite(allocation.proportion)
                          ? allocation.proportion * 100
                          : null;
                      const allocationAmount =
                        allocation && Number.isFinite(allocation.allocation)
                          ? allocation.allocation
                          : null;
                      const newApr =
                        allocation && Number.isFinite(allocation.newAprPercent)
                          ? allocation.newAprPercent
                          : null;
                      const allocationShare =
                        allocation &&
                        Number.isFinite(allocation.allocation) &&
                        allocation.allocation > 0 &&
                        gauge.votesBtc + allocation.allocation > 0
                          ? allocation.allocation /
                            (gauge.votesBtc + allocation.allocation)
                          : null;
                      const bribesReceivedUsd =
                        allocationShare !== null
                          ? gauge.bribeValueUsd * allocationShare
                          : null;

                      return (
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
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="text-sm font-semibold text-foreground">
                              {formatVeBtc(gauge.votes)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1 text-xs">
                              <div className="font-semibold text-foreground">
                                {allocationPercent !== null
                                  ? `${allocationPercent.toFixed(2)}%`
                                  : "—"}
                              </div>
                              <div className="text-muted-foreground">
                                {allocationAmount !== null
                                  ? `${allocationAmount.toFixed(4)} veBTC`
                                  : "Best split"}
                              </div>
                              <div className="text-foreground">
                                {newApr !== null
                                  ? `${newApr.toFixed(2)}%`
                                  : "—"}
                              </div>
                              <div className="text-muted-foreground">
                                new APR
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1 text-xs">
                              <div className="font-semibold text-foreground">
                                {bribesReceivedUsd !== null
                                  ? `~$${formatUsd(bribesReceivedUsd)}`
                                  : "—"}
                              </div>
                              {allocationShare !== null &&
                              gauge.rewards.length > 0 ? (
                                <div className="space-y-1">
                                  {gauge.rewards.map((reward) => (
                                    <div
                                      key={`${gauge.gauge}-received-${reward.token}`}
                                      className="flex flex-wrap items-center gap-2"
                                    >
                                      <span className="font-mono text-foreground">
                                        {formatDecimalString(
                                          (
                                            Number.parseFloat(
                                              formatUnits(reward.amount, 18)
                                            ) * allocationShare
                                          ).toString(),
                                          reward.token.toLowerCase() ===
                                            MezoTokens.BTC.address.toLowerCase()
                                            ? 6
                                            : 4
                                        )}
                                      </span>
                                      <span className="text-muted-foreground">
                                        {tokenSymbolMap.get(
                                          reward.token.toLowerCase()
                                        ) ?? truncateAddress(reward.token)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 md:hidden">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={sortKey === "votes" ? "default" : "outline"}
                    onClick={() => handleSort("votes")}
                  >
                    Sort by votes
                    {sortKey === "votes"
                      ? sortOrder === "asc"
                        ? " ↑"
                        : " ↓"
                      : null}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={sortKey === "apr" ? "default" : "outline"}
                    onClick={() => handleSort("apr")}
                  >
                    Sort by APR
                    {sortKey === "apr"
                      ? sortOrder === "asc"
                        ? " ↑"
                        : " ↓"
                      : null}
                  </Button>
                </div>
                {sortedGauges.map((gauge) => {
                  const allocation = calculatorAllocations.get(gauge.gauge);
                  const allocationPercent =
                    allocation && Number.isFinite(allocation.proportion)
                      ? allocation.proportion * 100
                      : null;
                  const allocationAmount =
                    allocation && Number.isFinite(allocation.allocation)
                      ? allocation.allocation
                      : null;
                  const newApr =
                    allocation && Number.isFinite(allocation.newAprPercent)
                      ? allocation.newAprPercent
                      : null;
                  const allocationShare =
                    allocation &&
                    Number.isFinite(allocation.allocation) &&
                    allocation.allocation > 0 &&
                    gauge.votesBtc + allocation.allocation > 0
                      ? allocation.allocation /
                        (gauge.votesBtc + allocation.allocation)
                      : null;
                  const bribesReceivedUsd =
                    allocationShare !== null
                      ? gauge.bribeValueUsd * allocationShare
                      : null;

                  return (
                    <div
                      key={gauge.gauge}
                      className="rounded-lg border border-card-border/40 bg-card/30 p-4"
                    >
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

                      <div className="mt-3 space-y-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">
                            Bribes (epoch):
                          </span>{" "}
                          {gauge.rewards.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              No active bribes
                            </span>
                          ) : (
                            <div className="mt-1 flex flex-col gap-2 text-xs">
                              {gauge.rewards.map((reward) => (
                                <div
                                  key={`${gauge.gauge}-mobile-${reward.token}`}
                                  className="flex flex-wrap items-center gap-2"
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
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <span className="text-muted-foreground">APR:</span>{" "}
                          <span className="font-semibold text-foreground">
                            {Number.isFinite(gauge.aprPercent)
                              ? `${gauge.aprPercent.toFixed(2)}%`
                              : "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Votes:</span>{" "}
                          <span className="font-semibold text-foreground">
                            {formatVeBtc(gauge.votes)}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <span className="text-muted-foreground">
                            Allocation:
                          </span>{" "}
                          <span className="font-semibold text-foreground">
                            {allocationPercent !== null
                              ? `${allocationPercent.toFixed(2)}%`
                              : "—"}
                          </span>
                          <div className="text-xs text-muted-foreground">
                            {allocationAmount !== null
                              ? `${allocationAmount.toFixed(4)} veBTC`
                              : "Best split"}
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            New APR:
                          </span>{" "}
                          <span className="font-semibold text-foreground">
                            {newApr !== null ? `${newApr.toFixed(2)}%` : "—"}
                          </span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-muted-foreground">
                            Bribes received:
                          </span>{" "}
                          <span className="font-semibold text-foreground">
                            {bribesReceivedUsd !== null
                              ? `~$${formatUsd(bribesReceivedUsd)}`
                              : "—"}
                          </span>
                          {allocationShare !== null &&
                          gauge.rewards.length > 0 ? (
                            <div className="mt-2 space-y-1 text-xs">
                              {gauge.rewards.map((reward) => (
                                <div
                                  key={`${gauge.gauge}-mobile-received-${reward.token}`}
                                  className="flex flex-wrap items-center gap-2"
                                >
                                  <span className="font-mono text-foreground">
                                    {formatDecimalString(
                                      (
                                        Number.parseFloat(
                                          formatUnits(reward.amount, 18)
                                        ) * allocationShare
                                      ).toString(),
                                      reward.token.toLowerCase() ===
                                        MezoTokens.BTC.address.toLowerCase()
                                        ? 6
                                        : 4
                                    )}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {tokenSymbolMap.get(
                                      reward.token.toLowerCase()
                                    ) ?? truncateAddress(reward.token)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
