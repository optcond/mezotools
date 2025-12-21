# @mtools/dashboard

The dashboard is a Vite + React single-page app that tracks Mezo's mUSD protocol health. It visualizes the data that the indexer writes into Supabase (current troves, liquidations, redemptions, price-feed trends, bridge balances, and wallet-level stats) while giving operators quick actions such as opening the redeemer or debt calculator from the same surface.

## Highlights

- **Real-time monitor** - `useMonitorData` aggregates every Supabase table the indexer maintains and refreshes it minute-by-minute with TanStack Query.
- **Risk + execution tooling** - see TCR projections, watch risky troves, drill into wallet health, and launch redemption or bridge dialogs without leaving the page.
- **Supabase-first architecture** - all reads flow through the generated Supabase client so the dashboard stays in sync with whatever schema the backend enforces.
- **Shadcn UI + Tailwind** - composable UI primitives and theme tokens keep the glassmorphism look consistent across sections.

## Getting started

```bash
# install workspace deps from the repo root
pnpm install

# run the dev server
pnpm --filter @mtools/dashboard dev
```

The local dev server runs at http://localhost:5173. Make sure the Supabase instance already contains data (usually by running the indexer) so charts and tables populate.

### Build, preview, and lint

```bash
pnpm --filter @mtools/dashboard build        # production bundle
pnpm --filter @mtools/dashboard preview      # serve dist/ locally
pnpm --filter @mtools/dashboard lint         # eslint + tsconfig paths
```

## Environment variables

| Name | Description |
| --- | --- |
| `VITE_SUPABASE_URL_DEV` | URL of the Supabase project queried in development mode. |
| `VITE_SUPABASE_PUBLISHABLE_KEY_DEV` | Anonymous key for the dev project. |
| `VITE_SUPABASE_URL` | URL for the production Supabase project. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anonymous key for production. |

All variables are consumed inside `src/integrations/supabase/client.ts`. The client picks the `DEV` pair whenever `import.meta.env.DEV` is true.

## Data flow

```
Supabase tables
  -> troves, liquidations, redemptions, bridge_assets, system_metrics_daily,
     indexer_state
      |
      v
useMonitorData hook (TanStack Query + typed Supabase client)
      |
      v
Lazily loaded sections (SystemState, RiskAnalysis, LatestActivity, AllTroves, etc.)
```

If a table is empty the respective section renders skeleton placeholders plus a retry button that simply re-runs the hook.

## Project layout

```
packages/dashboard
|-- src
|   |-- components        # cards, dialogs, charts, shadcn wrappers
|   |-- hooks             # data (useMonitorData) + wallet wiring
|   |-- integrations      # generated Supabase client + types
|   `-- pages             # router entry points (Index, Contacts, NotFound)
|-- public                # favicon + og meta
`-- vite.config.ts
```

Styling is handled by Tailwind (`src/index.css`) and glass-card utility classes. React Router controls page-level navigation though most users stay on the `/` route.
