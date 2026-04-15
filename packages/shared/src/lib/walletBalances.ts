import { erc20Abi, formatUnits, PublicClient } from "viem";
import { getMezoContracts, MezoTokenPriceSymbols, MezoTokens } from "../types";

export interface KnownTokenBalance {
  symbol: string;
  address?: `0x${string}`;
  decimals: number;
  raw: bigint;
  formatted: string;
  amount: number;
  priceUsd: number | null;
  valueUsd: number | null;
}

export interface KnownTokenBalanceOptions {
  chainId?: number;
  tokenPricesUsd?: Record<string, number | null | undefined>;
  includeZeroBalances?: boolean;
  excludeSymbols?: string[];
}

export const getKnownMezoTokenBalances = async (
  client: PublicClient,
  owner: `0x${string}`,
  options: KnownTokenBalanceOptions = {}
): Promise<KnownTokenBalance[]> => {
  const contracts = getMezoContracts(options.chainId);
  const tokens = contracts.tokens ?? MezoTokens;
  const includeZeroBalances = options.includeZeroBalances ?? false;
  const excludedSymbols = new Set(options.excludeSymbols ?? ["veBTC", "veMEZO"]);

  const nativeToken = tokens.BTC;
  const erc20Tokens = Object.entries(tokens)
    .filter(
      ([symbol, token]) =>
        symbol !== "BTC" && token.address !== "0x0" && !excludedSymbols.has(symbol)
    )
    .map(([symbol, token]) => ({
      symbol,
      address: token.address as `0x${string}`,
      decimals: token.decimals,
    }));

  const [nativeRaw, erc20Results] = await Promise.all([
    nativeToken ? client.getBalance({ address: owner }) : Promise.resolve(0n),
    erc20Tokens.length > 0
      ? client.multicall({
          allowFailure: true,
          contracts: erc20Tokens.map((token) => ({
            address: token.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [owner],
          })),
        })
      : Promise.resolve([]),
  ]);

  const balances: KnownTokenBalance[] = [];
  if (nativeToken) {
    balances.push(
      toKnownTokenBalance({
        symbol: "BTC",
        decimals: nativeToken.decimals,
        raw: nativeRaw,
        tokenPricesUsd: options.tokenPricesUsd,
      })
    );
  }

  erc20Tokens.forEach((token, index) => {
    const result = erc20Results[index];
    if (result?.status !== "success" || typeof result.result !== "bigint") {
      return;
    }

    balances.push(
      toKnownTokenBalance({
        ...token,
        raw: result.result,
        tokenPricesUsd: options.tokenPricesUsd,
      })
    );
  });

  return balances
    .filter((balance) => includeZeroBalances || balance.raw > 0n)
    .sort((a, b) => (b.valueUsd ?? b.amount) - (a.valueUsd ?? a.amount));
};

const toKnownTokenBalance = ({
  symbol,
  address,
  decimals,
  raw,
  tokenPricesUsd,
}: {
  symbol: string;
  address?: `0x${string}`;
  decimals: number;
  raw: bigint;
  tokenPricesUsd?: Record<string, number | null | undefined>;
}): KnownTokenBalance => {
  const formatted = formatUnits(raw, decimals);
  const amount = Number(formatted);
  const priceSymbol = MezoTokenPriceSymbols[symbol] ?? symbol;
  const priceUsd = tokenPricesUsd?.[priceSymbol] ?? tokenPricesUsd?.[symbol] ?? null;
  const valueUsd = priceUsd !== null && Number.isFinite(priceUsd)
    ? amount * priceUsd
    : null;

  return {
    symbol,
    address,
    decimals,
    raw,
    formatted,
    amount,
    priceUsd,
    valueUsd,
  };
};
