# @mtools/shared

Shared is the TypeScript toolbox that every other package depends on. It centralizes Mezo-specific constants, smart-contract ABIs, Supabase helpers, CowFi adapters, and higher-level abstractions such as the `RedemptionMaker` so we can keep business logic in sync across the dashboard, indexer, liquidator, and redeemer.

## Exposed modules

- **Network + types** - `MezoChain`, token metadata, trove / bridge / Supabase row types, and ABI exports.
- **Fetchers** - `TroveFetcher`, `TroveFetcherWrapper`, `PriceFeedFetcher`, `BridgeAssetFetcher`, `CowFiFetcher`.
- **Supabase repository** - `createSupabase` and `SupabaseRepository` wrap inserts/updates for every table the indexer maintains.
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

The package uses Vitest. Suites currently cover the fetchers and Supabase repository helpers.

```bash
pnpm --filter @mtools/shared test
```

## Usage examples

```ts
import {
  MezoChain,
  TroveFetcher,
  PriceFeedFetcher,
  TroveFetcherWrapper,
  RedemptionMaker,
  createSupabase,
  SupabaseRepository,
} from "@mtools/shared";
import { createPublicClient, http } from "viem";

const client = createPublicClient({ chain: MezoChain, transport: http(MezoChain.rpcUrls.default.http[0]) });
const troveFetcher = new TroveFetcher(client);
const priceFeedFetcher = new PriceFeedFetcher(client, await troveFetcher.getPriceFeedAddress());
const fetcherWrapper = new TroveFetcherWrapper(troveFetcher, priceFeedFetcher);

const redemptionMaker = new RedemptionMaker(client, fetcherWrapper, /* wallet client */);

const supabase = createSupabase({ url: process.env.SUPABASE_URL!, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
const repository = new SupabaseRepository(supabase);
await repository.upsertTroves(await fetcherWrapper.getTrovesWithData(await fetcherWrapper.getBtcPrice()));
```

## Project layout

```
packages/shared
|-- src
|   |-- abi/                    # on-chain contract ABIs
|   |-- lib/
|   |   |-- bridgeAssetFetcher.ts
|   |   |-- cowFiFetcher.ts
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
