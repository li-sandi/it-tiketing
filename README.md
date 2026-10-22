# IT Ticketing

Aplikasi pelaporan dan pengelolaan tiket bantuan IT berbasis Next.js, Supabase,
dan Telegram.

## Fitur

- Form laporan publik di `/lapor` dan halaman status privat `/status/[token]`.
- Daftar tiket aktif lintas site dengan filter site dan urutan prioritas. Data
  pelapor serta deskripsi tiket orang lain tidak ditampilkan.
- Antrian dan pengelolaan tiket untuk staf IT.
- Poin kesulitan (skala 1–5) dan catatan solusi wajib diisi IT saat menandai
  tiket selesai.
- Prioritas, SLA, notifikasi Telegram, dan auto-close tiket.
- Lampiran foto serta AnyDesk ID/UV ID yang terhubung dengan nomor aset.
- Halaman utama publik untuk memulai laporan tiket.
- Tema terang dan gelap yang dapat dipilih pengguna.
- Admin Panel di `/admin` untuk mengelola kategori, user, dan jadwal kunjungan
  Sleman.
- Generator jadwal Selasa/Kamis selama delapan minggu, bergantian antara Miko
  dan Fuad.
- Tiket onsite untuk site tanpa petugas IT lokal diarahkan ke petugas kunjungan.
  P0/P1 memicu notifikasi penanganan segera, sedangkan P2/P3 dijadwalkan ke
  kunjungan terdekat dengan tanggal kunjungan tersimpan pada tiket.
- Jumlah task aktivasi/non-aktivasi VPN disimpan pada tiket; lebih dari 10 task
  otomatis menjadi P0.
- Status IT otomatis diselaraskan ke `sibuk` saat menangani tiket dan `free`
  setelah tidak ada tiket berstatus diproses; status manual `off`/`kunjungan`
  dipertahankan.
- Pengingat Telegram untuk daftar tiket kunjungan esok hari.
- Rate limiting form publik menggunakan Upstash Redis, 20 tiket per IP setiap
  15 menit untuk mengakomodasi jaringan kantor dengan IP bersama.

## Teknologi

- Next.js 16, React, TypeScript, dan Tailwind CSS 4.
- Supabase untuk autentikasi, database, dan penyimpanan lampiran.
- Telegram Bot API untuk notifikasi.
- Upstash Redis untuk rate limiting form publik.

## Menjalankan secara lokal

Prasyarat: Node.js dan npm.

1. Pasang dependensi:

   ```bash
   npm install
   ```

2. Buat file `.env.local` pada root project:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
   TELEGRAM_BOT_TOKEN=your-telegram-bot-token
   TELEGRAM_BOT_USERNAME=your_bot_username
   UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
   UPSTASH_REDIS_REST_TOKEN=your-upstash-token
   CRON_SECRET=replace-with-a-long-random-secret
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

   Simpan secret hanya di `.env.local` atau secret manager deployment. Jangan
   commit secret atau gunakan prefix `NEXT_PUBLIC_` untuk key rahasia.

3. Siapkan Supabase dan jalankan migrasi SQL berurutan sesuai
   [supabase/README.md](./supabase/README.md).
