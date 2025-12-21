import { TradingSdk } from "@cowprotocol/sdk-trading";
import { OrderKind } from "@cowprotocol/cow-sdk";
import { formatUnits, parseUnits } from "viem";
import { EthTokens } from "../types";

export class CowFiFetcher {
  constructor(private tradingSDK: TradingSdk) {}

  async getMUSDSellQuote(amount: number = 100000): Promise<{
    sellAmount: number;
    buyAmount: number;
  }> {
    const pAmount = parseUnits(
      amount.toString(),
      EthTokens.MUSD.decimals
    ).toString();

    const { quoteResults } = await this.tradingSDK.getQuote({
      kind: OrderKind.SELL,
      sellToken: EthTokens.MUSD.address,
      sellTokenDecimals: EthTokens.MUSD.decimals,
      buyToken: EthTokens.USDC.address,
      buyTokenDecimals: EthTokens.USDC.decimals,
      amount: pAmount,
      partiallyFillable: true,
    });
    return {
      sellAmount: Number(
        formatUnits(
          quoteResults.amountsAndCosts.afterNetworkCosts.sellAmount,
          EthTokens.MUSD.decimals
        )
      ),
      buyAmount: Number(
        formatUnits(
          quoteResults.amountsAndCosts.afterNetworkCosts.buyAmount,
          EthTokens.USDC.decimals
        )
      ),
    };
  }
}
