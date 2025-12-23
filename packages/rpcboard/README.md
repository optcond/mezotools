# @mtools/rpcboard

`@mtools/rpcboard` is a Vite + React control room that connects directly to the Mezo RPC (mainnet or testnet) to visualize the latest trove data, block activity, and protocol events without depending on Supabase. It reuses the shared viem fetchers (`TroveFetcher`, `TroveFetcherWrapper`, `PriceFeedFetcher`) so its view of the world matches the rest of the toolkit, and it exposes lightweight redemption helpers powered by the shared `RedemptionMaker`.

## Highlights

- **Live RPC telemetry** – subscribes to new blocks via viem, recomputes trove metrics client-side, and keeps activity panels in sync by replaying liquidation/redemption events directly from the chain.
- **Network aware** – built-in toggle + RPC override fields let operators jump between testnet and mainnet endpoints. Each network tracks its own RPC history and automatically reconnects with exponential backoff.
- **Protocol tooling** – embeds the shared redemption helper so anyone can compute hints/simulations for a given amount, even without a connected wallet (gas estimates require a read-only account address).
- **Shadcn UI** – shares the same design tokens and components as the dashboard/redeemer for consistency (Tailwind + shadcn + Lucide icons).

## Getting started

```bash
# install workspace deps from the repo root
pnpm install

# start the Vite dev server
pnpm --filter @mtools/rpcboard dev
```

The dev server runs at http://localhost:5173 by default. Configure `VITE_MEZO_PROVIDER_URL` and `VITE_SEED_PHRASE` if you prefer environment variables over the in-app settings panel; otherwise, use the header settings to point at any WebSocket/HTTP RPC.

### Build, preview, and lint

```bash
pnpm --filter @mtools/rpcboard build     # production bundle
pnpm --filter @mtools/rpcboard preview   # serve dist/ locally
pnpm --filter @mtools/rpcboard lint      # eslint + type checks
```

## Key features

- Realtime trove table with watchlists, CSV export, client-side risk metrics, and manual BTC price override.
- Activity panel showing the latest 50 liquidations/redemptions (10k block window) fetched directly from the shared fetchers.
- Risk analysis card plus embedded redemption helper panel for hint generation + gas simulations using shared `RedemptionMaker`.
- Network-aware settings that reset state whenever RPCs/networks change, ensuring data doesn’t leak across environments.

## Project layout

```
packages/rpcboard
|-- src
|   |-- components        # dashboard sections, shadcn wrappers
|   |-- hooks             # viem communicator + utilities
|   |-- pages             # router entry points (Dashboard)
|   `-- stores            # Zustand store for RPC + metrics
|-- public                # favicon/index.html assets
`-- vite.config.ts
```

Extend the shared `@mtools/shared` package first when protocol-level changes occur; the RPC board consumes those helpers directly, so new contracts or fetcher logic should land there before touching this package.
