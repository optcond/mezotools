import { PublicClient } from "viem";

type BlockWithTransactions = Awaited<ReturnType<PublicClient["getBlock"]>>;

export class BlockFetcher {
  private readonly cache = new Map<bigint, BlockWithTransactions>();

  constructor(
    private readonly client: PublicClient,
    private readonly defaultChunkSize: bigint = 250n
  ) {}

  async getBlock(blockNumber: bigint): Promise<BlockWithTransactions> {
    const cached = this.cache.get(blockNumber);
    if (cached) return cached;

    const block = await this.client.getBlock({
      blockNumber,
      includeTransactions: true,
    });
    this.cache.set(blockNumber, block);
    return block;
  }

  async getBlocksInRange(options: {
    fromBlock: bigint;
    toBlock: bigint;
    chunkSize?: bigint;
  }): Promise<BlockWithTransactions[]> {
    const { fromBlock, toBlock } = options;
    if (fromBlock > toBlock) {
      throw new Error("fromBlock must be <= toBlock");
    }

    const chunkSize = options.chunkSize ?? this.defaultChunkSize;
    if (chunkSize <= 0n) {
      throw new Error("chunkSize must be > 0");
    }

    const blocks: BlockWithTransactions[] = [];
    let cursor = fromBlock;

    while (cursor <= toBlock) {
      const end =
        cursor + chunkSize - 1n > toBlock ? toBlock : cursor + chunkSize - 1n;
      const blockNumbers: bigint[] = [];
      for (let bn = cursor; bn <= end; bn += 1n) {
        blockNumbers.push(bn);
      }

      const chunk = await Promise.all(
        blockNumbers.map((blockNumber) => this.getBlock(blockNumber))
      );
      blocks.push(...chunk);

      cursor = end + 1n;
    }

    blocks.sort((a, b) => {
      const blockDiff = (a.number ?? 0n) - (b.number ?? 0n);
      if (blockDiff !== 0n) return blockDiff > 0n ? 1 : -1;
      return 0;
    });

    return blocks;
  }
}
