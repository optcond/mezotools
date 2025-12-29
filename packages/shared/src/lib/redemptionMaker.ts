import { getMezoContracts, MezoProtocolContracts, MezoTokens } from "../types";
import { TroveFetcherWrapper } from "./troveFetcherWrapper";
import { HintHelpersAbi } from "../abi/HinteHelpers";
import { SortedTrovesAbi } from "../abi/SortedTroves";
import { TroveManagerAbi } from "../abi/TroveManager";
import {
  encodeFunctionData,
  erc20Abi,
  parseUnits,
  PublicClient,
  WalletClient,
} from "viem";

export type RedemptionHints = {
  firstRedemptionHint: `0x${string}`;
  upperHint: `0x${string}`;
  lowerHint: `0x${string}`;
  partialRedemptionHintNICR: bigint;
  truncatedAmount: bigint;
};

export type RedemptionSimulation = {
  truncatedAmount: bigint;
  gasEstimate: bigint;
};

export type RedemptionResult = RedemptionSimulation & {
  txHash: `0x${string}`;
};

export class RedemptionMaker {
  private readonly musdAddress = MezoTokens.MUSD.address as `0x${string}`;
  private readonly contracts: MezoProtocolContracts;

  constructor(
    private client: PublicClient,
    private fetcher: TroveFetcherWrapper,
    private walletClient?: WalletClient
  ) {
    this.contracts = getMezoContracts(this.client.chain?.id);
  }

  setWalletClient(walletClient?: WalletClient) {
    this.walletClient = walletClient;
  }

  async getRedemptionHintsForAmount(
    _musdAmount: string,
    _maxIterations: number = 100
  ): Promise<RedemptionHints> {
    const musdAmount = parseUnits(_musdAmount, 18);
    const maxIterations = BigInt(_maxIterations);
    const price = await this.fetcher.getBtcPrice();

    const [firstRedemptionHint, partialRedemptionHintNICR, truncatedAmount] =
      await this.client.readContract({
        abi: HintHelpersAbi,
        address: this.contracts.hintHelpers,
        functionName: `getRedemptionHints`,
        args: [musdAmount, price, maxIterations],
      });

    if (partialRedemptionHintNICR === 0n) {
      return {
        firstRedemptionHint,
        upperHint: "0x0000000000000000000000000000000000000000",
        lowerHint: "0x0000000000000000000000000000000000000000",
        partialRedemptionHintNICR,
        truncatedAmount,
      };
    }

    const numTrials = 32n;
    const randomSeed = BigInt(Date.now());

    const [approxHint] = await this.client.readContract({
      abi: HintHelpersAbi,
      address: this.contracts.hintHelpers,
      functionName: `getApproxHint`,
      args: [partialRedemptionHintNICR, numTrials, randomSeed],
    });

    const [upperHint, lowerHint] = await this.client.readContract({
      abi: SortedTrovesAbi,
      address: this.contracts.sortedTroves,
      functionName: "findInsertPosition",
      args: [partialRedemptionHintNICR, approxHint, approxHint],
    });

    return {
      firstRedemptionHint,
      upperHint,
      lowerHint,
      partialRedemptionHintNICR,
      truncatedAmount,
    };
  }

  async simulateRedemption(
    hints: RedemptionHints,
    account?: `0x${string}`,
    maxIterations: bigint = 100n
  ): Promise<RedemptionSimulation> {
    const sender = account ?? this.walletClient?.account?.address;

    if (!sender) {
      throw new Error(
        "No account available to simulate redemption. Connect a wallet first."
      );
    }

    const gasEstimate = await this.client.estimateGas({
      account: sender,
      to: this.contracts.troveManager,
      data: encodeFunctionData({
        abi: TroveManagerAbi,
        functionName: "redeemCollateral",
        args: [
          hints.truncatedAmount,
          hints.firstRedemptionHint,
          hints.upperHint,
          hints.lowerHint,
          hints.partialRedemptionHintNICR,
          maxIterations,
        ],
      }),
    });

    return {
      truncatedAmount: hints.truncatedAmount,
      gasEstimate,
    };
  }

  async executeRedemption(
    hints: RedemptionHints,
    options?: {
      maxIterations?: bigint;
    }
  ): Promise<RedemptionResult> {
    if (hints.truncatedAmount === 0n) {
      throw new Error("HintHelper returned zero redeemable amount.");
    }

    if (!this.walletClient) {
      throw new Error("Wallet client is not initialized.");
    }

    if (!this.walletClient.account) {
      throw new Error("Connected wallet does not expose an account address.");
    }

    const musdBalance = await this.client.readContract({
      address: this.musdAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [this.walletClient.account.address],
    });

    if (musdBalance < hints.truncatedAmount) {
      throw new Error(
        "Insufficient mUSD balance to redeem the requested amount."
      );
    }

    await this.ensureMusdAllowance(hints.truncatedAmount);

    const maxIterations = options?.maxIterations ?? 100n;

    const simulation = await this.simulateRedemption(
      hints,
      this.walletClient.account?.address,
      maxIterations
    );

    const txHash = await this.walletClient.writeContract({
      account: this.walletClient.account,
      address: this.contracts.troveManager,
      abi: TroveManagerAbi,
      functionName: "redeemCollateral",
      chain: this.walletClient.chain,
      args: [
        simulation.truncatedAmount,
        hints.firstRedemptionHint,
        hints.upperHint,
        hints.lowerHint,
        hints.partialRedemptionHintNICR,
        maxIterations,
      ],
    });

    return {
      txHash,
      ...simulation,
    };
  }

  private async ensureMusdAllowance(requiredAmount: bigint) {
    if (!this.walletClient?.account) {
      throw new Error("Wallet client is not initialized.");
    }
    const owner = this.walletClient.account.address;
    const allowance = await this.client.readContract({
      address: this.musdAddress,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, this.contracts.troveManager],
    });

    if (allowance >= requiredAmount) {
      return;
    }

    await this.walletClient.writeContract({
      account: this.walletClient.account,
      address: this.musdAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [this.contracts.troveManager, requiredAmount],
      chain: this.walletClient.chain,
    });
  }
}
