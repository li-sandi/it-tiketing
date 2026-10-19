-- Allow ticket creators to rate and close their completed tickets.

create or replace function public.close_ticket_by_creator(
  p_ticket_id uuid,
  p_rating integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Belum login.';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating harus 1-5.';
  end if;

  update public.tickets
  set status = 'ditutup',
      ditutup_pada = now(),
      rating = p_rating
  where id = p_ticket_id
    and pembuat_id = auth.uid()
    and status = 'selesai'
  returning id into closed_id;

  if closed_id is null then
    raise exception 'Tiket tidak ditemukan, bukan milik pengguna, atau belum selesai.';
  end if;

  insert into public.ticket_events (
    ticket_id,
    aktor_id,
    jenis,
    dari,
    ke
  )
  values (
    closed_id,
    auth.uid(),
    'status',
    'selesai',
    'ditutup'
  );
end
$$;

revoke all on function public.close_ticket_by_creator(uuid, integer)
  from public, anon;
grant execute on function public.close_ticket_by_creator(uuid, integer)
  to authenticated;

drop policy if exists "Users and staff can read allowed profiles" on public.users;
create policy "Users and staff can read allowed profiles"
on public.users for select to authenticated
using (
  id = (select auth.uid())
  or (select public.current_app_role()) in ('it', 'admin')
  or exists (
    select 1
    from public.ticket_events event
    join public.tickets ticket on ticket.id = event.ticket_id
    where event.aktor_id = users.id
      and ticket.pembuat_id = (select auth.uid())
  )
);
