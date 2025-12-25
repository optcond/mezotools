import { Chain } from "viem";

export const MezoChain = {
  contracts: {
    multicall3: {
      address: "0xca11bde05977b3631167028862be2a173976ca11",
    },
  },
  id: 31612,
  name: "Mezo",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc-internal.mezo.org"],
      webSocket: ["wss://rpc-ws.mezo.boar.network"],
    },
  },
} as Chain;

export const MezoChainTestnet = {
  contracts: {
    multicall3: {
      address: "0xca11bde05977b3631167028862be2a173976ca11",
    },
  },
  id: 31611,
  name: "Mezo",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.test.mezo.org"],
      webSocket: ["wss://rpc-ws.test.mezo.org"],
    },
  },
} as Chain;

export enum ProviderType {
  HTTP = "http",
  WEBSOCKET = "websocket",
}

export enum EnvironmentType {
  DEV = "dev",
  PROD = "prod",
}

export const MezoTokens: Record<string, { address: string; decimals: number }> =
  {
    BTC: {
      address: "0x7b7C000000000000000000000000000000000000",
      decimals: 18,
    },
    MUSD: {
      address: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186",
      decimals: 18,
    },
    mcbBTC: {
      address: "0x6a7CD8E1384d49f502b4A4CE9aC9eb320835c5d7",
      decimals: 8,
    },
    mUSDT: {
      address: "0xeB5a5d39dE4Ea42C2Aa6A57EcA2894376683bB8E",
      decimals: 6,
    },
    mUSDC: {
      address: "0x04671C72Aab5AC02A03c1098314b1BB6B560c197",
      decimals: 6,
    },
    mT: {
      address: "0xaaC423eDC4E3ee9ef81517e8093d52737165b71F",
      decimals: 18,
    },
    mSolvBTC: {
      address: "0xa10aD2570ea7b93d19fDae6Bd7189fF4929Bc747",
      decimals: 18,
    },
    mxSolvBTC: {
      address: "0xdF708431162Ba247dDaE362D2c919e0fbAfcf9DE",
      decimals: 18,
    },
  };

export const EthTokens: Record<string, { address: string; decimals: number }> =
  {
    TBTC: {
      address: "0x18084fbA666a33d37592fA2633fD49a74DD93a88",
      decimals: 18,
    },
    MUSD: {
      address: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186",
      decimals: 18,
    },
    USDC: {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      decimals: 6,
    },
  };

export const AppContracts: Record<string, `0x${string}`> = {
  ETH_MEZO_TBTC_BRIDGE: "0xf6680ea3b480ca2b72d96ea13ccaf2cfd8e6908c",
  MEZO_TROVE_MANAGER: "0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193",
  MEZO_TESTNET_TROVE_MANAGER: "0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0",
  MEZO_BORROWER_OPERATIONS: "0x44b1bac67dDA612a41a58AAf779143B181dEe031",
  MEZO_TESTNET_BORROWER_OPERATIONS:
    "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5",
  MEZO_HINT_HELPERS: "0xD267b3bE2514375A075fd03C3D9CBa6b95317DC3",
  MEZO_TESTNET_HINT_HELPERS: "0x000000000000000000",
  MEZO_SORTED_TROVES: "0x8C5DB4C62BF29c1C4564390d10c20a47E0b2749f",
  MEZO_TESTNET_SORTED_TROVES: "0x722E4D24FD6Ff8b0AC679450F3D91294607268fA",
  MEZO_POOL_FACTORY: "0x83FE469C636C4081b87bA5b3Ae9991c6Ed104248",
  MEZO_VOTER: "0x48233cCC97B87Ba93bCA212cbEe48e3210211f03",
  MEZO_BRIBE_VOTING_REWARD: "0x94A9A494872BF7231D8378d0Aef7d32BA552E305",
  MEZO_VE: "0x3D4b1b884A7a1E59fE8589a3296EC8f8cBB6f279",
};

export interface BridgeTokenDefinition {
  tokenSymbol: string;
  ethereumSymbol: string;
  mezoAddress: string;
  ethereumAddress: `0x${string}`;
}

export const BridgeTokens: BridgeTokenDefinition[] = [
  {
    tokenSymbol: "mcbBTC",
    ethereumSymbol: "cbBTC",
    mezoAddress: "0x6a7CD8E1384d49f502b4A4CE9aC9eb320835c5d7",
    ethereumAddress: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  },
  {
    tokenSymbol: "mDAI",
    ethereumSymbol: "DAI",
    mezoAddress: "0x1531b6e3d51BF80f634957dF81A990B92dA4b154",
    ethereumAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  },
  {
    tokenSymbol: "mFBTC",
    ethereumSymbol: "FBTC",
    mezoAddress: "0x812fcC0Bb8C207Fd8D6165a7a1173037F43B2dB8",
    ethereumAddress: "0xC96dE26018A54D51c097160568752c4E3BD6C364",
  },
  {
    tokenSymbol: "mSolvBTC",
    ethereumSymbol: "SolvBTC",
    mezoAddress: "0xa10aD2570ea7b93d19fDae6Bd7189fF4929Bc747",
    ethereumAddress: "0x7A56E1C57C7475CCf742a1832B028F0456652F97",
  },
  {
    tokenSymbol: "mswBTC",
    ethereumSymbol: "swBTC",
    mezoAddress: "0x29fA8F46CBB9562b87773c8f50a7F9F27178261c",
    ethereumAddress: "0x8DB2350D78aBc13f5673A411D4700BCF87864dDE",
  },
  {
    tokenSymbol: "mT",
    ethereumSymbol: "T",
    mezoAddress: "0xaaC423eDC4E3ee9ef81517e8093d52737165b71F",
    ethereumAddress: "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5",
  },
  {
    tokenSymbol: "mUSDC",
    ethereumSymbol: "USDC",
    mezoAddress: "0x04671C72Aab5AC02A03c1098314b1BB6B560c197",
    ethereumAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  {
    tokenSymbol: "mUSDe",
    ethereumSymbol: "USDe",
    mezoAddress: "0xdf6542260a9F768f07030E4895083F804241F4C4",
    ethereumAddress: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3",
  },
  {
    tokenSymbol: "mUSDT",
    ethereumSymbol: "USDT",
    mezoAddress: "0xeB5a5d39dE4Ea42C2Aa6A57EcA2894376683bB8E",
    ethereumAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  },
  {
    tokenSymbol: "mxSolvBTC",
    ethereumSymbol: "xSolvBTC",
    mezoAddress: "0xdF708431162Ba247dDaE362D2c919e0fbAfcf9DE",
    ethereumAddress: "0xd9D920AA40f578ab794426F5C90F6C731D159DEf",
  },
  {
    tokenSymbol: "BTC",
    ethereumSymbol: "tBTC",
    mezoAddress: "0x7b7C000000000000000000000000000000000000",
    ethereumAddress: "0x18084fbA666a33d37592fA2633fD49a74DD93a88",
  },
];
