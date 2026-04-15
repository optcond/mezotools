import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
} from "wagmi";
import { formatUnits, type PublicClient } from "viem";
import { Copy, RefreshCw, Vote } from "lucide-react";
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
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  MezoBlockChainExplorer,
  MezoChain,
  VeVoteFetcher,
  VoterAbi,
  ZeroAddress,
  fetchMezoRewardTokenMarkets,
  getMezoContracts,
  shortenAddress,
} from "@mtools/shared";
import type {
  GaugeBribeTokenReward,
  GaugeIncentive,
  GaugeVoteOpportunity,
  TokenMarket,
  VeLockSummary,
} from "@mtools/shared";

// ── constants ──────────────────────────────────────────────────────────────
const ZERO_ADDRESS = ZeroAddress;
const EXPLORER = MezoBlockChainExplorer;

// ── pure helpers (mirroring App.tsx) ──────────────────────────────────────

const formatBig = (value: bigint, digits = 4) =>
  Number(formatUnits(value, 18)).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });

const formatTokenAmount = (value: bigint, decimals: number, digits = 6) =>
  Number(formatUnits(value, decimals)).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });

const formatUsd = (value: number, digits = 2) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  });

const mergeRewardRows = (
  rows: GaugeBribeTokenReward[],
): GaugeBribeTokenReward[] =>
  Object.values(
    rows.reduce<Record<string, GaugeBribeTokenReward>>((acc, row) => {
      const key = row.token.toLowerCase();
      const current = acc[key] ?? { ...row, amount: 0n };
      return {
        ...acc,
        [key]: { ...current, amount: current.amount + row.amount },
      };
    }, {}),
  );

const projectRewardRows = (
  rows: GaugeBribeTokenReward[],
  vote: bigint,
  totalVotes: bigint,
): GaugeBribeTokenReward[] => {
  if (vote <= 0n) return [];
  const denominator = totalVotes + vote;
  if (denominator <= 0n) return [];
  return mergeRewardRows(rows)
    .map((row) => ({ ...row, amount: (row.amount * vote) / denominator }))
    .filter((row) => row.amount > 0n);
};

const normalizeWeightsToVotingPower = (
  weightsByPool: Record<string, bigint>,
  votingPower: bigint,
): Record<string, bigint> => {
  if (votingPower <= 0n) return {};
  const entries = Object.entries(weightsByPool).filter(([, w]) => w > 0n);
  if (!entries.length) return {};
  const totalWeight = entries.reduce((acc, [, w]) => acc + w, 0n);
  if (totalWeight <= 0n) return {};
  const normalized: Record<string, bigint> = {};
  const remainders: { pool: string; remainder: bigint }[] = [];
  let assigned = 0n;
  for (const [pool, weight] of entries) {
    const precise = weight * votingPower;
    const vote = precise / totalWeight;
    normalized[pool] = vote;
    assigned += vote;
    remainders.push({ pool, remainder: precise % totalWeight });
  }
  let left = votingPower - assigned;
  if (left > 0n) {
    remainders.sort((a, b) => (a.remainder > b.remainder ? -1 : 1));
    let idx = 0;
    while (left > 0n) {
      const row = remainders[idx % remainders.length];
      normalized[row.pool] = (normalized[row.pool] ?? 0n) + 1n;
      left -= 1n;
      idx++;
    }
  }
  return normalized;
};

const formatRewardSignalSource = (
  source: GaugeVoteOpportunity["rewardSignalSource"],
): string | null => {
  switch (source) {
    case "current":
      return "Current epoch";
    case "none":
      return "No current rewards";
    default:
      return null;
  }
};

// ── Supabase row → GaugeIncentive ─────────────────────────────────────────

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as `0x${string}`;

type GaugeSupabaseRow = Tables<"gauges">;
type BribeJsonRow = {
  token: string;
  amount: string;
  previous_epoch_amount?: string;
  next_epoch_amount?: string;
};

