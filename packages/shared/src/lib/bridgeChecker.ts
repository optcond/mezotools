import { PublicClient, decodeFunctionData, toFunctionSelector } from "viem";
import { AssetsBridgeCallerAbi } from "../abi/AssetsBridgeCaller";
import { getMezoContracts } from "../types";
import { BlockFetcher } from "./blockFetcher";

type BridgeFunctionName = "bridge" | "bridgeOut";

export type BridgeCallResult = {
  functionName: BridgeFunctionName;
  args: unknown;
  transactionHash: `0x${string}`;
  blockNumber: bigint;
  transactionIndex: number;
  from: `0x${string}`;
  to: `0x${string}` | null;
  blockTimestamp: number;
};

export type BridgeTransfer = {
  direction: "in" | "out";
  sender: `0x${string}`;
  receiver: `0x${string}`;
  amount: bigint;
  asset: `0x${string}`;
  transactionHash: `0x${string}`;
  blockNumber: bigint;
  transactionIndex: number;
  blockTimestamp: number;
};

export class BridgeChecker {
  private readonly abi = AssetsBridgeCallerAbi;
  private readonly contractAddress: `0x${string}`;
  private readonly bridgeSelector = toFunctionSelector(
    "bridge((uint256,address,uint256,address)[])",
  ).toLowerCase();
  private readonly bridgeOutSelector = toFunctionSelector(
    "bridgeOut(address,uint256,uint8,bytes)",
  ).toLowerCase();
  private readonly blockFetcher: BlockFetcher;

  constructor(
    private readonly client: PublicClient,
    blockFetcher?: BlockFetcher,
    contractAddress?: `0x${string}`,
  ) {
    const contracts = getMezoContracts(this.client.chain?.id);
    this.contractAddress =
      contractAddress ?? (contracts.assetsBridgeCaller as `0x${string}`);
    this.blockFetcher = blockFetcher ?? new BlockFetcher(this.client);
  }

  private isTargetFunction(input: `0x${string}`): BridgeFunctionName | null {
    if (!input || input.length < 10) return null;
    const selector = input.slice(0, 10).toLowerCase();
    if (selector === this.bridgeSelector) return "bridge";
    if (selector === this.bridgeOutSelector) return "bridgeOut";
    return null;
  }

  private buildTransfers(params: {
    functionName: BridgeFunctionName;
    args: unknown;
    txHash: `0x${string}`;
    txFrom: `0x${string}`;
    txIndex: number;
    blockNumber: bigint;
    blockTimestamp: number;
  }): BridgeTransfer[] {
    const {
      functionName,
      args,
      txHash,
      txFrom,
      txIndex,
      blockNumber,
      blockTimestamp,
    } = params;

    if (functionName === "bridge") {
      const [events] = args as [
        Array<{
          sequenceNumber: bigint;
          recipient: `0x${string}`;
          amount: bigint;
          token: `0x${string}`;
        }>
      ];
      return events.map((event) => ({
        direction: "in",
        sender: txFrom,
        receiver: event.recipient,
        amount: event.amount,
        asset: event.token,
        transactionHash: txHash,
        blockNumber,
        transactionIndex: txIndex,
        blockTimestamp,
      }));
    }

    const [token, amount, _chain, recipient] = args as [
      `0x${string}`,
      bigint,
      number,
      `0x${string}`
    ];

    return [
      {
        direction: "out",
        sender: txFrom,
        receiver: recipient,
        amount,
        asset: token,
        transactionHash: txHash,
        blockNumber,
        transactionIndex: txIndex,
        blockTimestamp,
      },
    ];
  }

  async getBridgeCallsInRange(options: {
    fromBlock: bigint;
    toBlock: bigint;
    chunkSize?: bigint;
  }): Promise<BridgeCallResult[]> {
    const { fromBlock, toBlock } = options;
    if (fromBlock > toBlock) {
      throw new Error("fromBlock must be <= toBlock");
    }

    const chunkSize = options.chunkSize ?? 250n;
    if (chunkSize <= 0n) {
      throw new Error("chunkSize must be > 0");
    }

    const results: BridgeCallResult[] = [];
    const blocks = await this.blockFetcher.getBlocksInRange({
      fromBlock,
      toBlock,
      chunkSize,
    });

    for (const block of blocks) {
      const timestamp =
        typeof block.timestamp === "number"
          ? block.timestamp
          : Number(block.timestamp);
      for (const tx of block.transactions) {
        if (typeof tx === "string") continue;
        if (!tx.to) continue;
        if (tx.to.toLowerCase() !== this.contractAddress.toLowerCase()) {
          continue;
        }

        const functionName = this.isTargetFunction(tx.input);
        if (!functionName) continue;

        let decoded;
        try {
          decoded = decodeFunctionData({
            abi: this.abi,
            data: tx.input,
          });
        } catch {
          continue;
        }

        if (decoded.functionName !== functionName) continue;

        results.push({
          functionName,
          args: decoded.args,
          transactionHash: tx.hash,
          blockNumber: block.number ?? 0n,
          transactionIndex: tx.transactionIndex ?? 0,
          from: tx.from,
          to: tx.to ?? null,
          blockTimestamp: timestamp,
        });
      }
    }

    results.sort((a, b) => {
      const blockDiff = a.blockNumber - b.blockNumber;
      if (blockDiff !== 0n) return blockDiff > 0n ? 1 : -1;
      return a.transactionIndex - b.transactionIndex;
    });

    return results;
  }

  async getBridgeTransfersInRange(options: {
    fromBlock: bigint;
    toBlock: bigint;
    chunkSize?: bigint;
  }): Promise<BridgeTransfer[]> {
    const calls = await this.getBridgeCallsInRange(options);
    const transfers = calls.flatMap((call) =>
      this.buildTransfers({
        functionName: call.functionName,
        args: call.args,
        txHash: call.transactionHash,
        txFrom: call.from,
        txIndex: call.transactionIndex,
        blockNumber: call.blockNumber,
        blockTimestamp: call.blockTimestamp,
      })
    );

    transfers.sort((a, b) => {
      const blockDiff = a.blockNumber - b.blockNumber;
      if (blockDiff !== 0n) return blockDiff > 0n ? 1 : -1;
      return a.transactionIndex - b.transactionIndex;
    });

    return transfers;
  }
}
