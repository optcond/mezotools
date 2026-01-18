import { describe, expect, it } from "vitest";
import { BridgeChecker } from "./bridgeChecker";
import { BlockFetcher } from "./blockFetcher";
import { getMezoContracts } from "../types";
import { createMezoPublicClient } from "../testUtils/publicClient";

const parseBigIntEnv = (value?: string): bigint | undefined => {
  if (!value) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
};

describe("BridgeChecker", () => {
  it("fetches bridge/bridgeOut calls in a block range", async () => {
    const client = createMezoPublicClient();

    const toBlock =
      parseBigIntEnv(process.env.MEZO_TO_BLOCK) ??
      (await client.getBlockNumber());
    const fallbackFrom = toBlock > 500n ? toBlock - 1000n : 0n;
    const fromBlock =
      parseBigIntEnv(process.env.MEZO_FROM_BLOCK) ?? fallbackFrom;
    const chunkSize = parseBigIntEnv(process.env.MEZO_CHUNK_SIZE) ?? 100n;

    const checker = new BridgeChecker(client, new BlockFetcher(client));
    const results = await checker.getBridgeCallsInRange({
      fromBlock: 6172178n,
      toBlock: 6172178n,
      chunkSize,
    });

    results.forEach((r) => console.log(r.args));
    expect(Array.isArray(results)).toBe(true);
  }, 120_000);
});
