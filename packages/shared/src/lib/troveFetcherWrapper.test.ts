import {
  Chain,
  PublicClient,
  createPublicClient,
  formatUnits,
  http,
  webSocket,
} from "viem";
import { MezoChain } from "../types";
import { beforeAll, describe, expect, it } from "vitest";
import { TroveFetcher } from "./troveFetcher";
import { PriceFeedFetcher } from "./priceFeedFetcher";
import { TroveFetcherWrapper } from "./troveFetcherWrapper";

describe(`TroveManager operations`, () => {
  let client: PublicClient;
  let fetcher: TroveFetcher;
  let priceFeed: PriceFeedFetcher;
  let wrapper: TroveFetcherWrapper;
  beforeAll(async () => {
    client = createPublicClient({
      chain: MezoChain as Chain,
      transport: http(),
    });
    fetcher = new TroveFetcher(client);
    const priceFeedAddress = await fetcher.getPriceFeedAddress();
    priceFeed = new PriceFeedFetcher(client, priceFeedAddress);
    wrapper = new TroveFetcherWrapper(fetcher, priceFeed);
  });

  it(`fetch events`, async () => {
    const events = await wrapper.getRedemptionsSinceBlock(5027891);
    console.log(events);
  });

  // it(`fetch redemptions`, async () => {
  //   const events = await fetcher.getRedemptionsSinceBlock(4_897_012);
  //   expect(events).toHaveLength(1);
  //   expect(events[0].blockNumber).toEqual(4897013);
  //   expect(events[0].attemptedAmount).toEqual(4611);
  //   console.log(events[0]);
  // }, 30_000);

  // it.only(`fetch liquidations`, async () => {
  //   const events = await fetcher.getLiquidationsSinceBlock(4_776_445);
  //   expect(events).toHaveLength(2);
  //   expect(events[0].blockNumber).toEqual(4_776_445);
  //   expect(events[0].debt).toEqual(2000.169572549725);
  // }, 30_000);
});
