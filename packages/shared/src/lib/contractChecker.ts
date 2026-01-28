import { PublicClient } from "viem";
import { BlockFetcher } from "./blockFetcher";

export type ContractCreation = {
  contractAddress: `0x${string}`;
  creator: `0x${string}`;
  transactionHash: `0x${string}`;
  blockNumber: bigint;
  transactionIndex: number;
  blockTimestamp: number;
  txStatus: "success" | "failed";
};

type ReceiptInfo = {
  status: "success" | "failed";
  contractAddress: `0x${string}` | null;
};

export class ContractChecker {
  private readonly blockFetcher: BlockFetcher;

  constructor(
    private readonly client: PublicClient,
    blockFetcher?: BlockFetcher,
  ) {
    this.blockFetcher = blockFetcher ?? new BlockFetcher(this.client);
  }

  async getContractCreationsInRange(options: {
    fromBlock: bigint;
    toBlock: bigint;
    chunkSize?: bigint;
  }): Promise<ContractCreation[]> {
    const { fromBlock, toBlock } = options;
    if (fromBlock > toBlock) {
      throw new Error("fromBlock must be <= toBlock");
    }

    const chunkSize = options.chunkSize ?? 250n;
    if (chunkSize <= 0n) {
      throw new Error("chunkSize must be > 0");
    }

    const blocks = await this.blockFetcher.getBlocksInRange({
      fromBlock,
      toBlock,
      chunkSize,
    });

    const candidates: Array<{
      hash: `0x${string}`;
      from: `0x${string}`;
      blockNumber: bigint;
      transactionIndex: number;
      blockTimestamp: number;
    }> = [];

    for (const block of blocks) {
      const timestamp =
        typeof block.timestamp === "number"
          ? block.timestamp
          : Number(block.timestamp);
      for (const tx of block.transactions) {
        if (typeof tx === "string") continue;
        if (tx.to) continue;
        candidates.push({
          hash: tx.hash,
          from: tx.from,
          blockNumber: tx.blockNumber ?? 0n,
          transactionIndex: tx.transactionIndex ?? 0,
          blockTimestamp: timestamp,
        });
      }
    }

    if (candidates.length === 0) {
      return [];
    }

    const receiptMap = await this.buildReceiptMap(
      candidates.map((candidate) => candidate.hash),
    );

    const creations: ContractCreation[] = [];
    for (const candidate of candidates) {
      const receipt = receiptMap.get(candidate.hash);
      if (!receipt?.contractAddress) continue;
      creations.push({
        contractAddress: receipt.contractAddress,
        creator: candidate.from,
        transactionHash: candidate.hash,
        blockNumber: candidate.blockNumber,
        transactionIndex: candidate.transactionIndex,
        blockTimestamp: candidate.blockTimestamp,
        txStatus: receipt.status,
      });
    }

    creations.sort((a, b) => {
      const blockDiff = a.blockNumber - b.blockNumber;
      if (blockDiff !== 0n) return blockDiff > 0n ? 1 : -1;
      return a.transactionIndex - b.transactionIndex;
    });

    return creations;
  }

  private async buildReceiptMap(
    txHashes: `0x${string}`[],
  ): Promise<Map<`0x${string}`, ReceiptInfo>> {
    const unique = [...new Set(txHashes)];
    const receipts = await Promise.all(
      unique.map(async (hash) => {
        try {
          const receipt = await this.client.getTransactionReceipt({ hash });
          return [
            hash,
            {
              status: receipt.status === "success" ? "success" : "failed",
              contractAddress:
                (receipt.contractAddress as `0x${string}` | null) ?? null,
            },
          ];
        } catch (error) {
          console.warn("Failed to fetch transaction receipt", { hash, error });
          return [
            hash,
            { status: "failed" as const, contractAddress: null },
          ];
        }
      }),
    );

    return new Map(receipts as Array<[`0x${string}`, ReceiptInfo]>);
  }
}
