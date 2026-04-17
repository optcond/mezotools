import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useChainId, usePublicClient } from "wagmi";
import { Activity, ExternalLink, Info, Wallet } from "lucide-react";
import type { PublicClient } from "viem";

import { WalletConnectButton } from "@/components/WalletConnectButton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getKnownMezoTokenBalances,
  getWalletVeNftStats,
  MezoChain,
  bigintSharePct,
  formatVotingPower,
  formatUsd as formatUsdShared,
  shortenAddress,
} from "@mtools/shared";
import type { KnownTokenBalance, WalletVeNftStats } from "@mtools/shared";
import type { Trove, Liquidation, Redemption } from "@/hooks/useMonitorData";
import type { WalletControls } from "@/hooks/useWallet";
import { formatNumber } from "@/lib/formatNumber";
import { MEZO_BC_EXPLORER } from "@mtools/shared";

interface PersonalWalletStatsProps {
  troves: Trove[];
  liquidations: Liquidation[];
  redemptions: Redemption[];
  isLoading: boolean;
  wallet: WalletControls;
  tokenPricesUsd?: Record<string, number | null | undefined>;
  onNftOperationsClick?: () => void;
}

type MainTab = "balance" | "troves" | "activity" | "ve-nft";
type ActivityTab = "redemptions" | "liquidations";

const MIN_COLLATERAL_RATIO = 1.1;

const getTroveKey = (trove: Trove) =>
  trove.id ||
  `${trove.owner.toLowerCase()}-${trove.collateral.toString()}-${trove.interest.toLocaleString()}`;

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });

const formatBalance = (value: number, symbol: string) =>
  `${value.toLocaleString(undefined, {
    maximumFractionDigits: value >= 1 ? 4 : 8,
  })} ${symbol}`;

const EmptyState = ({ message }: { message: string }) => (
  <div className="flex items-center gap-2 rounded-xl border border-dashed border-card-border/40 bg-muted/10 px-3 py-4 text-sm text-muted-foreground">
    <Activity className="h-4 w-4 text-muted-foreground/70" />
    {message}
  </div>
);

