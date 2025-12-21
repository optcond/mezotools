# Mezo Redeemer

Mezo Redeemer is a React + Vite dApp that lets anyone simulate and submit mUSD redemptions against the Mezo Matsnet protocol. It wraps the on-chain helpers and redemption logic exposed by `@mtools/shared` with a focused interface that highlights system health, estimated gas usage, and the specific troves that will be touched by a redemption.

Wallet access is powered by [RainbowKit](https://www.rainbowkit.com/), so any WalletConnect-enabled or injected wallet can connect without extra setup.

## Features

- **End-to-end redemption flow** - fetch trove data, compute hints, simulate the outcome, and send the transaction without leaving the app.
- **Safety checks built in** - automatically blocks redemptions when Total Collateral Ratio (TCR) drops below 110% and surfaces recovery-mode status.
- **Wallet-agnostic connectivity** - leverage RainbowKit to let users connect with MetaMask, Rabby, or any WalletConnect-capable wallet through the modal.
- **Shared protocol tooling** - reuse the same `RedemptionMaker`, trove fetchers, and price feed helpers that other Mezo tooling relies on.

## Getting Started

```bash
# install workspace dependencies
pnpm install

# start the dev server for the redeemer package
pnpm --filter @mtools/redeemer web:dev
```

The app runs at http://localhost:5173 by default (see `vite.config.ts`). A connected wallet must already have the Mezo Matsnet RPC configured.

### Node helper (RedemptionMaker CLI)

The package also exposes a thin Node entry point that instantiates `RedemptionMaker` outside of the browser, which is handy for scripts or debugging.

```bash
# rebuild so dist/index.js exists
pnpm --filter @mtools/redeemer build

# watch mode for quick iteration
pnpm --filter @mtools/redeemer dev

# execute the compiled script once
pnpm --filter @mtools/redeemer start
```

Set the `PK` environment variable to the private key that should sign redemptions when using the Node helper.

### Production build

```bash
# bundle the web app into packages/redeemer/dist-web
pnpm --filter @mtools/redeemer web:build

# optional: preview the production build locally
pnpm --filter @mtools/redeemer web:preview
```

### Tests

```bash
pnpm --filter @mtools/redeemer test
```

## Environment variables

| Variable | Description |
| --- | --- |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect project id passed to `getDefaultConfig`. Defaults to `MezoRedeemerDemoId` for local tinkering, but production deployments should set a real id. |
| `PK` | Private key used by the Node helper (`src/index.ts`) when it connects with Viem's `createWalletClient`. Required if you plan to run CLI redemptions. |

## Project layout

```
packages/redeemer
|-- src
|   |-- app
|   |   |-- App.tsx          # redemption UI + logic
|   |   |-- main.tsx         # RainbowKit / wagmi providers
|   |   `-- styles.css
|   `-- index.ts             # Node helper that instantiates RedemptionMaker
|-- vite.config.ts
`-- package.json
```

`App.tsx` owns the redemption experience. It bootstraps trove + price feed fetchers, computes hints via `RedemptionMaker`, and displays simulation / transaction results. Wallet state comes from the RainbowKit `ConnectButton` and wagmi hooks exposed through `main.tsx`.

The `src/index.ts` entry-point is a thin Node helper that shows how to create a `RedemptionMaker` with a wallet client; you can import that file in other tooling or run it directly to debug the redemption pipeline outside of the browser.

## Configuration

Most protocol-specific configuration lives inside `@mtools/shared` (e.g., `MezoChain` RPC URLs, contract addresses, and fetcher implementations). If you need to point the app at a different chain or hint helper, update the shared package and re-run the redeemer.

RainbowKit handles wallet connectors. Set the WalletConnect project id via the `VITE_WALLETCONNECT_PROJECT_ID` environment variable and update `getDefaultConfig` inside `src/app/main.tsx` if you want to customize the list of supported wallets or chains.

For CLI usage, export `PK` before running `pnpm --filter @mtools/redeemer dev|start`. The account only needs redemption permissions on the Mezo chain; keep the key in a secure secrets manager in production.

## Contributing

1. Fork + clone the repo, then run `pnpm install`.
2. Make changes within `packages/redeemer`.
3. Run the relevant scripts (`web:dev`, `web:build`, `test`) to verify the changes.
4. Submit a pull request with a clear description of the fix or feature.

Ideas, bug reports, and contributions are all welcome - anything that makes redemptions on Mezo easier benefits the broader community.
