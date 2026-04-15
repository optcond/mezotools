import { PublicClient } from "viem";
import { PythAbi } from "../abi/Pyth";

export const DEFAULT_PYTH_ADDRESS =
  "0x2880aB155794e7179c9eE2e38200202908C17B43" as const;

export const DEFAULT_PYTH_PRICE_IDS = {
  MUSD: "0x0617a9b725011a126a2b9fd53563f4236501f32cf76d877644b943394606c6de",
  MEZO: "0x80beaaedbdd228e77c5d62dfcd74b0305674b7e27a5cc6a46e71bd3a696826df",
  BTC: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  USDC: "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
  USDT: "0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b",
  T: "0x7a072b799215196b0ecb6a58636ec312bce8461dcc33c28c3a046b1e636d121d",
  cbBTC: "0x2817d7bfe5c64b8ea956e9a26f573ef64e72e4d7891f2d6af9bcc93f7aff9a97",
  SolvBTC:
    "0xf253cf87dc7d5ed5aa14cba5a6e79aee8bcfaef885a0e1b807035a0bbecc36fa",
} as const satisfies Record<string, `0x${string}`>;

export type PythTokenSymbol = keyof typeof DEFAULT_PYTH_PRICE_IDS;

export interface PythPrice {
  token: string;
  priceId: `0x${string}`;
  rawPrice: bigint;
  conf: bigint;
  expo: number;
  publishTime: bigint;
  normalized: number;
}

export interface PythPriceFetcherConfig {
  contractAddress?: `0x${string}`;
  maxAgeSeconds?: bigint;
  priceIds?: Record<string, `0x${string}`>;
}

export type PythPriceRequest =
  | PythTokenSymbol
  | {
      token: string;
      priceId?: `0x${string}`;
      maxAgeSeconds?: bigint;
    };

export class PythPriceFetcher {
  private readonly contractAddress: `0x${string}`;
  private readonly maxAgeSeconds: bigint;
  private readonly priceIds: Record<string, `0x${string}`>;

  constructor(
    private readonly client: PublicClient,
    config: PythPriceFetcherConfig = {}
  ) {
    this.contractAddress = config.contractAddress ?? DEFAULT_PYTH_ADDRESS;
    this.maxAgeSeconds = config.maxAgeSeconds ?? 3600n;
    this.priceIds = config.priceIds ?? DEFAULT_PYTH_PRICE_IDS;
  }

  async fetchPrice(request: PythPriceRequest): Promise<PythPrice> {
    const token = typeof request === "string" ? request : request.token;
    const priceId =
      typeof request === "string"
        ? this.getPriceId(request)
        : request.priceId ?? this.getPriceId(request.token);
    const maxAgeSeconds =
      typeof request === "string"
        ? this.maxAgeSeconds
        : request.maxAgeSeconds ?? this.maxAgeSeconds;

    const result = await this.client.readContract({
      address: this.contractAddress,
      abi: PythAbi,
      functionName: "getPriceNoOlderThan",
      args: [priceId, maxAgeSeconds],
    });

    return {
      token,
      priceId,
      rawPrice: result.price,
      conf: result.conf,
      expo: result.expo,
      publishTime: result.publishTime,
      normalized: normalizePythPrice(result.price, result.expo),
    };
  }

  async fetchMusdUsdPrice(): Promise<PythPrice> {
    return this.fetchPrice("MUSD");
  }

  async fetchMezoUsdPrice(): Promise<PythPrice> {
    return this.fetchPrice("MEZO");
  }

  private getPriceId(token: string): `0x${string}` {
    const priceId = this.priceIds[token];
    if (!priceId) {
      throw new Error(`Pyth price id is not configured for token: ${token}`);
    }
    return priceId;
  }
}

export const normalizePythPrice = (price: bigint, expo: number): number =>
  Number(price) * 10 ** expo;
