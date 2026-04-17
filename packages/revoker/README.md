# Revoker

Backend indexer for wallet approval state. It scans Blockscout logs for:

- `Approval(address indexed owner, address indexed spender, uint256 value)`
- `ApprovalForAll(address indexed owner, address indexed operator, bool approved)`

The indexer intentionally scans all matching approval events, not only a curated
token list. It writes the latest known event state per
`chain-standard-token-owner-spender-tokenId` key into Supabase. During historical
backfill it scans from the latest safe block down to block zero; older logs do
not overwrite newer state.

`approvals_state` is an event-derived index, not a guarantee that an approval is
still active. Consumers must verify live state before showing revocable entries:

- ERC-20: show only when `allowance(owner, spender) > 0`.
- ERC-721 token approval: show only when `getApproved(tokenId) == spender`.
- ERC-721/ERC-1155 operator approval: show only when
  `isApprovedForAll(owner, operator) == true`.

If a live read reverts, for example because an NFT token no longer exists, the
entry should not be shown as active. Keep the indexed row for history/debugging;
hide it or mark it stale at the consumer/live-check layer.

## Tables

Apply:

```bash
packages/revoker/migrations/20260417_create_revoker_tables.sql
```

Main tables:

- `approvals_state` - latest known approval state.
- `indexer_checkpoints` - scan cursor and latest safe block processed.

## Environment

Copy [`.env.example`](./.env.example) and fill the values for the target
environment.

Required:

- `MEZO_RPC_URL`
- `SUPABASE_URL` or `SUPABASE_URL_DEV` for normal runs
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_ROLE_KEY_DEV` for normal runs

Supabase variables are not required for `-nodbrun`.

Optional:

- `ENVIRONMENT` - `dev` by default, set `prod` for production env keys.
- `REVOKER_BLOCKSCOUT_API_BASE_URL` - defaults to Mezo Blockscout classic API.
- `REVOKER_CHAIN_ID` - defaults to Mezo mainnet chain id.
- `REVOKER_BLOCK_RANGE_SIZE` - defaults to `1000`.
- `REVOKER_REQUEST_COOLDOWN_MS` - defaults to `500`.
- `REVOKER_REQUEST_TIMEOUT_MS` - defaults to `20000`.
- `REVOKER_CONFIRMATION_BLOCKS` - defaults to `10`.
- `REVOKER_MAX_RANGES_PER_RUN` - defaults to `50`.
- `REVOKER_UPSERT_BATCH_SIZE` - defaults to `500`.
- `REVOKER_DEV_HISTORY_BLOCK_LIMIT` - defaults to `200000`; dev runs only scan this many latest blocks.
- `REVOKER_INTERVAL_SECONDS` - docker entrypoint loop interval, defaults to `600`.

## Commands

```bash
pnpm --filter @mtools/revoker build
pnpm --filter @mtools/revoker start
pnpm --filter @mtools/revoker start:nodbrun
pnpm --filter @mtools/revoker dev:nodbrun
```

`-nodbrun` scans from block `0` to the current block in production mode. In dev
mode it scans only the latest `REVOKER_DEV_HISTORY_BLOCK_LIMIT` blocks. It keeps
only the latest approval state per key in memory, logs range-level progress, and
exits without reading or writing Supabase.
