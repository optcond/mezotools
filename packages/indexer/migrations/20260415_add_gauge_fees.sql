alter table public.gauges
  add column if not exists fee text not null default '0x0000000000000000000000000000000000000000',
  add column if not exists fees jsonb not null default '[]'::jsonb;
