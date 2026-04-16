import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2, RotateCw, ShieldX } from "lucide-react";
import {
  MEZO_BC_EXPLORER,
  MezoChain,
  MezoUserApprovalsClient,
  getMezoChain,
  getMezoContracts,
  type ActiveAllowance,
  type ApprovalCandidate,
  type KnownApprovalToken,
} from "@mtools/shared";
import { formatUnits, getAddress, type Address, type Hex, type PublicClient } from "viem";
import { useAccount, useChainId, usePublicClient } from "wagmi";

import { TableCard, TableShell } from "@/components/TableShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/useWallet";

interface RevokeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface StoredAllowance {
  token: Address;
  tokenSymbol?: string;
  tokenDecimals?: number;
  owner: Address;
  spender: Address;
  value: string;
  currentAllowance: string;
  transactionHash: Hex;
  blockNumber: number;
  logIndex: number;
}

interface StoredApprovalScan {
  scannedAt: string;
  scannedToBlock: string;
  chainId: number;
  owner: Address;
  allowances: StoredAllowance[];
}

const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const STORAGE_PREFIX = "mezo-tools-revoke-scan";
const MAX_UINT256 = (1n << 256n) - 1n;

const truncateAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

const formatTimestamp = (value: string | null) => {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return `${date.toLocaleString()} (${formatDistanceToNow(date, {
    addSuffix: true,
  })})`;
};

const toStoredAllowance = (allowance: ActiveAllowance): StoredAllowance => ({
  token: getAddress(allowance.token),
  tokenSymbol: allowance.tokenSymbol,
  tokenDecimals: allowance.tokenDecimals,
  owner: getAddress(allowance.owner),
  spender: getAddress(allowance.spender),
  value: allowance.value.toString(),
  currentAllowance: allowance.currentAllowance.toString(),
  transactionHash: allowance.transactionHash,
  blockNumber: allowance.blockNumber,
  logIndex: allowance.logIndex,
});

const fromStoredAllowance = (allowance: StoredAllowance): ActiveAllowance => ({
  token: getAddress(allowance.token),
  tokenSymbol: allowance.tokenSymbol,
  tokenDecimals: allowance.tokenDecimals,
  owner: getAddress(allowance.owner),
  spender: getAddress(allowance.spender),
  value: BigInt(allowance.value),
  currentAllowance: BigInt(allowance.currentAllowance),
  transactionHash: allowance.transactionHash,
  blockNumber: allowance.blockNumber,
  logIndex: allowance.logIndex,
});

const getStorageKey = (chainId: number, owner: Address) =>
  `${STORAGE_PREFIX}:${chainId}:${getAddress(owner)}`;

