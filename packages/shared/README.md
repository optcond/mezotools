# @mtools/shared

Shared is the TypeScript toolbox that every other package depends on. It centralizes Mezo-specific constants, smart-contract ABIs, Supabase helpers, CowFi adapters, and higher-level abstractions such as the `RedemptionMaker` so we can keep business logic in sync across the dashboard, indexer, liquidator, and redeemer.

## Exposed modules

- **Network + types** - `MezoChain`, `MezoChainTestnet`, token metadata (`MezoTokens`, `EthTokens`), trove / bridge / Supabase row types, and ABI exports.
- **Fetchers** - `TroveFetcher`, `TroveFetcherWrapper`, `PriceFeedFetcher`, `BridgeAssetFetcher`, `BridgeChecker`, `BlockFetcher`, `CowFiFetcher`, `GaugesFetcher`.
- **Supabase repository** - `createSupabase` and `SupabaseRepository` wrap inserts/updates for every table the indexer maintains, including bridge transfers and gauge state.
- **Execution helpers** - `RedemptionMaker` computes redemption hints, simulations, and transactions using the fetchers above.

Everything is re-exported through `src/index.ts`, so consumers can simply import from `@mtools/shared`.

## Developing locally

```bash
# install workspace dependencies at the repo root
pnpm install

# run the TypeScript entry point with tsx
pnpm --filter @mtools/shared dev

# or build the package
pnpm --filter @mtools/shared build
```

### Tests

The package uses Vitest. Suites currently cover the fetchers and Supabase repository helpers. Most tests are integration-style and expect working RPC/Supabase credentials.

```bash
pnpm --filter @mtools/shared test
```

## Usage examples

Below are focused examples you can mix and match. The imports can be shared; each block is otherwise self-contained.

### 1) Setup clients + fetcher wrapper

```ts
import {
  BridgeAssetFetcher,
  BridgeChecker,
  CowFiFetcher,
  GaugesFetcher,
  MezoChain,
  MezoTokens,
  TroveFetcher,
  PriceFeedFetcher,
  TroveFetcherWrapper,
  RedemptionMaker,
  createSupabase,
  SupabaseRepository,
} from "@mtools/shared";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { TradingSdk } from "@cowprotocol/sdk-trading";
import { ViemAdapter } from "@cowprotocol/sdk-viem-adapter";
import { privateKeyToAccount } from "viem/accounts";
import { SupportedChainId } from "@cowprotocol/cow-sdk";

const client = createPublicClient({
  chain: MezoChain,
  transport: http(MezoChain.rpcUrls.default.http[0]),
});
const ethClient = createPublicClient({ chain: mainnet, transport: http() });

const troveFetcher = new TroveFetcher(client);
const priceFeedFetcher = new PriceFeedFetcher(
  client,
  await troveFetcher.getPriceFeedAddress()
);
const fetcherWrapper = new TroveFetcherWrapper(troveFetcher, priceFeedFetcher);
```

### 2) Troves + snapshots

```ts
const supabase = createSupabase({
  url: process.env.SUPABASE_URL!,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
});
const repository = new SupabaseRepository(supabase);

const btcPrice = await fetcherWrapper.getBtcPrice();
const troves = await fetcherWrapper.getTrovesWithData(btcPrice);
await repository.upsertTroves(troves);
```

### 3) Bridge assets (Ethereum side)

```ts
const bridgeAssetFetcher = new BridgeAssetFetcher(ethClient);
const bridgeAssets = await bridgeAssetFetcher.fetchAssets();
await repository.upsertBridgeAssets(bridgeAssets);
```

### 4) Bridge transfers (Mezo side)

```ts
const bridgeChecker = new BridgeChecker(client);
const currentBlock = await client.getBlockNumber();
const transfers = await bridgeChecker.getBridgeTransfersInRange({
  fromBlock: currentBlock - 100n,
  toBlock: currentBlock,
});
await repository.upsertBridgeTransfers(transfers);
```

### 5) Gauges

```ts
const gaugesFetcher = new GaugesFetcher(client);
const incentives = await gaugesFetcher.fetchGaugeIncentives({
  probeAdjacentEpochs: true,
});
const totalVotes = await gaugesFetcher.getTotalVotingPower();
const totalVeSupply = await gaugesFetcher.getTotalVeSupply();
```

### 6) CowFi (Ethereum side)

```ts
const account = privateKeyToAccount(process.env.COW_FI_PK as `0x${string}`);
const adapter = new ViemAdapter({ provider: ethClient, signer: account });
const cowFiTradingSDK = new TradingSdk(
  { appCode: "mezo-tools", chainId: SupportedChainId.MAINNET },
  {},
  adapter
);
const cowFi = new CowFiFetcher(cowFiTradingSDK);
const musdToUsdcQuote = await cowFi.getMUSDSellQuote();
```

### 7) Redemption maker

```ts
const redemptionMaker = new RedemptionMaker(
  client,
  fetcherWrapper,
  /* wallet client */
);
const btcTokenAddress = MezoTokens.BTC.address;
console.log({ btcTokenAddress });
```

## Project layout

```
packages/shared
|-- src
|   |-- abi/                    # on-chain contract ABIs
|   |-- lib/
|   |   |-- bridgeAssetFetcher.ts
|   |   |-- bridgeChecker.ts
|   |   |-- blockFetcher.ts
|   |   |-- cowFiFetcher.ts
|   |   |-- gaugesFetcher.ts
|   |   |-- priceFeedFetcher.ts
|   |   |-- redemptionMaker.ts
|   |   |-- supabase.ts
|   |   |-- troveFetcher.ts
|   |   `-- troveFetcherWrapper.ts
|   |-- supabase.types.ts
|   |-- trove.types.ts
|   `-- types.ts
`-- tsconfig.json
```

When you add new protocol helpers (e.g., another fetcher or ABI) export them via `src/index.ts` so downstream packages pick them up automatically. Keep tests beside the implementation to make it easy for consumers to understand expected behavior.
