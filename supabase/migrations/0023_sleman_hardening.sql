-- IT Ticketing — Sleman H-1 schedule reminder deduplication table

create table if not exists public.schedule_reminder_deliveries (
  site_id uuid not null references public.sites(id) on delete cascade,
  tanggal date not null,
  it_id uuid not null references public.users(id) on delete cascade,
  ticket_count integer not null default 0,
  sent_at timestamptz not null default now(),
  primary key (site_id, tanggal, it_id)
);

alter table public.schedule_reminder_deliveries enable row level security;
revoke all on public.schedule_reminder_deliveries from public, anon, authenticated;
grant all on public.schedule_reminder_deliveries to service_role;
