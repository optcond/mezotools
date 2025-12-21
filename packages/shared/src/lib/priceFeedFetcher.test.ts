import {
  Chain,
  PublicClient,
  createPublicClient,
  http,
  parseUnits,
} from "viem";
import { beforeAll, describe, expect, it } from "vitest";
import { PriceFeedFetcher } from "./priceFeedFetcher";
import { MezoChain } from "../types";

describe(`Price Feed tBTC Oracle`, () => {
  let client: PublicClient;
  let fetcher: PriceFeedFetcher;
  beforeAll(async () => {
    client = createPublicClient({
      chain: MezoChain as Chain,
      transport: http(),
    });
    fetcher = new PriceFeedFetcher(
      client,
      "0xc5aC5A8892230E0A3e1c473881A2de7353fFcA88"
    );
  });

  it(`fetch price`, async () => {
    const price = await fetcher.fetchBtcOraclePrice();
    expect(price).toBeGreaterThan(parseUnits("10000", 18));
  }, 10_000);
});
