create table public.bridge_assets (
  token_symbol text not null,
  token_name text not null,
  ethereum_symbol text not null,
  mezo_address text not null,
  ethereum_address text not null,
  bridge_address text not null,
  balance_raw text not null,
  balance_formatted text not null,
  decimals integer not null,
  updated_at timestamp with time zone not null,
  constraint bridge_assets_pkey primary key (token_symbol)
) TABLESPACE pg_default;

create table public.indexer_state (
  key text not null,
  block_number bigint not null,
  updated_at timestamp with time zone not null,
  constraint indexer_state_pkey primary key (key)
) TABLESPACE pg_default;

create table public.liquidations (
  id text not null,
  borrower text not null,
  debt double precision not null,
  collateral double precision not null,
  operation integer not null,
  tx_hash text not null,
  block_number bigint not null,
  log_index integer not null,
  block_timestamp timestamp with time zone not null,
  tx_status text not null,
  constraint liquidations_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists liquidations_block_idx on public.liquidations using btree (block_number desc, log_index desc) TABLESPACE pg_default;

create table public.price_feeds (
  id text not null,
  price double precision not null,
  source text not null,
  block_number bigint not null,
  recorded_at timestamp with time zone not null,
  constraint price_feeds_pkey primary key (id)
) TABLESPACE pg_default;

create table public.redemptions (
  id text not null,
  attempted_amount double precision not null,
  actual_amount double precision not null,
  collateral_sent double precision not null,
  collateral_fee double precision not null,
  tx_hash text not null,
  block_number bigint not null,
  log_index integer not null,
  block_timestamp timestamp with time zone not null,
  tx_status text not null,
  affected_borrowers jsonb null,
  constraint redemptions_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists redemptions_block_idx on public.redemptions using btree (block_number desc, log_index desc) TABLESPACE pg_default;

create table public.system_metrics_daily (
  day date not null,
  trove_count integer not null,
  collateral double precision not null,
  debt double precision not null,
  tcr double precision not null,
  btc_price double precision not null,
  updated_at timestamp with time zone not null,
  constraint system_metrics_daily_pkey primary key (day)
) TABLESPACE pg_default;

create index IF not exists system_metrics_daily_day_idx on public.system_metrics_daily using btree (day desc) TABLESPACE pg_default;

create table public.system_snapshots (
  id text not null,
  collateral double precision not null,
  debt double precision not null,
  tcr double precision not null,
  btc_price double precision not null,
  recorded_at timestamp with time zone not null,
  musd_to_usdc_price double precision null,
  constraint system_snapshots_pkey primary key (id)
) TABLESPACE pg_default;

create table public.troves (
  owner text not null,
  collateral double precision not null,
  principal_debt double precision not null,
  interest double precision not null,
  collaterization_ratio double precision not null,
  updated_at timestamp with time zone not null,
  constraint troves_pkey primary key (owner)
) TABLESPACE pg_default;