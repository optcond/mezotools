import { erc20Abi, formatUnits, PublicClient } from "viem";
import {
  getMezoChain,
  getMezoContracts,
  MezoTokenPriceSymbols,
  MezoTokens,
} from "../types";

const Multicall3Abi = [
  {
    inputs: [{ internalType: "address", name: "addr", type: "address" }],
    name: "getEthBalance",
    outputs: [{ internalType: "uint256", name: "balance", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

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
  const multicallAddress =
    client.chain?.contracts?.multicall3?.address ??
    getMezoChain(options.chainId).contracts?.multicall3?.address;
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

  const nativeBalanceCalls =
    nativeToken && multicallAddress
      ? [
          {
            address: multicallAddress,
            abi: Multicall3Abi,
            functionName: "getEthBalance",
            args: [owner],
          } as const,
        ]
      : [];

  const balanceResults =
    nativeBalanceCalls.length > 0 || erc20Tokens.length > 0
      ? await client.multicall({
          allowFailure: true,
          contracts: [
            ...nativeBalanceCalls,
            ...erc20Tokens.map((token) => ({
              address: token.address,
              abi: erc20Abi,
              functionName: "balanceOf" as const,
              args: [owner],
            })),
          ],
        })
      : [];
  const nativeResult = nativeBalanceCalls.length > 0 ? balanceResults[0] : null;
  const nativeRaw =
    nativeResult?.status === "success" && typeof nativeResult.result === "bigint"
      ? nativeResult.result
      : nativeToken
        ? await client.getBalance({ address: owner })
        : 0n;
  const erc20Results = balanceResults.slice(nativeBalanceCalls.length);

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
