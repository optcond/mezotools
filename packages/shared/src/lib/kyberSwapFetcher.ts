import { formatUnits, parseUnits } from "viem";
import { EthTokens } from "../types";

type FetchLike = typeof fetch;

interface KyberRouteResponse {
  code?: number;
  message?: string;
  data?: {
    routeSummary?: {
      amountOut?: string;
    };
  };
}

const DEFAULT_KYBER_BASE_URL = "https://aggregator-api.kyberswap.com";

export class KyberSwapFetcher {
  constructor(
    private readonly baseUrl: string = DEFAULT_KYBER_BASE_URL,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async getMUSDSellQuote(amount: number = 100000): Promise<{
    sellAmount: number;
    buyAmount: number;
  }> {
    const amountIn = parseUnits(
      amount.toString(),
      EthTokens.MUSD.decimals,
    ).toString();
    const url = new URL("/ethereum/api/v1/routes", this.baseUrl);
    url.searchParams.set("tokenIn", EthTokens.MUSD.address);
    url.searchParams.set("tokenOut", EthTokens.USDC.address);
    url.searchParams.set("amountIn", amountIn);

    const response = await this.fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`KyberSwap quote request failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as KyberRouteResponse;
    if (typeof payload.code === "number" && payload.code !== 0) {
      throw new Error(
        `KyberSwap quote request failed: ${payload.message ?? `code ${payload.code}`}`,
      );
    }
    const amountOut = payload?.data?.routeSummary?.amountOut;

    if (!amountOut) {
      throw new Error("KyberSwap quote response missing routeSummary.amountOut");
    }

    return {
      sellAmount: amount,
      buyAmount: Number(formatUnits(BigInt(amountOut), EthTokens.USDC.decimals)),
    };
  }
}
