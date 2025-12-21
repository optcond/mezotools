import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldAlert, ArrowRightLeft, Sparkles } from "lucide-react";
import {
  MezoChain,
  PriceFeedFetcher,
  RedemptionHints,
  RedemptionMaker,
  RedemptionResult,
  RedemptionSimulation,
  TroveFetcher,
  TroveFetcherWrapper,
} from "@mtools/shared";
import {
  BaseError,
  createPublicClient,
  formatUnits,
  http,
  PublicClient,
} from "viem";
import type { WalletControls } from "@/hooks/useWallet";

const httpTransport = http(MezoChain.rpcUrls.default.http[0]);
const MIN_TCR = 1_100_000_000_000_000_000n;

const sanitizeIterations = (value: string, fallback = 50) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const clamped = Math.min(Math.max(Math.floor(parsed), 1), 250);
  return clamped;
};

const formatReadableError = (err: unknown, fallback: string) => {
  if (err instanceof BaseError) {
    if (
      err.shortMessage ===
      `Execution reverted with reason: rpc error: code = Unknown desc = TroveManager: Requested redemption amount must be <= user's mUSD token balance.`
    )
      return `Your MUSD balance is insufficient to simulate redemption. Requested redemption amount must be <= MUSD token balance.`;
    else return err.shortMessage || err.message || fallback;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return fallback;
};

const formatPercent = (value?: bigint | null) => {
  if (!value) {
    return null;
  }
  const ratio = Number.parseFloat(formatUnits(value, 18));
  if (!Number.isFinite(ratio)) {
    return null;
  }
  return ratio * 100;
};

const formatAmount = (value: bigint, decimals = 18, fractionDigits = 4) => {
  const asNumber = Number.parseFloat(formatUnits(value, decimals));
  if (!Number.isFinite(asNumber)) {
    return "—";
  }
  return asNumber.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: fractionDigits,
  });
};

const truncateAddress = (address: string) => {
  if (!address) {
    return "—";
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
};

interface RedemptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet: WalletControls;
}

