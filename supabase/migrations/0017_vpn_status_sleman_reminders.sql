alter table public.tickets
  add column if not exists jumlah_task integer
  check (jumlah_task is null or jumlah_task between 1 and 100000);

alter table public.tickets
  add column if not exists kunjungan_pada date;

grant insert (jumlah_task) on public.tickets to authenticated;

alter table public.telegram_notification_deliveries
  drop constraint if exists telegram_notification_deliveries_notification_type_check;

alter table public.telegram_notification_deliveries
  add constraint telegram_notification_deliveries_notification_type_check
  check (
    notification_type in (
      'ticket_new',
      'ticket_p0',
      'ticket_done',
      'sla_respon_mendekati',
      'sla_respon_lewat',
      'sla_resolusi_mendekati',
      'sla_resolusi_lewat',
      'auto_close',
      'kunjungan_sleman',
      'kunjungan_sleman_reminder'
    )
  );

create or replace function public.set_sla_batas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  menit_respon integer;
  menit_resolusi integer;
  kategori public.categories%rowtype;
  threshold numeric;
  operator_task text;
  naik_ke text;
  jumlah_task_melebihi boolean := false;
  tanggal_lokal date;
begin
  select *
  into kategori
  from public.categories
  where id = new.category_id
    and aktif;

  if not found then
    raise exception 'Kategori tiket tidak ditemukan atau tidak aktif.';
  end if;

  if kategori.prioritas_naik ->> 'tipe' = 'jumlah_task' then
    if new.jumlah_task is null or new.jumlah_task < 1 then
      raise exception 'Jumlah task wajib diisi untuk kategori ini.';
    end if;
    threshold := (kategori.prioritas_naik ->> 'threshold')::numeric;
    operator_task := kategori.prioritas_naik ->> 'operator';
    naik_ke := kategori.prioritas_naik ->> 'naik_ke';
    if threshold is null
       or threshold < 0
       or operator_task is null
       or operator_task not in ('>', '>=')
       or naik_ke is distinct from 'P0' then
      raise exception 'Aturan kenaikan prioritas jumlah task tidak valid.';
    end if;
    jumlah_task_melebihi :=
      case operator_task
        when '>' then new.jumlah_task > threshold
        when '>=' then new.jumlah_task >= threshold
      end;
    new.prioritas :=
      case when jumlah_task_melebihi then naik_ke else kategori.prioritas_default end;
  else
    if new.jumlah_task is not null then
      raise exception 'Jumlah task hanya berlaku untuk kategori aktivasi task.';
    end if;
  end if;

  case new.prioritas
    when 'P0' then menit_respon := 5;   menit_resolusi := 30;
    when 'P1' then menit_respon := 15;  menit_resolusi := 120;
    when 'P2' then menit_respon := 30;  menit_resolusi := 240;
    when 'P3' then menit_respon := 120; menit_resolusi := 1440;
    else raise exception 'Prioritas tiket tidak valid.';
  end case;

  new.sla_respon_batas :=
    new.dibuat_pada + pg_catalog.make_interval(mins => menit_respon);
  new.sla_resolusi_batas :=
    new.dibuat_pada + pg_catalog.make_interval(mins => menit_resolusi);

  if new.site_id is not null
     and new.penanganan = 'onsite'
     and new.prioritas = 'P1' then
    tanggal_lokal := (new.dibuat_pada at time zone 'Asia/Jakarta')::date;
    if exists (
      select 1
      from public.sites as site
      join public.it_schedule as schedule on schedule.site_id = site.id
      where site.id = new.site_id
        and not site.punya_it
        and schedule.tanggal = tanggal_lokal
        and schedule.jenis = 'kunjungan_sleman'
    ) then
      new.sla_resolusi_batas :=
        ((tanggal_lokal + 1)::timestamp at time zone 'Asia/Jakarta')
        - interval '1 microsecond';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.set_sla_batas()
  from public, anon, authenticated;

drop trigger if exists trg_route_scheduled_sleman_ticket on public.tickets;
drop function if exists public.route_scheduled_sleman_ticket();