const canUseLocalStorage = () => {
  if (typeof window === "undefined") return false;
  try {
    const key = `${STORAGE_PREFIX}:probe`;
    window.localStorage.setItem(key, "1");
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

const formatAllowance = (allowance: ActiveAllowance) => {
  if (allowance.currentAllowance === MAX_UINT256) return "Unlimited";

  const decimals = allowance.tokenDecimals ?? 18;
  try {
    const formatted = formatUnits(allowance.currentAllowance, decimals);
    const asNumber = Number.parseFloat(formatted);
    if (!Number.isFinite(asNumber)) return formatted;
    return asNumber.toLocaleString(undefined, {
      maximumFractionDigits: decimals <= 8 ? decimals : 6,
    });
  } catch {
    return allowance.currentAllowance.toString();
  }
};

export const RevokeSheet = ({ open, onOpenChange }: RevokeSheetProps) => {
  const { address } = useAccount();
  const chainId = useChainId() || MezoChain.id;
  const publicClient = usePublicClient({ chainId });
  const wallet = useWallet();
  const { toast } = useToast();
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [scan, setScan] = useState<StoredApprovalScan | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const owner = address ? getAddress(address) : null;
  const storageKey = owner ? getStorageKey(chainId, owner) : null;

  const knownTokens = useMemo<KnownApprovalToken[]>(() => {
    const contracts = getMezoContracts(chainId);
    return Object.entries(contracts.tokens ?? {}).map(([symbol, token]) => ({
      symbol,
      address: getAddress(token.address),
      decimals: token.decimals,
    }));
  }, [chainId]);

  const allowances = useMemo(
    () => (scan?.allowances ?? []).map(fromStoredAllowance),
    [scan],
  );

  const allowanceKey = (allowance: ActiveAllowance) =>
    `${getAddress(allowance.token)}:${getAddress(allowance.spender)}`;

  const selectedAllowances = allowances.filter((allowance) =>
    selectedKeys.has(allowanceKey(allowance)),
  );

  const persistScan = useCallback(
    (nextAllowances: ActiveAllowance[], scannedToBlock: bigint) => {
      if (!storageKey || !owner) return null;

      const nextScan: StoredApprovalScan = {
        scannedAt: new Date().toISOString(),
        scannedToBlock: scannedToBlock.toString(),
        chainId,
        owner,
        allowances: nextAllowances.map(toStoredAllowance),
      };

      window.localStorage.setItem(storageKey, JSON.stringify(nextScan));
      setScan(nextScan);
      setSelectedKeys(
        new Set(nextAllowances.map((allowance) => allowanceKey(allowance))),
      );
      return nextScan;
    },
    [chainId, owner, storageKey],
  );

  const runScan = useCallback(async () => {
    if (!owner || !storageKey) {
      setError("Connect a wallet before scanning approvals.");
      return [];
    }

    if (!storageAvailable) {
      setError("Browser localStorage is unavailable, so scan results cannot be saved.");
      return [];
    }

    setIsScanning(true);
    setProgress(`Scanning ${knownTokens.length} known Mezo tokens...`);
    setError(null);

    try {
      const chain = getMezoChain(chainId);
      const rpcUrl = chain.rpcUrls.default.http[0];
      const client = new MezoUserApprovalsClient({ rpcUrl });
      const latestBlock = await client.getBlockNumber();
      const previousScannedToBlock = scan?.scannedToBlock
        ? BigInt(scan.scannedToBlock)
        : null;
      const previousApprovals: ApprovalCandidate[] =
        scan?.allowances.map(fromStoredAllowance) ?? [];
      const fromBlock =
        previousScannedToBlock !== null ? previousScannedToBlock + 1n : 0n;

      const newApprovals =
        fromBlock <= latestBlock
          ? await client.fetchApprovalLogsForKnownTokens(owner, knownTokens, {
              fromBlock,
              toBlock: latestBlock,
              blockRangeSize: 1_000_000n,
              allowExplorerFallback: false,
            })
          : [];

      const nextAllowances =
        await client.fetchActiveAllowancesForApprovalCandidates(
          [...previousApprovals, ...newApprovals],
          knownTokens,
          { minAllowance: 1n },
        );

      persistScan(nextAllowances, latestBlock);
      setProgress(null);
      return nextAllowances;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Approval scan failed.";
      setError(message);
      setProgress(null);
      return [];
    } finally {
      setIsScanning(false);
    }
  }, [
    chainId,
    knownTokens,
    owner,
    persistScan,
    scan,
    storageAvailable,
    storageKey,
  ]);

  const revokeSelected = async () => {
    if (!wallet.walletClient || !owner || !publicClient) {
      setError("Connect a wallet before revoking approvals.");
      return;
    }
    if (selectedAllowances.length === 0) {
      setError("Select at least one active allowance.");
      return;
    }

    setIsRevoking(true);
    setError(null);

    try {
      for (const [index, allowance] of selectedAllowances.entries()) {
        const label = `${allowance.tokenSymbol ?? truncateAddress(allowance.token)} -> ${truncateAddress(allowance.spender)}`;
        setProgress(`Revoking ${index + 1}/${selectedAllowances.length}: ${label}`);
        const hash = await wallet.walletClient.writeContract({
          address: allowance.token,
          abi: ERC20_APPROVE_ABI,
          functionName: "approve",
          args: [allowance.spender, 0n],
          account: owner,
          chain: getMezoChain(chainId),
        });
        await (publicClient as PublicClient).waitForTransactionReceipt({ hash });
      }

      toast({
        title: "Revoke complete",
        description: "Refreshing allowances from chain.",
      });
      await runScan();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke transaction failed.");
    } finally {
      setProgress(null);
      setIsRevoking(false);
    }
  };

  useEffect(() => {
    if (!open) return;

    const available = canUseLocalStorage();
    setStorageAvailable(available);
    setError(null);
    setSelectedKeys(new Set());

    if (!available || !storageKey) {
      setScan(null);
      return;
    }

    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) {
        setScan(null);
        return;
      }
      const parsed = JSON.parse(stored) as StoredApprovalScan;
      setScan(parsed);
      setSelectedKeys(
        new Set(parsed.allowances.map((allowance) => allowanceKey(fromStoredAllowance(allowance)))),
      );
    } catch {
      setScan(null);
      setError("Saved approval scan is unreadable. Run refresh to replace it.");
    }
  }, [open, storageKey]);

  const toggleAllowance = (allowance: ActiveAllowance, checked: boolean) => {
    const key = allowanceKey(allowance);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const allSelected =
    allowances.length > 0 &&
    allowances.every((allowance) => selectedKeys.has(allowanceKey(allowance)));

  const toggleAll = (checked: boolean) => {
    setSelectedKeys(
      checked ? new Set(allowances.map((allowance) => allowanceKey(allowance))) : new Set(),
    );
  };

  const busy = isScanning || isRevoking;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-4 overflow-y-auto sm:max-w-5xl"
        enableSwipeClose
        onSwipeClose={() => onOpenChange(false)}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShieldX className="h-5 w-5 text-primary" />
            Revoke approvals
          </SheetTitle>
          <SheetDescription asChild>
            <div className="space-y-1 text-sm text-muted-foreground">
              <div>
              Scan known Mezo tokens for active ERC-20 allowances, then revoke the selected approvals.
              </div>
              <div>
                Scan results are saved in this browser&apos;s localStorage for the connected wallet.
                {scan?.scannedAt ? (
                  <span className="text-foreground">
                    {" "}
                    Last scan: {formatTimestamp(scan.scannedAt)}.
                  </span>
                ) : null}
              </div>
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {owner ? (
              <>
                Wallet <span className="font-mono text-foreground">{truncateAddress(owner)}</span>
                {" · "}
                {knownTokens.length} tokens
              </>
            ) : (
              "Connect a wallet to scan approvals."
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void runScan()}
              disabled={!owner || !storageAvailable || busy}
            >
              {isScanning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
            <Button
              type="button"
              onClick={() => void revokeSelected()}
              disabled={!owner || !wallet.walletClient || selectedAllowances.length === 0 || busy}
            >
              {isRevoking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Revoke selected ({selectedAllowances.length})
            </Button>
          </div>
        </div>

        {!storageAvailable ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Browser localStorage is unavailable. This tool cannot show cached approval data or save new scans.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {progress ? (
          <div className="flex items-center gap-2 rounded-lg border border-card-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            {progress}
          </div>
        ) : null}

        {!scan && !busy ? (
          <div className="rounded-lg border border-dashed border-card-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            No saved scan for this wallet. Run refresh to load current allowances.
          </div>
        ) : allowances.length === 0 && scan ? (
          <div className="rounded-lg border border-dashed border-card-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            No active allowances found in the known Mezo token list.
          </div>
        ) : allowances.length > 0 ? (
          <>
            <TableShell className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allSelected} onCheckedChange={(value) => toggleAll(value === true)} />
                    </TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead>Spender</TableHead>
                    <TableHead>Allowance</TableHead>
                    <TableHead>Last approval</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allowances.map((allowance) => {
                    const key = allowanceKey(allowance);
                    return (
                      <TableRow key={key}>
                        <TableCell>
                          <Checkbox
                            checked={selectedKeys.has(key)}
                            onCheckedChange={(value) => toggleAllowance(allowance, value === true)}
                          />
                        </TableCell>
                        <TableCell>
                          <a
                            href={`${MEZO_BC_EXPLORER}/address/${allowance.token}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-xs underline-offset-2 hover:underline"
                          >
                            {allowance.tokenSymbol ?? truncateAddress(allowance.token)}
                          </a>
                        </TableCell>
                        <TableCell>
                          <a
                            href={`${MEZO_BC_EXPLORER}/address/${allowance.spender}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-xs underline-offset-2 hover:underline"
                          >
                            {truncateAddress(allowance.spender)}
                          </a>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatAllowance(allowance)}
                        </TableCell>
                        <TableCell>
                          <a
                            href={`${MEZO_BC_EXPLORER}/tx/${allowance.transactionHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-xs underline-offset-2 hover:underline"
                          >
                            #{allowance.blockNumber.toLocaleString()}
                          </a>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableShell>

            <div className="space-y-3 md:hidden">
              {allowances.map((allowance) => {
                const key = allowanceKey(allowance);
                return (
                  <TableCard key={key}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-foreground">
                          {allowance.tokenSymbol ?? truncateAddress(allowance.token)}
                        </div>
                        <a
                          href={`${MEZO_BC_EXPLORER}/address/${allowance.spender}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs text-muted-foreground underline-offset-2 hover:underline"
                        >
                          {truncateAddress(allowance.spender)}
                        </a>
                      </div>
                      <Checkbox
                        checked={selectedKeys.has(key)}
                        onCheckedChange={(value) => toggleAllowance(allowance, value === true)}
                      />
                    </div>
                    <div className="mt-3 text-sm">
                      Allowance: <span className="font-mono">{formatAllowance(allowance)}</span>
                    </div>
                  </TableCard>
                );
              })}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
};
