create table if not exists public.approvals_state (
  state_key text not null,
  chain_id integer not null,
  standard text not null,
  token_address text not null,
  owner_address text not null,
  spender_address text not null,
  token_id numeric null,
  approved_value numeric null,
  approved_bool boolean null,
  last_block_number bigint not null,
  last_log_index integer not null,
  last_tx_hash text not null,
  updated_at timestamp with time zone not null,
  constraint approvals_state_pkey primary key (state_key),
  constraint approvals_state_standard_check check (
    standard in ('erc20', 'erc721', 'erc1155', 'unknown')
  )
) tablespace pg_default;

create index if not exists approvals_state_owner_idx
  on public.approvals_state using btree (chain_id, owner_address)
  tablespace pg_default;

create index if not exists approvals_state_spender_idx
  on public.approvals_state using btree (chain_id, spender_address)
  tablespace pg_default;

create index if not exists approvals_state_token_idx
  on public.approvals_state using btree (chain_id, token_address)
  tablespace pg_default;

create index if not exists approvals_state_updated_idx
  on public.approvals_state using btree (updated_at desc)
  tablespace pg_default;

create table if not exists public.indexer_checkpoints (
  indexer_name text not null,
  last_indexed_block bigint not null,
  last_safe_block bigint not null,
  updated_at timestamp with time zone not null,
  constraint indexer_checkpoints_pkey primary key (indexer_name)
) tablespace pg_default;
