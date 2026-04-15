import {
  createPublicClient,
  formatUnits,
  getAddress,
  http,
  type PublicClient,
} from "viem";
import { base } from "viem/chains";
import {
  AerodromeOracleAbi,
  ERC20BalanceAbi,
  ERC20MetaAbi,
  GaugeMarketAbi,
  PoolMarketAbi,
} from "../abi/PoolMarket";
import { MezoTokens } from "../types";
import { PriceFeedFetcher } from "./priceFeedFetcher";
import { TroveFetcher } from "./troveFetcher";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const MEZO_TOKEN_ADDRESS = "0x7B7c000000000000000000000000000000000001";
export const AERODROME_BASE_MEZO = getAddress(
  "0x8e4cbbcc33db6c0a18561fde1f6ba35906d4848b",
);
export const AERODROME_BASE_MUSD = getAddress(
  "0xdd468a1ddc392dcdbef6db6e34e89aa338f9f186",
);
export const AERODROME_BASE_OFFCHAIN_ORACLE = getAddress(
  "0xfbC91Fc9C6E70Afbea84b69FB0bF5EBa7F90aaFd",
);

export type PoolMarketRead = {
  name: string;
  symbol: string;
  decimals: number;
  token0: `0x${string}`;
  token1: `0x${string}`;
  stable: boolean;
  reserve0: bigint;
  reserve1: bigint;
  lpTotalSupply: bigint;
};

export type GaugeMarketRead = {
  stakingToken: `0x${string}` | null;
  rewardToken: `0x${string}` | null;
  gaugeTotalSupply: bigint;
  rewardRate: bigint;
  periodFinish: bigint;
};

export type TokenMarket = {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  priceUsd: number | null;
  priceSource: string | null;
  confidence: number;
};

export type Erc20BalanceRequest = {
  token: `0x${string}`;
  owner: `0x${string}`;
};

export type Erc20BalanceRead = Erc20BalanceRequest & {
  balance: bigint;
};

export const normalizeAddress = (value: string) => value.toLowerCase();

export const shortenAddress = (value: string) =>
  `${value.slice(0, 6)}...${value.slice(-4)}`;

export const createAerodromeBasePublicClient = () =>
  createPublicClient({
    chain: base,
    transport: http(base.rpcUrls.default.http[0]),
  });

const buildKnownDecimalsByAddress = () => {
  const entries = Object.values(MezoTokens).map((token) => [
    normalizeAddress(token.address),
    token.decimals,
  ] as const);
  return new Map<string, number>(entries);
};

const buildKnownSymbolByAddress = () => {
  const entries = Object.entries(MezoTokens).map(([symbol, token]) => [
    normalizeAddress(token.address),
    symbol,
  ] as const);
  return new Map<string, string>(entries);
};

const KNOWN_SYMBOLS: Record<string, { symbol: string; decimals: number }> = {
  [normalizeAddress(MEZO_TOKEN_ADDRESS)]: { symbol: "MEZO", decimals: 18 },
};

const BTC_PRICED_SYMBOLS = new Set(["BTC", "mcbBTC", "mSolvBTC", "mxSolvBTC"]);
const USD_PEGGED_SYMBOLS = new Set(["MUSD", "mUSDT", "mUSDC", "mUSDe"]);
const PYTH_HERMES_ENDPOINT = "https://hermes.pyth.network";
const PYTH_FETCH_TIMEOUT_MS = 4_000;

type PythFeedSearchRow = {
  id?: string;
  attributes?: {
    asset_type?: string;
    base?: string;
    display_symbol?: string;
    quote_currency?: string;
  };
};

type PythLatestPriceResponse = {
  parsed?: Array<{
    price?: {
      price?: string;
      expo?: number;
    };
  }>;
};

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PYTH_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchBtcPriceUsd(
  publicClient: PublicClient,
): Promise<number | null> {
  try {
    const troveFetcher = new TroveFetcher(publicClient);
    const priceFeedAddress = await troveFetcher.getPriceFeedAddress();
    const priceFeed = new PriceFeedFetcher(publicClient, priceFeedAddress);
    const btcPrice = await priceFeed.fetchBtcOraclePrice();
    return Number(formatUnits(btcPrice, 18));
  } catch {
    return null;
  }
}

export async function fetchMezoPriceUsdFromAerodrome(
  publicClient = createAerodromeBasePublicClient(),
): Promise<number | null> {
  try {
    const rate = (await publicClient.readContract({
      address: AERODROME_BASE_OFFCHAIN_ORACLE,
      abi: AerodromeOracleAbi,
      functionName: "getRate",
      args: [AERODROME_BASE_MEZO, AERODROME_BASE_MUSD, false],
    })) as bigint;

    const priceUsd = Number(formatUnits(rate, 18));
    return Number.isFinite(priceUsd) && priceUsd > 0 ? priceUsd : null;
  } catch {
    return null;
  }
}

