import { useEffect, useMemo, useState } from "react";
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
import {
  GaugesFetcher,
  GaugeIncentive,
  MezoChain,
  MezoTokens,
} from "@mtools/shared";
import { createPublicClient, formatUnits, http, PublicClient } from "viem";

const REFRESH_INTERVAL_MS = 60_000;
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
  const [gauges, setGauges] = useState<GaugeIncentive[]>([]);
  const [totalVotingPower, setTotalVotingPower] = useState<bigint | null>(null);
  const [totalVeSupply, setTotalVeSupply] = useState<bigint | null>(null);
  const [epochStartSupply, setEpochStartSupply] = useState<{
    epochStart: bigint;
    supply: bigint;
  } | null>(null);
  const [epochTiming, setEpochTiming] = useState<{
    now: bigint;
    epochEnd: bigint;
    voteEnd: bigint;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: MezoChain,
        transport: http(MezoChain.rpcUrls.default.http[0]),
      }),
    []
  );

  const fetcher = useMemo(
    () => new GaugesFetcher(publicClient as PublicClient),
    [publicClient]
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [
          fetchedGauges,
          totalPower,
          veSupply,
          veSupplyAtEpoch,
          timing,
        ] = await Promise.all([
          fetcher.fetchGaugeIncentives({ probeAdjacentEpochs: true }),
          fetcher.getTotalVotingPower(),
          fetcher.getTotalVeSupply(),
          fetcher.getTotalVeSupplyAtEpochStart(),
          fetcher.getEpochTiming(),
        ]);
        if (cancelled) return;
        setGauges(fetchedGauges);
        setTotalVotingPower(totalPower);
        setTotalVeSupply(veSupply);
        setEpochStartSupply(veSupplyAtEpoch);
        setEpochTiming({
          now: timing.now,
          epochEnd: timing.epochEnd,
          voteEnd: timing.voteEnd,
        });
        setLastUpdated(new Date());
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load gauge bribes."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchData();
    intervalId = setInterval(fetchData, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [fetcher, open]);

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

  const totalVotesCast = useMemo(
    () => gauges.reduce((acc, gauge) => acc + gauge.votes, 0n),
    [gauges]
  );

  const formatEpochStartSupply = () => {
    if (!epochStartSupply) return "—";
    return formatVeBtc(epochStartSupply.supply);
  };

  const formatCountdown = (seconds: bigint) => {
    if (seconds <= 0n) return "0m";
    const totalSeconds = Number(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const epochEndsIn =
    epochTiming && epochTiming.epochEnd > epochTiming.now
      ? formatCountdown(epochTiming.epochEnd - epochTiming.now)
      : "—";

  const voteClosesAt =
    epochTiming && epochTiming.voteEnd > 0n
      ? new Date(Number(epochTiming.voteEnd) * 1000).toLocaleString()
      : "—";

  const refreshLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString()
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
              Bribes and vote weights refresh every minute
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
          {isLoading && gauges.length === 0 ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, idx) => (
                <Skeleton key={idx} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : gaugesWithTotals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-card-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              No gauges found yet. Try again after the next refresh.
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
