import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PYTH_ADDRESS,
  DEFAULT_PYTH_PRICE_IDS,
  PythPriceFetcher,
  normalizePythPrice,
} from "./pythPriceFetcher";

describe("PythPriceFetcher", () => {
  it("fetches a configured token price", async () => {
    const readContract = vi.fn().mockResolvedValue({
      price: 100000000n,
      conf: 1000n,
      expo: -8,
      publishTime: 1710000000n,
    });
    const fetcher = new PythPriceFetcher({ readContract } as never);

    const price = await fetcher.fetchPrice("MUSD");

    expect(readContract).toHaveBeenCalledWith({
      address: DEFAULT_PYTH_ADDRESS,
      abi: expect.any(Array),
      functionName: "getPriceNoOlderThan",
      args: [DEFAULT_PYTH_PRICE_IDS.MUSD, 3600n],
    });
    expect(price).toEqual({
      token: "MUSD",
      priceId: DEFAULT_PYTH_PRICE_IDS.MUSD,
      rawPrice: 100000000n,
      conf: 1000n,
      expo: -8,
      publishTime: 1710000000n,
      normalized: 1,
    });
  });

  it("fetches the configured MEZO/USD price", async () => {
    const readContract = vi.fn().mockResolvedValue({
      price: 9000000n,
      conf: 1000n,
      expo: -8,
      publishTime: 1710000000n,
    });
    const fetcher = new PythPriceFetcher({ readContract } as never);

    const price = await fetcher.fetchMezoUsdPrice();

    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [DEFAULT_PYTH_PRICE_IDS.MEZO, 3600n],
      })
    );
    expect(price.token).toBe("MEZO");
    expect(price.normalized).toBe(0.09);
  });

  it("uses explicit price ids for custom tokens", async () => {
    const readContract = vi.fn().mockResolvedValue({
      price: 250000000n,
      conf: 1000n,
      expo: -8,
      publishTime: 1710000000n,
    });
    const fetcher = new PythPriceFetcher({ readContract } as never);
    const priceId =
      "0x1111111111111111111111111111111111111111111111111111111111111111";

    const price = await fetcher.fetchPrice({
      token: "CUSTOM",
      priceId,
      maxAgeSeconds: 120n,
    });

    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [priceId, 120n],
      })
    );
    expect(price.normalized).toBe(2.5);
  });

  it("normalizes pyth price values", () => {
    expect(normalizePythPrice(123456789n, -8)).toBeCloseTo(1.23456789);
    expect(normalizePythPrice(123n, 2)).toBe(12300);
  });
});
