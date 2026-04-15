alter table public.system_snapshots
  add column if not exists mezo_usd_price double precision null;

alter table public.system_metrics_daily
  add column if not exists mezo_usd_price double precision null;
