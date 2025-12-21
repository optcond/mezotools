# @mtools/indexer

The indexer is the backend cron that keeps Supabase in sync with on-chain Mezo state and CowSwap pricing. Every run pulls the latest troves, bridge balances, liquidations, redemptions, and price feed snapshots, then persists that data so the dashboard and other tools stay current.

## Responsibilities

- **State ingestion** - connects to Mezo RPC (WebSocket or HTTP) plus Ethereum mainnet to fetch trove data, Bridge assets, and block numbers.
- **Risk + history data** - snapshots system metrics, 4h averages, and BTC price feeds for charting.
- **Activity tracking** - stores the most recent liquidations and redemptions (including CowFi swap quotes) and tracks the last processed block inside `indexer_state`.
- **Shared tooling** - reuses the fetchers, adapters, and Supabase repository exported from `@mtools/shared`, so all protocol constants live in one place.

## Quick start

```bash
# install dependencies from the repo root
pnpm install

# run an uncompiled watch build (uses tsx)
pnpm --filter @mtools/indexer dev

# or build + execute the compiled output
pnpm --filter @mtools/indexer build
pnpm --filter @mtools/indexer start
```

### Available scripts

| Command | Description |
| --- | --- |
| `pnpm --filter @mtools/indexer dev` | Run `src/index.ts` with `tsx watch` and reload on changes. |
| `pnpm --filter @mtools/indexer build` | Type-check and emit `dist/` via `tsc`. |
| `pnpm --filter @mtools/indexer start` | Execute the compiled `dist/index.js` once (suitable for cron). |
| `pnpm --filter @mtools/indexer test` | Run Vitest suites for the shared helpers. |

## Environment variables

All values are parsed in `src/config.ts`.

| Variable | Required | Description |
| --- | --- | --- |
| `ENVIRONMENT` | No (defaults to `dev`) | `dev` uses the `_DEV` Supabase credentials; `prod` uses the production pair. |
| `MEZO_RPC_URL` | Yes | RPC endpoint for the Mezo chain. Supports `http(s)` and `wss`. |
| `MEZO_RPC_TYPE` | No | `http` (default) or `websocket`. |
| `ETHEREUM_RPC_URL` | Yes | Ethereum mainnet RPC (used for CowSwap + bridge asset lookups). |
| `ETHEREUM_RPC_TYPE` | No | `http` (default) or `websocket`. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Yes (prod) | URL + service role key for the production project. |
| `SUPABASE_URL_DEV`, `SUPABASE_SERVICE_ROLE_KEY_DEV` | Yes (dev) | URL + service role key for the dev project. Falls back to `SUPABASE_SERVICE_KEY` if the role key is missing. |
| `COW_FI_PK` | Yes | Private key used to authenticate with the CowFi trading SDK. |
| `LIQUIDATION_CHUNK_SIZE` | No | Batch size when backfilling historic liquidations (default `1000`). |
| `REDEMPTION_CHUNK_SIZE` | No | Batch size when backfilling historic redemptions (default `1000`). |
| `INDEXER_INTERVAL_SECONDS` | No | Only used by the Docker entrypoint loop; sleeps this many seconds between runs (default `60`). |

Only service-role keys can insert into Supabase, so do **not** use publishable keys here.

## Docker + Make targets

The package ships with a multi-stage Dockerfile and a helper Makefile:

```bash
cd packages/indexer
make build IMAGE_NAME=mezo-indexer IMAGE_TAG=latest
ENV_FILE=.env make run IMAGE_NAME=mezo-indexer
```

- `Dockerfile` installs just the indexer + shared workspaces and runs `pnpm --filter @mtools/indexer start` inside `docker/entrypoint.sh`.
- `INDEXER_INTERVAL_SECONDS` controls how often the entrypoint relaunches the process.

## Data written to Supabase

- `troves`, `liquidations`, `redemptions`
- `bridge_assets`
- `system_metrics_daily` + intra-day snapshots (used for price charts and wallet stats)
- `price_feeds`
- `indexer_state` (stores the latest processed block)

Each run also calculates swap quotes by calling the CowFi SDK so the dashboard can convert mUSD -> USDC in real time.

## Project layout

```
packages/indexer
|-- src
|   |-- config.ts     # env parsing + validation
|   |-- index.ts      # process bootstrap + lifecycle handling
|   `-- indexer.ts    # main orchestration + Supabase writes
|-- docker            # entrypoint script used by the container
|-- Makefile          # build/run/push helpers
`-- tsconfig.json
```

`Indexer.createFromEnv` wires up all dependencies (Supabase repository, fetchers, CowFi SDK, Viem clients). Extend `Indexer.run` if you need to track additional data; the shared helpers already expose the contracts and types you need.
