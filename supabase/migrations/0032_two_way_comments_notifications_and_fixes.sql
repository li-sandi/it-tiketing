-- 0032: Two-way ticket comments, public/internal wiki scoping, in-app notifications,
-- SLA procurement restore, remote credential update RLS, ticket asset indexes,
-- ticket_events policy harmonization, and Realtime publication setup.
-- Strictly additive migration (zero destructive removal statements).

-- 1. Two-way ticket discussion comments (public replies vs internal IT notes)
create table if not exists public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  aktor_id uuid references public.users(id) on delete set null,
  penulis_nama text not null check (char_length(btrim(penulis_nama)) between 1 and 120),
  penulis_peran text not null check (penulis_peran in ('user', 'it', 'admin', 'ga', 'pelapor')),
  is_internal boolean not null default false,
  isi text not null check (char_length(btrim(isi)) between 1 and 5000),
  dibuat_pada timestamptz not null default now()
);

create index if not exists idx_ticket_comments_ticket_time
  on public.ticket_comments (ticket_id, dibuat_pada asc);

alter table public.ticket_comments enable row level security;

revoke all on public.ticket_comments from public, anon;
grant select, insert on public.ticket_comments to authenticated;
grant all on public.ticket_comments to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ticket_comments'
      and policyname = 'Users and staff can read accessible ticket comments'
  ) then
    create policy "Users and staff can read accessible ticket comments"
      on public.ticket_comments
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.tickets t
          where t.id = ticket_comments.ticket_id
            and (
              (select public.current_app_role()) in ('it', 'admin')
              or (
                not ticket_comments.is_internal
                and (
                  t.pembuat_id = (select auth.uid())
                  or (
                    (select public.current_app_role()) = 'ga'
                    and t.approval_status <> 'tidak_perlu'
                  )
                )
              )
            )
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ticket_comments'
      and policyname = 'Users and staff can insert ticket comments'
  ) then
    create policy "Users and staff can insert ticket comments"
      on public.ticket_comments
      for insert
      to authenticated
      with check (
        aktor_id = (select auth.uid())
        and penulis_peran = (select public.current_app_role())
        and (
          (select public.current_app_role()) in ('it', 'admin')
          or (
            not is_internal
            and exists (
              select 1
              from public.tickets t
              where t.id = ticket_comments.ticket_id
                and (
                  t.pembuat_id = (select auth.uid())
                  or (
                    (select public.current_app_role()) = 'ga'
                    and t.approval_status <> 'tidak_perlu'
                  )
                )
            )
          )
        )
      );
  end if;
end $$;

-- 2. Knowledge articles internal flag + strict RLS scoping
alter table public.knowledge_articles
  add column if not exists is_internal boolean not null default false;

create index if not exists idx_knowledge_articles_public_status
  on public.knowledge_articles (status, is_internal, diperbarui_pada desc);

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'knowledge_articles'
      and policyname = 'Authenticated read published wiki and staff read all'
  ) then
    alter policy "Authenticated read published wiki and staff read all"
      on public.knowledge_articles
      using (
        (status = 'published' and not is_internal)
        or (select public.current_app_role()) in ('it', 'admin')
      );
  else
    create policy "Authenticated read published wiki and staff read all"
      on public.knowledge_articles
      for select
      to authenticated
      using (
        (status = 'published' and not is_internal)
        or (select public.current_app_role()) in ('it', 'admin')
      );
  end if;
end $$;

-- 3. In-app notifications table + strict owner-only RLS
create table if not exists public.in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete cascade,
  jenis text not null check (char_length(btrim(jenis)) between 2 and 60),
  judul text not null check (char_length(btrim(judul)) between 1 and 200),
  pesan text not null check (char_length(btrim(pesan)) between 1 and 1000),
  tautan text,
  dibaca boolean not null default false,
  dibaca_pada timestamptz,
  dibuat_pada timestamptz not null default now()
);

create index if not exists idx_in_app_notifications_user_unread
  on public.in_app_notifications (user_id, dibaca, dibuat_pada desc);

alter table public.in_app_notifications enable row level security;

revoke all on public.in_app_notifications from public, anon;
grant select on public.in_app_notifications to authenticated;
grant update (dibaca, dibaca_pada) on public.in_app_notifications to authenticated;
grant all on public.in_app_notifications to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'in_app_notifications'
      and policyname = 'Users can read own notifications'
  ) then
    create policy "Users can read own notifications"
      on public.in_app_notifications
      for select
      to authenticated
      using (user_id = (select auth.uid()));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'in_app_notifications'
      and policyname = 'Users can mark own notifications read'
  ) then
    create policy "Users can mark own notifications read"
      on public.in_app_notifications
      for update
      to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

-- 4. Update handle_sla_pause() to handle menunggu_pengadaan -> baru SLA reset
--    and robust menunggu_user -> diproses resume
create or replace function public.handle_sla_pause()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  paused_secs integer;
  menit_respon integer;
  menit_resolusi integer;
