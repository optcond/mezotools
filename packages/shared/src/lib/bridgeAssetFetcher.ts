import { AppContracts, BridgeTokenDefinition, BridgeTokens } from "../types";
import { erc20Abi, formatUnits, PublicClient } from "viem";

export interface BridgeAssetBalance extends BridgeTokenDefinition {
  bridgeAddress: string;
  decimals: number;
  balanceRaw: string;
  balanceFormatted: string;
}

export class BridgeAssetFetcher {
  constructor(
    private readonly client: PublicClient,
    private readonly bridgeAddress: string = AppContracts.ETH_MEZO_TBTC_BRIDGE
  ) {}

  async fetchAssets(): Promise<BridgeAssetBalance[]> {
    const calls = BridgeTokens.flatMap((token) => [
      {
        abi: erc20Abi,
        address: token.ethereumAddress,
        functionName: "balanceOf",
        args: [this.bridgeAddress],
      },
      {
        abi: erc20Abi,
        address: token.ethereumAddress,
        functionName: "decimals",
      },
    ]);

    const results = await this.client.multicall({ contracts: calls });

    let idx = 0;
    return BridgeTokens.map((token) => {
      const balanceOfResult = results[idx++];
      const decimalsResult = results[idx++];

      if (
        balanceOfResult.status === "failure" ||
        decimalsResult.status === "failure" ||
        balanceOfResult.result === "0x" ||
        decimalsResult.result === "0x"
      )
        return;

      const balance = balanceOfResult.result;
      const decimals = decimalsResult.result;

      if (!balance || !decimals) return;
      return {
        ...token,
        bridgeAddress: this.bridgeAddress,
        balanceRaw: balance.toString(),
        decimals: decimals as number,
        balanceFormatted: formatUnits(balance as bigint, decimals as number),
      };
    }).filter((asset): asset is BridgeAssetBalance => asset !== undefined);
  }
}
