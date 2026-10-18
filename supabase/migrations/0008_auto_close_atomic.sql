-- IT Ticketing — Atomic system ticket auto-close

create or replace function public.auto_close_ticket(
  p_ticket_id uuid,
  p_cutoff timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed_id uuid;
begin
  update public.tickets
  set status = 'ditutup',
      ditutup_pada = now()
  where id = p_ticket_id
    and status = 'selesai'
    and selesai_pada <= p_cutoff
  returning id into closed_id;

  if closed_id is null then
    return false;
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
    null,
    'status',
    'selesai',
    'ditutup'
  );

  return true;
end
$$;

revoke all on function public.auto_close_ticket(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.auto_close_ticket(uuid, timestamptz)
  to service_role;
