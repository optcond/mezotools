import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
} from "wagmi";
import { formatUnits, getAddress, parseUnits, type PublicClient } from "viem";
import { Copy, RefreshCw, RotateCcw, Vote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  MEZO_BC_EXPLORER,
  MezoChain,
  VeVoteFetcher,
  VoterAbi,
  ZERO_ADDRESS,
  bigintSharePct,
  fetchMezoRewardTokenMarkets,
  formatTokenAmount,
  formatUsd,
  formatVotingPower,
  gaugeRowToIncentive,
  getMezoContracts,
  incentivesToOpportunities,
  normalizeWeightsToVotingPower,
  projectGaugeBribeRewards,
  shortenAddress,
} from "@mtools/shared";
import type {
  GaugeBribeTokenReward,
  GaugeIncentive,
  GaugeVoteOpportunity,
  TokenMarket,
  VeLockSummary,
} from "@mtools/shared";

// ── types ──────────────────────────────────────────────────────────────────

type TxState = "idle" | "pending" | "success" | "error";
type GaugeSupabaseRow = Tables<"gauges">;

type ProjectionRow = {
  pool: `0x${string}`;
  vote: bigint;
  projectedRewards: GaugeBribeTokenReward[];
  projectedUsd: number;
  hasUnpricedRewards: boolean;
};

type Projection = {
  rows: ProjectionRow[];
  totalProjectedUsd: number;
  hasUnpricedRewards: boolean;
};

// ── helpers ────────────────────────────────────────────────────────────────

const formatRewardSignalSource = (
  source: GaugeVoteOpportunity["rewardSignalSource"],
): string | null => {
  switch (source) {
    case "current":
      return "Current epoch";
    case "none":
      return "No rewards";
    default:
      return null;
  }
};

const safeParseUnits = (value: string): bigint => {
  try {
    if (!value.trim()) return 0n;
    return parseUnits(value.trim(), 18);
  } catch {
    return 0n;
  }
};

// ── component ──────────────────────────────────────────────────────────────

interface VoteCalculatorSectionProps {
  open: boolean;
  btcPrice: number;
}

