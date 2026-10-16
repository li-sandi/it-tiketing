-- IT Ticketing — Row-level access policies

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select peran
  from public.users
  where id = (select auth.uid())
$$;

revoke all on function public.current_app_role() from public;
grant execute on function public.current_app_role() to authenticated;

alter table public.users enable row level security;
alter table public.sites enable row level security;
alter table public.it_status enable row level security;
alter table public.it_schedule enable row level security;
alter table public.categories enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_events enable row level security;
alter table public.attachments enable row level security;
alter table public.remote_credentials enable row level security;

drop policy if exists "Users can read own profile" on public.users;
create policy "Users and staff can read allowed profiles"
on public.users for select to authenticated
using (
  id = (select auth.uid())
  or (select public.current_app_role()) in ('it', 'admin')
);

drop policy if exists "Authenticated users can read sites" on public.sites;
create policy "Authenticated users can read sites"
on public.sites for select to authenticated
using (true);

drop policy if exists "Authenticated users can read active categories" on public.categories;
create policy "Authenticated users can read active categories"
on public.categories for select to authenticated
using (aktif);

drop policy if exists "Users can read own tickets and staff can read all" on public.tickets;
create policy "Users can read own tickets and staff can read all"
on public.tickets for select to authenticated
using (
  pembuat_id = (select auth.uid())
  or (select public.current_app_role()) in ('it', 'admin')
);

drop policy if exists "Users can create own new tickets" on public.tickets;
create policy "Users can create own new tickets"
on public.tickets for insert to authenticated
with check (
  pembuat_id = (select auth.uid())
  and status = 'baru'
  and it_id is null
);

drop policy if exists "IT can update unassigned or assigned tickets" on public.tickets;
create policy "IT can update unassigned or assigned tickets"
on public.tickets for update to authenticated
using (
  (select public.current_app_role()) in ('it', 'admin')
  and (
    it_id = (select auth.uid())
    or (it_id is null and status = 'baru')
    or (select public.current_app_role()) = 'admin'
  )
)
with check (
  (select public.current_app_role()) in ('it', 'admin')
  and (
    it_id = (select auth.uid())
    or (select public.current_app_role()) = 'admin'
  )
);

drop policy if exists "Users can read events for accessible tickets" on public.ticket_events;
create policy "Users can read events for accessible tickets"
on public.ticket_events for select to authenticated
using (
  exists (
    select 1
    from public.tickets
    where tickets.id = ticket_events.ticket_id
  )
);

drop policy if exists "IT can write status and assignment events" on public.ticket_events;
create policy "IT can write status and assignment events"
on public.ticket_events for insert to authenticated
with check (
  aktor_id = (select auth.uid())
  and jenis in ('status', 'assign')
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

drop policy if exists "IT can read credentials for assigned tickets" on public.remote_credentials;
create policy "IT can read credentials for assigned tickets"
on public.remote_credentials for select to authenticated
using (
  (select public.current_app_role()) = 'admin'
  or exists (
    select 1
    from public.tickets
    where tickets.id = remote_credentials.ticket_id
      and tickets.it_id = (select auth.uid())
  )
);

drop policy if exists "Ticket owners can add remote IDs" on public.remote_credentials;
create policy "Ticket owners can add remote IDs"
on public.remote_credentials for insert to authenticated
with check (
  exists (
    select 1
    from public.tickets
    where tickets.id = remote_credentials.ticket_id
      and tickets.pembuat_id = (select auth.uid())
  )
);

revoke select on public.users from authenticated;
grant select (id, nama, site_id, peran) on public.users to authenticated;

grant select on public.sites, public.categories,
  public.tickets, public.ticket_events to authenticated;

revoke insert on public.tickets from authenticated;
grant insert (
  pembuat_id,
  site_id,
  category_id,
  tipe,
  deskripsi,
  prioritas,
  jumlah_user_terdampak,
  nomor_aset,
  penanganan
) on public.tickets to authenticated;
grant usage, select on sequence public.ticket_seq to authenticated;

revoke update on public.tickets from authenticated;
grant update (
  it_id,
  status,
  diproses_pada,
  selesai_pada,
  ditutup_pada
) on public.tickets to authenticated;

revoke insert on public.ticket_events from authenticated;
grant insert (ticket_id, aktor_id, jenis, dari, ke, waktu)
on public.ticket_events to authenticated;

revoke select on public.remote_credentials from authenticated;
grant select (id, ticket_id, aplikasi, remote_id, kedaluwarsa_pada)
on public.remote_credentials to authenticated;
revoke insert on public.remote_credentials from authenticated;
grant insert (ticket_id, aplikasi, remote_id)
on public.remote_credentials to authenticated;
