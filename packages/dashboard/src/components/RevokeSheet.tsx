import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2, RotateCw, ShieldX } from "lucide-react";
import {
  MEZO_BC_EXPLORER,
  MezoChain,
  getMezoChain,
  getMezoContracts,
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
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

interface RevokeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ApprovalScan {
  scannedAt: string;
  scannedToBlock: string;
  chainId: number;
  owner: Address;
  approvals: RevocableApproval[];
}

type ApprovalStateRow = Tables<"approvals_state">;
type RevocableApprovalType = "erc20" | "erc721-token" | "erc721-operator";

interface RevocableApproval {
  type: RevocableApprovalType;
  token: Address;
  tokenSymbol?: string;
  tokenDecimals?: number;
  owner: Address;
  spender: Address;
  value?: bigint;
  currentAllowance?: bigint;
  tokenId?: bigint;
  transactionHash: Hex;
  blockNumber: number;
  logIndex: number;
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

const ERC20_ALLOWANCE_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const ERC721_APPROVAL_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const ERC721_SET_APPROVAL_FOR_ALL_ABI = [
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const;

const ERC721_GET_APPROVED_ABI = [
  {
    type: "function",
    name: "getApproved",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const ERC721_IS_APPROVED_FOR_ALL_ABI = [
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const MAX_UINT256 = (1n << 256n) - 1n;
const SUPABASE_PAGE_SIZE = 1000;
const ALLOWANCE_BATCH_SIZE = 25;

const truncateAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

const formatTimestamp = (value: string | null) => {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return `${date.toLocaleString()} (${formatDistanceToNow(date, {
    addSuffix: true,
  })})`;
};

const formatApproval = (approval: RevocableApproval) => {
  if (approval.type === "erc721-token") {
    return `Token #${approval.tokenId?.toString() ?? "unknown"}`;
  }

  if (approval.type === "erc721-operator") {
    return "All NFTs";
  }

  if (approval.currentAllowance === MAX_UINT256) return "Unlimited";

  const decimals = approval.tokenDecimals ?? 18;
  try {
    const formatted = formatUnits(approval.currentAllowance ?? 0n, decimals);
    const asNumber = Number.parseFloat(formatted);
    if (!Number.isFinite(asNumber)) return formatted;
    return asNumber.toLocaleString(undefined, {
      maximumFractionDigits: decimals <= 8 ? decimals : 6,
    });
  } catch {
    return (approval.currentAllowance ?? 0n).toString();
  }
};

const TokenContractLink = ({ approval }: { approval: RevocableApproval }) => {
  if (approval.tokenSymbol) {
    return (
      <a
        href={`${MEZO_BC_EXPLORER}/address/${approval.token}`}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-xs underline-offset-2 hover:underline"
      >
        {approval.tokenSymbol}
      </a>
    );
  }

  return (
    <a
      href={`${MEZO_BC_EXPLORER}/address/${approval.token}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex flex-col gap-0.5 font-mono text-xs underline-offset-2 hover:underline"
    >
      <span>Contract</span>
      <span>{truncateAddress(approval.token)}</span>
    </a>
  );
};

const fetchErc20ApprovalRows = async (
  chainId: number,
  owner: Address,
): Promise<ApprovalStateRow[]> => {
  const rows: ApprovalStateRow[] = [];
  let from = 0;

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("approvals_state")
      .select("*")
      .eq("chain_id", chainId)
      .eq("standard", "erc20")
      .eq("owner_address", owner.toLowerCase())
      .not("approved_value", "is", null)
      .order("last_block_number", { ascending: false })
      .order("last_log_index", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to load indexed approvals: ${error.message}`);
    }

    rows.push(...(data ?? []));
    if (!data || data.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }

  return rows;
};

const fetchVeNftApprovalRows = async (
  chainId: number,
  owner: Address,
  veAddresses: Address[],
): Promise<ApprovalStateRow[]> => {
  if (veAddresses.length === 0) return [];

  const rows: ApprovalStateRow[] = [];
  let from = 0;
  const lowerVeAddresses = veAddresses.map((address) => address.toLowerCase());

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("approvals_state")
      .select("*")
      .eq("chain_id", chainId)
      .eq("standard", "erc721")
      .eq("owner_address", owner.toLowerCase())
      .in("token_address", lowerVeAddresses)
      .order("last_block_number", { ascending: false })
      .order("last_log_index", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to load indexed ve approvals: ${error.message}`);
    }

    rows.push(...(data ?? []));
    if (!data || data.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }

  return rows;
};

export const RevokeSheet = ({ open, onOpenChange }: RevokeSheetProps) => {
  const { address } = useAccount();
  const chainId = useChainId() || MezoChain.id;
  const publicClient = usePublicClient({ chainId });
  const wallet = useWallet();
  const { toast } = useToast();
  const [scan, setScan] = useState<ApprovalScan | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const owner = address ? getAddress(address) : null;

  const knownTokens = useMemo<KnownApprovalToken[]>(() => {
    const contracts = getMezoContracts(chainId);
    return Object.entries(contracts.tokens ?? {}).map(([symbol, token]) => ({
      symbol,
      address: getAddress(token.address),
      decimals: token.decimals,
    }));
  }, [chainId]);

  const tokenMetaByAddress = useMemo(
    () =>
      new Map(
        [
          ...knownTokens.map((token): [string, { symbol: string; decimals: number }] => [
          getAddress(token.address).toLowerCase(),
          { symbol: token.symbol, decimals: token.decimals },
          ]),
          ...((): [string, { symbol: string; decimals: number }][] => {
            const contracts = getMezoContracts(chainId);
            return [
              contracts.veBTC
                ? [getAddress(contracts.veBTC).toLowerCase(), { symbol: "veBTC", decimals: 0 }]
                : null,
              contracts.veMEZO
                ? [getAddress(contracts.veMEZO).toLowerCase(), { symbol: "veMEZO", decimals: 0 }]
                : null,
            ].filter((item): item is [string, { symbol: string; decimals: number }] => item !== null);
          })(),
        ],
      ),
    [chainId, knownTokens],
  );

  const veNftAddresses = useMemo(() => {
    const contracts = getMezoContracts(chainId);
    return [contracts.veBTC, contracts.veMEZO]
      .filter((address): address is Address => Boolean(address))
      .map((address) => getAddress(address));
  }, [chainId]);

  const approvals = useMemo(() => scan?.approvals ?? [], [scan]);

  const approvalKey = (approval: RevocableApproval) =>
    `${approval.type}:${getAddress(approval.token)}:${getAddress(approval.spender)}:${approval.tokenId?.toString() ?? "-"}`;

  const selectedApprovals = approvals.filter((approval) =>
    selectedKeys.has(approvalKey(approval)),
  );

  const runScan = useCallback(async () => {
    if (!owner || !publicClient) {
      setError("Connect a wallet before scanning approvals.");
      return [];
    }

    setIsScanning(true);
    setProgress("Loading indexed approvals from Supabase...");
    setError(null);

    try {
      const [erc20Rows, veRows] = await Promise.all([
        fetchErc20ApprovalRows(chainId, owner),
        fetchVeNftApprovalRows(chainId, owner, veNftAddresses),
      ]);
      const rows = [...erc20Rows, ...veRows];
      setProgress(
        `Checking current state on-chain for ${rows.length} indexed approvals...`,
      );

      const nextApprovals: RevocableApproval[] = [];
      for (let index = 0; index < rows.length; index += ALLOWANCE_BATCH_SIZE) {
        const batch = rows.slice(index, index + ALLOWANCE_BATCH_SIZE);
        setProgress(
          `Checking current state ${Math.min(index + batch.length, rows.length)}/${rows.length}...`,
        );

        const batchApprovals = await Promise.all(
          batch.map(async (row): Promise<RevocableApproval | null> => {
            try {
              const token = getAddress(row.token_address);
              const spender = getAddress(row.spender_address);
              const tokenMeta = tokenMetaByAddress.get(token.toLowerCase());
              const baseApproval = {
                token,
                tokenSymbol: tokenMeta?.symbol,
                tokenDecimals: tokenMeta?.decimals,
                owner,
                spender,
                transactionHash: row.last_tx_hash as Hex,
                blockNumber: Number(row.last_block_number),
                logIndex: Number(row.last_log_index),
              };

              if (row.standard === "erc20") {
                const currentAllowance = await (publicClient as PublicClient).readContract({
                  address: token,
                  abi: ERC20_ALLOWANCE_ABI,
                  functionName: "allowance",
                  args: [owner, spender],
                });

                if (currentAllowance < 1n) return null;

                return {
                  ...baseApproval,
                  type: "erc20",
                  value: BigInt(row.approved_value ?? "0"),
                  currentAllowance,
                };
              }

              if (row.standard === "erc721" && row.token_id) {
                if (spender.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
                  return null;
                }

                const tokenId = BigInt(row.token_id);
                const approved = await (publicClient as PublicClient).readContract({
                  address: token,
                  abi: ERC721_GET_APPROVED_ABI,
                  functionName: "getApproved",
                  args: [tokenId],
                });

                if (getAddress(approved).toLowerCase() !== spender.toLowerCase()) {
                  return null;
                }

                return {
                  ...baseApproval,
                  type: "erc721-token",
                  tokenId,
                };
              }

              if (row.standard === "erc721" && row.token_id === null) {
                if (row.approved_bool === false) return null;

                const approved = await (publicClient as PublicClient).readContract({
                  address: token,
                  abi: ERC721_IS_APPROVED_FOR_ALL_ABI,
                  functionName: "isApprovedForAll",
                  args: [owner, spender],
                });

                if (!approved) return null;

                return {
                  ...baseApproval,
                  type: "erc721-operator",
                };
              }

              return null;
            } catch {
              return null;
            }
          }),
        );

        nextApprovals.push(
          ...batchApprovals.filter(
            (item): item is RevocableApproval => item !== null,
          ),
        );
      }

      const latestBlock = await (publicClient as PublicClient).getBlockNumber();
      const nextScan: ApprovalScan = {
        scannedAt: new Date().toISOString(),
        scannedToBlock: latestBlock.toString(),
        chainId,
        owner,
        approvals: nextApprovals,
      };

      setScan(nextScan);
      setSelectedKeys(
        new Set(nextApprovals.map((approval) => approvalKey(approval))),
      );
      setProgress(null);
      return nextApprovals;
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
    owner,
    publicClient,
    tokenMetaByAddress,
    veNftAddresses,
  ]);

  const revokeSelected = async () => {
    if (!wallet.walletClient || !owner || !publicClient) {
      setError("Connect a wallet before revoking approvals.");
      return;
    }
    if (selectedApprovals.length === 0) {
      setError("Select at least one active approval.");
      return;
    }

    setIsRevoking(true);
    setError(null);

    try {
      for (const [index, approval] of selectedApprovals.entries()) {
        const label = `${approval.tokenSymbol ?? truncateAddress(approval.token)} -> ${truncateAddress(approval.spender)}`;
        setProgress(`Revoking ${index + 1}/${selectedApprovals.length}: ${label}`);
        const hash =
          approval.type === "erc20"
            ? await wallet.walletClient.writeContract({
                address: approval.token,
                abi: ERC20_APPROVE_ABI,
                functionName: "approve",
                args: [approval.spender, 0n],
                account: owner,
                chain: getMezoChain(chainId),
              })
            : approval.type === "erc721-token" && approval.tokenId != null
              ? await wallet.walletClient.writeContract({
                  address: approval.token,
                  abi: ERC721_APPROVAL_ABI,
                  functionName: "approve",
                  args: [ZERO_ADDRESS, approval.tokenId],
                  account: owner,
                  chain: getMezoChain(chainId),
                })
              : await wallet.walletClient.writeContract({
                  address: approval.token,
                  abi: ERC721_SET_APPROVAL_FOR_ALL_ABI,
                  functionName: "setApprovalForAll",
                  args: [approval.spender, false],
                  account: owner,
                  chain: getMezoChain(chainId),
                });
        await (publicClient as PublicClient).waitForTransactionReceipt({ hash });
      }

      toast({
        title: "Revoke complete",
        description: "Refreshing approvals from chain.",
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
    setScan(null);
    setError(null);
    setProgress(null);
    setSelectedKeys(new Set());
  }, [chainId, open, owner]);

  const toggleApproval = (approval: RevocableApproval, checked: boolean) => {
    const key = approvalKey(approval);
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
    approvals.length > 0 &&
    approvals.every((approval) => selectedKeys.has(approvalKey(approval)));

  const toggleAll = (checked: boolean) => {
    setSelectedKeys(
      checked ? new Set(approvals.map((approval) => approvalKey(approval))) : new Set(),
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
            <div className="space-y-3 text-sm text-muted-foreground">
              <div>
                Load indexed ERC-20, veBTC, and veMEZO approvals, check current state on-chain, then revoke the selected approvals.
              </div>
              <div className="space-y-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-foreground">
                <div>
                  The approval index stores all observed approval events for future token support. This screen currently supports ERC-20 plus veBTC and veMEZO NFT revoke.
                </div>
                <div>
                  Allowance 0 means the spender has no active token allowance, so there is nothing to revoke.
                </div>
              </div>
              {scan?.scannedAt ? (
                <div>
                  Last scan: <span className="text-foreground">{formatTimestamp(scan.scannedAt)}</span>.
                </div>
              ) : null}
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {owner ? (
              <>
                Wallet <span className="font-mono text-foreground">{truncateAddress(owner)}</span>
                {" · "}
                {approvals.length} active approvals
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
              disabled={!owner || busy}
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
              disabled={!owner || !wallet.walletClient || selectedApprovals.length === 0 || busy}
            >
              {isRevoking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Revoke selected ({selectedApprovals.length})
            </Button>
          </div>
        </div>

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
            Run refresh to load indexed approvals and current state.
          </div>
        ) : approvals.length === 0 && scan ? (
          <div className="rounded-lg border border-dashed border-card-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            No active supported approvals found for this wallet.
          </div>
        ) : approvals.length > 0 ? (
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
                    <TableHead>Approval</TableHead>
                    <TableHead>Last approval</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvals.map((approval) => {
                    const key = approvalKey(approval);
                    return (
                      <TableRow key={key}>
                        <TableCell>
                          <Checkbox
                            checked={selectedKeys.has(key)}
                            onCheckedChange={(value) => toggleApproval(approval, value === true)}
                          />
                        </TableCell>
                        <TableCell>
                          <TokenContractLink approval={approval} />
                        </TableCell>
                        <TableCell>
                          <a
                            href={`${MEZO_BC_EXPLORER}/address/${approval.spender}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-xs underline-offset-2 hover:underline"
                          >
                            {truncateAddress(approval.spender)}
                          </a>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatApproval(approval)}
                        </TableCell>
                        <TableCell>
                          <a
                            href={`${MEZO_BC_EXPLORER}/tx/${approval.transactionHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-xs underline-offset-2 hover:underline"
                          >
                            #{approval.blockNumber.toLocaleString()}
                          </a>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableShell>

            <div className="space-y-3 md:hidden">
              {approvals.map((approval) => {
                const key = approvalKey(approval);
                return (
                  <TableCard key={key}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-foreground">
                          <TokenContractLink approval={approval} />
                        </div>
                        <a
                          href={`${MEZO_BC_EXPLORER}/address/${approval.spender}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs text-muted-foreground underline-offset-2 hover:underline"
                        >
                          {truncateAddress(approval.spender)}
                        </a>
                      </div>
                      <Checkbox
                        checked={selectedKeys.has(key)}
                        onCheckedChange={(value) => toggleApproval(approval, value === true)}
                      />
                    </div>
                    <div className="mt-3 text-sm">
                      Approval: <span className="font-mono">{formatApproval(approval)}</span>
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
