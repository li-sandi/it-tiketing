-- IT Ticketing — Seed data (sites & categories)

insert into sites (id, nama, punya_it, jumlah_user) values
  ('11111111-1111-1111-1111-111111111111', 'Terban',    true,  195),
  ('22222222-2222-2222-2222-222222222222', 'Ngampilan', true,  60),
  ('33333333-3333-3333-3333-333333333333', 'Sleman',    false, 40),
  ('44444444-4444-4444-4444-444444444444', 'Kota Baru', true,  50);

insert into categories
(nama, tipe, prioritas_default, prioritas_naik, butuh_aset, butuh_foto, bisa_remote, butuh_approval) values
('Internet down / ISP down','insiden','P0', null, false, false, true, false),
('Main link failure','insiden','P0', null, false, false, true, false),
('Internet lambat','insiden','P1','{"tipe":"persen_site","threshold":0.5,"naik_ke":"P0"}'::jsonb, false, true, true, false),
('Masalah VPN','insiden','P1','{"tipe":"jumlah_user","threshold":5,"naik_ke":"P0"}'::jsonb, false, true, true, false),
('Aktivasi / non-aktivasi VPN','permintaan','P1','{"tipe":"jumlah_task","threshold":10,"operator":">","naik_ke":"P0"}'::jsonb, false, false, true, false),
('Masalah Genesys / MicroSIP','insiden','P1', null, false, true, true, false),
('Layar laptop hitam','insiden','P1', null, true, true, false, false),
('Gangguan tampilan layar laptop','insiden','P1', null, true, true, false, false),
('Keyboard / headset','insiden','P2', null, true, false, false, false),
('Mouse','insiden','P2', null, true, false, false, false),
('Pengisian daya laptop','insiden','P2', null, true, true, false, false),
('Laptop lemot','insiden','P2', null, true, false, true, false),
('Masalah handphone','insiden','P2', null, true, false, false, false),
('Instalasi aplikasi (WPS, AnyDesk, dll)','permintaan','P2', null, true, false, true, false),
('Upgrade RAM','permintaan','P2', null, true, false, false, true),
('Setup laptop karyawan baru','permintaan','P2', null, true, false, false, false),
('Instal ulang Windows','permintaan','P2', null, true, false, false, false),
('Pemantauan internet harian, uji link cadangan','internal','P3', null, false, false, true, false),
('Koordinasi vendor, anggaran, dokumentasi, pengumuman','internal','P3', null, false, false, true, false);
