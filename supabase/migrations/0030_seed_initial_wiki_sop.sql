-- Seed 10 artikel Wiki & SOP awal berdasarkan Daily Ticket Report Debito Jogja
-- Idempoten: hanya menyisipkan jika judul belum ada. Tidak menggunakan DROP.

INSERT INTO public.knowledge_articles (judul, grup, category_id, masalah, solusi, kata_kunci, status)
SELECT
  v.judul,
  v.grup,
  v.category_id::uuid,
  v.masalah,
  v.solusi,
  v.kata_kunci,
  'published'
FROM (
  VALUES
    (
      'Troubleshooting VPN Gagal Terhubung (OpenVPN / SoftEther)',
      'Network & VPN',
      '00176019-443f-4161-aa16-23e2612c9f50',
      'Pengguna tidak dapat terhubung ke OpenVPN atau SoftEther, koneksi sering putus, atau muncul error autentikasi saat WFH/operasional.',
      '1. Pastikan koneksi internet dasar stabil (buka halaman uji atau cek ping).\n2. Tutup penuh aplikasi VPN (tray icon -> Exit) lalu jalankan ulang sebagai Administrator.\n3. Pastikan profil .ovpn atau setting SoftEther Virtual Adapter aktif dan tidak bentrok dengan VPN lain.\n4. Jika muncul error kredensial/sertifikat kedaluwarsa, lampirkan screenshot error dan ajukan tiket dengan jumlah user terdampak.',
      ARRAY['vpn', 'openvpn', 'softether', 'konek', 'putus', 'autentikasi']
    ),
    (
      'MicroSIP Error Registrasi atau Tidak Ada Suara',
      'Software & Aplikasi',
      'b20f56d5-d3fd-4883-a294-e50d1d413b5a',
      'MicroSIP menampilkan status Request Timeout / Service Unavailable, tidak bisa melakukan panggilan, atau suara audio tidak masuk/keluar.',
      '1. Pastikan VPN perusahaan sudah terhubung sebelum membuka MicroSIP.\n2. Buka Settings pada MicroSIP lalu pastikan perangkat Microphone dan Speaker mengarah ke headset aktif (bukan Default jika headset baru dicolok).\n3. Restart MicroSIP atau cabut-pasang ulang USB/jack headset.\n4. Jika ekstensi SIP tetap merah/offline, lampirkan screenshot konfigurasi akun dan buka tiket.',
      ARRAY['microsip', 'sip', 'registrasi', 'timeout', 'suara', 'audio', 'headset']
    ),
    (
      'Genesys Tidak Auto-Call atau Gagal Login',
      'Software & Aplikasi',
      'b20f56d5-d3fd-4883-a294-e50d1d413b5a',
      'Aplikasi atau tab Genesys tidak melakukan panggilan otomatis, status agent tersangkut, atau gagal memuat halaman login.',
      '1. Gunakan Google Chrome versi terbaru dengan profil kerja.\n2. Tekan Ctrl+Shift+Del -> Clear Cached Images and Files (jangan hapus password yang dibutuhkan jika belum tersimpan), lalu muat ulang halaman.\n3. Periksa izin mikrofon browser (ikon gembok di address bar -> Microphone: Allow).\n4. Tutup tab tidak terpakai agar memori laptop tidak penuh.',
      ARRAY['genesys', 'autocall', 'call', 'login', 'chrome', 'mic']
    ),
    (
      'Kendala AnyDesk ID Ganda dan Koneksi UltraViewer',
      'Software & Aplikasi',
      '04693dd7-cc08-4bf9-9bed-f609a000202a',
      'ID AnyDesk muncul ganda/terblokir batas sesi komersial atau UltraViewer gagal menampilkan layar saat dukungan remote.',
      '1. Catat ID AnyDesk atau UltraViewer yang tampil di layar saat ini.\n2. Jika ID AnyDesk berduplikasi akibat cloning image laptop, kirim foto layar AnyDesk melalui kolom Kredensial Remote pada tiket.\n3. Sebagai alternatif cepat, buka UltraViewer lalu masukkan ID, password sementara, dan screenshot jendela UltraViewer pada form tiket.',
      ARRAY['anydesk', 'ultraviewer', 'remote', 'id ganda', 'duplikat', 'password']
    ),
    (
      'Optimasi Laptop Lemot dan Overheat (Cache, Tab Chrome, MemReduce)',
      'Laptop Lifecycle & Performa',
      '808103e0-8ee8-4c7a-a1eb-9d852d87a50a',
      'Laptop terasa lambat, freeze saat membuka banyak aplikasi kerja, atau kipas berisik dan suhu cepat panas.',
      '1. Tutup tab Chrome yang tidak dipakai dan nonaktifkan ekstensi berat.\n2. Jalankan pembersihan memori menggunakan MemReduce bila terpasang dan restart laptop minimal 1 kali setiap hari kerja.\n3. Pastikan ventilasi bawah laptop tidak tertutup kain/bantal.\n4. Cek nomor aset perangkat: bila RAM terpasang <= 4 GB atau laptop butuh cleaning fisik/repaste thermal paste, laporkan tiket beserta nomor aset.',
      ARRAY['lemot', 'lambat', 'freeze', 'overheat', 'panas', 'memreduce', 'ram', 'repaste']
    ),
    (
      'Chrome Gagal Membuka Situs atau Kendala DNS',
      'Network & VPN',
      '44aec050-7ad1-4d4b-a183-a795cbc8d1e0',
      'Google Chrome menampilkan ERR_NAME_NOT_RESOLVED, ERR_CONNECTION_TIMED_OUT, atau situs client tidak bisa dibuka padahal koneksi tersambung.',
      '1. Cek apakah VPN diperlukan untuk membuka situs tujuan.\n2. Buka chrome://net-internals/#dns di address bar lalu klik Clear host cache.\n3. Nonaktifkan fitur Secure DNS / Use secure DNS di Chrome Settings -> Privacy and Security jika diminta menggunakan DNS lokal kantor.\n4. Uji kembali dalam mode Incognito untuk memastikan bukan gangguan ekstensi.',
      ARRAY['chrome', 'dns', 'browser', 'timeout', 'err_name_not_resolved', 'internet']
    ),
    (
      'WPS Office Corrupt atau Gagal Membuka Dokumen',
      'Software & Aplikasi',
      'b20f56d5-d3fd-4883-a294-e50d1d413b5a',
      'WPS Office error saat membuka spreadsheet/dokumen laporan, sering crash, atau menu tidak merespons.',
      '1. Tutup seluruh proses WPS dari Task Manager (Ctrl+Shift+Esc).\n2. Salin berkas kerja ke folder lokal (Documents/Desktop) sebelum dibuka bila file berasal dari unduhan chat.\n3. Jika muncul pesan corrupt/gagal repair, buat tiket dengan kategori Error Aplikasi Kerja agar tim IT melakukan repair atau instal ulang WPS Office.',
      ARRAY['wps', 'office', 'excel', 'word', 'corrupt', 'crash']
    ),
    (
      'Prosedur Penggantian Sparepart & Cek Stok (RAM, Headset, Mouse, Kabel Power, Charger)',
      'Hardware & Periferal',
      'a94c51d1-2964-4b52-b143-b1f79553bcd6',
      'Perangkat periferal kerja rusak (headset putus suara, mouse double-click, kabel power/charger rusak) atau kebutuhan upgrade RAM.',
      '1. Buat tiket dengan memilih kategori spesifik (Headset, Mouse, Kabel Power, Charger Laptop, atau Upgrade RAM).\n2. Sertakan nomor aset dan foto kondisi perangkat yang bermasalah.\n3. Sistem otomatis mengecek stok gudang: jika stok tersedia, tim IT segera memproses penggantian; jika stok kosong, tiket masuk antrian Menunggu Pengadaan bulan depan (GA & IT/Admin).',
      ARRAY['stok', 'sparepart', 'ram', 'headset', 'mouse', 'kabel power', 'charger', 'pengadaan']
    ),
    (
      'Checklist Setup Laptop Karyawan Baru (NJ) & Laptop Client',
      'Laptop Lifecycle & Performa',
      '237d4a2b-1676-42ef-be18-e3b4e0a72d35',
      'Permintaan penyiapan laptop baru (NJ), laptop sewa, atau laptop khusus client operasional sebelum diserahkan ke user.',
      '1. Ajukan tiket minimal H-1 sebelum jadwal serah terima dengan mencantumkan project/client tujuan.\n2. Pastikan inventaris nomor aset dan kapasitas RAM sudah tercatat di halaman Aset.\n3. Paket standar meliputi instalasi Chrome, WPS Office, OpenVPN/SoftEther, AnyDesk/UltraViewer, MicroSIP, MemReduce, serta penamaan ID remote ke inventaris aset.',
      ARRAY['setup', 'laptop baru', 'nj', 'client', 'onboarding', 'sewa']
    ),
    (
      'Langkah Cepat Saat Internet Down atau Melambat di Area Kerja',
      'Network & VPN',
      '1ceee41c-6f50-4434-bd9b-ddde5aa961d6',
      'Koneksi Wi-Fi/LAN di area kerja Debito Jogja terputus total atau melambat drastis bagi banyak pengguna.',
      '1. Cek apakah kendala terjadi di 1 perangkat saja atau banyak meja sekaligus.\n2. Jika banyak user terdampak, buat tiket dengan kategori Internet down / ISP down atau Internet lambat dan isi perkiraan jumlah user terdampak.\n3. Jika >50% user terdampak (>200 user), prioritas otomatis naik menjadi P0 agar seluruh staf IT menerima peringatan cepat.',
      ARRAY['internet', 'down', 'lambat', 'isp', 'wifi', 'lan', 'mikrotik', 'p0']
    )
) AS v(judul, grup, category_id, masalah, solusi, kata_kunci)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.knowledge_articles k
  WHERE lower(k.judul) = lower(v.judul)
);
