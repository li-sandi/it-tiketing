-- Revamp 19 kategori IT berdasarkan Daily Ticket Report Debito Jogja
-- Mempertahankan semua UUID kategori lama yang memiliki tiket agar foreign key tetap utuh,
-- menonaktifkan 3 duplikat dengan 0 tiket, serta menambah kategori Kabel Power & Headset.

-- 1. Network & VPN
UPDATE public.categories
SET
  nama = 'Internet down / ISP down',
  grup = 'Network & VPN',
  tipe = 'insiden',
  prioritas_default = 'P0',
  prioritas_naik = '{"masalah_banyak_user": true}'::jsonb,
  butuh_aset = false,
  butuh_foto = false,
  bisa_remote = false,
  butuh_approval = false,
  aktif = true
WHERE id = '1ceee41c-6f50-4434-bd9b-ddde5aa961d6';

UPDATE public.categories
SET
  nama = 'Internet lambat / Bandwidth & DNS',
  grup = 'Network & VPN',
  tipe = 'insiden',
  prioritas_default = 'P1',
  butuh_aset = false,
  butuh_foto = false,
  bisa_remote = true,
  butuh_approval = false,
  aktif = true
WHERE id = '44aec050-7ad1-4d4b-a183-a795cbc8d1e0';

UPDATE public.categories
SET
  nama = 'Masalah VPN (OpenVPN / SoftEther)',
  grup = 'Network & VPN',
  tipe = 'insiden',
  prioritas_default = 'P1',
  butuh_aset = false,
  butuh_foto = true,
  bisa_remote = true,
  butuh_approval = false,
  aktif = true
WHERE id = '00176019-443f-4161-aa16-23e2612c9f50';

-- 2. Hardware & Periferal
UPDATE public.categories
SET
  nama = 'Laptop Bermasalah (Layar / Keyboard / Fan / Baterai / Repair)',
  grup = 'Hardware & Periferal',
  tipe = 'insiden',
  prioritas_default = 'P1',
  butuh_aset = true,
  butuh_foto = true,
  bisa_remote = false,
  butuh_approval = false,
  aktif = true
WHERE id = '1e2a1f25-b669-42a8-a893-7175d69be17c';

UPDATE public.categories
SET
  nama = 'Mouse bermasalah / ganti mouse',
  grup = 'Hardware & Periferal',
  tipe = 'insiden',
  prioritas_default = 'P2',
  butuh_aset = true,
  butuh_foto = true,
  bisa_remote = false,
  butuh_approval = false,
  aktif = true
WHERE id = 'a94c51d1-2964-4b52-b143-b1f79553bcd6';

UPDATE public.categories
SET
  nama = 'Charger laptop bermasalah / ganti charger',
  grup = 'Hardware & Periferal',
  tipe = 'insiden',
  prioritas_default = 'P1',
  butuh_aset = true,
  butuh_foto = true,
  bisa_remote = false,
  butuh_approval = false,
  aktif = true
WHERE id = '21a58ec6-279f-47cf-b34c-ec83e9f273c0';

UPDATE public.categories
SET
  nama = 'Printer, CCTV & Perangkat Kerja (HP / Scanner)',
  grup = 'Hardware & Periferal',
  tipe = 'insiden',
  prioritas_default = 'P2',
  butuh_aset = true,
  butuh_foto = true,
  bisa_remote = false,
  butuh_approval = false,
  aktif = true
WHERE id = 'ab820a2f-acef-4a4a-ac85-073f9024b0d4';

-- 3. Software & Aplikasi
UPDATE public.categories
SET
  nama = 'Error Aplikasi Kerja (Genesys, MicroSIP, SmartChat, WPS)',
  grup = 'Software & Aplikasi',
  tipe = 'insiden',
  prioritas_default = 'P1',
  butuh_aset = false,
  butuh_foto = true,
  bisa_remote = true,
  butuh_approval = false,
  aktif = true
WHERE id = 'b20f56d5-d3fd-4883-a294-e50d1d413b5a';

UPDATE public.categories
SET
  nama = 'Instalasi & Update Aplikasi (AnyDesk, UltraViewer, Genesys, MicroSIP, WPS)',
  grup = 'Software & Aplikasi',
  tipe = 'permintaan',
  prioritas_default = 'P3',
  butuh_aset = false,
  butuh_foto = false,
  bisa_remote = true,
  butuh_approval = false,
  aktif = true
WHERE id = '04693dd7-cc08-4bf9-9bed-f609a000202a';

UPDATE public.categories
SET
  nama = 'Instal Ulang OS / Windows',
  grup = 'Software & Aplikasi',
  tipe = 'permintaan',
  prioritas_default = 'P3',
  butuh_aset = true,
  butuh_foto = false,
  bisa_remote = false,
  butuh_approval = false,
  aktif = true