const rowToGaugeIncentive = (row: GaugeSupabaseRow): GaugeIncentive => {
  const epochStart = BigInt(row.epoch_start);
  const toBribeTokenReward = (b: BribeJsonRow): GaugeBribeTokenReward => ({
    token: b.token as `0x${string}`,
    amount: BigInt(b.amount),
    epochStart,
    previousEpochAmount: b.previous_epoch_amount
      ? BigInt(b.previous_epoch_amount)
      : undefined,
    nextEpochAmount: b.next_epoch_amount
      ? BigInt(b.next_epoch_amount)
      : undefined,
  });
  return {
    pool: row.pool as `0x${string}`,
    poolName: row.pool_name ?? undefined,
    gauge: row.gauge as `0x${string}`,
    bribe: row.bribe as `0x${string}`,
    fee: (row.fee ?? ZERO_ADDR) as `0x${string}`,
    votes: BigInt(row.votes),
    duration: BigInt(row.duration),
    epochStart,
    rewards: ((row.bribes ?? []) as unknown as BribeJsonRow[]).map(
      toBribeTokenReward,
    ),
    fees: ((row.fees ?? []) as unknown as BribeJsonRow[]).map(
      toBribeTokenReward,
    ),
  };
};

// ── local types ────────────────────────────────────────────────────────────

type TxState = "idle" | "pending" | "success" | "error";

