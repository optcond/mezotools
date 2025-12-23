# Mezo Tools

Monorepo for the Mezo chain tools. The workspace is managed with `pnpm` and contains the operational dashboard, the real-time RPC board, data indexer, redemption dApp, and a shared TypeScript toolkit so protocol logic stays consistent across packages.

## Getting Started

```bash
# install dependencies for every workspace
pnpm install

# run a package script (examples below)
pnpm --filter @mtools/dashboard dev
pnpm --filter @mtools/indexer build
```

Each package exposes its own scripts, but the root `pnpm` installation step only needs to happen once per clone.

## Packages

### `@mtools/dashboard`

- Vite + React single-page app that visualizes the MUSD protocol state (troves, liquidations, bridge balances, wallet health) pulled from Supabase.
- Offers operator tooling such as risk projections, quick redemption/bridge dialogs, and live monitoring powered by TanStack Query and Supabase subscriptions.
- Develop with `pnpm --filter @mtools/dashboard dev` and build via `pnpm --filter @mtools/dashboard build`. Preview the production bundle using `pnpm --filter @mtools/dashboard preview`.

### `@mtools/indexer`

- Backend cron that ingests on-chain Mezo data plus CowSwap pricing and persists it in Supabase so downstream tools always have fresh state.
- Handles trove snapshots, bridge balances, price feeds, liquidation/redemption history, and stores cursor metadata in `indexer_state`.
- Run continuously with `pnpm --filter @mtools/indexer dev`, ship compiled code through `pnpm --filter @mtools/indexer build && pnpm --filter @mtools/indexer start`, or containerize via the included `Dockerfile` + `Makefile`.

### `@mtools/redeemer`

- React + Vite dApp (with RainbowKit wallets) that lets operators simulate and submit MUSD redemptions, showing touched troves, estimated gas, and system safety checks.
- Also exposes a Node helper/CLI to run `RedemptionMaker` flows outside the browser for scripts or debugging.
- Start the web app with `pnpm --filter @mtools/redeemer web:dev`, build for production via `web:build`, and run CLI scripts with `dev`, `build`, or `start`. Requires `VITE_WALLETCONNECT_PROJECT_ID` (web) and `PK` (CLI) environment variables.

### `@mtools/shared`

- Central TypeScript toolkit that exports protocol constants, ABIs, fetchers, Supabase repositories, and execution helpers such as `RedemptionMaker`.
- Consumed by every other package to avoid duplicating business logic; extend this package first when protocol changes occur.
- Develop with `pnpm --filter @mtools/shared dev`, build via `pnpm --filter @mtools/shared build`, and run Vitest suites using `pnpm --filter @mtools/shared test`.

### `@mtools/rpcboard`

- Operations-oriented heads-up display that listens to Mezo RPC in real time (via viem) and surfaces trove stats, block updates, liquidations/redemptions, and redemption helper tooling directly in the browser.
- Reuses the shared `TroveFetcher`/`TroveFetcherWrapper`/`PriceFeedFetcher` logic and mirrors the redeemer’s `RedemptionMaker` so risk teams can monitor or simulate redemptions without wallet connectivity.
- Supports mainnet vs testnet toggles, manual RPC overrides, manual BTC price inputs, and live block/watchlist metrics that are recalculated client-side.
- Develop with `pnpm --filter @mtools/rpcboard dev`, build via `pnpm --filter @mtools/rpcboard build`, and run lint using `pnpm --filter @mtools/rpcboard lint`.

## Supabase + Environment Notes

- Dashboard uses publishable Supabase keys (`VITE_SUPABASE_URL[_DEV]` + `VITE_SUPABASE_PUBLISHABLE_KEY[_DEV]`) defined in its `.env`.
- Indexer requires service-role Supabase credentials plus Mezo/Ethereum RPC URLs and CowFi key. Optional knobs cover chunk sizes and polling cadence.
- Redeemer relies on Mezo Matsnet RPC via RainbowKit/wagmi plus the optional CLI `PK`.
- Shared package centralizes RPC endpoints and Supabase helpers so updates propagate to consumers automatically.

## Recommended Workflow

1. Install dependencies with `pnpm install`.
2. Populate Supabase (usually by running the indexer) so the dashboard has data.
3. Run `pnpm --filter <package> <script>` from the repo root to launch the dashboard, redeemer, or supporting tooling as needed.
4. Make protocol changes inside `@mtools/shared`, then rebuild dependent packages.
