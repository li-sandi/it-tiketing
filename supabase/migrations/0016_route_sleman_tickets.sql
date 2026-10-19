create or replace function public.route_scheduled_sleman_ticket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ticket_date date;
  schedule_count integer;
  scheduled_it_id uuid;
  resolution_deadline timestamptz;
begin
  ticket_date :=
    (new.dibuat_pada at time zone 'Asia/Jakarta')::date;

  select count(*), (pg_catalog.array_agg(schedule.it_id))[1]
  into schedule_count, scheduled_it_id
  from public.it_schedule as schedule
  where schedule.site_id = new.site_id
    and schedule.tanggal = ticket_date
    and schedule.jenis = 'kunjungan_sleman';

  if schedule_count = 0 then
    return new;
  end if;

  if schedule_count > 1 then
    raise exception 'Jadwal kunjungan site ini duplikat pada tanggal %.', ticket_date;
  end if;

  if not exists (
    select 1
    from public.users as scheduled_user
    where scheduled_user.id = scheduled_it_id
      and scheduled_user.peran = 'it'
  ) then
    raise exception 'Petugas jadwal kunjungan tidak lagi memiliki peran IT.';
  end if;

  if new.prioritas = 'P1' then
    resolution_deadline :=
      ((ticket_date + 1)::timestamp at time zone 'Asia/Jakarta')
      - interval '1 microsecond';
  else
    resolution_deadline := new.sla_resolusi_batas;
  end if;

  update public.tickets
  set it_id = coalesce(it_id, scheduled_it_id),
      sla_resolusi_batas = resolution_deadline
  where id = new.id;

  if new.it_id is null then
    insert into public.ticket_events (ticket_id, jenis, dari, ke)
    values (new.id, 'assign', null, scheduled_it_id::text);
  end if;

  return new;
end;
$$;

revoke all on function public.route_scheduled_sleman_ticket()
  from public, anon, authenticated;

create trigger trg_route_scheduled_sleman_ticket
after insert on public.tickets
for each row execute function public.route_scheduled_sleman_ticket();
