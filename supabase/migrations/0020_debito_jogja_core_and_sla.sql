-- IT Ticketing — Debito Jogja consolidation, category grouping, settings, SLA & aging

-- 1. Consolidate sites into single active entity: Debito Jogja (400 users)
alter table public.sites
  add column if not exists aktif boolean not null default true;

update public.sites
set nama = 'Debito Jogja',
    punya_it = true,
    jumlah_user = 400,
    aktif = true
where id = '11111111-1111-1111-1111-111111111111';

update public.users
set site_id = '11111111-1111-1111-1111-111111111111'
where site_id = '22222222-2222-2222-2222-222222222222';

update public.tickets
set site_id = '11111111-1111-1111-1111-111111111111'
where site_id = '22222222-2222-2222-2222-222222222222';

update public.it_schedule
set site_id = '11111111-1111-1111-1111-111111111111'
where site_id = '22222222-2222-2222-2222-222222222222';

delete from public.sites
where id = '22222222-2222-2222-2222-222222222222';

-- Preserve Sleman as inactive until multi-site routing is re-enabled
update public.sites
set aktif = false
where id = '33333333-3333-3333-3333-333333333333';

drop policy if exists "Authenticated users can read sites" on public.sites;
create policy "Authenticated users can read sites"
on public.sites for select to authenticated
using (
  aktif
  or (select public.current_app_role()) in ('it', 'admin')
);

-- 2. Category grouping (Internet & Jaringan, Software, Hardware, Internal IT)
alter table public.categories
  add column if not exists grup text not null default 'Lainnya';

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.categories'::regclass
      and conname = 'categories_grup_length_check'
  ) then
    alter table public.categories
      add constraint categories_grup_length_check
      check (pg_catalog.char_length(pg_catalog.btrim(grup)) between 2 and 60);
  end if;
end;
$$;

update public.categories
set grup = 'Internet & Jaringan'
where nama in (
  'Internet down / ISP down',
  'Main link failure',
  'Internet lambat',
  'Masalah VPN',
  'Aktivasi / non-aktivasi VPN'
);

update public.categories
set grup = 'Software'
where nama in (
  'Masalah Genesys / MicroSIP',
  'Instalasi aplikasi (WPS, AnyDesk, dll)',
  'Instal ulang Windows'
);

update public.categories
set grup = 'Hardware'
where nama in (
  'Layar laptop hitam',
  'Gangguan tampilan layar laptop',
  'Keyboard / headset',
  'Mouse',
  'Pengisian daya laptop',
  'Laptop lemot',
  'Masalah handphone',
  'Upgrade RAM',
  'Setup laptop karyawan baru'
);

update public.categories
set grup = 'Internal IT'
where nama in (
  'Pemantauan internet harian, uji link cadangan',
  'Koordinasi vendor, anggaran, dokumentasi, pengumuman'
);

-- 3. Dynamic settings table
create table if not exists public.settings (
  kunci text primary key,
  nilai jsonb not null,
  deskripsi text,
  diperbarui_pada timestamptz not null default now()
);

alter table public.settings enable row level security;
revoke all on public.settings from public, anon, authenticated;
grant all on public.settings to service_role;
grant select on public.settings to authenticated;

drop policy if exists "Authenticated users can read safe settings" on public.settings;
create policy "Authenticated users can read safe settings"
on public.settings for select to authenticated
using (
  kunci in ('working_hours', 'feature_flags')
  or (select public.current_app_role()) in ('it', 'admin')
);

insert into public.settings (kunci, nilai, deskripsi) values
  (
    'working_hours',
    '{"timezone":"Asia/Jakarta","workdays":[1,2,3,4,5],"holidays":[]}'::jsonb,
    'Hari kerja dan daftar tanggal libur nasional (YYYY-MM-DD) untuk perhitungan SLA hari kerja.'
  ),
  (
    'rate_limit',
    '{"public_limit":20,"emergency_limit":100,"window_minutes":15}'::jsonb,
    'Batas permintaan form publik per IP tiap jendela waktu.'
  ),
  (
    'feature_flags',
    '{"sleman_routing_enabled":false,"ai_self_check_enabled":true,"auto_close_follow_sla":true}'::jsonb,
    'Pengaturan fitur operasional.'
  ),
  (
    'weekly_report',
    '{"enabled":true,"chat_ids":[]}'::jsonb,
    'Konfigurasi penerima tambahan laporan mingguan Telegram.'
  )
on conflict (kunci) do nothing;

-- 4. SLA pause, aging, and event/notification types
alter table public.tickets
  add column if not exists sla_paused_at timestamptz,
  add column if not exists sla_total_paused_seconds integer not null default 0,
  add column if not exists prioritas_awal text,
  add column if not exists aging_level integer not null default 0;