create or replace function public.refresh_it_status(p_it_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_status text;
begin
  if not exists (
    select 1 from public.users where id = p_it_id and peran = 'it'
  ) then
    return;
  end if;

  next_status := case
    when exists (
      select 1 from public.tickets
      where it_id = p_it_id and status = 'diproses'
    ) then 'sibuk'
    else 'free'
  end;

  insert into public.it_status (it_id, status, diperbarui_pada)
  values (p_it_id, next_status, pg_catalog.now())
  on conflict (it_id) do update
    set status = excluded.status,
        diperbarui_pada = pg_catalog.now()
    where public.it_status.status in ('free', 'sibuk')
      and public.it_status.status is distinct from excluded.status;
end;
$$;

create or replace function public.sync_it_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.it_id is not null then
    perform public.refresh_it_status(new.it_id);
  end if;
  if tg_op = 'UPDATE'
     and old.it_id is not null
     and old.it_id is distinct from new.it_id then
    perform public.refresh_it_status(old.it_id);
  end if;
  return null;
end;
$$;

revoke all on function public.refresh_it_status(uuid)
  from public, anon, authenticated;
revoke all on function public.sync_it_status()
  from public, anon, authenticated;

create or replace function public.sync_it_status_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.peran = 'it' then
    perform public.refresh_it_status(new.id);
  elsif tg_op = 'UPDATE' and old.peran = 'it' then
    delete from public.it_status where it_id = new.id;
  end if;
  return null;
end;
$$;

revoke all on function public.sync_it_status_for_user()
  from public, anon, authenticated;

drop trigger if exists trg_sync_it_status_for_user on public.users;
create trigger trg_sync_it_status_for_user
after insert or update of peran on public.users
for each row execute function public.sync_it_status_for_user();

drop trigger if exists trg_sync_it_status on public.tickets;
create trigger trg_sync_it_status
after insert or update of status, it_id on public.tickets
for each row execute function public.sync_it_status();

with eligible_tickets as (
  select ticket.id, min(schedule.tanggal) as tanggal
  from public.tickets as ticket
  join public.sites as site
    on site.id = ticket.site_id
   and not site.punya_it
  join public.it_schedule as schedule
    on schedule.site_id = ticket.site_id
   and schedule.it_id = ticket.it_id
   and schedule.tanggal =
       (ticket.dibuat_pada at time zone 'Asia/Jakarta')::date
   and schedule.jenis = 'kunjungan_sleman'
  where ticket.status = 'baru'
    and ticket.prioritas in ('P2', 'P3')
    and ticket.penanganan = 'onsite'
    and ticket.it_id is not null
  group by ticket.id
  having count(*) = 1
), scheduled_tickets as (
  update public.tickets as ticket
  set status = 'dijadwalkan_kunjungan',
      kunjungan_pada = eligible.tanggal
  from eligible_tickets as eligible
  where ticket.id = eligible.id
  returning ticket.id
)
insert into public.ticket_events (ticket_id, jenis, dari, ke)
select id, 'status', 'baru', 'dijadwalkan_kunjungan'
from scheduled_tickets;

insert into public.it_status (it_id, status, diperbarui_pada)
select
  staff.id,
  case
    when exists (
      select 1 from public.tickets
      where it_id = staff.id and status = 'diproses'
    ) then 'sibuk'
    else 'free'
  end,
  pg_catalog.now()
from public.users as staff
where staff.peran = 'it'
on conflict (it_id) do update
  set status = excluded.status,
      diperbarui_pada = pg_catalog.now()
  where public.it_status.status in ('free', 'sibuk')
    and public.it_status.status is distinct from excluded.status;

create or replace function public.schedule_sleman_ticket(
  p_ticket_id uuid,
  p_schedule_date date,
  p_it_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tickets as ticket
  set status = 'dijadwalkan_kunjungan',
      it_id = p_it_id,
      kunjungan_pada = p_schedule_date
  where ticket.id = p_ticket_id
    and ticket.status = 'baru'
    and ticket.it_id is null
    and ticket.penanganan = 'onsite'
    and exists (
      select 1
      from public.sites as site
      where site.id = ticket.site_id
        and not site.punya_it
    )
    and exists (
      select 1 from public.users
      where id = p_it_id and peran = 'it'
    )
    and exists (
      select 1 from public.it_schedule as schedule
      where schedule.site_id = ticket.site_id
        and schedule.tanggal = p_schedule_date
        and schedule.it_id = p_it_id
        and schedule.jenis = 'kunjungan_sleman'
    );

  if not found then
    return false;
  end if;

  insert into public.ticket_events (ticket_id, jenis, dari, ke)
  values
    (p_ticket_id, 'status', 'baru', 'dijadwalkan_kunjungan'),
    (p_ticket_id, 'assign', null, p_it_id::text);

  return true;
end;
$$;

revoke all on function public.schedule_sleman_ticket(uuid, date, uuid)
  from public, anon, authenticated;
grant execute on function public.schedule_sleman_ticket(uuid, date, uuid)
  to service_role;
