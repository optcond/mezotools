import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChainId, usePublicClient } from "wagmi";
import { Loader2, Scissors, Shuffle } from "lucide-react";
import { formatUnits, parseUnits, type PublicClient } from "viem";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import type { WalletControls } from "@/hooks/useWallet";
import {
  formatVotingPower,
  getWalletVeNftStats,
  MezoChain,
  VotingEscrowAbi,
} from "@mtools/shared";
import type { VeNftLock, WalletVeNftStats } from "@mtools/shared";

interface NftOperationsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet: WalletControls;
}

type OperationMode = "merge" | "split";

const NFT_DECIMALS = 18;

const lockValue = (lock: VeNftLock) =>
  `${lock.escrow}:${lock.tokenId.toString()}`;

const formatLockLabel = (lock: VeNftLock) => {
  const amount =
    lock.lockedAmount !== null ? formatVotingPower(lock.lockedAmount) : "—";
  return `${lock.escrow} #${lock.tokenId.toString()} · ${amount}`;
};

const findLock = (locks: VeNftLock[], value: string) =>
  locks.find((lock) => lockValue(lock) === value) ?? null;

const getVestingEndLabel = (lock: VeNftLock) => {
  if (!lock.vestingEnd || lock.vestingEnd <= 0n) return null;
  return new Date(Number(lock.vestingEnd) * 1000).toLocaleDateString();
};

const getVestingError = (lock: VeNftLock | null) => {
  if (!lock || !lock.vestingEnd || lock.vestingEnd <= 0n) {
    return null;
  }

  return `${lock.escrow} #${lock.tokenId.toString()} has vesting until ${getVestingEndLabel(
    lock,
  )}. This NFT cannot be edited before vesting is removed or completed.`;
};

const getMaxLockError = (lock: VeNftLock | null) => {
  if (!lock?.isPermanent) return null;
  return `${lock.escrow} #${lock.tokenId.toString()} has max lock enabled. Remove max lock first, then retry.`;
};

const getSourceEditError = (lock: VeNftLock | null) =>
  getVestingError(lock) ?? getMaxLockError(lock);

const getMergeError = (
  sourceLock: VeNftLock | null,
  targetLock: VeNftLock | null,
) => {
  if (!sourceLock || !targetLock) return null;
  return getSourceEditError(sourceLock) ?? getVestingError(targetLock);
};

const getAmountError = (amountInput: string, selectedLock: VeNftLock | null) => {
  if (!selectedLock) return "Select an NFT first.";
  const sourceEditError = getSourceEditError(selectedLock);
  if (sourceEditError) return sourceEditError;
  if (!selectedLock.lockedAmount || selectedLock.lockedAmount <= 0n) {
    return "Selected NFT has no locked amount.";
  }
  if (!amountInput.trim()) return "Enter split amount.";

  try {
    const amount = parseUnits(amountInput.trim(), NFT_DECIMALS);
    if (amount <= 0n) return "Split amount must be greater than zero.";
    if (amount >= selectedLock.lockedAmount) {
      return "Split amount must be lower than the locked amount.";
    }
    return null;
  } catch {
    return "Enter a valid amount.";
  }
};