export const VoteCalculatorSection = ({
  open,
  btcPrice,
}: VoteCalculatorSectionProps) => {
  const { address } = useAccount();
  const chainId = useChainId();
  const activeChainId = chainId ?? MezoChain.id;
  const publicClient = usePublicClient({ chainId: activeChainId });
  const { data: walletClient } = useWalletClient({ chainId: activeChainId });
  const contracts = useMemo(() => getMezoContracts(chainId), [chainId]);

  // ── state ──────────────────────────────────────────────────────────────
  const [gauges, setGauges] = useState<GaugeVoteOpportunity[]>([]);
  const [locks, setLocks] = useState<VeLockSummary[]>([]);
  const [incentives, setIncentives] = useState<GaugeIncentive[]>([]);
  const [selectedLockId, setSelectedLockId] = useState("");
  /** Manual veBTC VP input — decimal string, used when no lock selected */
  const [manualVpInput, setManualVpInput] = useState("");
  const [draftWeights, setDraftWeights] = useState<Record<string, string>>({});
  const [optimalWeights, setOptimalWeights] = useState<Record<string, bigint>>(
    {},
  );
  const [enabledPools, setEnabledPools] = useState<Record<string, boolean>>({});
  const [tokenMarkets, setTokenMarkets] = useState<Record<string, TokenMarket>>(
    {},
  );
  const [maxVotingNum, setMaxVotingNum] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txState, setTxState] = useState<TxState>("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [sortField, setSortField] = useState<"votes" | "rewardSignal">(
    "rewardSignal",
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // ── fetcher ─────────────────────────────────────────────────────────────
  const vFetcher = useMemo(
    () =>
      publicClient ? new VeVoteFetcher(publicClient as PublicClient) : null,
    [publicClient],
  );

  // ── derived ─────────────────────────────────────────────────────────────
  const selectedLock = useMemo(
    () => locks.find((l) => l.tokenId.toString() === selectedLockId) ?? null,
    [locks, selectedLockId],
  );

  /** Effective voting power: from selected lock or manual input */
  const effectiveVotingPower = useMemo(() => {
    if (selectedLock) return selectedLock.votingPower;
    return safeParseUnits(manualVpInput);
  }, [selectedLock, manualVpInput]);

  const draftVotesByPool = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(draftWeights).map(([pool, raw]) => {
          let value = 0n;
          try {
            value = raw.trim() === "" ? 0n : BigInt(raw);
          } catch {
            value = 0n;
          }
          return [pool, value > 0n ? value : 0n];
        }),
      ) as Record<string, bigint>,
    [draftWeights],
  );

  const draftedTotal = useMemo(
    () => Object.values(draftVotesByPool).reduce((s, v) => s + v, 0n),
    [draftVotesByPool],
  );

  const effectiveDraftVotesByPool = useMemo(
    () => normalizeWeightsToVotingPower(draftVotesByPool, effectiveVotingPower),
    [draftVotesByPool, effectiveVotingPower],
  );

  const effectiveOptimalVotesByPool = useMemo(
    () =>
      normalizeWeightsToVotingPower(
        Object.fromEntries(Object.entries(optimalWeights)) as Record<
          string,
          bigint
        >,
        effectiveVotingPower,
      ),
    [optimalWeights, effectiveVotingPower],
  );

  const calculationGauges = useMemo(
    () =>
      gauges.filter((item) => enabledPools[item.pool.toLowerCase()] !== false),
    [enabledPools, gauges],
  );

  // ── token helpers ────────────────────────────────────────────────────────
  const getTokenMeta = useCallback(
    (token: `0x${string}`) => {
      const key = token.toLowerCase();
      const market = tokenMarkets[key];
      return {
        decimals: market?.decimals ?? 18,
        symbol: market?.symbol ?? shortenAddress(token),
        priceUsd: market?.priceUsd ?? null,
      };
    },
    [tokenMarkets],
  );

  const getRewardRowsUsd = useCallback(
    (rows: GaugeBribeTokenReward[]) => {
      let total = 0;
      let hasUnpriced = false;
      for (const row of rows) {
        if (row.amount <= 0n) continue;
        const meta = getTokenMeta(row.token);
        if (meta.priceUsd === null) {
          hasUnpriced = true;
          continue;
        }
        total += Number(formatUnits(row.amount, meta.decimals)) * meta.priceUsd;
      }
      return { total, hasUnpriced };
    },
    [getTokenMeta],
  );

  const onSort = (field: "votes" | "rewardSignal") => {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sortedGauges = useMemo(() => {
    if (!gauges.length) return gauges;
    return [...gauges].sort((a, b) => {
      let aVal: number;
      let bVal: number;
      if (sortField === "votes") {
        aVal = Number(formatUnits(a.votes, 18));
        bVal = Number(formatUnits(b.votes, 18));
      } else {
        aVal = getRewardRowsUsd([...a.rewards, ...a.fees]).total;
        bVal = getRewardRowsUsd([...b.rewards, ...b.fees]).total;
      }
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });
  }, [gauges, sortField, sortDir, getRewardRowsUsd]);

  const formatRewardRows = useCallback(
    (rows: GaugeBribeTokenReward[]) => {
      const nonZero = rows.filter((r) => r.amount > 0n);
      if (!nonZero.length) return "-";
      return nonZero
        .map((row) => {
          const meta = getTokenMeta(row.token);
          return `${formatTokenAmount(row.amount, meta.decimals)} ${meta.symbol}`;
        })
        .join(" / ");
    },
    [getTokenMeta],
  );

  const btcPriceUsd = useMemo(
    () =>
      Object.values(tokenMarkets).find((m) => m.symbol === "BTC")?.priceUsd ??
      (btcPrice > 0 ? btcPrice : null),
    [tokenMarkets, btcPrice],
  );

  // ── projections ───────────────────────────────────────────────────────────
  const buildProjection = useCallback(
    (votesByPool: Record<string, bigint>): Projection | null => {
      if (!gauges.length) return null;
      const rows = gauges.map((item) => {
        const key = item.pool.toLowerCase();
        const vote = votesByPool[key] ?? 0n;
        const projectedRewards = projectGaugeBribeRewards(
          [...item.rewards, ...item.fees],
          vote,
          item.votes,
        );
        const priced = getRewardRowsUsd(projectedRewards);
        return {
          pool: item.pool,
          vote,
          projectedRewards,
          projectedUsd: priced.total,
          hasUnpricedRewards: priced.hasUnpriced,
        };
      });
      return {
        rows,
        totalProjectedUsd: rows.reduce((a, r) => a + r.projectedUsd, 0),
        hasUnpricedRewards: rows.some((r) => r.hasUnpricedRewards),
      };
    },
    [gauges, getRewardRowsUsd],
  );

  const draftProjection = useMemo(
    () => buildProjection(effectiveDraftVotesByPool),
    [buildProjection, effectiveDraftVotesByPool],
  );
  const optimalProjection = useMemo(
    () => buildProjection(effectiveOptimalVotesByPool),
    [buildProjection, effectiveOptimalVotesByPool],
  );

  // ── actions ───────────────────────────────────────────────────────────────
  const onApplyOptimal = () => {
    setDraftWeights(
      Object.fromEntries(
        Object.entries(optimalWeights).map(([pool, w]) => [pool, w.toString()]),
      ),
    );
  };

  const onClearDraft = () => {
    setDraftWeights(
      Object.fromEntries(gauges.map((g) => [g.pool.toLowerCase(), ""])),
    );
  };

  const onWeightChange = (key: string, value: string) => {
    setDraftWeights((prev) => ({ ...prev, [key]: value }));
  };

  const onTogglePool = (key: string, enabled: boolean) => {
    setEnabledPools((prev) => ({ ...prev, [key]: enabled }));
  };

  const onCopyAddress = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* ignore */
    }
  };

  const onVote = async () => {
    const account = walletClient?.account;
    if (!account || !publicClient || !selectedLock) return;
    const entries = Object.entries(effectiveDraftVotesByPool).filter(
      ([, w]) => w > 0n,
    );
    if (!entries.length) return;
    // Checksum pool addresses for the contract call
    const pools = entries.map(([pool]) => getAddress(pool));
    const weights = entries.map(([, w]) => w);

    setTxState("pending");
    setTxHash(null);
    setError(null);
    try {
      const { request } = await (publicClient as PublicClient).simulateContract(
        {
          address: contracts.voter,
          abi: VoterAbi,
          functionName: "vote",
          args: [selectedLock.tokenId, pools, weights],
          account,
        },
      );
      const hash = await walletClient.writeContract(request);
      setTxHash(hash);
      setTxState("success");
      // Refresh to update hasVoted flag
      void reloadBase();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vote transaction failed.");
      setTxState("error");
    }
  };

  const onResetVote = async () => {
    const account = walletClient?.account;
    if (!account || !publicClient || !selectedLock) return;

    setTxState("pending");
    setTxHash(null);
    setError(null);
    try {
      const { request } = await (publicClient as PublicClient).simulateContract(
        {
          address: contracts.voter,
          abi: VoterAbi,
          functionName: "reset",
          args: [selectedLock.tokenId],
          account,
        },
      );
      const hash = await walletClient.writeContract(request);
      setTxHash(hash);
      setTxState("success");
      void reloadBase();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Reset vote transaction failed.",
      );
      setTxState("error");
    }
  };

  // ── reloadBase ────────────────────────────────────────────────────────────
  const reloadBase = useCallback(async () => {
    if (!publicClient) return;
    setLoading(true);
    setError(null);
    try {
      const [gaugeRowsResult, nextMaxVotingNum, nextLocks] = await Promise.all([
        supabase.from("gauges").select("*").returns<GaugeSupabaseRow[]>(),
        (publicClient as PublicClient).readContract({
          address: contracts.voter,
          abi: VoterAbi,
          functionName: "maxVotingNum",
        }) as Promise<bigint>,
        address && vFetcher
          ? vFetcher.getLocks(address)
          : Promise.resolve([] as VeLockSummary[]),
      ]);

      if (gaugeRowsResult.error) throw new Error(gaugeRowsResult.error.message);

      const nextIncentives = (gaugeRowsResult.data ?? []).map((r) =>
        gaugeRowToIncentive(r as Parameters<typeof gaugeRowToIncentive>[0]),
      );

      const rewardTokens = Array.from(
        new Set(
          nextIncentives
            .flatMap((item) => [
              ...item.rewards.map((r) => r.token),
              ...item.fees.map((r) => r.token),
            ])
            .map((t) => t.toLowerCase()),
        ),
      ) as `0x${string}`[];

      const nextMarkets =
        rewardTokens.length > 0
          ? await fetchMezoRewardTokenMarkets(
              publicClient as PublicClient,
              rewardTokens,
            )
          : new Map<string, TokenMarket>();

      setIncentives(nextIncentives);
      setTokenMarkets(Object.fromEntries(nextMarkets));
      setMaxVotingNum(nextMaxVotingNum);
      setLocks(nextLocks);

      if (nextLocks.length > 0) {
        setSelectedLockId((prev) => {
          if (prev && nextLocks.some((l) => l.tokenId.toString() === prev))
            return prev;
          return nextLocks[0].tokenId.toString();
        });
      } else {
        setSelectedLockId("");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load vote data.",
      );
    } finally {
      setLoading(false);
    }
  }, [publicClient, address, vFetcher, contracts]);

  // ── effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (open) void reloadBase();
  }, [open, reloadBase]);

  // Build gauge opportunities from incentives + optional per-lock votes
  useEffect(() => {
    const load = async () => {
      if (!incentives.length) {
        setGauges([]);
        return;
      }
      if (selectedLock && vFetcher) {
        try {
          const opps = await vFetcher.getGaugeVoteOpportunities(
            selectedLock.tokenId,
            incentives,
          );
          setGauges(opps);
        } catch {
          setGauges(incentivesToOpportunities(incentives));
        }
      } else {
        setGauges(incentivesToOpportunities(incentives));
      }
    };
    void load();
  }, [selectedLockId, selectedLock, vFetcher, incentives]);

  // Sync enabledPools when gauges change (keep existing toggles)
  useEffect(() => {
    setEnabledPools((prev) =>
      Object.fromEntries(
        gauges.map((g) => {
          const key = g.pool.toLowerCase();
          return [key, prev[key] ?? true];
        }),
      ),
    );
  }, [gauges]);

  // Recompute optimal allocation and seed draft when inputs change
  useEffect(() => {
    if (!vFetcher || !effectiveVotingPower || !gauges.length) {
      setOptimalWeights({});
      setDraftWeights({});
      return;
    }
    const eligible = calculationGauges;
    if (!eligible.length) {
      setOptimalWeights({});
      setDraftWeights(
        Object.fromEntries(gauges.map((g) => [g.pool.toLowerCase(), ""])),
      );
      return;
    }
    const rewardSignalByPool = Object.fromEntries(
      eligible.map((item) => {
        const priced = getRewardRowsUsd([...item.rewards, ...item.fees]);
        return [item.pool.toLowerCase(), priced.total];
      }),
    );
    const suggested = vFetcher.buildOptimalVoteAllocation(
      eligible,
      effectiveVotingPower,
      {
        maxPools: maxVotingNum === null ? undefined : Number(maxVotingNum),
        rewardSignalByPool,
      },
    );
    const suggestedByPool = Object.fromEntries(
      suggested.map((r) => [r.pool.toLowerCase(), r.weight]),
    );
    setOptimalWeights(suggestedByPool);
    setDraftWeights(
      Object.fromEntries(
        gauges.map((g) => {
          const key = g.pool.toLowerCase();
          const weight = suggestedByPool[key] ?? 0n;
          return [key, weight > 0n ? weight.toString() : ""];
        }),
      ),
    );
  }, [
    calculationGauges,
    effectiveVotingPower,
    gauges,
    getRewardRowsUsd,
    maxVotingNum,
    vFetcher,
  ]);

  // ── render ─────────────────────────────────────────────────────────────────

  const hasWallet = !!address;
  const hasLocks = locks.length > 0;
  const canVote =
    !!selectedLock && !selectedLock.hasVoted && !!walletClient?.account;
  // Reset abstains for current epoch (clears carried-over weights).
  // Only callable before voting this epoch — same window as vote.
  const canReset =
    !!selectedLock && !selectedLock.hasVoted && !!walletClient?.account;

  return (
    <div className="flex flex-col gap-4">
      {/* ── actions row ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Lock selector or manual VP input */}
        {loading && !gauges.length ? (
          <Skeleton className="h-9 w-52" />
        ) : hasLocks ? (
          <Select value={selectedLockId} onValueChange={setSelectedLockId}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Select lock…" />
            </SelectTrigger>
            <SelectContent>
              {locks.map((lock) => (
                <SelectItem
                  key={lock.tokenId.toString()}
                  value={lock.tokenId.toString()}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      #{lock.tokenId.toString()}
                    </span>
                    <span>{formatVotingPower(lock.votingPower)} veBTC</span>
                    {lock.hasVoted && (
                      <span className="rounded bg-muted px-1 text-[10px]">
                        voted
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0.0 veBTC"
              value={manualVpInput}
              onChange={(e) => setManualVpInput(e.target.value)}
              className="h-9 w-36 text-right text-xs"
            />
            <span className="text-xs text-muted-foreground">
              {hasWallet
                ? "No veBTC locks found"
                : "Enter voting power manually"}
            </span>
          </div>
        )}

        <Button
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={() => void reloadBase()}
          disabled={loading}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onApplyOptimal}
          disabled={!effectiveVotingPower}
        >
          Apply Optimal
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearDraft}
          disabled={!gauges.length}
        >
          Clear
        </Button>

        {/* Vote / Reset buttons — only when wallet connected and lock selected */}
        {canVote && (
          <Button
            variant="default"
            size="sm"
            className="gap-1.5"
            onClick={() => void onVote()}
            disabled={
              txState === "pending" ||
              Object.values(effectiveDraftVotesByPool).every((w) => w === 0n)
            }
          >
            <Vote className="h-3.5 w-3.5" />
            {txState === "pending" ? "Voting…" : "Vote"}
          </Button>
        )}
        {canReset && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void onResetVote()}
            disabled={txState === "pending"}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {txState === "pending" ? "Resetting…" : "Reset Vote"}
          </Button>
        )}

        {/* Tx feedback */}
        {txState === "success" && txHash && (
          <a
            href={`${MEZO_BC_EXPLORER}/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-green-500 hover:underline"
          >
            Tx submitted ↗
          </a>
        )}
        {txState === "error" && (
          <span className="text-xs text-destructive">Tx failed</span>
        )}

        {/* Right side: VP summary */}
        <span className="ml-auto text-xs text-muted-foreground">
          {selectedLock ? (
            <>
              Lock #{selectedLock.tokenId.toString()} · VP{" "}
              <span className="font-semibold text-foreground">
                {formatVotingPower(selectedLock.votingPower)}
              </span>
            </>
          ) : effectiveVotingPower > 0n ? (
            <>
              VP{" "}
              <span className="font-semibold text-foreground">
                {formatVotingPower(effectiveVotingPower)}
              </span>{" "}
              (manual)
            </>
          ) : null}
          {draftedTotal > 0n && effectiveVotingPower > 0n && (
            <span className="ml-2">
              · drafted{" "}
              <span className="font-semibold text-foreground">
                {formatVotingPower(draftedTotal)}
              </span>
            </span>
          )}
        </span>
      </div>

      {/* ── projection grid ── */}
      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <div className="space-y-1 rounded-lg border border-card-border/60 bg-muted/20 p-3">
          <div className="text-sm font-semibold text-foreground">
            {btcPriceUsd !== null ? formatUsd(btcPriceUsd) : "—"}
          </div>
          <div className="font-medium text-foreground">Oracle BTC Price</div>
        </div>
        <div className="space-y-1 rounded-lg border border-card-border/60 bg-muted/20 p-3">
          <div className="text-sm font-semibold text-foreground">
            {draftProjection
              ? formatUsd(draftProjection.totalProjectedUsd)
              : "—"}
          </div>
          <div className="font-medium text-foreground">
            Draft Projected Rewards
          </div>
          <p>
            {draftProjection?.hasUnpricedRewards
              ? "priced tokens only"
              : "USD denom"}
          </p>
        </div>
        <div className="space-y-1 rounded-lg border border-card-border/60 bg-muted/20 p-3">
          <div className="text-sm font-semibold text-foreground">
            {optimalProjection
              ? formatUsd(optimalProjection.totalProjectedUsd)
              : "—"}
          </div>
          <div className="font-medium text-foreground">
            Optimal Projected Rewards
          </div>
          <p>
            {optimalProjection?.hasUnpricedRewards
              ? "priced tokens only"
              : "USD denom"}
          </p>
        </div>
      </div>

      {/* ── gauge table ── */}
      <div className="overflow-x-auto rounded-xl border border-card-border/60 bg-muted/20">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">Calc</TableHead>
              <TableHead className="min-w-[160px]">Pool</TableHead>
              <TableHead className="min-w-[90px] text-right">
                <button
                  type="button"
                  className="flex w-full items-center justify-end gap-1 hover:text-foreground"
                  onClick={() => onSort("votes")}
                >
                  Votes
                  <span className="text-[10px]">
                    {sortField === "votes"
                      ? sortDir === "desc"
                        ? "↓"
                        : "↑"
                      : "↕"}
                  </span>
                </button>
              </TableHead>
              <TableHead className="min-w-[140px]">
                <button
                  type="button"
                  className="flex items-center gap-1 hover:text-foreground"
                  onClick={() => onSort("rewardSignal")}
                >
                  Reward Signal
                  <span className="text-[10px]">
                    {sortField === "rewardSignal"
                      ? sortDir === "desc"
                        ? "↓"
                        : "↑"
                      : "↕"}
                  </span>
                </button>
              </TableHead>
              <TableHead className="text-right">Optimal</TableHead>
              <TableHead className="w-28">Draft</TableHead>
              <TableHead className="min-w-[110px]">Draft PnL</TableHead>
              <TableHead className="min-w-[110px]">Optimal PnL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !gauges.length
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : sortedGauges.map((gauge) => {
                  const key = gauge.pool.toLowerCase();
                  const calcEnabled = enabledPools[key] !== false;
                  const gaugeAddr =
                    gauge.gauge === ZERO_ADDRESS ? gauge.pool : gauge.gauge;
                  const draftRow =
                    draftProjection?.rows.find(
                      (r) => r.pool.toLowerCase() === key,
                    ) ?? null;
                  const optimalRow =
                    optimalProjection?.rows.find(
                      (r) => r.pool.toLowerCase() === key,
                    ) ?? null;
                  const rewardSignalUsd = getRewardRowsUsd([
                    ...gauge.rewards,
                    ...gauge.fees,
                  ]);
                  const optimalWeight = optimalWeights[key] ?? 0n;
                  const draftVote = effectiveDraftVotesByPool[key] ?? 0n;
                  const draftPct = bigintSharePct(
                    draftVote,
                    effectiveVotingPower,
                  );

                  return (
                    <TableRow key={gauge.gauge}>
                      {/* Calc */}
                      <TableCell>
                        <input
                          aria-label={`Include ${gauge.poolName || gauge.pool} in calculation`}
                          checked={calcEnabled}
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer accent-primary"
                          onChange={(e) => onTogglePool(key, e.target.checked)}
                        />
                      </TableCell>

                      {/* Pool */}
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-foreground">
                            {gauge.poolName || shortenAddress(gauge.pool)}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <a
                              href={`${MEZO_BC_EXPLORER}/address/${gauge.pool}`}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:text-foreground hover:underline"
                            >
                              Pool {shortenAddress(gauge.pool)}
                            </a>
                            <button
                              aria-label="Copy pool address"
                              type="button"
                              className="opacity-50 hover:opacity-100"
                              onClick={() => void onCopyAddress(gauge.pool)}
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Gauge{" "}
                            <a
                              href={`${MEZO_BC_EXPLORER}/address/${gaugeAddr}`}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:text-foreground hover:underline"
                            >
                              {shortenAddress(gaugeAddr)}
                            </a>
                          </span>
                        </div>
                      </TableCell>

                      {/* Votes: my vote (large) + total in parens below (small) */}
                      <TableCell className="text-right font-mono text-xs">
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-semibold text-foreground">
                            {formatVotingPower(gauge.currentVote)}
                          </span>
                          <span className="text-[12px] text-muted-foreground">
                            ({formatVotingPower(gauge.votes)})
                          </span>
                        </div>
                      </TableCell>

                      {/* Reward Signal */}
                      <TableCell>
                        <div className="flex flex-col gap-0.5 text-xs">
                          <span className="font-semibold text-foreground">
                            {formatUsd(rewardSignalUsd.total)}
                          </span>
                          <span className="text-muted-foreground">
                            {formatRewardSignalSource(gauge.rewardSignalSource)}
                            {rewardSignalUsd.hasUnpriced
                              ? " · priced only"
                              : ""}
                          </span>
                          <span className="text-muted-foreground">
                            Bribes: {formatRewardRows(gauge.rewards)}
                          </span>
                          <span className="text-muted-foreground">
                            Fees: {formatRewardRows(gauge.fees)}
                          </span>
                        </div>
                      </TableCell>

                      {/* Optimal */}
                      <TableCell className="text-right font-mono text-xs">
                        {formatVotingPower(optimalWeight)}
                      </TableCell>

                      {/* Draft + % */}
                      <TableCell>
                        <div className="flex flex-col items-end gap-0.5">
                          <Input
                            inputMode="numeric"
                            value={draftWeights[key] ?? ""}
                            onChange={(e) =>
                              onWeightChange(key, e.target.value)
                            }
                            className="h-7 w-28 px-2 text-right text-xs"
                          />
                          <span className="text-[10px] text-muted-foreground">
                            {draftPct !== null && draftPct > 0
                              ? `${draftPct.toFixed(1)}%`
                              : ""}
                          </span>
                        </div>
                      </TableCell>

                      {/* Draft PnL */}
                      <TableCell>
                        <div className="flex flex-col gap-0.5 text-xs">
                          <span className="font-semibold text-foreground">
                            {draftRow ? formatUsd(draftRow.projectedUsd) : "-"}
                          </span>
                          <span className="text-muted-foreground">
                            {draftRow
                              ? formatRewardRows(draftRow.projectedRewards)
                              : "-"}
                            {draftRow?.hasUnpricedRewards
                              ? " · priced only"
                              : ""}
                          </span>
                        </div>
                      </TableCell>

                      {/* Optimal PnL */}
                      <TableCell>
                        <div className="flex flex-col gap-0.5 text-xs">
                          <span className="font-semibold text-foreground">
                            {optimalRow
                              ? formatUsd(optimalRow.projectedUsd)
                              : "-"}
                          </span>
                          <span className="text-muted-foreground">
                            {optimalRow
                              ? formatRewardRows(optimalRow.projectedRewards)
                              : "-"}
                            {optimalRow?.hasUnpricedRewards
                              ? " · priced only"
                              : ""}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}

            {!loading && !gauges.length && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No gauge data available.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── errors ── */}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
};
