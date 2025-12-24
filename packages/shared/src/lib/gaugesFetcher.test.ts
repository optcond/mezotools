import { createPublicClient, http, PublicClient } from "viem";
import { beforeAll, describe, expect, it } from "vitest";
import { GaugesFetcher } from "./gaugesFetcher";
import { MezoChain } from "../types";

const stringifyBigInt = (value: unknown) =>
  JSON.stringify(
    value,
    (_, item) => (typeof item === "bigint" ? item.toString() : item),
    2
  );

describe("GaugesFetcher integration test", () => {
  let client: PublicClient;
  let fetcher: GaugesFetcher;

  beforeAll(async () => {
    client = createPublicClient({
      chain: MezoChain,
      transport: http(MezoChain.rpcUrls.default.http[0]),
    });
    fetcher = new GaugesFetcher(client);
  });

  it("fetches gauge incentives", async () => {
    const results = await fetcher.fetchGaugeIncentives({
      probeAdjacentEpochs: true,
    });

    const readable = results.map((gauge) => ({
      pool: gauge.pool,
      poolName: gauge.poolName,
      gauge: gauge.gauge,
      bribe: gauge.bribe,
      votes: gauge.votes,
      duration: gauge.duration,
      epochStart: gauge.epochStart,
      rewards: gauge.rewards.map((reward) => ({
        token: reward.token,
        amount: reward.amount,
        previousEpochAmount: reward.previousEpochAmount,
        nextEpochAmount: reward.nextEpochAmount,
      })),
    }));

    console.log(stringifyBigInt(readable));
    expect(results.length).toBeGreaterThan(0);
  }, 60_000);
});