export const NftOperationsSheet = ({
  open,
  onOpenChange,
  wallet,
}: NftOperationsSheetProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const chainId = useChainId();
  const activeChainId = chainId ?? MezoChain.id;
  const publicClient = usePublicClient({ chainId: activeChainId });
  const [mode, setMode] = useState<OperationMode>("merge");
  const [mergeFrom, setMergeFrom] = useState("");
  const [mergeTo, setMergeTo] = useState("");
  const [splitToken, setSplitToken] = useState("");
  const [splitAmount, setSplitAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const veNftStatsQuery = useQuery<WalletVeNftStats>({
    queryKey: ["wallet-ve-nft-stats", wallet.account, activeChainId],
    enabled: open && Boolean(wallet.account && publicClient),
    refetchInterval: open && wallet.account ? 30_000 : false,
    queryFn: () =>
      getWalletVeNftStats(
        publicClient as PublicClient,
        wallet.account as `0x${string}`,
        { chainId: activeChainId },
      ),
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
  });

  const veNftStats = veNftStatsQuery.data;
  const locks = useMemo(() => veNftStats?.locks ?? [], [veNftStats]);
  const mergeableLocks = useMemo(
    () =>
      locks.filter(
        (lock) =>
          locks.filter((candidate) => candidate.escrow === lock.escrow)
            .length >= 2,
      ),
    [locks],
  );
  const selectedMergeFrom = findLock(locks, mergeFrom);
  const selectedMergeTo = findLock(locks, mergeTo);
  const selectedSplitLock = findLock(locks, splitToken);
  const mergeError = getMergeError(selectedMergeFrom, selectedMergeTo);
  const splitError = getAmountError(splitAmount, selectedSplitLock);
  const activeVestingError =
    mode === "merge"
      ? selectedMergeFrom
        ? getVestingError(selectedMergeFrom) ?? getVestingError(selectedMergeTo)
        : null
      : getVestingError(selectedSplitLock);
  const maxLockSource =
    !activeVestingError && mode === "merge"
      ? selectedMergeFrom?.isPermanent
        ? selectedMergeFrom
        : null
      : !activeVestingError && selectedSplitLock?.isPermanent
        ? selectedSplitLock
        : null;
  const splitRemainder =
    selectedSplitLock?.lockedAmount && !splitError
      ? selectedSplitLock.lockedAmount - parseUnits(splitAmount, NFT_DECIMALS)
      : null;

  const mergeTargets = selectedMergeFrom
    ? locks.filter(
        (lock) =>
          lock.escrow === selectedMergeFrom.escrow &&
          lock.tokenId !== selectedMergeFrom.tokenId,
      )
    : mergeableLocks;

  useEffect(() => {
    if (!open) {
      setStatus(null);
      setIsSubmitting(false);
      return;
    }

    if (!mergeFrom && mergeableLocks.length > 0) {
      setMergeFrom(lockValue(mergeableLocks[0]));
    }
    if (!splitToken && locks.length > 0) {
      setSplitToken(lockValue(locks[0]));
    }
  }, [locks, mergeFrom, mergeableLocks, open, splitToken]);

  useEffect(() => {
    if (
      selectedMergeFrom &&
      selectedMergeTo &&
      selectedMergeFrom.escrow !== selectedMergeTo.escrow
    ) {
      setMergeTo("");
    }
    if (
      selectedMergeFrom &&
      selectedMergeTo?.tokenId === selectedMergeFrom.tokenId
    ) {
      setMergeTo("");
    }
  }, [selectedMergeFrom, selectedMergeTo]);

  const refreshLocks = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["wallet-ve-nft-stats", wallet.account, activeChainId],
    });
  };

  const submitMerge = async () => {
    if (!wallet.walletClient?.account || !publicClient) {
      setStatus("Connect a wallet that can sign transactions.");
      return;
    }
    if (!selectedMergeFrom || !selectedMergeTo) {
      setStatus("Select two NFTs from the same escrow.");
      return;
    }
    if (mergeError) {
      setStatus(mergeError);
      toast({ title: "NFT merge blocked", description: mergeError });
      return;
    }
    setIsSubmitting(true);
    setStatus("Waiting for wallet signature...");
    try {
      const hash = await wallet.walletClient.writeContract({
        account: wallet.walletClient.account,
        chain: wallet.walletClient.chain,
        address: selectedMergeFrom.contractAddress,
        abi: VotingEscrowAbi,
        functionName: "merge",
        args: [selectedMergeFrom.tokenId, selectedMergeTo.tokenId],
      });
      setStatus("Merge submitted. Waiting for confirmation...");
      await publicClient.waitForTransactionReceipt({ hash });
      setStatus("Merge confirmed.");
      toast({ title: "NFT merge confirmed" });
      await refreshLocks();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Merge failed.";
      setStatus(message);
      toast({ title: "NFT merge failed", description: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitSplit = async () => {
    if (!wallet.walletClient?.account || !publicClient) {
      setStatus("Connect a wallet that can sign transactions.");
      return;
    }
    if (!selectedSplitLock || splitError) {
      const message = splitError ?? "Select an NFT and enter a valid amount.";
      setStatus(message);
      toast({ title: "NFT split blocked", description: message });
      return;
    }
    setIsSubmitting(true);
    setStatus("Waiting for wallet signature...");
    try {
      const hash = await wallet.walletClient.writeContract({
        account: wallet.walletClient.account,
        chain: wallet.walletClient.chain,
        address: selectedSplitLock.contractAddress,
        abi: VotingEscrowAbi,
        functionName: "split",
        args: [selectedSplitLock.tokenId, parseUnits(splitAmount, NFT_DECIMALS)],
      });
      setStatus("Split submitted. Waiting for confirmation...");
      await publicClient.waitForTransactionReceipt({ hash });
      setStatus("Split confirmed.");
      toast({ title: "NFT split confirmed" });
      setSplitAmount("");
      await refreshLocks();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Split failed.";
      setStatus(message);
      toast({ title: "NFT split failed", description: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitUnlockPermanent = async (lock: VeNftLock) => {
    if (!wallet.walletClient?.account || !publicClient) {
      setStatus("Connect a wallet that can sign transactions.");
      return;
    }

    setIsSubmitting(true);
    setStatus("Waiting for wallet signature...");
    try {
      const hash = await wallet.walletClient.writeContract({
        account: wallet.walletClient.account,
        chain: wallet.walletClient.chain,
        address: lock.contractAddress,
        abi: VotingEscrowAbi,
        functionName: "unlockPermanent",
        args: [lock.tokenId],
      });
      setStatus("Max lock removal submitted. Waiting for confirmation...");
      await publicClient.waitForTransactionReceipt({ hash });
      setStatus("Max lock removed.");
      toast({ title: "Max lock removed" });
      await refreshLocks();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Max lock removal failed.";
      setStatus(message);
      toast({ title: "Max lock removal failed", description: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-y-auto sm:max-w-2xl"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Shuffle className="h-5 w-5 text-primary" />
            NFT operations
          </SheetTitle>
          <SheetDescription>
            Merge or split veBTC and veMEZO NFTs owned by the connected wallet.
          </SheetDescription>
        </SheetHeader>

        {!wallet.account ? (
          <div className="rounded-xl border border-dashed border-card-border/50 bg-muted/10 p-4 text-sm text-muted-foreground">
            Connect a wallet to load your veNFTs.
          </div>
        ) : veNftStatsQuery.isFetching && locks.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-card-border/40 bg-card/30 p-4 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading NFTs...
          </div>
        ) : locks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-card-border/50 bg-muted/10 p-4 text-sm text-muted-foreground">
            No veBTC or veMEZO NFTs found for this wallet.
          </div>
        ) : (
          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value as OperationMode)}
            className="space-y-4"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="merge">Merge</TabsTrigger>
              <TabsTrigger value="split">Split</TabsTrigger>
            </TabsList>

            <TabsContent value="merge" className="space-y-4">
              <div className="rounded-xl border border-card-border/40 bg-card/30 p-4">
                <p className="text-sm text-muted-foreground">
                  Select the NFT to merge from and the NFT that receives the
                  merged lock. Both NFTs must be from the same escrow.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <NftSelect
                    label="Merge from"
                    value={mergeFrom}
                    onValueChange={setMergeFrom}
                    locks={mergeableLocks}
                    placeholder="Select NFT"
                  />
                  <NftSelect
                    label="Merge into"
                    value={mergeTo}
                    onValueChange={setMergeTo}
                    locks={mergeTargets}
                    placeholder="Select target"
                  />
                </div>
                {activeVestingError ? (
                  <VestingNotice message={activeVestingError} />
                ) : mergeError ? (
                  <p className="mt-3 text-sm text-destructive">{mergeError}</p>
                ) : null}
                {maxLockSource ? (
                  <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                    <p className="text-sm text-amber-200">
                      Max lock must be removed before this NFT can be merged.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 border-amber-500/60 bg-background/70 text-foreground hover:bg-amber-500/20"
                      disabled={isSubmitting || !wallet.walletClient}
                      onClick={() => void submitUnlockPermanent(maxLockSource)}
                    >
                      {isSubmitting && mode === "merge" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Remove max lock
                    </Button>
                  </div>
                ) : null}
                <Button
                  type="button"
                  className="mt-4 w-full sm:w-auto"
                  disabled={
                    isSubmitting ||
                    !wallet.walletClient ||
                    !selectedMergeFrom ||
                    !selectedMergeTo ||
                    Boolean(mergeError)
                  }
                  onClick={() => void submitMerge()}
                >
                  {isSubmitting && mode === "merge" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Merge NFTs
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="split" className="space-y-4">
              <div className="rounded-xl border border-card-border/40 bg-card/30 p-4">
                <p className="text-sm text-muted-foreground">
                  Enter the amount for the new split NFT. The remainder stays in
                  the second NFT returned by the contract.
                </p>
                <div className="mt-4 grid gap-4">
                  <NftSelect
                    label="NFT"
                    value={splitToken}
                    onValueChange={setSplitToken}
                    locks={locks}
                    placeholder="Select NFT"
                  />
                  <div className="space-y-2">
                    <Label htmlFor="split-amount">Split amount</Label>
                    <Input
                      id="split-amount"
                      inputMode="decimal"
                      placeholder="0.0"
                      value={splitAmount}
                      onChange={(event) => setSplitAmount(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Available:{" "}
                      {selectedSplitLock?.lockedAmount !== null &&
                      selectedSplitLock?.lockedAmount !== undefined
                        ? formatVotingPower(selectedSplitLock.lockedAmount)
                        : "—"}
                    </p>
                    {splitRemainder !== null ? (
                      <p className="text-xs text-muted-foreground">
                        Remainder: {formatUnits(splitRemainder, NFT_DECIMALS)}
                      </p>
                    ) : splitError && !activeVestingError ? (
                      <p className="text-xs text-destructive">{splitError}</p>
                    ) : null}
                  </div>
                </div>
                {activeVestingError ? (
                  <VestingNotice message={activeVestingError} />
                ) : null}
                {maxLockSource ? (
                  <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                    <p className="text-sm text-amber-200">
                      Max lock must be removed before this NFT can be split.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 border-amber-500/60 bg-background/70 text-foreground hover:bg-amber-500/20"
                      disabled={isSubmitting || !wallet.walletClient}
                      onClick={() => void submitUnlockPermanent(maxLockSource)}
                    >
                      {isSubmitting && mode === "split" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Remove max lock
                    </Button>
                  </div>
                ) : null}
                <Button
                  type="button"
                  className="mt-4 w-full sm:w-auto"
                  disabled={
                    isSubmitting ||
                    !wallet.walletClient ||
                    !selectedSplitLock ||
                    Boolean(splitError)
                  }
                  onClick={() => void submitSplit()}
                >
                  {isSubmitting && mode === "split" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Scissors className="mr-2 h-4 w-4" />
                  )}
                  Split NFT
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        )}

        {status ? (
          <div className="rounded-xl border border-card-border/40 bg-background/60 p-3 text-sm text-muted-foreground">
            {status}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
};

const NftSelect = ({
  label,
  value,
  onValueChange,
  locks,
  placeholder,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  locks: VeNftLock[];
  placeholder: string;
}) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {locks.map((lock) => (
          <SelectItem key={lockValue(lock)} value={lockValue(lock)}>
            {formatLockLabel(lock)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

const VestingNotice = ({ message }: { message: string }) => (
  <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
    <p className="text-sm text-amber-200">{message}</p>
  </div>
);