export const RedemptionDialog = ({
  open,
  onOpenChange,
  wallet,
}: RedemptionDialogProps) => {
  const [amountInput, setAmountInput] = useState("1000");
  const [iterationInput, setIterationInput] = useState("50");
  const [status, setStatus] = useState("Bootstrapping redemption helpers…");
  const [fetcher, setFetcher] = useState<TroveFetcherWrapper | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [hints, setHints] = useState<RedemptionHints | null>(null);
  const [simulation, setSimulation] = useState<RedemptionSimulation | null>(
    null
  );
  const [txResult, setTxResult] = useState<RedemptionResult | null>(null);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [redemptionError, setRedemptionError] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [tcrValue, setTcrValue] = useState<bigint | null>(null);
  const [isRecoveryMode, setIsRecoveryMode] = useState<boolean | null>(null);

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: MezoChain,
        transport: httpTransport,
      }),
    []
  );

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      setIsBootstrapping(true);
      setBootstrapError(null);
      try {
        const troveFetcher = new TroveFetcher(publicClient as PublicClient);
        const priceFeedAddress = await troveFetcher.getPriceFeedAddress();
        if (cancelled) return;
        const priceFetcher = new PriceFeedFetcher(
          publicClient as PublicClient,
          priceFeedAddress
        );
        if (cancelled) return;
        setFetcher(new TroveFetcherWrapper(troveFetcher, priceFetcher));
        setStatus("Connect your wallet to begin.");
      } catch (err) {
        if (!cancelled) {
          setBootstrapError(
            formatReadableError(err, "Failed to initialize redemption helpers.")
          );
          setStatus("Unable to initialize redemption helpers.");
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [publicClient]);

  useEffect(() => {
    if (!wallet.account) {
      setHints(null);
      setSimulation(null);
      setTxResult(null);
      setStatus("Connect your wallet to begin.");
      return;
    }

    if (isBootstrapping) {
      setStatus("Bootstrapping redemption helpers…");
      return;
    }

    setStatus((prev) =>
      prev === "Connect your wallet to begin." ||
      prev === "Bootstrapping redemption helpers…"
        ? "Ready to simulate a redemption."
        : prev
    );
  }, [wallet.account, isBootstrapping]);

  useEffect(() => {
    if (!open) {
      setSimulationError(null);
      setRedemptionError(null);
    }
  }, [open]);

  const maker = useMemo(() => {
    if (!fetcher) {
      return null;
    }
    return new RedemptionMaker(
      publicClient as PublicClient,
      fetcher,
      wallet.walletClient ?? undefined
    );
  }, [fetcher, publicClient, wallet.walletClient]);

  const handleSimulate = async () => {
    if (!wallet.account) {
      setSimulationError("Connect a wallet to simulate redemptions.");
      return;
    }
    if (!maker) {
      setSimulationError(
        "Redemption helpers are still loading. Try again in a moment."
      );
      return;
    }
    const parsedAmount = Number.parseFloat(amountInput);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setSimulationError("Enter a positive MUSD amount to redeem.");
      return;
    }

    try {
      setIsSimulating(true);
      setSimulationError(null);
      setRedemptionError(null);
      setTxResult(null);
      setStatus("Checking system health…");
      const iterations = sanitizeIterations(iterationInput);
      const tcrData = await fetcher?.getTcr();
      if (tcrData) {
        setTcrValue(tcrData.tcr);
        setIsRecoveryMode(tcrData.recovery);
        if (tcrData.tcr < MIN_TCR) {
          setHints(null);
          setSimulation(null);
          setStatus("Redemptions disabled while TCR < 110%");
          setSimulationError(
            "The total collateral ratio must stay above 110%. Wait for the system to recover, then try again."
          );
          return;
        }
      }
      setStatus("Calculating redemption hints…");
      const nextHints = await maker.getRedemptionHintsForAmount(
        amountInput,
        iterations
      );
      setHints(nextHints);
      if (nextHints.truncatedAmount === 0n) {
        setSimulation(null);
        setStatus("No redeemable troves for this amount");
        setSimulationError(
          "HintHelper returned zero redeemable amount. Try a different amount or wait for troves to update."
        );
        return;
      }

      setStatus("Estimating execution and gas…");
      const sim = await maker.simulateRedemption(
        nextHints,
        wallet.account as `0x${string}`,
        BigInt(iterations)
      );
      setSimulation(sim);
      setStatus("Simulation ready");
    } catch (err) {
      setSimulation(null);
      setHints(null);
      setStatus("Simulation failed");
      setSimulationError(
        formatReadableError(err, "Failed to simulate redemption.")
      );
    } finally {
      setIsSimulating(false);
    }
  };

  const handleRedeem = async () => {
    if (!maker || !hints) {
      setRedemptionError("Run a successful simulation before redeeming.");
      return;
    }
    if (!wallet.walletClient) {
      setRedemptionError(
        "Connect a wallet that can sign transactions to execute the redemption."
      );
      return;
    }

    try {
      setIsRedeeming(true);
      setRedemptionError(null);
      setStatus("Submitting redemption transaction…");
      const iterations = sanitizeIterations(iterationInput);
      const result = await maker.executeRedemption(hints, {
        maxIterations: BigInt(iterations),
      });
      setTxResult(result);
      setStatus("Redemption submitted");
    } catch (err) {
      setStatus("Redemption failed");
      setRedemptionError(
        formatReadableError(err, "Redemption transaction failed.")
      );
    } finally {
      setIsRedeeming(false);
    }
  };

  const percentLabel = formatPercent(tcrValue);
  const isBusy = isSimulating || isRedeeming;
  const redeemDisabled =
    !wallet.account || !wallet.walletClient || !simulation || !hints || isBusy;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-4 overflow-hidden sm:w-full sm:max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Redeem MUSD
          </DialogTitle>
          <DialogDescription className="space-y-1 text-sm">
            Simulate and execute redemptions directly against the Mezo
            contracts. The simulation uses on-chain hints and checks the system
            health before attempting a transaction.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-5 overflow-y-auto pr-1">
          <Alert className="border border-primary/40 bg-primary/5">
            <Sparkles className="h-4 w-4" />
            <AlertTitle>Experimental tooling</AlertTitle>
            <AlertDescription>
              Heads up: this redemption utility currently runs in a public test
              mode. Redemptions might still fail even after a successful
              simulation while we finish validating the flow.
            </AlertDescription>
          </Alert>

          {bootstrapError && (
            <Alert variant="destructive">
              <AlertTitle>Initialization failed</AlertTitle>
              <AlertDescription>{bootstrapError}</AlertDescription>
            </Alert>
          )}

          <div className="rounded-2xl border border-card-border/50 bg-card/30 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Wallet status</p>
                <p className="text-xs text-muted-foreground">
                  {wallet.account
                    ? "Connected wallet will be used for simulations and transactions."
                    : "Connect a wallet to load personalized data and run redemptions."}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                {wallet.account && (
                  <Badge variant="outline" className="font-mono text-xs">
                    {truncateAddress(wallet.account)}
                  </Badge>
                )}
                <Button
                  variant={wallet.account ? "outline" : "default"}
                  onClick={() =>
                    wallet.account ? wallet.disconnect() : void wallet.connect()
                  }
                  disabled={wallet.isConnecting}
                >
                  {wallet.account
                    ? "Disconnect"
                    : wallet.isConnecting
                    ? "Connecting..."
                    : "Connect wallet"}
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="redeem-amount">Amount (MUSD)</Label>
              <Input
                id="redeem-amount"
                type="number"
                min="0"
                step="0.01"
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                disabled={isBusy}
                placeholder="Enter the MUSD amount to redeem"
              />
              <p className="text-xs text-muted-foreground">
                Enter the total MUSD value you want to redeem from the riskiest
                troves.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="redeem-iterations">Hint iterations</Label>
              <Input
                id="redeem-iterations"
                type="number"
                min="1"
                max="250"
                step="1"
                value={iterationInput}
                onChange={(event) => setIterationInput(event.target.value)}
                disabled={isBusy}
              />
              <p className="text-xs text-muted-foreground">
                Higher iterations scan more troves to find redeemable hints (max
                250). Default: 50.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => void handleSimulate()}
              disabled={
                isBusy ||
                !wallet.account ||
                !maker ||
                !!bootstrapError ||
                isBootstrapping
              }
            >
              {isSimulating && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Run simulation
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handleRedeem()}
              disabled={redeemDisabled || !!bootstrapError}
            >
              {isRedeeming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Redeem now
            </Button>
          </div>

          <div className="rounded-2xl border border-card-border/50 bg-card/20 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase text-muted-foreground">
                  Current status
                </p>
                <p className="text-lg font-semibold text-foreground">
                  {status}
                </p>
              </div>
              <div className="text-sm text-muted-foreground">
                <p className="text-xs uppercase text-muted-foreground">
                  System TCR
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-foreground">
                    {percentLabel
                      ? `${percentLabel.toFixed(2)}%`
                      : isBootstrapping
                      ? "—"
                      : "Fetching…"}
                  </span>
                  {isRecoveryMode && (
                    <Badge variant="destructive">Recovery mode</Badge>
                  )}
                </div>
                <p className="text-xs">
                  Redemptions pause automatically if the TCR drops below 110%.
                </p>
              </div>
            </div>
          </div>

          {simulationError && (
            <Alert variant="destructive">
              <AlertTitle>Simulation error</AlertTitle>
              <AlertDescription>{simulationError}</AlertDescription>
            </Alert>
          )}

          {redemptionError && (
            <Alert variant="destructive">
              <AlertTitle>Redemption error</AlertTitle>
              <AlertDescription>{redemptionError}</AlertDescription>
            </Alert>
          )}

          {simulation && hints && (
            <div className="rounded-2xl border border-card-border/50 bg-card/30 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">Simulation output</p>
                  <p className="text-xs text-muted-foreground">
                    These values come from the on-chain hint helper.
                  </p>
                </div>
                <Badge variant="secondary">Ready</Badge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Truncated amount
                  </p>
                  <p className="text-xl font-semibold text-foreground">
                    {formatAmount(simulation.truncatedAmount, 18, 4)} MUSD
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Gas estimate</p>
                  <p className="text-xl font-semibold text-foreground">
                    {Number(simulation.gasEstimate).toLocaleString()} gas units
                  </p>
                </div>
              </div>
            </div>
          )}

          {txResult && (
            <Alert>
              <AlertTitle>Redemption submitted</AlertTitle>
              <AlertDescription className="space-y-1 text-sm">
                <p>
                  Your redemption transaction was broadcast. Track it on the
                  Mezo explorer.
                </p>
                <a
                  href={`https://explorer.mezo.org/tx/${txResult.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-primary underline-offset-2 hover:underline"
                >
                  {txResult.txHash}
                </a>
              </AlertDescription>
            </Alert>
          )}

          {!wallet.account && (
            <div className="flex items-center gap-3 rounded-2xl border border-dashed border-card-border/50 bg-muted/5 p-4 text-sm text-muted-foreground">
              <ShieldAlert className="h-4 w-4 text-primary" />
              Connect a wallet first to unlock simulations and transactions.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