type ProjectionRow = {
  pool: `0x${string}`;
  gauge: `0x${string}`;
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

  const AppContracts = useMemo(() => getMezoContracts(chainId), [chainId]);

  // ── state ──────────────────────────────────────────────────────────────
  const [gauges, setGauges] = useState<GaugeVoteOpportunity[]>([]);
  const [locks, setLocks] = useState<VeLockSummary[]>([]);
  const [incentives, setIncentives] = useState<GaugeIncentive[]>([]);
  const [selectedLockId, setSelectedLockId] = useState("");
  const [draftWeights, setDraftWeights] = useState<Record<string, string>>({});
  const [optimalWeights, setOptimalWeights] = useState<Record<string, bigint>>(
    {},
  );
  const [enabledPoolCalculations, setEnabledPoolCalculations] = useState<
    Record<string, boolean>
  >({});
  const [rewardTokenMarkets, setRewardTokenMarkets] = useState<
    Record<string, TokenMarket>
  >({});
  const [maxVotingNum, setMaxVotingNum] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txState, setTxState] = useState<TxState>("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

  // ── fetchers ────────────────────────────────────────────────────────────
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

  const draftedTotal = useMemo(
    () =>
      Object.values(draftWeights).reduce((sum, raw) => {
        try {
          const parsed = raw.trim() === "" ? 0n : BigInt(raw);
          return sum + (parsed > 0n ? parsed : 0n);
        } catch {
          return sum;
        }
      }, 0n),
    [draftWeights],
  );

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

  const optimalVotesByPool = useMemo(
    () =>
      Object.fromEntries(Object.entries(optimalWeights)) as Record<
        string,
        bigint
      >,
    [optimalWeights],
  );

  const effectiveDraftVotesByPool = useMemo(
    () =>
      normalizeWeightsToVotingPower(
        draftVotesByPool,
        selectedLock?.votingPower ?? 0n,
      ),
    [draftVotesByPool, selectedLock?.votingPower],
  );

  const effectiveOptimalVotesByPool = useMemo(
    () =>
      normalizeWeightsToVotingPower(
        optimalVotesByPool,
        selectedLock?.votingPower ?? 0n,
      ),
    [optimalVotesByPool, selectedLock?.votingPower],
  );

  const calculationGauges = useMemo(
    () =>
      gauges.filter(
        (item) => enabledPoolCalculations[item.pool.toLowerCase()] !== false,
      ),
    [enabledPoolCalculations, gauges],
  );

  // ── token helpers ────────────────────────────────────────────────────────
  const getTokenMeta = useCallback(
    (token: `0x${string}`) => {
      const key = token.toLowerCase();
      const market = rewardTokenMarkets[key];
      return {
        decimals: market?.decimals ?? 18,
        symbol: market?.symbol ?? shortenAddress(token),
        priceUsd: market?.priceUsd ?? null,
      };
    },
    [rewardTokenMarkets],
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
      Object.values(rewardTokenMarkets).find((m) => m.symbol === "BTC")
        ?.priceUsd ?? (btcPrice > 0 ? btcPrice : null),
    [rewardTokenMarkets, btcPrice],
  );

  // ── reward signals ────────────────────────────────────────────────────────
  const rewardSignalUsdByPool = useMemo(
    () =>
      Object.fromEntries(
        gauges.map((item) => {
          const priced = getRewardRowsUsd([...item.rewards, ...item.fees]);
          return [item.pool.toLowerCase(), priced.total];
        }),
      ) as Record<string, number>,
    [gauges, getRewardRowsUsd],
  );

  // ── projections ───────────────────────────────────────────────────────────
  const draftProjection = useMemo((): Projection | null => {
    if (!gauges.length) return null;
    const rows = gauges.map((item) => {
      const key = item.pool.toLowerCase();
      const vote = effectiveDraftVotesByPool[key] ?? 0n;
      const projectedRewards = projectRewardRows(
        [...item.rewards, ...item.fees],
        vote,
        item.votes,
      );
      const priced = getRewardRowsUsd(projectedRewards);
      return {
        pool: item.pool,
        gauge: item.gauge,
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
  }, [effectiveDraftVotesByPool, gauges, getRewardRowsUsd]);

  const optimalProjection = useMemo((): Projection | null => {
    if (!gauges.length) return null;
    const rows = gauges.map((item) => {
      const key = item.pool.toLowerCase();
      const vote = effectiveOptimalVotesByPool[key] ?? 0n;
      const projectedRewards = projectRewardRows(
        [...item.rewards, ...item.fees],
        vote,
        item.votes,
      );
      const priced = getRewardRowsUsd(projectedRewards);
      return {
        pool: item.pool,
        gauge: item.gauge,
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
  }, [effectiveOptimalVotesByPool, gauges, getRewardRowsUsd]);

  // ── actions ───────────────────────────────────────────────────────────────
  const onApplyOptimal = () => {
    setDraftWeights(
      Object.fromEntries(
        Object.entries(optimalWeights).map(([pool, weight]) => [
          pool,
          weight.toString(),
        ]),
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

  const onTogglePoolCalculation = (key: string, enabled: boolean) => {
    setEnabledPoolCalculations((prev) => ({ ...prev, [key]: enabled }));
  };

  const onCopyAddress = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* ignore */
    }
  };

  const onVote = async () => {
    if (!walletClient || !publicClient || !selectedLock) return;
    const entries = Object.entries(effectiveDraftVotesByPool).filter(
      ([, w]) => w > 0n,
    );
    if (!entries.length) return;
    const pools = entries.map(([pool]) => pool as `0x${string}`);
    const weights = entries.map(([, weight]) => weight);

    setTxState("pending");
    setTxHash(null);
    try {
      const { request } = await (publicClient as PublicClient).simulateContract(
        {
          address: AppContracts.voter as `0x${string}`,
          abi: VoterAbi,
          functionName: "vote",
          args: [selectedLock.tokenId, pools, weights],
          account: walletClient.account,
        },
      );
      const hash = await walletClient.writeContract(request);
      setTxHash(hash);
      setTxState("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vote transaction failed.");
      setTxState("error");
    }
  };

  // ── reloadBase ────────────────────────────────────────────────────────────
  const reloadBase = useCallback(async () => {
    if (!publicClient || !address || !vFetcher) {
      setLocks([]);
      setIncentives([]);
      setGauges([]);
      setRewardTokenMarkets({});
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [nextLocks, gaugeRowsResult, nextMaxVotingNum] = await Promise.all([
        vFetcher.getLocks(address),
        supabase.from("gauges").select("*").returns<GaugeSupabaseRow[]>(),
        (publicClient as PublicClient).readContract({
          address: AppContracts.voter as `0x${string}`,
          abi: VoterAbi,
          functionName: "maxVotingNum",
        }) as Promise<bigint>,
      ]);

      if (gaugeRowsResult.error) {
        throw new Error(gaugeRowsResult.error.message);
      }

      const nextIncentives = (gaugeRowsResult.data ?? []).map(
        rowToGaugeIncentive,
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

      setLocks(nextLocks);
      setIncentives(nextIncentives);
      setMaxVotingNum(nextMaxVotingNum);
      setRewardTokenMarkets(Object.fromEntries(nextMarkets));

      if (nextLocks.length === 0) {
        setSelectedLockId("");
        setGauges([]);
        setDraftWeights({});
        setOptimalWeights({});
      } else {
        setSelectedLockId((prev) => {
          if (prev && nextLocks.some((l) => l.tokenId.toString() === prev))
            return prev;
          return nextLocks[0].tokenId.toString();
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load vote data.",
      );
      setGauges([]);
      setDraftWeights({});
      setOptimalWeights({});
      setRewardTokenMarkets({});
    } finally {
      setLoading(false);
    }
  }, [publicClient, address, vFetcher]);

  // ── effects ───────────────────────────────────────────────────────────────

  // Reload when sheet opens
  useEffect(() => {
    if (open) void reloadBase();
  }, [open, reloadBase]);

  // Refresh gauge opportunities when selected lock or incentives change
  useEffect(() => {
    const refreshLockView = async () => {
      if (!vFetcher || !selectedLock || !incentives.length) return;
      try {
        setError(null);
        const opportunities = await vFetcher.getGaugeVoteOpportunities(
          selectedLock.tokenId,
          incentives,
        );
        setGauges(opportunities);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load gauge data.",
        );
      }
    };
    void refreshLockView();
  }, [selectedLockId, selectedLock, vFetcher, incentives]);

  // Init enabledPoolCalculations when gauges load
  useEffect(() => {
    setEnabledPoolCalculations((prev) =>
      Object.fromEntries(
        gauges.map((gauge) => {
          const key = gauge.pool.toLowerCase();
          return [key, prev[key] ?? true];
        }),
      ),
    );
  }, [gauges]);

  // Recalculate optimal weights and initialize draft weights when inputs change
  useEffect(() => {
    if (!vFetcher || !selectedLock || !gauges.length) {
      setOptimalWeights({});
      setDraftWeights({});
      return;
    }
    const selectedOpps = calculationGauges;
    if (!selectedOpps.length) {
      setOptimalWeights({});
      setDraftWeights(
        Object.fromEntries(gauges.map((g) => [g.pool.toLowerCase(), ""])),
      );
      return;
    }
    const rewardSignalByPool = Object.fromEntries(
      selectedOpps.map((item) => {
        const priced = getRewardRowsUsd([...item.rewards, ...item.fees]);
        return [item.pool.toLowerCase(), priced.total];
      }),
    );
    const suggested = vFetcher.buildOptimalVoteAllocation(
      selectedOpps,
      selectedLock.votingPower,
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
        gauges.map((gauge) => {
          const key = gauge.pool.toLowerCase();
          const weight = suggestedByPool[key] ?? 0n;
          return [key, weight > 0n ? weight.toString() : ""];
        }),
      ),
    );
  }, [
    calculationGauges,
    gauges,
    getRewardRowsUsd,
    maxVotingNum,
    selectedLock,
    vFetcher,
  ]);

  // ── render ─────────────────────────────────────────────────────────────────

  if (!address) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-card-border/60 bg-muted/20 p-6 text-sm text-muted-foreground">
        <p>Connect your wallet to use the vote calculator.</p>
        <WalletConnectButton />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── actions row ── */}
      <div className="flex flex-wrap items-center gap-2">
        {loading && !locks.length ? (
          <Skeleton className="h-9 w-52" />
        ) : locks.length === 0 ? (
          <span className="text-sm text-muted-foreground">
            No veBTC locks found.
          </span>
        ) : (
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
                    <span>{formatBig(lock.votingPower)} veBTC</span>
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
          disabled={!selectedLock}
        >
          Apply Optimal
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearDraft}
          disabled={!selectedLock || !gauges.length}
        >
          Clear Draft
        </Button>
        {/* <Button
          variant="default"
          size="sm"
          className="gap-1.5"
          onClick={() => void onVote()}
          disabled={
            !selectedLock ||
            !walletClient ||
            txState === "pending" ||
            Object.values(effectiveDraftVotesByPool).every((w) => w === 0n)
          }
        >
          <Vote className="h-3.5 w-3.5" />
          {txState === "pending" ? "Voting…" : "Vote"}
        </Button> */}
        {txState === "success" && txHash && (
          <a
            href={`https://explorer.mezo.org/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-green-500 hover:underline"
          >
            Tx submitted ↗
          </a>
        )}
        {txState === "error" && (
          <span className="text-xs text-destructive">Vote failed</span>
        )}

        {selectedLock && (
          <span className="ml-auto text-xs text-muted-foreground">
            Lock #{selectedLock.tokenId.toString()} · VP{" "}
            <span className="font-semibold text-foreground">
              {formatBig(selectedLock.votingPower)}
            </span>
            {draftedTotal > 0n && (
              <span className="ml-2">
                · drafted{" "}
                <span className="font-semibold text-foreground">
                  {formatBig(draftedTotal)}
                </span>
              </span>
            )}
          </span>
        )}
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
              <TableHead className="w-10">Calc</TableHead>
              <TableHead className="min-w-[180px]">Pool</TableHead>
              <TableHead className="min-w-[90px] text-right">Votes</TableHead>
              <TableHead className="min-w-[140px]">Reward Signal</TableHead>
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
              : gauges.map((gauge) => {
                  const key = gauge.pool.toLowerCase();
                  const calculationEnabled =
                    enabledPoolCalculations[key] !== false;
                  const gaugeAddress =
                    gauge.gauge === ZERO_ADDRESS ? gauge.pool : gauge.gauge;
                  const draftRewardRow =
                    draftProjection?.rows.find(
                      (r) => r.pool.toLowerCase() === key,
                    ) ?? null;
                  const optimalRewardRow =
                    optimalProjection?.rows.find(
                      (r) => r.pool.toLowerCase() === key,
                    ) ?? null;
                  const rewardSignalUsd = getRewardRowsUsd([
                    ...gauge.rewards,
                    ...gauge.fees,
                  ]);
                  const optimal = optimalWeights[key] ?? 0n;

                  return (
                    <TableRow key={gauge.gauge}>
                      {/* Calc */}
                      <TableCell>
                        <input
                          aria-label={`Include ${gauge.poolName || gauge.pool} in calculation`}
                          checked={calculationEnabled}
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer accent-primary"
                          onChange={(e) =>
                            onTogglePoolCalculation(key, e.target.checked)
                          }
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
                              href={`${EXPLORER}/${gauge.pool}`}
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
                              href={`${EXPLORER}/${gaugeAddress}`}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:text-foreground hover:underline"
                            >
                              {shortenAddress(gaugeAddress)}
                            </a>
                          </span>
                        </div>
                      </TableCell>

                      {/* Votes: my / total */}
                      <TableCell className="text-right font-mono text-xs">
                        <div className="flex flex-col items-end">
                          <span>{formatBig(gauge.currentVote)}</span>
                          <span className="text-[12px] text-muted-foreground">
                            ({formatBig(gauge.votes)})
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
                              ? " · priced tokens only"
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
                        {formatBig(optimal)}
                      </TableCell>

                      {/* Draft */}
                      <TableCell>
                        <Input
                          inputMode="numeric"
                          value={draftWeights[key] ?? "0"}
                          onChange={(e) => onWeightChange(key, e.target.value)}
                          className="h-7 w-28 px-2 text-right text-xs"
                        />
                      </TableCell>

                      {/* Draft PnL */}
                      <TableCell>
                        <div className="flex flex-col gap-0.5 text-xs">
                          <span className="font-semibold text-foreground">
                            {draftRewardRow
                              ? formatUsd(draftRewardRow.projectedUsd)
                              : "-"}
                          </span>
                          <span className="text-muted-foreground">
                            {draftRewardRow
                              ? formatRewardRows(
                                  draftRewardRow.projectedRewards,
                                )
                              : "-"}
                            {draftRewardRow?.hasUnpricedRewards
                              ? " · priced tokens only"
                              : ""}
                          </span>
                        </div>
                      </TableCell>

                      {/* Optimal PnL */}
                      <TableCell>
                        <div className="flex flex-col gap-0.5 text-xs">
                          <span className="font-semibold text-foreground">
                            {optimalRewardRow
                              ? formatUsd(optimalRewardRow.projectedUsd)
                              : "-"}
                          </span>
                          <span className="text-muted-foreground">
                            {optimalRewardRow
                              ? formatRewardRows(
                                  optimalRewardRow.projectedRewards,
                                )
                              : "-"}
                            {optimalRewardRow?.hasUnpricedRewards
                              ? " · priced tokens only"
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
                  {selectedLock
                    ? "No gauge data for selected lock."
                    : "Select a lock to view gauge opportunities."}
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
