-- 0033: Replace pg_catalog.greatest(...) with bare greatest(...) in
-- add_working_days_wib and handle_sla_pause, and revoke excess authenticated
-- table privileges on in_app_notifications, ticket_comments, and remote_credentials.
-- Strictly additive migration.

-- 1. Fix add_working_days_wib(timestamptz, integer): pg_catalog.greatest -> greatest
create or replace function public.add_working_days_wib(p_start timestamptz, p_days integer)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  local_ts timestamp;
  local_time time;
  candidate_date date;
  remaining integer := greatest(p_days, 0);
  holidays jsonb := '[]'::jsonb;
  dow integer;
begin
  if remaining = 0 then
    return p_start;
  end if;

  select coalesce(nilai -> 'holidays', '[]'::jsonb)
  into holidays
  from public.settings
  where kunci = 'working_hours';

  local_ts := p_start at time zone 'Asia/Jakarta';
  local_time := local_ts::time;
  candidate_date := local_ts::date;

  while remaining > 0 loop
    candidate_date := candidate_date + 1;
    dow := extract(dow from candidate_date)::integer;
    if dow not in (0, 6)
       and not (holidays ? pg_catalog.to_char(candidate_date, 'YYYY-MM-DD')) then
      remaining := remaining - 1;
    end if;
  end loop;

  return (candidate_date::timestamp + local_time) at time zone 'Asia/Jakarta';
end;
$$;

-- 2. Fix handle_sla_pause(): pg_catalog.greatest -> greatest
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
        paused_secs := greatest(
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
        paused_secs := greatest(
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
      paused_secs := greatest(
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

-- 3. Revoke excess authenticated table privileges & enforce column-level grants
revoke all on public.in_app_notifications from public, anon, authenticated;
grant select on public.in_app_notifications to authenticated;
grant update (dibaca, dibaca_pada) on public.in_app_notifications to authenticated;
grant all on public.in_app_notifications to service_role;

revoke all on public.ticket_comments from public, anon, authenticated;
grant select, insert on public.ticket_comments to authenticated;
grant all on public.ticket_comments to service_role;

revoke delete, truncate, references, trigger on public.remote_credentials from authenticated;
