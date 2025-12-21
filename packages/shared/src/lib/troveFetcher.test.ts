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

describe(`TroveManager operations`, () => {
  let client: PublicClient;
  let fetcher: TroveFetcher;
  let priceFeed: PriceFeedFetcher;
  beforeAll(async () => {
    client = createPublicClient({
      chain: MezoChain as Chain,
      transport: http(),
    });
    fetcher = new TroveFetcher(client);
    const priceFeedAddress = await fetcher.getPriceFeedAddress();
    priceFeed = new PriceFeedFetcher(client, priceFeedAddress);
  });

  it(`fetch system state`, async () => {
    const state = await fetcher.getSystemState();
    expect(state.troveOwnersCount).toBeGreaterThan(10);
    expect(Number(formatUnits(state.collateral, 18))).toBeGreaterThan(10);
    expect(Number(formatUnits(state.debt, 18))).toBeGreaterThan(1000);
  });

  it(`fetch TCR and recovery status`, async () => {
    const price = await priceFeed.fetchBtcOraclePrice();
    expect(price).toBeGreaterThan(0n);

    const state = await fetcher.getTCR(price);
    expect(state.recovery).toBeFalsy();
    expect(state.tcr).toBeGreaterThan(0);
  });

  it(`fetch trove owners`, async () => {
    const owners = await fetcher.getTroveOwners();
    expect(owners.length).toBeGreaterThan(0);

    const owners2nd = await fetcher.getTroveOwners(10n);
    expect(owners2nd).toHaveLength(10);
  }, 30_000);

  it(`fetch troves with data`, async () => {
    const owners = await fetcher.getTroveOwners(10n);
    expect(owners).toHaveLength(10);

    const price = await priceFeed.fetchBtcOraclePrice();
    const data = await fetcher.getTrovesWithData(owners, price);

    console.log(data);
  });

  it(`fetch events`, async () => {
    const events = await fetcher.getEventLog("Redemption", {
      fromBlock: 4792586n,
      toBlock: 4792956n,
    });
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
