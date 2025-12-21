import { BridgeTokenDefinition } from "./types";

export interface BridgeAssetBalance extends BridgeTokenDefinition {
  bridgeAddress: string;
  decimals: number;
  balanceRaw: string;
  balanceFormatted: string;
}