4. Jalankan `npm run dev`, lalu buka [http://localhost:3000](http://localhost:3000).

## Perintah pengembangan

```bash
npm run dev      # server development
npm run lint     # ESLint
npm run build    # production build dan pemeriksaan TypeScript
npm run start    # jalankan production build
```

## Halaman dan akses berdasarkan peran

`/` adalah halaman publik untuk memulai laporan; `/dashboard` adalah dashboard
akun yang memerlukan login; `/admin` adalah panel pengelolaan khusus admin.
Jadi dashboard akun dan Admin Panel bukan halaman yang sama: admin dapat
mengakses keduanya, sedangkan user/IT tidak dapat membuka Admin Panel.

| Route | Siapa yang dapat membuka | Kegunaan |
| --- | --- | --- |
| `/` | Semua orang | Halaman awal layanan dan tautan untuk melapor |
| `/lapor` | Semua orang | Membuat tiket publik tanpa login |
| `/status/[token]` | Pemegang token tiket | Melihat status dan riwayat tiket publik, memberi rating saat selesai |
| `/login` | Semua orang | Login akun user, IT, atau admin |
| `/dashboard` | User, IT, admin yang login | Dashboard akun; tautan tiket, pembuatan tiket, Telegram, dan antrian untuk staf |
| `/tiket` | Semua akun yang login | Ringkasan tiket aktif lintas site dengan filter; riwayat tiket selesai milik sendiri |
| `/tiket/baru` | Semua akun yang login | Membuat tiket atas nama akun |
| `/tiket/[id]` | Pembuat tiket tersebut, IT, atau admin | Detail dan aksi tiket sesuai role |
| `/antrian` | IT dan admin | Antrian baru dan tiket yang sedang ditangani |
| `/admin` | Admin saja | Ringkasan dan pintu masuk fitur Admin Panel |
| `/admin/kategori` | Admin saja | Mengelola kategori tiket |
| `/admin/users` | Admin saja | Mengelola role dan site user |
| `/admin/jadwal` | Admin saja | Melihat dan membuat jadwal kunjungan Sleman |

Dashboard akun menampilkan tautan **Admin Panel** hanya untuk admin. Di dalam
panel, navigasi **Dashboard** kembali ke `/dashboard`; halaman admin tetap
terkumpul di bawah `/admin` dengan navigasi Kategori, User, dan Jadwal.

### Endpoint API

API tidak dimaksudkan untuk dibuka langsung sebagai halaman web. Endpoint
`/api/admin/*` memerlukan role admin; endpoint cron memerlukan `CRON_SECRET`;
endpoint notifikasi tiket internal, Telegram, lampiran, dan pembuatan tiket
berakun memerlukan sesi atau validasi kepemilikan yang sesuai. Pembuatan tiket
publik dan API status/rating publik dibatasi validasi form atau token tiket.

## Database dan deployment

- Jalankan migrasi Supabase dalam urutan numerik. Database yang sudah berjalan
  hanya perlu menerima migrasi baru yang belum diterapkan.
- Terapkan migrasi `0014_remove_kota_baru_site.sql` untuk menghapus site Kota
  Baru tanpa menghapus record user, tiket, dan jadwal terkait.
- Terapkan migrasi `0015_replace_sleman_schedule.sql` sebelum menggunakan
  generator jadwal.
- Terapkan migrasi `0016_route_sleman_tickets.sql` untuk routing tiket Sleman
  ke petugas kunjungan dan SLA resolusi P1 pada hari kunjungan.
- Terapkan migrasi `0017_vpn_status_sleman_reminders.sql` untuk jumlah task VPN,
  status IT otomatis, routing tiket onsite ke kunjungan, dan tipe notifikasi
  pengingat.
- Terapkan migrasi `0018_active_ticket_board_and_solution.sql` untuk validasi
  poin kesulitan dan catatan solusi saat tiket ditandai selesai.
- Terapkan migrasi `0019_restrict_ticket_event_reads.sql` untuk membatasi
  riwayat tiket ke pembuatnya serta staf IT/admin.
- Deployment Vercel memerlukan environment variables yang sama dengan
  `.env.local`. Atur `NEXT_PUBLIC_APP_URL` ke domain produksi.
- Endpoint cron dilindungi oleh header `x-cron-secret` atau authorization
  bearer token. `vercel.json` menjadwalkan pengingat kunjungan Sleman dan
  auto-close harian.

### Scheduler SLA tiap 5 menit

Workflow GitHub Actions `.github/workflows/sla-check.yml` memanggil
`/api/cron/sla-check` dengan interval lima menit. Atur di GitHub repository
**Settings → Secrets and variables → Actions**:

- Variable `CRON_BASE_URL`: origin production HTTPS, tanpa slash di akhir
  (contoh `https://aplikasi.example.com`).
- Secret `CRON_SECRET`: nilai yang sama dengan secret deployment.

Workflow juga dapat dijalankan manual dari tab **Actions**. Jadwal GitHub
Actions dapat terlambat ketika antrean sibuk; selama UAT, pantau eksekusi
workflow dan response HTTP. Jika pemanggilan harus lebih presisi, gunakan
cron-job.org dengan URL `/api/cron/sla-check` dan header `x-cron-secret`.

Sebelum UAT routing Sleman, admin harus membuka `/admin/jadwal`, generate jadwal
8 minggu, lalu memastikan daftar kunjungan muncul. Tanpa jadwal aktif, routing
tiket onsite Sleman tidak dapat menentukan petugas kunjungan.

Rate limiter form publik menetapkan 20 tiket per IP per 15 menit. Request yang
ditolak dicatat sebagai event `public_ticket_rate_limited` tanpa menyimpan IP,
agar beban shared-IP dapat dievaluasi selama UAT.

Lihat [supabase/README.md](./supabase/README.md) untuk urutan migrasi, setup
Telegram, lampiran, rating, dan catatan database lainnya.
