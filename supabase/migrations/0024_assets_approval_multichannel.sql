-- IT Ticketing — Assets inventory, GA approval workflow, and multi-channel notifications

-- 1. Assets inventory table
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  nomor_aset text unique not null check (char_length(btrim(nomor_aset)) between 2 and 120),
  nama_perangkat text not null check (char_length(btrim(nama_perangkat)) between 2 and 200),
  tipe text not null check (tipe in ('laptop', 'pc', 'hp', 'printer', 'jaringan', 'lainnya')) default 'laptop',
  spesifikasi jsonb not null default '{}'::jsonb,
  ram_gb integer check (ram_gb is null or ram_gb between 1 and 1024),
  site_id uuid references public.sites(id) on delete set null,
  pemegang_nama text,
  pemegang_user_id uuid references public.users(id) on delete set null,
  anydesk_id text,
  uv_id text,
  status text not null check (status in ('aktif', 'perbaikan', 'nonaktif')) default 'aktif',
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);

create index if not exists idx_assets_site_status on public.assets (site_id, status);

alter table public.assets enable row level security;
revoke all on public.assets from public, anon;
grant select, insert, update, delete on public.assets to authenticated;
grant all on public.assets to service_role;

create policy "Authenticated users can read active or owned assets"
on public.assets for select to authenticated
using (
  (select public.current_app_role()) in ('it', 'admin', 'ga')
  or pemegang_user_id = (select auth.uid())
);

create policy "IT, Admin, and GA can manage assets"
on public.assets for all to authenticated
using ((select public.current_app_role()) in ('it', 'admin', 'ga'))
with check ((select public.current_app_role()) in ('it', 'admin', 'ga'));

-- 2. Ticket asset link, RAM upgrade recommendation, and GA approval columns
alter table public.tickets
  add column if not exists asset_id uuid references public.assets(id) on delete set null,
  add column if not exists rekomendasi_upgrade_ram boolean not null default false,
  add column if not exists approval_status text not null default 'tidak_perlu',
  add column if not exists approval_oleh uuid references public.users(id) on delete set null,
  add column if not exists approval_pada timestamptz,
  add column if not exists approval_catatan text;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.tickets'::regclass
      and conname = 'tickets_approval_status_check'
  ) then
    alter table public.tickets
      add constraint tickets_approval_status_check
      check (approval_status in ('tidak_perlu', 'menunggu', 'disetujui', 'ditolak'));
  end if;
end;
$$;

grant insert (rekomendasi_upgrade_ram) on public.tickets to authenticated;

-- Allow GA to read tickets requiring approval (and their events)
alter policy "Users can read own tickets and staff can read all"
on public.tickets
using (
  pembuat_id = (select auth.uid())
  or (select public.current_app_role()) in ('it', 'admin')
  or (
    (select public.current_app_role()) = 'ga'
    and approval_status <> 'tidak_perlu'
  )
);

alter policy "Users can read events for accessible tickets"
on public.ticket_events
using (
  exists (
    select 1
    from public.tickets
    where tickets.id = ticket_events.ticket_id
      and (
        tickets.pembuat_id = (select auth.uid())
        or (select public.current_app_role()) in ('it', 'admin')
        or (
          (select public.current_app_role()) = 'ga'
          and tickets.approval_status <> 'tidak_perlu'
        )
      )
  )
);

-- Initialize asset_id and approval_status on insert
create or replace function public.init_ticket_asset_and_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_asset_id uuid;
  cat_needs_approval boolean := false;
begin
  if new.nomor_aset is not null and pg_catalog.btrim(new.nomor_aset) <> '' then
    select id into matched_asset_id
    from public.assets
    where lower(nomor_aset) = lower(pg_catalog.btrim(new.nomor_aset))
    limit 1;
    if matched_asset_id is not null then
      new.asset_id := matched_asset_id;
    end if;
  end if;

  select coalesce(butuh_approval, false)
  into cat_needs_approval
  from public.categories
  where id = new.category_id;

  if cat_needs_approval or coalesce(new.rekomendasi_upgrade_ram, false) then
    new.approval_status := 'menunggu';
  else
    new.approval_status := 'tidak_perlu';
  end if;

  return new;
end;
$$;

revoke all on function public.init_ticket_asset_and_approval()
  from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.tickets'::regclass
      and tgname = 'trg_init_ticket_asset_and_approval'
  ) then
    create trigger trg_init_ticket_asset_and_approval
    before insert on public.tickets
    for each row execute function public.init_ticket_asset_and_approval();
  end if;
end;
$$;

-- 3. Browser Push Subscriptions & Multi-channel Notification Logs
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon;
grant select, insert, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

create policy "Users manage own push subscriptions"
on public.push_subscriptions for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.tickets(id) on delete cascade,
  channel text not null check (channel in ('telegram', 'email', 'web_push')),
  notification_type text not null,
  recipient text not null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_logs_ticket
  on public.notification_logs (ticket_id, created_at desc);

alter table public.notification_logs enable row level security;
revoke all on public.notification_logs from public, anon;
grant select on public.notification_logs to authenticated;
grant all on public.notification_logs to service_role;

create policy "Staff can read notification logs"
on public.notification_logs for select to authenticated
using ((select public.current_app_role()) in ('it', 'admin'));
