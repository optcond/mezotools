import { createPublicClient, http, PublicClient } from "viem";
import { mainnet } from "viem/chains";
import { beforeAll, describe, expect, it } from "vitest";
import { BridgeAssetFetcher } from "./bridgeAssetFetcher";
import { BridgeTokens } from "../types";

describe("assets fetch integration test", () => {
  let client: PublicClient;
  let fetcher: BridgeAssetFetcher;
  beforeAll(async () => {
    client = createPublicClient({
      chain: mainnet,
      transport: http(),
    });
    fetcher = new BridgeAssetFetcher(client);
  });

  it(`fetch`, async () => {
    const result = await fetcher.fetchAssets();
    expect(result.length).toEqual(BridgeTokens.length);
    expect(result[0].tokenSymbol).toEqual(BridgeTokens[0].tokenSymbol);
  });
});