export async function fetchPythUsdPrice(
  query: string,
  baseSymbol: string,
): Promise<number | null> {
  try {
    const searchUrl = `${PYTH_HERMES_ENDPOINT}/v2/price_feeds?query=${encodeURIComponent(query)}`;
    const searchResponse = await fetchWithTimeout(searchUrl);
    if (!searchResponse.ok) return null;
    const feeds = (await searchResponse.json()) as PythFeedSearchRow[];
    const base = baseSymbol.toUpperCase();
    const feed = feeds.find((candidate) => {
      const attributes = candidate.attributes;
      return (
        candidate.id &&
        attributes?.asset_type === "Crypto" &&
        attributes.base?.toUpperCase() === base &&
        attributes.quote_currency === "USD"
      );
    });
    if (!feed?.id) return null;

    const latestUrl = `${PYTH_HERMES_ENDPOINT}/v2/updates/price/latest?ids[]=${feed.id}`;
    const latestResponse = await fetchWithTimeout(latestUrl);
    if (!latestResponse.ok) return null;
    const latest = (await latestResponse.json()) as PythLatestPriceResponse;
    const price = latest.parsed?.[0]?.price;
    if (!price?.price || typeof price.expo !== "number") return null;

    const priceUsd = Number(price.price) * 10 ** price.expo;
    return Number.isFinite(priceUsd) && priceUsd > 0 ? priceUsd : null;
  } catch {
    return null;
  }
}

export async function fetchMezoRewardTokenMarkets(
  publicClient: PublicClient,
  addresses: `0x${string}`[],
): Promise<Map<string, TokenMarket>> {
  const markets = await fetchTokenMarkets(publicClient, addresses);
  const [btcPriceUsd, mezoPythPriceUsd, mezoAerodromePriceUsd, musdPythPriceUsd] = await Promise.all([
    fetchBtcPriceUsd(publicClient),
    fetchPythUsdPrice("MEZO/USD", "MEZO"),
    fetchMezoPriceUsdFromAerodrome(),
    fetchPythUsdPrice("MUSD/USD", "MUSD"),
  ]);
  const mezoPriceUsd = mezoPythPriceUsd ?? mezoAerodromePriceUsd;

  for (const [address, market] of markets.entries()) {
    if (address === normalizeAddress(MEZO_TOKEN_ADDRESS)) {
      markets.set(address, {
        ...market,
        priceUsd: mezoPriceUsd,
        priceSource:
          mezoPriceUsd === null
            ? null
            : mezoPythPriceUsd === null
              ? "aerodrome-base-oracle"
              : "pyth-hermes",
        confidence:
          mezoPriceUsd === null ? 0 : mezoPythPriceUsd === null ? 0.7 : 0.9,
      });
      continue;
    }

    if (BTC_PRICED_SYMBOLS.has(market.symbol)) {
      markets.set(address, {
        ...market,
        priceUsd: btcPriceUsd,
        priceSource: btcPriceUsd === null ? null : "mezo-btc-price-feed",
        confidence: btcPriceUsd === null ? 0 : 0.9,
      });
      continue;
    }

    if (USD_PEGGED_SYMBOLS.has(market.symbol)) {
      const isMusd = market.symbol === "MUSD";
      markets.set(address, {
        ...market,
        priceUsd: isMusd && musdPythPriceUsd !== null ? musdPythPriceUsd : 1,
        priceSource: isMusd && musdPythPriceUsd !== null ? "pyth-hermes" : "usd-peg",
        confidence: isMusd && musdPythPriceUsd !== null ? 0.9 : 0.8,
      });
    }
  }

  return markets;
}

export async function fetchPoolMarketReads(
  publicClient: PublicClient,
  poolAddresses: `0x${string}`[],
): Promise<Map<string, PoolMarketRead>> {
  const unique = Array.from(new Set(poolAddresses.map((address) => getAddress(address))));
  const contracts = unique.flatMap((address) => [
    { address, abi: PoolMarketAbi, functionName: "name" as const },
    { address, abi: PoolMarketAbi, functionName: "symbol" as const },
    { address, abi: PoolMarketAbi, functionName: "decimals" as const },
    { address, abi: PoolMarketAbi, functionName: "token0" as const },
    { address, abi: PoolMarketAbi, functionName: "token1" as const },
    { address, abi: PoolMarketAbi, functionName: "stable" as const },
    { address, abi: PoolMarketAbi, functionName: "getReserves" as const },
    { address, abi: PoolMarketAbi, functionName: "totalSupply" as const },
  ]);

  const results = await publicClient.multicall({ contracts });
  const map = new Map<string, PoolMarketRead>();
  let index = 0;
  for (const address of unique) {
    const name = results[index++];
    const symbol = results[index++];
    const decimals = results[index++];
    const token0 = results[index++];
    const token1 = results[index++];
    const stable = results[index++];
    const reserves = results[index++];
    const totalSupply = results[index++];

    if (
      name.status !== "success" ||
      symbol.status !== "success" ||
      decimals.status !== "success" ||
      token0.status !== "success" ||
      token1.status !== "success" ||
      stable.status !== "success" ||
      reserves.status !== "success" ||
      totalSupply.status !== "success"
    ) {
      continue;
    }

    const [reserve0, reserve1] = reserves.result as readonly [
      bigint,
      bigint,
      number,
    ];
    map.set(normalizeAddress(address), {
      name: name.result as string,
      symbol: symbol.result as string,
      decimals: Number(decimals.result),
      token0: token0.result as `0x${string}`,
      token1: token1.result as `0x${string}`,
      stable: stable.result as boolean,
      reserve0,
      reserve1,
      lpTotalSupply: totalSupply.result as bigint,
    });
  }

  return map;
}