update public.tickets
set prioritas_awal = prioritas
where prioritas_awal is null;

alter table public.ticket_events
  drop constraint if exists ticket_events_jenis_check;

alter table public.ticket_events
  add constraint ticket_events_jenis_check
  check (jenis in (
    'status',
    'assign',
    'komentar',
    'kredensial_dilihat',
    'aging',
    'merge',
    'approval'
  ));

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
      'sla_aging',
      'auto_close',
      'kunjungan_sleman',
      'kunjungan_sleman_reminder',
      'ticket_merged',
      'approval_needed',
      'approval_decided',
      'weekly_report',
      'schedule_expiry'
    )
  );

-- 5. Working-day helper in Asia/Jakarta
create or replace function public.add_working_days_wib(
  p_start timestamptz,
  p_days integer
)
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
  remaining integer := pg_catalog.greatest(p_days, 0);
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

revoke all on function public.add_working_days_wib(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.add_working_days_wib(timestamptz, integer)
  to service_role;

-- 6. Upgrade set_sla_batas() to enforce ALL escalation rules server-side + working-day P3
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
  rule_type text;
  threshold numeric;
  operator_task text;
  naik_ke text;
  site_users integer := 0;
  escalates boolean := false;
  tanggal_lokal date;
  sleman_enabled boolean := false;
begin
  select *
  into kategori
  from public.categories
  where id = new.category_id
    and aktif;

  if not found then
    raise exception 'Kategori tiket tidak ditemukan atau tidak aktif.';
  end if;

  rule_type := kategori.prioritas_naik ->> 'tipe';

  if rule_type = 'persen_site' then
    if new.jumlah_user_terdampak is null or new.jumlah_user_terdampak < 1 then
      raise exception 'Jumlah user terdampak wajib diisi (minimal 1).';
    end if;
    if new.jumlah_task is not null then
      raise exception 'Jumlah task hanya berlaku untuk kategori aktivasi task.';
    end if;
    threshold := (kategori.prioritas_naik ->> 'threshold')::numeric;
    naik_ke := kategori.prioritas_naik ->> 'naik_ke';
    if new.site_id is not null then
      select s.jumlah_user into site_users from public.sites as s where s.id = new.site_id;
    end if;
    escalates := coalesce(site_users, 0) > 0
      and (new.jumlah_user_terdampak::numeric / site_users::numeric) > threshold;
    new.prioritas := case when escalates then coalesce(naik_ke, 'P0') else kategori.prioritas_default end;

  elsif rule_type = 'jumlah_user' then
    if new.jumlah_user_terdampak is null or new.jumlah_user_terdampak < 1 then
      raise exception 'Jumlah user terdampak wajib diisi (minimal 1).';
    end if;
    if new.jumlah_task is not null then
      raise exception 'Jumlah task hanya berlaku untuk kategori aktivasi task.';
    end if;
    threshold := (kategori.prioritas_naik ->> 'threshold')::numeric;
    naik_ke := kategori.prioritas_naik ->> 'naik_ke';
    escalates := new.jumlah_user_terdampak > threshold;
    new.prioritas := case when escalates then coalesce(naik_ke, 'P0') else kategori.prioritas_default end;

  elsif rule_type = 'jumlah_task' then
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
    escalates :=
      case operator_task
        when '>' then new.jumlah_task > threshold
        when '>=' then new.jumlah_task >= threshold
      end;
    new.prioritas := case when escalates then naik_ke else kategori.prioritas_default end;

  else
    if new.jumlah_task is not null then
      raise exception 'Jumlah task hanya berlaku untuk kategori aktivasi task.';
    end if;
    new.prioritas := kategori.prioritas_default;
  end if;

  new.prioritas_awal := new.prioritas;

  case new.prioritas
    when 'P0' then menit_respon := 5;   menit_resolusi := 30;
    when 'P1' then menit_respon := 15;  menit_resolusi := 120;
    when 'P2' then menit_respon := 30;  menit_resolusi := 240;
    when 'P3' then menit_respon := 120; menit_resolusi := 1440;
    else raise exception 'Prioritas tiket tidak valid.';
  end case;

  new.sla_respon_batas :=
    new.dibuat_pada + pg_catalog.make_interval(mins => menit_respon);

  if new.prioritas = 'P3' then
    new.sla_resolusi_batas := public.add_working_days_wib(new.dibuat_pada, 1);
  else
    new.sla_resolusi_batas :=
      new.dibuat_pada + pg_catalog.make_interval(mins => menit_resolusi);
  end if;

  select coalesce((nilai ->> 'sleman_routing_enabled')::boolean, false)
  into sleman_enabled
  from public.settings
  where kunci = 'feature_flags';

  if sleman_enabled
     and new.site_id is not null
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

-- 7. Trigger to pause/resume SLA resolution deadline across waiting states
create or replace function public.handle_sla_pause()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  paused_secs integer;
begin
  if new.status is distinct from old.status then
    if new.status in ('menunggu_user', 'menunggu_pengadaan', 'dijadwalkan_kunjungan')
       and old.status = 'diproses' then
      new.sla_paused_at := pg_catalog.now();
    elsif new.status = 'diproses'
          and old.status in ('menunggu_user', 'menunggu_pengadaan', 'dijadwalkan_kunjungan')
          and old.sla_paused_at is not null then
      paused_secs := pg_catalog.greatest(
        0,
        extract(epoch from (pg_catalog.now() - old.sla_paused_at))::integer
      );
      new.sla_total_paused_seconds := coalesce(old.sla_total_paused_seconds, 0) + paused_secs;
      if old.sla_resolusi_batas is not null then
        new.sla_resolusi_batas := old.sla_resolusi_batas + pg_catalog.make_interval(secs => paused_secs);
      end if;
      new.sla_paused_at := null;
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

drop trigger if exists trg_handle_sla_pause on public.tickets;
create trigger trg_handle_sla_pause
before update of status on public.tickets
for each row execute function public.handle_sla_pause();

-- 8. Queue aging RPC for overdue 'baru' tickets
create or replace function public.age_overdue_ticket(p_ticket_id uuid)
returns table (aged boolean, old_priority text, new_priority text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tickets%rowtype;
  next_prio text;
  new_respon_mins integer;
  new_res_mins integer;
  new_res_batas timestamptz;
begin
  select *
  into t
  from public.tickets
  where id = p_ticket_id
  for update;

  if not found
     or t.status <> 'baru'
     or t.sla_respon_batas is null
     or t.sla_respon_batas > pg_catalog.now() then
    return query select false, t.prioritas, t.prioritas;
    return;
  end if;

  next_prio := case t.prioritas
    when 'P3' then 'P2'
    when 'P2' then 'P1'
    when 'P1' then 'P0'
    else null
  end;

  if next_prio is null then
    return query select false, t.prioritas, t.prioritas;
    return;
  end if;

  case next_prio
    when 'P0' then new_respon_mins := 5;  new_res_mins := 30;
    when 'P1' then new_respon_mins := 15; new_res_mins := 120;
    when 'P2' then new_respon_mins := 30; new_res_mins := 240;
  end case;

  new_res_batas := pg_catalog.now() + pg_catalog.make_interval(mins => new_res_mins);
  if t.sla_resolusi_batas is not null and t.sla_resolusi_batas < new_res_batas then
    new_res_batas := t.sla_resolusi_batas;
  end if;

  update public.tickets
  set prioritas = next_prio,
      aging_level = coalesce(aging_level, 0) + 1,
      sla_respon_batas = pg_catalog.now() + pg_catalog.make_interval(mins => new_respon_mins),
      sla_resolusi_batas = new_res_batas
  where id = t.id;

  insert into public.ticket_events (ticket_id, aktor_id, jenis, dari, ke)
  values (t.id, null, 'aging', t.prioritas, next_prio);

  return query select true, t.prioritas, next_prio;
end;
$$;

revoke all on function public.age_overdue_ticket(uuid)
  from public, anon, authenticated;
grant execute on function public.age_overdue_ticket(uuid)
  to service_role;

-- 9. Per-SLA auto-close RPC
create or replace function public.auto_close_due_tickets()
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
  closed_id uuid;
begin
  for rec in
    select id
    from public.tickets
    where status = 'selesai'
      and selesai_pada is not null
      and (
        (prioritas = 'P0' and selesai_pada + interval '30 minutes' <= pg_catalog.now())
        or (prioritas = 'P1' and selesai_pada + interval '2 hours' <= pg_catalog.now())
        or (prioritas = 'P2' and selesai_pada + interval '4 hours' <= pg_catalog.now())
        or (prioritas = 'P3' and public.add_working_days_wib(selesai_pada, 1) <= pg_catalog.now())
      )
    for update skip locked
  loop
    update public.tickets
    set status = 'ditutup',
        ditutup_pada = pg_catalog.now()
    where id = rec.id
      and status = 'selesai'
    returning id into closed_id;

    if closed_id is not null then
      insert into public.ticket_events (ticket_id, aktor_id, jenis, dari, ke)
      values (closed_id, null, 'status', 'selesai', 'ditutup');
      return next closed_id;
    end if;
  end loop;
end;
$$;

revoke all on function public.auto_close_due_tickets()
  from public, anon, authenticated;
grant execute on function public.auto_close_due_tickets()
  to service_role;
