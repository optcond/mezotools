import { useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  MezoChain,
  PriceFeedFetcher,
  TroveFetcher,
  TroveFetcherWrapper,
} from "@mtools/shared";
import {
  BaseError,
  createPublicClient,
  formatUnits,
  http,
} from "viem";
import {
  RedemptionHints,
  RedemptionMaker,
  RedemptionResult,
  RedemptionSimulation,
} from "@mtools/shared";
import { useAccount, useWalletClient } from "wagmi";

const httpTransport = http(MezoChain.rpcUrls.default.http[0]);
const MIN_TCR = 1_100_000_000_000_000_000n; // 110%

const sanitizeIterations = (value: string, fallback = 50) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const clamped = Math.min(Math.max(Math.floor(parsed), 1), 250);
  return clamped;
};

const formatError = (err: unknown, fallback: string) => {
  if (err instanceof BaseError) {
    return err.shortMessage || err.message || fallback;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return fallback;
};

const App = () => {
  const [amount, setAmount] = useState("1000");
  const [fetcher, setFetcher] = useState<TroveFetcherWrapper | null>(null);
  const [hints, setHints] = useState<RedemptionHints | null>(null);
  const [simulation, setSimulation] = useState<RedemptionSimulation | null>(
    null
  );
  const [iterationInput, setIterationInput] = useState("50");
  const [txResult, setTxResult] = useState<RedemptionResult | null>(null);
  const [status, setStatus] = useState("Idle");
  const [error, setError] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [tcr, setTcr] = useState<bigint | null>(null);
  const [recoveryMode, setRecoveryMode] = useState<boolean | null>(null);
  const { address, connector } = useAccount();
  const { data: walletClient } = useWalletClient();

  const markParamsDirty = (
    nextStatus = "Parameters changed — re-run simulation."
  ) => {
    setHints(null);
    setSimulation(null);
    setTxResult(null);
    setStatus(nextStatus);
    setError(null);
  };

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
      setInitializing(true);
      try {
        const troveFetcher = new TroveFetcher(publicClient);
        const priceFeedAddress = await troveFetcher.getPriceFeedAddress();
        if (cancelled) return;
        const priceFeedFetcher = new PriceFeedFetcher(
          publicClient,
          priceFeedAddress
        );
        setFetcher(new TroveFetcherWrapper(troveFetcher, priceFeedFetcher));
        setStatus("Ready to connect wallet");
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to bootstrap redeemer"
          );
        }
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [publicClient]);

  useEffect(() => {
    setStatus((current) => {
      if (
        address &&
        (current === "Ready to connect wallet" ||
          current === "Wallet disconnected")
      ) {
        return "Wallet connected";
      }
      if (!address && current === "Wallet connected") {
        return "Ready to connect wallet";
      }
      return current;
    });
  }, [address]);


  const maker = useMemo(() => {
    if (!fetcher) {
      return null;
    }
    return new RedemptionMaker(
      publicClient,
      fetcher,
      walletClient ?? undefined
    );
  }, [publicClient, fetcher, walletClient]);

  const handleSimulate = async () => {
    if (!maker || !address) {
      setError("Connect your wallet first.");
      return;
    }
    try {
      setError(null);
      setIsSimulating(true);
      setStatus("Checking system health…");
      const iterations = sanitizeIterations(iterationInput);

      const tcrData = await fetcher?.getTcr();
      if (tcrData) {
        setTcr(tcrData.tcr);
        setRecoveryMode(tcrData.recovery);
        if (tcrData.tcr < MIN_TCR) {
          setStatus("TCR below 110% — redemptions disabled");
          setError("Cannot redeem when TCR < 110%. Try again later.");
          return;
        }
      }

      setStatus("Calculating redemption hints…");
      const nextHints = await maker.getRedemptionHintsForAmount(
        amount,
        iterations
      );
      setHints(nextHints);
      if (nextHints.truncatedAmount === 0n) {
        setSimulation(null);
        setTxResult(null);
        setStatus("No redeemable troves for this amount");
        setError(
          "HintHelper returned zero redeemable amount. Try a different amount or wait for troves to update."
        );
        return;
      }
      const sim = await maker.simulateRedemption(
        nextHints,
        address,
        BigInt(iterations)
      );
      setSimulation(sim);
      setTxResult(null);
      setStatus("Simulation ready");
    } catch (err) {
      setError(formatError(err, "Failed to simulate redemption."));
    } finally {
      setIsSimulating(false);
    }
  };

  const handleRedeem = async () => {
    if (!maker || !hints) {
      setError("Run a simulation before redeeming.");
      return;
    }
    if (hints.truncatedAmount === 0n) {
      setError(
        "HintHelper returned zero redeemable amount. Adjust the redemption amount and try again."
      );
      return;
    }
    try {
      setError(null);
      setIsRedeeming(true);
      setStatus("Refreshing hints before redemption…");
      const iterations = sanitizeIterations(iterationInput);

      const tcrData = await fetcher?.getTcr();
      if (tcrData) {
        setTcr(tcrData.tcr);
        setRecoveryMode(tcrData.recovery);
        if (tcrData.tcr < MIN_TCR) {
          setStatus("TCR below 110% — redemptions disabled");
          setError("Cannot redeem when TCR < 110%. Try again later.");
          setIsRedeeming(false);
          return;
        }
      }

      // Refresh hints right before submit to minimize chance of stale price/state.
      const freshHints = await maker.getRedemptionHintsForAmount(
        amount,
        iterations
      );
      setHints(freshHints);
      if (freshHints.truncatedAmount === 0n) {
        setError(
          "HintHelper returned zero redeemable amount at submission time. Adjust the amount or try again."
        );
        setStatus("No redeemable troves for this amount");
        setIsRedeeming(false);
        return;
      }

      setStatus("Sending redemption transaction…");
      const result = await maker.executeRedemption(freshHints, {
        maxIterations: BigInt(iterations),
      });
      setTxResult(result);
      setSimulation({
        truncatedAmount: result.truncatedAmount,
        gasEstimate: result.gasEstimate,
      });
      setStatus("Redemption transaction submitted");
    } catch (err) {
      setError(formatError(err, "Failed to send redemption."));
    } finally {
      setIsRedeeming(false);
    }
  };

  const redemptionDisabled =
    !maker || initializing || !walletClient;
  const redeemButtonDisabled =
    redemptionDisabled ||
    !hints ||
    hints.truncatedAmount === 0n ||
    isSimulating ||
    isRedeeming;

  return (
    <div className="app">
      <header>
        <h1>Mezo Redeemer</h1>
        <p>Simulate and execute mUSD redemptions directly from your browser.</p>
      </header>

      <section className="panel">
        <h2>Wallet</h2>
        <div className="status">
          <span>
            Status: <strong>{status}</strong>
          </span>
          <span>
            System TCR: {tcr ? `${formatUnits(tcr, 18)}x` : "Not checked yet"}
            {recoveryMode !== null
              ? recoveryMode
                ? " (Recovery mode)"
                : " (Normal mode)"
              : ""}
          </span>
          <span>
            Connected account: {address ?? "Not connected"}
          </span>
          <span>
            Active connector: {connector?.name ?? "None detected"}
          </span>
        </div>
        <div className="actions">
          <ConnectButton label={address ? "Manage Wallet" : "Connect Wallet"} />
        </div>
        <p className="helper-text">
          Wallet connections run through RainbowKit. Use the button above to
          pick your preferred wallet and network.
        </p>
      </section>

      <section className="panel">
        <h2>Redemption</h2>
        <label htmlFor="amount">Amount (mUSD)</label>
        <input
          id="amount"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            markParamsDirty();
          }}
          disabled={redemptionDisabled}
        />
        <label htmlFor="iterations">Max iterations</label>
        <input
          id="iterations"
          type="number"
          min="1"
          max="250"
          step="1"
          value={iterationInput}
          onChange={(event) => {
            setIterationInput(event.target.value);
            markParamsDirty();
          }}
          disabled={redemptionDisabled}
        />
        <p className="helper-text">
          Enter the total amount of mUSD you would like to redeem. We will pull
          hints from the on-chain HintHelper contract and estimate the gas cost.
        </p>
        <div className="actions">
          <button
            onClick={handleSimulate}
            disabled={redemptionDisabled || isSimulating}
          >
            {isSimulating ? "Simulating…" : "Simulate Redemption"}
          </button>
          <button
            className="secondary"
            onClick={handleRedeem}
            disabled={redeemButtonDisabled}
          >
            {isRedeeming ? "Sending…" : "Redeem"}
          </button>
        </div>

        {error && <div className="alert">{error}</div>}
        {txResult && (
          <div className="alert success">
            Redemption sent. Tx hash: {txResult.txHash}
          </div>
        )}

        {simulation && (
          <div className="results">
            <div className="result-card">
              <span>Truncated Amount</span>
              <strong>
                {formatUnits(simulation.truncatedAmount, 18)} mUSD
              </strong>
            </div>
            <div className="result-card">
              <span>Estimated Gas</span>
              <strong>{simulation.gasEstimate.toString()} units</strong>
            </div>
          </div>
        )}

        {hints && (
          <>
            <h3>Hints</h3>
            <div className="hint-grid">
              <div>
                <strong>First Redemption Hint</strong>
                <div>{hints.firstRedemptionHint}</div>
              </div>
              <div>
                <strong>Upper Hint</strong>
                <div>{hints.upperHint}</div>
              </div>
              <div>
                <strong>Lower Hint</strong>
                <div>{hints.lowerHint}</div>
              </div>
              <div>
                <strong>Partial Redemption NICR</strong>
                <div>{hints.partialRedemptionHintNICR.toString()}</div>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default App;
