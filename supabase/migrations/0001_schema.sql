-- IT Ticketing — Schema
-- Tahap 1 (MVP)

create extension if not exists "pgcrypto";

-- ============ SITES ============
create table sites (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  punya_it boolean not null default false,
  jumlah_user integer not null default 0
);

-- ============ USERS ============
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  nama text not null,
  email text unique not null,
  telegram_id text,
  site_id uuid references sites(id),
  vendor text,
  peran text not null check (peran in ('user','it','admin')) default 'user'
);

-- ============ IT STATUS ============
create table it_status (
  it_id uuid primary key references users(id) on delete cascade,
  status text not null check (status in ('free','sibuk','kunjungan','off')) default 'free',
  diperbarui_pada timestamptz not null default now()
);

-- ============ IT SCHEDULE ============
create table it_schedule (
  id uuid primary key default gen_random_uuid(),
  it_id uuid not null references users(id) on delete cascade,
  site_id uuid references sites(id),
  tanggal date not null,
  jenis text not null check (jenis in ('piket','kunjungan_sleman'))
);

-- ============ CATEGORIES ============
create table categories (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  tipe text not null check (tipe in ('insiden','permintaan','internal')),
  prioritas_default text not null check (prioritas_default in ('P0','P1','P2','P3')),
  prioritas_naik jsonb,
  butuh_aset boolean not null default false,
  butuh_foto boolean not null default false,
  bisa_remote boolean not null default false,
  butuh_approval boolean not null default false,
  aktif boolean not null default true
);

-- ============ TICKETS ============
create table tickets (
  id uuid primary key default gen_random_uuid(),
  nomor_tiket text unique not null,
  pembuat_id uuid not null references users(id),
  site_id uuid references sites(id),
  category_id uuid not null references categories(id),
  tipe text not null check (tipe in ('insiden','permintaan','internal')),
  deskripsi text not null,
  prioritas text not null check (prioritas in ('P0','P1','P2','P3')),
  jumlah_user_terdampak integer,
  nomor_aset text,
  digabung_ke_id uuid references tickets(id),
  penanganan text not null check (penanganan in ('remote','onsite')),
  status text not null check (status in ('baru','diproses','menunggu_user','dijadwalkan_kunjungan','menunggu_pengadaan','selesai','ditutup')) default 'baru',
  it_id uuid references users(id),
  poin_kesulitan integer,
  catatan_solusi text,
  rating integer check (rating between 1 and 5),
  dibuat_pada timestamptz not null default now(),
  diproses_pada timestamptz,
  selesai_pada timestamptz,
  ditutup_pada timestamptz,
  sla_respon_batas timestamptz,
  sla_resolusi_batas timestamptz
);

-- ============ TICKET EVENTS ============
create table ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  aktor_id uuid references users(id),
  jenis text not null check (jenis in ('status','assign','komentar','kredensial_dilihat')),
  dari text,
  ke text,
  waktu timestamptz not null default now()
);

-- ============ ATTACHMENTS ============
create table attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  path_file text not null,
  jenis text,
  diunggah_pada timestamptz not null default now()
);

-- ============ REMOTE CREDENTIALS ============
create table remote_credentials (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  aplikasi text not null check (aplikasi in ('anydesk','uv')),
  remote_id text not null,
  password_terenkripsi text,
  kedaluwarsa_pada timestamptz
);

-- ============ INDEXES ============
create index idx_tickets_antrian on tickets (prioritas, dibuat_pada) where status = 'baru';
create index idx_tickets_it on tickets (it_id, status);
create index idx_ticket_events_ticket on ticket_events (ticket_id, waktu);