begin
  if new.status is distinct from old.status then
    if new.status in ('menunggu_user', 'menunggu_pengadaan', 'dijadwalkan_kunjungan')
       and old.status = 'diproses' then
      new.sla_paused_at := pg_catalog.now();
    elsif new.status = 'diproses'
          and old.status in ('menunggu_user', 'menunggu_pengadaan', 'dijadwalkan_kunjungan') then
      if old.sla_paused_at is not null then
        paused_secs := pg_catalog.greatest(
          0,
          extract(epoch from (pg_catalog.now() - old.sla_paused_at))::integer
        );
        new.sla_total_paused_seconds := coalesce(old.sla_total_paused_seconds, 0) + paused_secs;
        if old.sla_resolusi_batas is not null then
          new.sla_resolusi_batas := old.sla_resolusi_batas + pg_catalog.make_interval(secs => paused_secs);
        end if;
      end if;
      new.sla_paused_at := null;
    elsif new.status = 'baru'
          and old.status = 'menunggu_pengadaan' then
      if old.sla_paused_at is not null then
        paused_secs := pg_catalog.greatest(
          0,
          extract(epoch from (pg_catalog.now() - old.sla_paused_at))::integer
        );
        new.sla_total_paused_seconds := coalesce(old.sla_total_paused_seconds, 0) + paused_secs;
      end if;
      new.sla_paused_at := null;

      case new.prioritas
        when 'P0' then menit_respon := 5;   menit_resolusi := 30;
        when 'P1' then menit_respon := 15;  menit_resolusi := 120;
        when 'P2' then menit_respon := 30;  menit_resolusi := 240;
        when 'P3' then menit_respon := 120; menit_resolusi := 1440;
        else
          menit_respon := 120;
          menit_resolusi := 1440;
      end case;

      new.sla_respon_batas :=
        pg_catalog.now() + pg_catalog.make_interval(mins => menit_respon);

      if new.prioritas = 'P3' then
        new.sla_resolusi_batas := public.add_working_days_wib(pg_catalog.now(), 1);
      else
        new.sla_resolusi_batas :=
          pg_catalog.now() + pg_catalog.make_interval(mins => menit_resolusi);
      end if;
    elsif new.status in ('selesai', 'ditutup') and old.sla_paused_at is not null then
      paused_secs := pg_catalog.greatest(
        0,
        extract(epoch from (pg_catalog.now() - old.sla_paused_at))::integer
      );
      new.sla_total_paused_seconds := coalesce(old.sla_total_paused_seconds, 0) + paused_secs;
      new.sla_paused_at := null;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.handle_sla_pause()
  from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_handle_sla_pause'
      and tgrelid = 'public.tickets'::regclass
  ) then
    create trigger trg_handle_sla_pause
      before update of status on public.tickets
      for each row execute function public.handle_sla_pause();
  end if;
end $$;

-- 5. remote_credentials privilege hardening + owner SELECT/UPDATE RLS
revoke all on public.remote_credentials from public, anon;
revoke update on public.remote_credentials from authenticated;
grant update (remote_id, password_terenkripsi, kedaluwarsa_pada)
  on public.remote_credentials to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'remote_credentials'
      and policyname = 'Ticket owners can read own remote credential metadata'
  ) then
    create policy "Ticket owners can read own remote credential metadata"
      on public.remote_credentials
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.tickets t
          where t.id = remote_credentials.ticket_id
            and t.pembuat_id = (select auth.uid())
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'remote_credentials'
      and policyname = 'Ticket owners can update own remote credentials'
  ) then
    create policy "Ticket owners can update own remote credentials"
      on public.remote_credentials
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.tickets t
          where t.id = remote_credentials.ticket_id
            and t.pembuat_id = (select auth.uid())
            and t.status not in ('selesai', 'ditutup')
        )
      )
      with check (
        exists (
          select 1
          from public.tickets t
          where t.id = remote_credentials.ticket_id
            and t.pembuat_id = (select auth.uid())
            and t.status not in ('selesai', 'ditutup')
        )
      );
  end if;
end $$;

-- 6. Ticket asset lookup indexes for Asset Service History
create index if not exists idx_tickets_asset_id
  on public.tickets (asset_id)
  where asset_id is not null;

create index if not exists idx_tickets_nomor_aset_lower
  on public.tickets (lower(nomor_aset))
  where nomor_aset is not null;

-- 7. Harmonize 0019 vs 0024 ticket_events policy across live DB and fresh replays
do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ticket_events'
      and policyname = 'Users and staff can read accessible ticket events'
  ) then
    alter policy "Users and staff can read accessible ticket events"
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
  elsif exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ticket_events'
      and policyname = 'Users can read events for accessible tickets'
  ) then
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
  else
    create policy "Users and staff can read accessible ticket events"
      on public.ticket_events
      for select
      to authenticated
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
  end if;
end $$;

-- 8. Idempotently add tables to supabase_realtime publication
do $$
declare
  tbl text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach tbl in array array['tickets', 'ticket_comments', 'in_app_notifications']
    loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = tbl
      ) then
        execute format('alter publication supabase_realtime add table public.%I', tbl);
      end if;
    end loop;
  end if;
end $$;
