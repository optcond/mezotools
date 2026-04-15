import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Vote } from "lucide-react";
import { formatUnits, type PublicClient } from "viem";
import { useChainId, usePublicClient } from "wagmi";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { VoteCalculatorSection } from "@/components/VoteCalculatorSheet";
import {
  AppContracts,
  MezoChain,
  VotingEscrowAbi,
} from "@mtools/shared";

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

type GaugeStateRow = Tables<"gauge_state">;

interface BribesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  btcPrice: number;
}

export const BribesSheet = ({ open, onOpenChange, btcPrice }: BribesSheetProps) => {
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: chainId ?? MezoChain.id });

  const toBigInt = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return 0n;
    if (typeof value === "number") return BigInt(Math.trunc(value));
    if (value === "") return 0n;
    return BigInt(value);
  };

  const query = useQuery({
    queryKey: ["bribes-gauge-state"],
    enabled: open,
    refetchInterval: open ? 60_000 : false,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gauge_state")
        .select("*")
        .eq("key", "current")
        .maybeSingle<GaugeStateRow>();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
  });

  const veMezoQuery = useQuery({
    queryKey: ["vemezo-total-vp"],
    enabled: open && !!publicClient,
    refetchInterval: open ? 60_000 : false,
    staleTime: 30_000,
    queryFn: async () => {
      const result = await (publicClient as PublicClient).readContract({
        address: AppContracts.MEZO_VEMEZO as `0x${string}`,
        abi: VotingEscrowAbi,
        functionName: "totalVotingPower",
      });
      return result as bigint;
    },
  });

  const gaugeState = query.data ?? null;
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
  const totalVotesCast = gaugeState
    ? toBigInt(gaugeState.total_votes_tracked)
    : null;
  const epochStartSupply = gaugeState
    ? toBigInt(gaugeState.ve_supply_epoch_start)
    : null;

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-4 overflow-y-auto sm:max-w-5xl"
        enableSwipeClose
        onSwipeClose={() => onOpenChange(false)}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Vote className="h-5 w-5 text-primary" />
            Gauge bribes
          </SheetTitle>
          <SheetDescription className="space-y-2 text-sm">
            <p>
              veBTC and epoch data refresh every minute while this dialog is
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
                  {epochStartSupply !== null ? formatVeBtc(epochStartSupply) : "—"}
                </div>
                <div className="font-medium text-foreground">
                  veBTC supply (epoch start)
                </div>
                <p>Voting power at the start of the current epoch.</p>
              </div>
              <div className="space-y-1 rounded-lg border border-card-border/60 bg-muted/20 p-3">
                <div className="text-sm font-semibold text-foreground">
                  {veMezoQuery.data !== undefined
                    ? Number(formatUnits(veMezoQuery.data, 18)).toLocaleString(
                        "en-US",
                        { maximumFractionDigits: 2 },
                      )
                    : "—"}
                </div>
                <div className="font-medium text-foreground">
                  veMEZO total voting power
                </div>
                <p>Live total voting power of the veMEZO contract.</p>
              </div>
            </div>
          </SheetDescription>
        </SheetHeader>

        {query.error && (
          <p className="text-xs text-destructive">
            {query.error instanceof Error
              ? query.error.message
              : "Failed to load current epoch data."}
          </p>
        )}

        {/* ── vote calculator (inline) ── */}
        <div className="border-t border-card-border/40 pt-4">
          <p className="mb-3 text-sm font-semibold text-foreground">
            Vote calculator
          </p>
          <VoteCalculatorSection open={open} btcPrice={btcPrice} />
        </div>
      </SheetContent>
    </Sheet>
  );
};
