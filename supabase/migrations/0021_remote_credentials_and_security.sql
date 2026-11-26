-- IT Ticketing — Remote credentials encryption support, remote photo scoping, audit log, & manual IT status

-- 1. Restrict attachment jenis values
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.attachments'::regclass
      and conname = 'attachments_jenis_check'
  ) then
    alter table public.attachments
      add constraint attachments_jenis_check
      check (jenis is null or jenis in ('foto', 'foto_remote'));
  end if;
end;
$$;

-- 2. Restrict foto_remote attachments to creator, assigned IT, or admin
alter policy "ticket owners can read their attachments"
on public.attachments
using (
  exists (
    select 1 from public.tickets t
    where t.id = attachments.ticket_id
      and (
        t.pembuat_id = (select auth.uid())
        or (
          coalesce(attachments.jenis, 'foto') <> 'foto_remote'
          and (select public.current_app_role()) in ('it', 'admin')
        )
        or (
          attachments.jenis = 'foto_remote'
          and (
            (select public.current_app_role()) = 'admin'
            or (
              (select public.current_app_role()) = 'it'
              and t.it_id = (select auth.uid())
            )
          )
        )
      )
  )
);

alter policy "IT and admins can read ticket images"
on storage.objects
using (
  bucket_id = 'ticket-attachments'
  and (
    (select public.current_app_role()) = 'admin'
    or (
      (select public.current_app_role()) = 'it'
      and not exists (
        select 1
        from public.attachments a
        join public.tickets t on t.id = a.ticket_id
        where a.path_file = storage.objects.name
          and a.jenis = 'foto_remote'
          and t.it_id is distinct from (select auth.uid())
      )
    )
  )
);

-- 3. Allow IT/admin to log kredensial_dilihat & komentar in ticket_events
alter policy "IT can write status and assignment events"
on public.ticket_events
with check (
  aktor_id = (select auth.uid())
  and jenis in ('status', 'assign', 'kredensial_dilihat', 'komentar')
  and (select public.current_app_role()) in ('it', 'admin')
  and exists (
    select 1
    from public.tickets
    where tickets.id = ticket_events.ticket_id
      and (
        tickets.it_id = (select auth.uid())
        or (select public.current_app_role()) = 'admin'
      )
  )
);

-- 4. Scrub encrypted remote passwords when ticket completes or closes (keep static remote_id for auto-fill)
create or replace function public.scrub_remote_passwords_on_complete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('selesai', 'ditutup')
     and old.status is distinct from new.status then
    update public.remote_credentials
    set password_terenkripsi = null,
        kedaluwarsa_pada = pg_catalog.now()
    where ticket_id = new.id
      and password_terenkripsi is not null;
  end if;
  return null;
end;
$$;

revoke all on function public.scrub_remote_passwords_on_complete()
  from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.tickets'::regclass
      and tgname = 'trg_scrub_remote_passwords_on_complete'
  ) then
    create trigger trg_scrub_remote_passwords_on_complete
    after update of status on public.tickets
    for each row execute function public.scrub_remote_passwords_on_complete();
  end if;
end;
$$;

-- 5. Allow IT / Admin to toggle manual IT availability status (free/off/kunjungan)
grant select on public.it_status to authenticated;

create or replace function public.set_manual_it_status(
  p_target_it_id uuid,
  p_status text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text;
  final_status text;
begin
  if caller_id is null then
    raise exception 'Belum login.';
  end if;

  select peran into caller_role from public.users where id = caller_id;
  if caller_role not in ('it', 'admin') then
    raise exception 'Hanya staf IT atau admin yang dapat mengubah status IT.';
  end if;

  if caller_role = 'it' and p_target_it_id <> caller_id then
    raise exception 'Staf IT hanya dapat mengubah status dirinya sendiri.';
  end if;

  if p_status not in ('free', 'off', 'kunjungan') then
    raise exception 'Status manual hanya boleh free, off, atau kunjungan.';
  end if;

  if not exists (
    select 1 from public.users where id = p_target_it_id and peran = 'it'
  ) then
    raise exception 'Target bukan user dengan peran IT.';
  end if;

  insert into public.it_status (it_id, status, diperbarui_pada)
  values (p_target_it_id, p_status, pg_catalog.now())
  on conflict (it_id) do update
    set status = excluded.status,
        diperbarui_pada = pg_catalog.now();

  if p_status = 'free' then
    perform public.refresh_it_status(p_target_it_id);
  end if;

  select status into final_status
  from public.it_status
  where it_id = p_target_it_id;

  return coalesce(final_status, p_status);
end;
$$;

revoke all on function public.set_manual_it_status(uuid, text)
  from public, anon;
grant execute on function public.set_manual_it_status(uuid, text)
  to authenticated;
