import { useMemo } from "react";
import { useBalance, useChainId } from "wagmi";
import { Activity, ShieldAlert, Wallet, ExternalLink } from "lucide-react";

import { WalletConnectButton } from "@/components/WalletConnectButton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getMezoContracts, MezoChain, MezoTokens } from "@mtools/shared";
import type { Trove, Liquidation, Redemption } from "@/hooks/useMonitorData";
import type { WalletControls } from "@/hooks/useWallet";
import { formatNumber } from "@/lib/formatNumber";

interface PersonalWalletStatsProps {
  troves: Trove[];
  liquidations: Liquidation[];
  redemptions: Redemption[];
  isLoading: boolean;
  wallet: WalletControls;
  onDebtCalculatorClick?: () => void;
}

const getTroveKey = (trove: Trove) =>
  trove.id ||
  `${trove.owner.toLowerCase()}-${trove.collateral.toString()}-${trove.interest.toLocaleString()}`;

const truncateAddress = (address: string) => {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });

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
  onDebtCalculatorClick,
}: PersonalWalletStatsProps) => {
  const { account } = wallet;
  const normalizedAccount = account?.toLowerCase() ?? null;
  const chainId = useChainId();
  const activeChainId = chainId ?? MezoChain.id;
  const contracts = useMemo(
    () => getMezoContracts(activeChainId),
    [activeChainId]
  );
  const musdTokenAddress =
    contracts.tokens?.MUSD.address ?? MezoTokens.MUSD.address;
  const {
    data: btcBalance,
    isFetching: isBtcBalanceFetching,
  } = useBalance({
    address: account ? (account as `0x${string}`) : undefined,
    chainId: activeChainId,
    query: {
      enabled: Boolean(account),
      refetchInterval: account ? 30_000 : false,
    },
  });
  const {
    data: musdBalance,
    isFetching: isMusdBalanceFetching,
  } = useBalance({
    address: account ? (account as `0x${string}`) : undefined,
    chainId: activeChainId,
    token: musdTokenAddress as `0x${string}`,
    query: {
      enabled: Boolean(account),
      refetchInterval: account ? 30_000 : false,
    },
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
      (trove) => trove.owner.toLowerCase() === normalizedAccount
    );
  }, [troves, normalizedAccount]);

  const userLiquidations = useMemo(() => {
    if (!normalizedAccount) return [];
    return liquidations.filter(
      (liq) => liq.borrower.toLowerCase() === normalizedAccount
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
            borrower.toLowerCase() === normalizedAccount
        )
    );
  }, [redemptions, normalizedAccount]);

  const totalCollateral = useMemo(
    () => userTroves.reduce((sum, trove) => sum + trove.collateral, 0),
    [userTroves]
  );

  const totalDebt = useMemo(
    () =>
      userTroves.reduce(
        (sum, trove) => sum + trove.principal_debt + trove.interest,
        0
      ),
    [userTroves]
  );

  const isDisplayingData = Boolean(account);
  const btcBalanceLabel = account
    ? isBtcBalanceFetching
      ? "Fetching…"
      : btcBalance
      ? `${Number(btcBalance.formatted).toLocaleString(undefined, {
          maximumFractionDigits: 4,
        })} ${btcBalance.symbol ?? "BTC"}`
      : "0 BTC"
    : "Connect wallet";
  const musdBalanceLabel = account
    ? isMusdBalanceFetching
      ? "Fetching…"
      : musdBalance
      ? `${Number(musdBalance.formatted).toLocaleString(undefined, {
          maximumFractionDigits: 2,
        })} ${musdBalance.symbol ?? "MUSD"}`
      : "0 MUSD"
    : "Connect wallet";

  const renderConnectMessage = () => (
    <div className="flex flex-col gap-3 rounded-2xl border border-card-border/40 bg-card/20 p-6 text-sm text-muted-foreground sm:flex-row sm:items-center">
      <ShieldAlert className="h-5 w-5 text-primary" />
      <div>
        Connect with MetaMask, Rabby, or any EIP-1193 compatible wallet to view
        personalized trove, redemption, and liquidation data.
      </div>
    </div>
  );

  const renderSkeleton = () => (
    <div className="grid gap-4 lg:grid-cols-2">
      <Skeleton className="h-32 rounded-2xl lg:col-span-2" />
      <Skeleton className="h-32 rounded-2xl" />
      <Skeleton className="h-32 rounded-2xl" />
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
              {truncateAddress(account)}
            </Badge>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {account && onDebtCalculatorClick && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onDebtCalculatorClick}
                className="border border-primary bg-transparent text-primary hover:bg-primary/10 hover:text-primary sm:order-1"
              >
                Debt calculator
              </Button>
            )}
            <WalletConnectButton />
          </div>
        </div>
      </div>

      {account && (
        <div className="rounded-2xl border border-card-border/40 bg-card/20 p-4">
          <p className="text-xs uppercase text-muted-foreground">
            Available balances
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">BTC</p>
              <p className="text-lg font-semibold text-foreground">
                {btcBalanceLabel}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">MUSD</p>
              <p className="text-lg font-semibold text-foreground">
                {musdBalanceLabel}
              </p>
            </div>
          </div>
        </div>
      )}

      {!isDisplayingData && renderConnectMessage()}

      {isDisplayingData && (
        <>
          {isLoading ? (
            renderSkeleton()
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-card-border/40 bg-card/30 p-5 lg:col-span-2">
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
                  <div className="grid w-full grid-cols-2 gap-3 text-sm sm:w-auto sm:grid-cols-2">
                    <div className="rounded-xl border border-card-border/40 bg-background/60 p-3">
                      <p className="text-xs text-muted-foreground">
                        Collateral
                      </p>
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
                            <Badge
                              variant="secondary"
                              className="text-xs font-bold"
                            >
                              {formatNumber(trove.collaterization_ratio * 100, {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1,
                              })}
                              % CR
                            </Badge>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                            <div>
                              <p className="text-xs text-muted-foreground">
                                Collateral
                              </p>
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
                                Owner
                              </p>
                              <p className="font-mono text-xs">
                                {truncateAddress(trove.owner)}
                              </p>
                            </div>
                          </div>
                          <div className="mt-4 rounded-xl border border-card-border/60 bg-card/20 p-4">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">
                              Redemption position
                            </p>
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
                                <p className="text-xs text-muted-foreground">
                                  BTC ahead
                                </p>
                                <p className="text-xl font-semibold">
                                  {formatNumber(
                                    riskStats?.collateralAhead ?? 0,
                                    {
                                      minimumFractionDigits: 4,
                                      maximumFractionDigits: 4,
                                    }
                                  )}{" "}
                                  BTC
                                </p>
                              </div>
                              <p className="text-xs text-muted-foreground sm:max-w-xs">
                                Troves are redeemed in order of collateral
                                ratio. Fewer troves and BTC ahead indicate
                                higher redemption risk.
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-card-border/40 bg-card/30 p-5">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="font-semibold">Recent redemptions</span>
                  <Badge variant="secondary">
                    {formatNumber(userRedemptions.length)}
                  </Badge>
                </div>
                {userRedemptions.length === 0 ? (
                  <EmptyState message="No redemptions affecting this wallet." />
                ) : (
                  <div className="space-y-3">
                    {userRedemptions.slice(0, 5).map((redemption) => (
                      <div
                        key={redemption.id}
                        className="rounded-xl border border-card-border/40 bg-background/50 p-3 text-sm"
                      >
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {formatDateTime(redemption.block_timestamp)}
                          </span>
                          <button
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                            onClick={() =>
                              window.open(
                                `https://explorer.mezo.org/tx/${redemption.tx_hash}`,
                                "_blank"
                              )
                            }
                          >
                            View
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Attempted
                        </p>
                        <p className="font-semibold">
                          {formatNumber(redemption.attempted_amount, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          MUSD
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Actual
                        </p>
                        <p className="font-semibold">
                          {formatNumber(redemption.actual_amount, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          MUSD
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Collateral sent
                        </p>
                        <p className="font-semibold">
                          {formatNumber(redemption.collateral_sent, {
                            minimumFractionDigits: 4,
                            maximumFractionDigits: 4,
                          })}{" "}
                          BTC
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Fee</p>
                        <p className="font-semibold">
                          {formatNumber(redemption.collateral_fee, {
                            minimumFractionDigits: 4,
                            maximumFractionDigits: 4,
                          })}{" "}
                          BTC
                        </p>
                      </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-card-border/40 bg-card/30 p-5">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="font-semibold">Recent liquidations</span>
                  <Badge variant="secondary">
                    {formatNumber(userLiquidations.length)}
                  </Badge>
                </div>
                {userLiquidations.length === 0 ? (
                  <EmptyState message="No liquidations for this wallet." />
                ) : (
                  <div className="space-y-3">
                    {userLiquidations.slice(0, 5).map((liquidation) => (
                      <div
                        key={liquidation.id}
                        className="rounded-xl border border-card-border/40 bg-background/50 p-3 text-sm"
                      >
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {formatDateTime(liquidation.block_timestamp)}
                          </span>
                          <button
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                            onClick={() =>
                              window.open(
                                `https://explorer.mezo.org/tx/${liquidation.tx_hash}`,
                                "_blank"
                              )
                            }
                          >
                            View
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Debt repaid
                            </p>
                            <p className="font-semibold">
                              {formatNumber(liquidation.debt, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{" "}
                              MUSD
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Collateral
                            </p>
                            <p className="font-semibold">
                              {formatNumber(liquidation.collateral, {
                                minimumFractionDigits: 4,
                                maximumFractionDigits: 4,
                              })}{" "}
                              BTC
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
};