export async function fetchGaugeMarketReads(
  publicClient: PublicClient,
  gaugeAddresses: `0x${string}`[],
): Promise<Map<string, GaugeMarketRead>> {
  const unique = Array.from(new Set(gaugeAddresses.map((address) => getAddress(address))));
  const contracts = unique.flatMap((address) => [
    { address, abi: GaugeMarketAbi, functionName: "stakingToken" as const },
    { address, abi: GaugeMarketAbi, functionName: "rewardToken" as const },
    { address, abi: GaugeMarketAbi, functionName: "totalSupply" as const },
    { address, abi: GaugeMarketAbi, functionName: "rewardRate" as const },
    { address, abi: GaugeMarketAbi, functionName: "periodFinish" as const },
  ]);

  const results = await publicClient.multicall({ contracts });
  const map = new Map<string, GaugeMarketRead>();
  let index = 0;
  for (const address of unique) {
    const stakingToken = results[index++];
    const rewardToken = results[index++];
    const gaugeTotalSupply = results[index++];
    const rewardRate = results[index++];
    const periodFinish = results[index++];

    map.set(normalizeAddress(address), {
      stakingToken:
        stakingToken.status === "success"
          ? (stakingToken.result as `0x${string}`)
          : null,
      rewardToken:
        rewardToken.status === "success"
          ? (rewardToken.result as `0x${string}`)
          : null,
      gaugeTotalSupply:
        gaugeTotalSupply.status === "success"
          ? (gaugeTotalSupply.result as bigint)
          : 0n,
      rewardRate:
        rewardRate.status === "success" ? (rewardRate.result as bigint) : 0n,
      periodFinish:
        periodFinish.status === "success"
          ? (periodFinish.result as bigint)
          : 0n,
    });
  }

  return map;
}

export async function fetchTokenMarkets(
  publicClient: PublicClient,
  addresses: `0x${string}`[],
): Promise<Map<string, TokenMarket>> {
  const knownDecimals = buildKnownDecimalsByAddress();
  const knownSymbols = buildKnownSymbolByAddress();
  const unique = Array.from(
    new Set(addresses.map((address) => normalizeAddress(address))),
  ).filter((address) => address !== normalizeAddress(ZERO_ADDRESS));

  const calls = unique.flatMap((address) => [
    {
      address: address as `0x${string}`,
      abi: ERC20MetaAbi,
      functionName: "symbol" as const,
    },
    {
      address: address as `0x${string}`,
      abi: ERC20MetaAbi,
      functionName: "decimals" as const,
    },
  ]);

  const results = await publicClient.multicall({ contracts: calls });
  const markets = new Map<string, TokenMarket>();
  let index = 0;
  for (const address of unique) {
    const symbolRead = results[index++];
    const decimalsRead = results[index++];
    const known = KNOWN_SYMBOLS[address];
    const symbol =
      known?.symbol ??
      knownSymbols.get(address) ??
      (symbolRead.status === "success"
        ? (symbolRead.result as string)
        : shortenAddress(address));
    const decimals =
      known?.decimals ??
      knownDecimals.get(address) ??
      (decimalsRead.status === "success" ? Number(decimalsRead.result) : 18);

    markets.set(address, {
      address: address as `0x${string}`,
      symbol,
      decimals,
      priceUsd: null,
      priceSource: null,
      confidence: 0,
    });
  }

  return markets;
}

export async function fetchErc20Balances(
  publicClient: PublicClient,
  requests: Erc20BalanceRequest[],
): Promise<Erc20BalanceRead[]> {
  const contracts = requests.map((request) => ({
    address: request.token,
    abi: ERC20BalanceAbi,
    functionName: "balanceOf" as const,
    args: [getAddress(request.owner)],
  }));

  const results = await publicClient.multicall({ contracts });
  return requests.map((request, index) => {
    const result = results[index];
    return {
      token: request.token,
      owner: request.owner,
      balance:
        result?.status === "success" ? (result.result as bigint) : 0n,
    };
  });
}
