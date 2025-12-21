import { SupportedChainId } from "@cowprotocol/cow-sdk";
import { TradingSdk } from "@cowprotocol/sdk-trading";
import { ViemAdapter } from "@cowprotocol/sdk-viem-adapter";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { beforeAll, describe, expect, it } from "vitest";
import { CowFiFetcher } from "./cowFiFetcher";

describe(`CowFi swap`, () => {
  let cowFiTradingSDK: TradingSdk;
  let fetcher: CowFiFetcher;
  beforeAll(async () => {
    const account = privateKeyToAccount(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
    );
    const ethClient = createPublicClient({
      transport: http(),
      chain: mainnet,
    });
    const adapter = new ViemAdapter({ provider: ethClient, signer: account });
    cowFiTradingSDK = new TradingSdk(
      { appCode: "mezo-tools", chainId: SupportedChainId.MAINNET },
      {},
      adapter
    );
    fetcher = new CowFiFetcher(cowFiTradingSDK);
  });
  it.only(`musd sell quote`, async () => {
    const result = await fetcher.getMUSDSellQuote(10000);
    expect(result.buyAmount).toBeGreaterThan(9_000);
  }, 30_000);
});