WHERE id = '3cc98365-c41d-424d-aa39-7091e975e2a6';

-- 4. Laptop Lifecycle & Performa
UPDATE public.categories
SET
  nama = 'Laptop lemot / Overheat (Cleaning, Repaste, Optimasi)',
  grup = 'Laptop Lifecycle & Performa',
  tipe = 'insiden',
  prioritas_default = 'P2',
  butuh_aset = true,
  butuh_foto = false,
  bisa_remote = true,
  butuh_approval = false,
  aktif = true
WHERE id = '808103e0-8ee8-4c7a-a1eb-9d852d87a50a';

UPDATE public.categories
SET
  nama = 'Setup Laptop NJ / Laptop Client / Offboarding',
  grup = 'Laptop Lifecycle & Performa',
  tipe = 'permintaan',
  prioritas_default = 'P3',
  butuh_aset = true,
  butuh_foto = false,
  bisa_remote = false,
  butuh_approval = false,
  aktif = true
WHERE id = '237d4a2b-1676-42ef-be18-e3b4e0a72d35';

UPDATE public.categories
SET
  nama = 'Upgrade RAM / Asset Swap',
  grup = 'Laptop Lifecycle & Performa',
  tipe = 'permintaan',
  prioritas_default = 'P3',
  butuh_aset = true,
  butuh_foto = false,
  bisa_remote = false,
  butuh_approval = false,
  aktif = true
WHERE id = 'b24001cf-f320-45f0-b104-b212be1a1cd0';

-- 5. Akses & Keamanan
UPDATE public.categories
SET
  nama = 'Akun VPN & Akses (Aktivasi / Reset / Whitelist)',
  grup = 'Akses & Keamanan',
  tipe = 'permintaan',
  prioritas_default = 'P2',
  butuh_aset = false,
  butuh_foto = false,
  bisa_remote = false,
  butuh_approval = false,
  aktif = true
WHERE id = 'd4b0785d-0b29-4f47-a416-b97d1b66c890';

-- 6. Internal IT (hanya terlihat untuk IT & Admin)
UPDATE public.categories
SET
  nama = 'Monitoring Jaringan, MikroTik & Stock Opname Aset',
  grup = 'Internal IT',
  tipe = 'internal',
  prioritas_default = 'P3',
  butuh_aset = false,
  butuh_foto = false,
  bisa_remote = false,
  butuh_approval = false,
  aktif = true
WHERE id = 'bfa0297c-cdb7-4278-8231-4b90b2b45116';

UPDATE public.categories
SET
  nama = 'Koordinasi Vendor / Client, Anggaran & Dokumentasi',
  grup = 'Internal IT',
  tipe = 'internal',
  prioritas_default = 'P3',
  butuh_aset = false,
  butuh_foto = false,
  bisa_remote = false,
  butuh_approval = false,
  aktif = true
WHERE id = '1c3575f5-d495-4f8e-b735-0ac13d1846be';

-- 7. Nonaktifkan 3 kategori duplikat dengan 0 tiket
UPDATE public.categories
SET aktif = false
WHERE id IN (
  '3747aa05-b107-4cab-a37a-10bde1f5f54d', -- Main link failure (overlap Internet down / ISP down)
  '2f0e313d-6838-4113-b0df-396a4e63bd4b', -- Gangguan tampilan layar laptop (digabung ke Laptop Bermasalah)
  '0db93bbf-3ee0-432b-b33e-fe0dbb5834b3'  -- Keyboard / headset (dipisah menjadi Headset & Laptop Bermasalah)
);

-- 8. Tambah kategori baru Kabel Power & Headset (idempoten, aman dijalankan ulang)
INSERT INTO public.categories (
  id, nama, grup, tipe, prioritas_default, butuh_aset, butuh_foto, bisa_remote, butuh_approval, aktif
)
SELECT
  '7a8c4e12-3b69-4d2e-9a11-5f20c9b7e101',
  'Kabel Power bermasalah / ganti kabel power',
  'Hardware & Periferal',
  'insiden',
  'P2',
  false,
  true,
  false,
  false,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
  WHERE id = '7a8c4e12-3b69-4d2e-9a11-5f20c9b7e101'
     OR lower(nama) = lower('Kabel Power bermasalah / ganti kabel power')
);

INSERT INTO public.categories (
  id, nama, grup, tipe, prioritas_default, butuh_aset, butuh_foto, bisa_remote, butuh_approval, aktif
)
SELECT
  '7a8c4e12-3b69-4d2e-9a11-5f20c9b7e102',
  'Headset bermasalah / ganti headset',
  'Hardware & Periferal',
  'insiden',
  'P2',
  true,
  true,
  false,
  false,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
  WHERE id = '7a8c4e12-3b69-4d2e-9a11-5f20c9b7e102'
     OR lower(nama) = lower('Headset bermasalah / ganti headset')
);
