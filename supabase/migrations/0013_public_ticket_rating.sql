-- Let public ticket holders close completed tickets using their access token.

create or replace function public.close_public_ticket(
  p_access_token uuid,
  p_rating integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed_id uuid;
begin
  if p_access_token is null then
    raise exception 'Token tiket tidak valid.';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating harus 1-5.';
  end if;

  update public.tickets
  set status = 'ditutup',
      ditutup_pada = now(),
      rating = p_rating
  where akses_token = p_access_token
    and pembuat_id is null
    and status = 'selesai'
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

revoke all on function public.close_public_ticket(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.close_public_ticket(uuid, integer)
  to service_role;
