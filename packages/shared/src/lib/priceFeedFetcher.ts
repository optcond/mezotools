import { PublicClient } from "viem";
import { PriceFeedAbi } from "../abi/PriceFeed";

export class PriceFeedFetcher {
  constructor(
    private readonly client: PublicClient,
    private readonly contractAddress: `0x${string}`
  ) {}

  async fetchBtcOraclePrice(): Promise<bigint> {
    const response = await this.client.readContract({
      abi: PriceFeedAbi,
      address: this.contractAddress,
      functionName: "fetchPrice",
    });

    return response;
  }
}