export const PersonalWalletStats = ({
  troves,
  liquidations,
  redemptions,
  isLoading,
  wallet,
  tokenPricesUsd,
  onNftOperationsClick,
}: PersonalWalletStatsProps) => {
  const { account } = wallet;
  const normalizedAccount = account?.toLowerCase() ?? null;
  const chainId = useChainId();
  const activeChainId = chainId ?? MezoChain.id;
  const publicClient = usePublicClient({ chainId: activeChainId });
  const [activeTab, setActiveTab] = useState<MainTab>("balance");
  const [activityTab, setActivityTab] = useState<ActivityTab>("redemptions");

  const veNftStatsQuery = useQuery<WalletVeNftStats>({
    queryKey: ["wallet-ve-nft-stats", account, activeChainId],
    enabled: Boolean(account && publicClient),
    refetchInterval: account ? 30_000 : false,
    queryFn: () =>
      getWalletVeNftStats(
        publicClient as PublicClient,
        account as `0x${string}`,
        {
          chainId: activeChainId,
        },
      ),
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
  });

  const veNftStats = veNftStatsQuery.data ?? {
    locks: [],
    totalVotingPowerByAddress: {},
  };
  const veNfts = veNftStats.locks;
  const totalVpByAddress = veNftStats.totalVotingPowerByAddress;

  const balancesQuery = useQuery<KnownTokenBalance[]>({
    queryKey: [
      "wallet-known-token-balances",
      account,
      activeChainId,
      tokenPricesUsd,
    ],
    enabled: Boolean(account && publicClient),
    refetchInterval: account ? 30_000 : false,
    queryFn: () =>
      getKnownMezoTokenBalances(
        publicClient as PublicClient,
        account as `0x${string}`,
        {
          chainId: activeChainId,
          tokenPricesUsd,
        },
      ),
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
  });

  const troveRiskMap = useMemo(() => {
    const sortedTroves = [...troves].sort((a, b) => {
      if (a.collaterization_ratio !== b.collaterization_ratio) {
        return a.collaterization_ratio - b.collaterization_ratio;
      }

      const aUpdated = new Date(a.updated_at).getTime();
      const bUpdated = new Date(b.updated_at).getTime();
      if (aUpdated !== bUpdated) {
        return aUpdated - bUpdated;
      }

      return a.id.localeCompare(b.id);
    });

    const riskMap = new Map<
      string,
      { trovesAhead: number; collateralAhead: number }
    >();
    let cumulativeCollateral = 0;

    sortedTroves.forEach((trove, index) => {
      riskMap.set(getTroveKey(trove), {
        trovesAhead: index,
        collateralAhead: cumulativeCollateral,
      });
      cumulativeCollateral += trove.collateral;
    });

    return riskMap;
  }, [troves]);

  const userTroves = useMemo(() => {
    if (!normalizedAccount) return [];
    return troves.filter(
      (trove) => trove.owner.toLowerCase() === normalizedAccount,
    );
  }, [troves, normalizedAccount]);

  const userLiquidations = useMemo(() => {
    if (!normalizedAccount) return [];
    return liquidations.filter(
      (liq) => liq.borrower.toLowerCase() === normalizedAccount,
    );
  }, [liquidations, normalizedAccount]);

  const userRedemptions = useMemo(() => {
    if (!normalizedAccount) return [];
    return redemptions.filter(
      (red) =>
        Array.isArray(red.affected_borrowers) &&
        red.affected_borrowers.some(
          (borrower) =>
            typeof borrower === "string" &&
            borrower.toLowerCase() === normalizedAccount,
        ),
    );
  }, [redemptions, normalizedAccount]);

  const totalCollateral = useMemo(
    () => userTroves.reduce((sum, trove) => sum + trove.collateral, 0),
    [userTroves],
  );

  const totalDebt = useMemo(
    () =>
      userTroves.reduce(
        (sum, trove) => sum + trove.principal_debt + trove.interest,
        0,
      ),
    [userTroves],
  );

  const isDisplayingData = Boolean(account);
  const nonZeroBalances = balancesQuery.data ?? [];
  const isBalanceFetching = balancesQuery.isFetching;

  const renderSkeleton = () => (
    <div className="space-y-4">
      <Skeleton className="h-16 rounded-2xl" />
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );

  const renderBalances = () => (
    <div className="rounded-2xl border border-card-border/40 bg-card/30 p-5">
      <div className="mb-4">
        <p className="text-xs uppercase text-muted-foreground">Balances</p>
        <p className="text-2xl font-semibold">
          {isBalanceFetching
            ? "Fetching..."
            : `${nonZeroBalances.length} assets`}
        </p>
      </div>
      {isBalanceFetching && nonZeroBalances.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : nonZeroBalances.length === 0 ? (
        <EmptyState message="No non-zero balances found for known Mezo tokens." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {nonZeroBalances.map((balance) => (
            <div
              key={balance.symbol}
              className="rounded-xl border border-card-border/40 bg-background/50 p-4"
            >
              <p className="text-xs text-muted-foreground">{balance.symbol}</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {formatBalance(balance.amount, balance.symbol)}
                {balance.valueUsd !== null &&
                Number.isFinite(balance.valueUsd) ? (
                  <span className="ml-2 text-sm font-medium text-muted-foreground">
                    ({formatUsdShared(balance.valueUsd)})
                  </span>
                ) : null}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderVeNfts = () => {
    return (
      <div className="rounded-2xl border border-card-border/40 bg-card/30 p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase text-muted-foreground">ve NFT</p>
            <p className="text-2xl font-semibold">
              {veNftStatsQuery.isFetching
                ? "Fetching..."
                : `${veNfts.length} locks`}
            </p>
          </div>
          {onNftOperationsClick ? (
            <Button
              type="button"
              variant="outline"
              onClick={onNftOperationsClick}
            >
              Edit NFTs
            </Button>
          ) : null}
        </div>
        {veNftStatsQuery.isFetching && veNfts.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : veNfts.length === 0 ? (
          <EmptyState message="No veBTC or veMEZO locks found for this wallet." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {veNfts.map((lock) => {
              const unlockDate = lock.isPermanent
                ? "Permanent"
                : lock.unlockTime && lock.unlockTime > 0n
                  ? new Date(
                      Number(lock.unlockTime) * 1000,
                    ).toLocaleDateString()
                  : "—";
              const totalVp =
                totalVpByAddress[lock.contractAddress.toLowerCase()] ?? null;
              const sharePct =
                lock.votingPower !== null && totalVp !== null && totalVp > 0n
                  ? bigintSharePct(lock.votingPower, totalVp)
                  : null;
              return (
                <div
                  key={`${lock.escrow}-${lock.tokenId.toString()}`}
                  className="rounded-xl border border-card-border/40 bg-background/50 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {lock.escrow}
                      </p>
                      <p className="text-lg font-semibold">
                        NFT #{lock.tokenId.toString()}
                      </p>
                    </div>
                    <a
                      href={`${MEZO_BC_EXPLORER}/address/${lock.contractAddress}`}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0"
                    >
                      <Badge
                        variant="secondary"
                        className="font-mono text-xs hover:bg-muted"
                      >
                        {shortenAddress(lock.contractAddress)}
                      </Badge>
                    </a>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Locked</p>
                      <p className="font-semibold">
                        {lock.lockedAmount !== null
                          ? formatVotingPower(lock.lockedAmount)
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Voting power
                      </p>
                      <p className="font-semibold">
                        {lock.votingPower !== null
                          ? formatVotingPower(lock.votingPower)
                          : "—"}
                        {sharePct !== null && (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            ({sharePct < 0.0001 ? "<0.0001" : sharePct.toFixed(4)}%)
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Unlock</p>
                      <p className="font-semibold">{unlockDate}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderTroves = () => (
    <div className="rounded-2xl border border-card-border/40 bg-card/30 p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase text-muted-foreground">
            Current troves
          </p>
          <p className="text-2xl font-semibold">
            {userTroves.length > 0
              ? `${formatNumber(userTroves.length)} active`
              : "No active troves"}
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-3 text-sm sm:w-auto">
          <div className="rounded-xl border border-card-border/40 bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">Collateral</p>
            <p className="text-lg font-semibold">
              {formatNumber(totalCollateral, {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
              })}{" "}
              BTC
            </p>
          </div>
          <div className="rounded-xl border border-card-border/40 bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">Debt</p>
            <p className="text-lg font-semibold">
              {formatNumber(totalDebt, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              MUSD
            </p>
          </div>
        </div>
      </div>
      {userTroves.length === 0 ? (
        <EmptyState message="No troves found for this wallet." />
      ) : (
        <div className="space-y-3">
          {userTroves.map((trove) => {
            const troveKey = getTroveKey(trove);
            const riskStats = troveRiskMap.get(troveKey);
            return (
              <div
                key={troveKey}
                className="rounded-xl border border-card-border/40 bg-background/50 p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-muted-foreground">
                    Updated {formatDateTime(trove.updated_at)}
                  </div>
                  <Badge variant="secondary" className="text-xs font-bold">
                    {formatNumber(trove.collaterization_ratio * 100, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                    % CR
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Collateral</p>
                    <p className="font-semibold">
                      {formatNumber(trove.collateral, {
                        minimumFractionDigits: 4,
                        maximumFractionDigits: 4,
                      })}{" "}
                      BTC
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Principal debt
                    </p>
                    <p className="font-semibold">
                      {formatNumber(trove.principal_debt, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      MUSD
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Accrued interest
                    </p>
                    <p className="font-semibold">
                      {formatNumber(trove.interest, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      MUSD
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Liquidation price
                    </p>
                    <p className="font-semibold">
                      {trove.collateral > 0
                        ? `$${formatNumber(
                            ((trove.principal_debt + trove.interest) *
                              MIN_COLLATERAL_RATIO) /
                              trove.collateral,
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            },
                          )}`
                        : "—"}
                    </p>
                  </div>
                </div>
                <div className="mt-4 rounded-xl border border-card-border/60 bg-card/20 p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                    <span>Redemption position</span>
                    <Tooltip delayDuration={150}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground/70 transition hover:text-muted-foreground"
                          aria-label="Redemption position details"
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="max-w-xs normal-case"
                      >
                        Troves are redeemed in order of collateral ratio. Fewer
                        troves and BTC ahead indicate higher redemption risk.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-6 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Troves ahead
                      </p>
                      <p className="text-xl font-semibold">
                        {formatNumber(riskStats?.trovesAhead ?? 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">BTC ahead</p>
                      <p className="text-xl font-semibold">
                        {formatNumber(riskStats?.collateralAhead ?? 0, {
                          minimumFractionDigits: 4,
                          maximumFractionDigits: 4,
                        })}{" "}
                        BTC
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderActivity = () => (
    <div className="rounded-2xl border border-card-border/40 bg-card/30 p-5">
      <Tabs
        value={activityTab}
        onValueChange={(value) => setActivityTab(value as ActivityTab)}
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Activity</p>
          </div>
          <TabsList className="grid grid-cols-2 gap-1.5 w-full h-auto bg-transparent p-0 sm:flex sm:h-10 sm:w-auto sm:bg-muted/10 sm:p-1">
            <TabsTrigger
              value="redemptions"
              className="border border-border/50 rounded-sm sm:border-0 sm:flex-none"
            >
              Redemptions
              <Badge variant="secondary" className="ml-2">
                {formatNumber(userRedemptions.length)}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="liquidations"
              className="border border-border/50 rounded-sm sm:border-0 sm:flex-none"
            >
              Liquidations
              <Badge variant="secondary" className="ml-2">
                {formatNumber(userLiquidations.length)}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="redemptions" className="mt-0 space-y-3">
          {userRedemptions.length === 0 ? (
            <EmptyState message="No redemptions affecting this wallet." />
          ) : (
            userRedemptions.slice(0, 5).map((redemption) => (
              <div
                key={redemption.id}
                className="rounded-xl border border-card-border/40 bg-background/50 p-3 text-sm"
              >
                <ActivityHeader
                  timestamp={redemption.block_timestamp}
                  txHash={redemption.tx_hash}
                />
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <ActivityValue
                    label="Attempted"
                    value={redemption.attempted_amount}
                    unit="MUSD"
                  />
                  <ActivityValue
                    label="Actual"
                    value={redemption.actual_amount}
                    unit="MUSD"
                  />
                  <ActivityValue
                    label="Collateral sent"
                    value={redemption.collateral_sent}
                    unit="BTC"
                    decimals={4}
                  />
                  <ActivityValue
                    label="Fee"
                    value={redemption.collateral_fee}
                    unit="BTC"
                    decimals={4}
                  />
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="liquidations" className="mt-0 space-y-3">
          {userLiquidations.length === 0 ? (
            <EmptyState message="No liquidations for this wallet." />
          ) : (
            userLiquidations.slice(0, 5).map((liquidation) => (
              <div
                key={liquidation.id}
                className="rounded-xl border border-card-border/40 bg-background/50 p-3 text-sm"
              >
                <ActivityHeader
                  timestamp={liquidation.block_timestamp}
                  txHash={liquidation.tx_hash}
                />
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <ActivityValue
                    label="Debt repaid"
                    value={liquidation.debt}
                    unit="MUSD"
                  />
                  <ActivityValue
                    label="Collateral"
                    value={liquidation.collateral}
                    unit="BTC"
                    decimals={4}
                  />
                </div>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );

  return (
    <Card className="glass-card p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-primary">
            <Wallet className="h-5 w-5 text-primary" />
            Personal Wallet Stats
          </h2>
          <p className="text-sm text-muted-foreground">
            {isDisplayingData
              ? "Live data for the connected address."
              : "Connect to view details for your wallet."}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {account && (
            <Badge
              variant="outline"
              className="justify-center font-mono text-xs uppercase"
            >
              {shortenAddress(account)}
            </Badge>
          )}
          <WalletConnectButton />
        </div>
      </div>

      {isDisplayingData ? (
        isLoading ? (
          renderSkeleton()
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as MainTab)}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <TabsList className="grid grid-cols-2 gap-1.5 w-full h-auto bg-transparent p-0 sm:flex sm:h-10 sm:w-auto sm:bg-muted/10 sm:p-1">
                <TabsTrigger
                  value="balance"
                  className="border border-border/50 rounded-sm sm:border-0 sm:flex-none"
                >
                  Balance
                  <Badge variant="secondary" className="ml-2">
                    {formatNumber(nonZeroBalances.length)}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger
                  value="troves"
                  className="border border-border/50 rounded-sm sm:border-0 sm:flex-none"
                >
                  Troves
                  <Badge variant="secondary" className="ml-2">
                    {formatNumber(userTroves.length)}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger
                  value="activity"
                  className="border border-border/50 rounded-sm sm:border-0 sm:flex-none"
                >
                  Activity
                  <Badge variant="secondary" className="ml-2">
                    {formatNumber(
                      userRedemptions.length + userLiquidations.length,
                    )}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger
                  value="ve-nft"
                  className="border border-border/50 rounded-sm sm:border-0 sm:flex-none"
                >
                  ve NFT
                  <Badge variant="secondary" className="ml-2">
                    {formatNumber(veNfts.length)}
                  </Badge>
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="balance" className="mt-4">
              {renderBalances()}
            </TabsContent>
            <TabsContent value="troves" className="mt-4">
              {renderTroves()}
            </TabsContent>
            <TabsContent value="activity" className="mt-4">
              {renderActivity()}
            </TabsContent>
            <TabsContent value="ve-nft" className="mt-4">
              {renderVeNfts()}
            </TabsContent>
          </Tabs>
        )
      ) : null}
    </Card>
  );
};

const ActivityHeader = ({
  timestamp,
  txHash,
}: {
  timestamp: string;
  txHash: string;
}) => (
  <div className="flex items-center justify-between text-xs text-muted-foreground">
    <span>{formatDateTime(timestamp)}</span>
    <button
      className="inline-flex items-center gap-1 text-primary hover:underline"
      onClick={() => window.open(`${MEZO_BC_EXPLORER}/tx/${txHash}`, "_blank")}
    >
      View
      <ExternalLink className="h-3 w-3" />
    </button>
  </div>
);

const ActivityValue = ({
  label,
  value,
  unit,
  decimals = 2,
}: {
  label: string;
  value: number;
  unit: string;
  decimals?: number;
}) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="font-semibold">
      {formatNumber(value, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}{" "}
      {unit}
    </p>
  </div>
);
