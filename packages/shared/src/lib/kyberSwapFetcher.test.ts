import { describe, expect, it, vi } from "vitest";
import { parseUnits } from "viem";
import { KyberSwapFetcher } from "./kyberSwapFetcher";

describe("KyberSwapFetcher", () => {
  it("returns parsed sell and buy amounts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 0,
        data: {
          routeSummary: {
            amountOut: parseUnits("99.25", 6).toString(),
          },
        },
      }),
    });

    const fetcher = new KyberSwapFetcher(
      "https://aggregator-api.kyberswap.com",
      fetchMock as unknown as typeof fetch,
    );

    const quote = await fetcher.getMUSDSellQuote(100);

    expect(quote.sellAmount).toBe(100);
    expect(quote.buyAmount).toBe(99.25);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when quote response does not contain amountOut", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 0, data: { routeSummary: {} } }),
    });

    const fetcher = new KyberSwapFetcher(
      "https://aggregator-api.kyberswap.com",
      fetchMock as unknown as typeof fetch,
    );

    await expect(fetcher.getMUSDSellQuote()).rejects.toThrow(
      "KyberSwap quote response missing routeSummary.amountOut",
    );
  });

  it("throws when KyberSwap returns non-zero code", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 12, message: "invalid token" }),
    });

    const fetcher = new KyberSwapFetcher(
      "https://aggregator-api.kyberswap.com",
      fetchMock as unknown as typeof fetch,
    );

    await expect(fetcher.getMUSDSellQuote()).rejects.toThrow(
      "KyberSwap quote request failed: invalid token",
    );
  });
});
