import { describe, expect, it } from "vitest";
import { ContractChecker } from "./contractChecker";
import { BlockFetcher } from "./blockFetcher";
import { createMezoPublicClient } from "../testUtils/publicClient";

const parseBigIntEnv = (value?: string): bigint | undefined => {
  if (!value) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
};

describe("ContractChecker", () => {
  it("fetches contract creations in a block range", async () => {
    const client = createMezoPublicClient();

    const toBlock =
      parseBigIntEnv(process.env.MEZO_TO_BLOCK) ??
      (await client.getBlockNumber());
    const fallbackFrom = toBlock > 500n ? toBlock - 1000n : 0n;
    const fromBlock =
      parseBigIntEnv(process.env.MEZO_FROM_BLOCK) ?? fallbackFrom;
    const chunkSize = parseBigIntEnv(process.env.MEZO_CHUNK_SIZE) ?? 100n;

    const checker = new ContractChecker(client, new BlockFetcher(client));
    const results = await checker.getContractCreationsInRange({
      fromBlock,
      toBlock,
      chunkSize,
    });

    results.forEach((r) => console.log(r));
    expect(Array.isArray(results)).toBe(true);
  }, 120_000);
});
