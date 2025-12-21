import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import type { Trove } from "@/hooks/useMonitorData";

interface DebtCalculatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  btcPrice: number;
  troves: Trove[];
  walletAccount?: string | null;
}

const MIN_COLLATERAL_RATIO = 1.1; // Liquity minimum collateral ratio (110%)
const STORAGE_KEY = "mezo-debt-calculator";
type RedemptionStats = {
  trovesAhead: number;
  collateralAhead: number;
};
const DEFAULT_FORM = {
  collateral: "5",
  debt: "10000",
  repay: "0",
  borrow: "0",
  targetPrice: "",
};

const formatNumber = (
  value: number | null,
  options?: Intl.NumberFormatOptions
) => {
  if (value === null || Number.isNaN(value) || !Number.isFinite(value)) {
    return "—";
  }

  return value.toLocaleString(undefined, {
    maximumFractionDigits: 4,
    ...options,
  });
};

const parseInput = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const DebtCalculatorDialog = ({
  open,
  onOpenChange,
  btcPrice,
  troves,
  walletAccount,
}: DebtCalculatorDialogProps) => {
  const [collateralInput, setCollateralInput] = useState(
    DEFAULT_FORM.collateral
  );
  const [debtInput, setDebtInput] = useState(DEFAULT_FORM.debt);
  const [btcPriceInput, setBtcPriceInput] = useState(() =>
    btcPrice > 0 ? btcPrice.toString() : "0"
  );
  const [repayInput, setRepayInput] = useState(DEFAULT_FORM.repay);
  const [borrowInput, setBorrowInput] = useState(DEFAULT_FORM.borrow);
  const [targetPriceInput, setTargetPriceInput] = useState(
    DEFAULT_FORM.targetPrice
  );
  const [hasSavedState, setHasSavedState] = useState(false);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [hasAutofilled, setHasAutofilled] = useState(false);
  const normalizedWalletAccount = walletAccount?.toLowerCase() ?? null;
  const walletTroves = useMemo(
    () =>
      normalizedWalletAccount
        ? troves.filter(
            (trove) => trove.owner?.toLowerCase() === normalizedWalletAccount
          )
        : [],
    [normalizedWalletAccount, troves]
  );
  const primaryWalletTrove = useMemo(() => {
    if (walletTroves.length === 0) {
      return null;
    }
    return walletTroves.reduce((selected, trove) => {
      const selectedDebt = selected.principal_debt + selected.interest;
      const troveDebt = trove.principal_debt + trove.interest;
      return troveDebt > selectedDebt ? trove : selected;
    }, walletTroves[0]);
  }, [walletTroves]);
  const sortedTroves = useMemo(() => {
    if (!troves.length) {
      return [];
    }
    return [...troves].sort((a, b) => {
      const ratioDiff =
        (a.collaterization_ratio ?? 0) - (b.collaterization_ratio ?? 0);
      if (ratioDiff !== 0) {
        return ratioDiff;
      }
      const aUpdated = new Date(a.updated_at).getTime();
      const bUpdated = new Date(b.updated_at).getTime();
      if (aUpdated !== bUpdated) {
        return aUpdated - bUpdated;
      }
      return a.id.localeCompare(b.id);
    });
  }, [troves]);
  const getRedemptionStats = useCallback(
    (ratio: number | null): RedemptionStats | null => {
      if (
        ratio === null ||
        !Number.isFinite(ratio) ||
        ratio <= 0 ||
        sortedTroves.length === 0
      ) {
        return null;
      }
      let trovesAhead = 0;
      let collateralAhead = 0;
      for (const trove of sortedTroves) {
        if ((trove.collaterization_ratio ?? 0) < ratio) {
          trovesAhead += 1;
          collateralAhead += trove.collateral;
        } else {
          break;
        }
      }
      return {
        trovesAhead,
        collateralAhead,
      };
    },
    [sortedTroves]
  );
  const applyWalletTroveValues = useCallback(() => {
    if (!primaryWalletTrove) {
      return false;
    }
    const troveDebt =
      primaryWalletTrove.principal_debt + primaryWalletTrove.interest;

    setCollateralInput(primaryWalletTrove.collateral.toString());
    setDebtInput(troveDebt.toString());
    setRepayInput(DEFAULT_FORM.repay);
    setBorrowInput(DEFAULT_FORM.borrow);
    setTargetPriceInput(DEFAULT_FORM.targetPrice);
    setBtcPriceInput(btcPrice > 0 ? btcPrice.toString() : "0");

    return true;
  }, [primaryWalletTrove, btcPrice]);

  useEffect(() => {
    if (open) {
      setBtcPriceInput((prev) =>
        Number(prev) > 0 ? prev : btcPrice.toString()
      );
    }
  }, [btcPrice, open]);

  useEffect(() => {
    if (!open) {
      setHasAutofilled(false);
    }
  }, [open]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          collateralInput?: string;
          debtInput?: string;
          btcPriceInput?: string;
          repayInput?: string;
          borrowInput?: string;
          targetPriceInput?: string;
        };
        if (parsed.collateralInput) setCollateralInput(parsed.collateralInput);
        if (parsed.debtInput) setDebtInput(parsed.debtInput);
        if (parsed.btcPriceInput) setBtcPriceInput(parsed.btcPriceInput);
        if (parsed.repayInput) setRepayInput(parsed.repayInput);
        if (parsed.borrowInput) setBorrowInput(parsed.borrowInput);
        if (parsed.targetPriceInput)
          setTargetPriceInput(parsed.targetPriceInput);
        setHasSavedState(true);
      } else {
        setHasSavedState(false);
      }
    } catch (err) {
      console.error("Failed to load debt calculator state", err);
      setHasSavedState(false);
    } finally {
      setStorageLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!open || !storageLoaded || hasAutofilled || hasSavedState) {
      return;
    }

    if (applyWalletTroveValues()) {
      setHasAutofilled(true);
    }
  }, [
    open,
    storageLoaded,
    hasAutofilled,
    hasSavedState,
    applyWalletTroveValues,
  ]);

  const handleSave = () => {
    if (typeof window === "undefined") {
      return;
    }
    const payload = {
      collateralInput,
      debtInput,
      btcPriceInput,
      repayInput,
      borrowInput,
      targetPriceInput,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setHasSavedState(true);
  };

  const handleReset = () => {
    const appliedWalletData = applyWalletTroveValues();

    if (!appliedWalletData) {
      setCollateralInput("1");
      setDebtInput("10000");
      setRepayInput(DEFAULT_FORM.repay);
      setBorrowInput(DEFAULT_FORM.borrow);
      setTargetPriceInput(DEFAULT_FORM.targetPrice);
      setBtcPriceInput(btcPrice > 0 ? btcPrice.toString() : "0");
    }

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setHasSavedState(false);
    setHasAutofilled(appliedWalletData);
  };

  const handleRefreshPrice = () => {
    setBtcPriceInput(btcPrice > 0 ? btcPrice.toString() : "0");
  };

  const collateral = useMemo(
    () => Math.max(parseInput(collateralInput), 0),
    [collateralInput]
  );
  const debt = useMemo(() => Math.max(parseInput(debtInput), 0), [debtInput]);
  const price = useMemo(
    () => Math.max(parseInput(btcPriceInput), 0),
    [btcPriceInput]
  );
  const repay = useMemo(
    () => Math.max(parseInput(repayInput), 0),
    [repayInput]
  );
  const borrow = useMemo(
    () => Math.max(parseInput(borrowInput), 0),
    [borrowInput]
  );
  const targetPrice = useMemo(() => {
    const parsed = parseInput(targetPriceInput);
    return parsed > 0 ? parsed : null;
  }, [targetPriceInput]);

  const liquidationPrice =
    collateral > 0 ? (debt * MIN_COLLATERAL_RATIO) / collateral : null;
  const collateralRatio = debt > 0 ? (collateral * price) / debt : null;
  const priceBuffer =
    liquidationPrice !== null && price > 0
      ? ((price - liquidationPrice) / price) * 100
      : null;

  const debtAfterAdjustment = Math.max(debt - repay + borrow, 0);
  const liquidationPriceAfterAdjustment =
    collateral > 0
      ? (debtAfterAdjustment * MIN_COLLATERAL_RATIO) / collateral
      : null;
  const collateralRatioAfterAdjustment =
    debtAfterAdjustment > 0
      ? (collateral * price) / debtAfterAdjustment
      : price > 0
      ? Infinity
      : null;

  const targetDebt =
    targetPrice !== null && collateral > 0
      ? (targetPrice * collateral) / MIN_COLLATERAL_RATIO
      : null;
  const repayForTarget =
    targetDebt !== null ? Math.max(debt - Math.max(targetDebt, 0), 0) : null;
  const targetRatio =
    targetDebt !== null && targetDebt > 0
      ? (collateral * price) / targetDebt
      : null;
  const redemptionPositionCurrent = useMemo(
    () => getRedemptionStats(collateralRatio),
    [collateralRatio, getRedemptionStats]
  );
  const redemptionPositionAfterAdjustment = useMemo(
    () =>
      getRedemptionStats(
        collateralRatioAfterAdjustment === Infinity
          ? null
          : collateralRatioAfterAdjustment
      ),
    [collateralRatioAfterAdjustment, getRedemptionStats]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto sm:h-auto sm:w-full sm:max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Debt calculator</DialogTitle>
          <DialogDescription className="space-y-1 text-sm">
            <p>
              Evaluate how changes to your position impact liquidation risk.
              Calculations use the Liquity minimum collateral ratio of 110%.
            </p>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="collateral">Collateral (BTC)</Label>
              <Input
                id="collateral"
                type="number"
                min="0"
                step="0.0001"
                value={collateralInput}
                onChange={(event) => setCollateralInput(event.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="debt">Debt (MUSD)</Label>
              <Input
                id="debt"
                type="number"
                min="0"
                step="1"
                value={debtInput}
                onChange={(event) => setDebtInput(event.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="btcPrice">BTC price (USD)</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshPrice}
                >
                  Refresh
                </Button>
              </div>
              <Input
                id="btcPrice"
                type="number"
                min="0"
                step="1"
                value={btcPriceInput}
                onChange={(event) => setBtcPriceInput(event.target.value)}
              />
            </div>

            <Separator />

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="repay">Repay amount (MUSD)</Label>
                <span className="text-xs text-muted-foreground">
                  Preview new ratio after repayment
                </span>
              </div>
              <Input
                id="repay"
                type="number"
                min="0"
                step="1"
                value={repayInput}
                onChange={(event) => setRepayInput(event.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="borrow">Borrow amount (MUSD)</Label>
                <span className="text-xs text-muted-foreground">
                  Preview new ratio after borrowing
                </span>
              </div>
              <Input
                id="borrow"
                type="number"
                min="0"
                step="1"
                value={borrowInput}
                onChange={(event) => setBorrowInput(event.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="targetPrice">
                  Target liquidation price (USD)
                </Label>
                <span className="text-xs text-muted-foreground">
                  How much debt to repay to reach this threshold
                </span>
              </div>
              <Input
                id="targetPrice"
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 15000"
                value={targetPriceInput}
                onChange={(event) => setTargetPriceInput(event.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleReset}>
                Reset
              </Button>
              <Button onClick={handleSave}>Save</Button>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-card-border/60 bg-muted/20 p-4 text-sm">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Current position
              </p>
              <div className="space-y-3 rounded-lg border border-card-border/60 bg-background/80 p-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Collateral ratio
                  </span>
                </div>
                <p className="text-2xl font-semibold text-primary">
                  {collateralRatio === null
                    ? "—"
                    : `${formatNumber(collateralRatio, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}×`}
                </p>
                <p className="text-sm text-muted-foreground">
                  Liquidation price:{" "}
                  <span className="font-semibold text-foreground">
                    $
                    {formatNumber(liquidationPrice, {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Buffer vs. market:{" "}
                  <span className="font-semibold text-foreground">
                    {priceBuffer === null
                      ? "—"
                      : `${formatNumber(priceBuffer, {
                          maximumFractionDigits: 2,
                        })}%`}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Troves ahead:{" "}
                  <span className="font-semibold text-foreground">
                    {redemptionPositionCurrent
                      ? redemptionPositionCurrent.trovesAhead.toLocaleString()
                      : "—"}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Collateral ahead:{" "}
                  <span className="font-semibold text-foreground">
                    {redemptionPositionCurrent
                      ? `${formatNumber(
                          redemptionPositionCurrent.collateralAhead,
                          {
                            minimumFractionDigits: 4,
                          }
                        )} BTC`
                      : "—"}
                  </span>
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                After payment
              </p>
              <div className="space-y-3 rounded-lg border border-card-border/60 bg-background/80 p-3">
                <p className="text-2xl font-semibold text-emerald-500">
                  {collateralRatioAfterAdjustment === null
                    ? "—"
                    : collateralRatioAfterAdjustment === Infinity
                    ? "∞"
                    : `${formatNumber(collateralRatioAfterAdjustment, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}×`}
                </p>
                <p className="text-sm text-muted-foreground">
                  New liquidation:{" "}
                  <span className="font-semibold text-foreground">
                    $
                    {formatNumber(liquidationPriceAfterAdjustment, {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Remaining debt:{" "}
                  <span className="font-semibold text-foreground">
                    {formatNumber(debtAfterAdjustment, {
                      minimumFractionDigits: 2,
                    })}{" "}
                    MUSD
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Troves ahead:{" "}
                  <span className="font-semibold text-foreground">
                    {redemptionPositionAfterAdjustment
                      ? redemptionPositionAfterAdjustment.trovesAhead.toLocaleString()
                      : "—"}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Collateral ahead:{" "}
                  <span className="font-semibold text-foreground">
                    {redemptionPositionAfterAdjustment
                      ? `${formatNumber(
                          redemptionPositionAfterAdjustment.collateralAhead,
                          {
                            minimumFractionDigits: 4,
                          }
                        )} BTC`
                      : "—"}
                  </span>
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Target price helper
              </p>
              <div className="space-y-3 rounded-lg border border-card-border/60 bg-background/80 p-3">
                <p className="font-semibold text-foreground">
                  Repay needed:{" "}
                  {repayForTarget === null
                    ? "—"
                    : `${formatNumber(repayForTarget, {
                        minimumFractionDigits: 2,
                      })} MUSD`}
                </p>
                <p className="text-sm text-muted-foreground">
                  Debt after target:{" "}
                  <span className="font-semibold text-foreground">
                    {targetDebt === null
                      ? "—"
                      : `${formatNumber(Math.max(targetDebt, 0), {
                          minimumFractionDigits: 2,
                        })} MUSD`}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Resulting ratio:{" "}
                  <span className="font-semibold text-foreground">
                    {targetRatio === null
                      ? "—"
                      : `${formatNumber(targetRatio, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}×`}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
