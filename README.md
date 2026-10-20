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
- Dashboard publik dengan informasi yang aman ditampilkan.
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

## Halaman utama

| Halaman | Keterangan |
| --- | --- |
| `/` | Dashboard publik |
| `/lapor` | Form laporan tiket publik |
| `/status/[token]` | Status dan rating tiket melalui link privat |
| `/login` | Login staf |
| `/dashboard` | Dashboard pengguna |
| `/tiket` | Tiket aktif lintas site dan riwayat tiket sendiri |
| `/antrian` | Antrian tiket IT |
| `/admin` | Ringkasan Admin Panel |
| `/admin/kategori` | Kelola kategori tiket |
| `/admin/users` | Kelola peran dan site pengguna |
| `/admin/jadwal` | Lihat dan generate jadwal kunjungan Sleman |

Admin Panel hanya dapat diakses oleh akun dengan peran `admin`. Masing-masing
fitur admin tersedia dari navigasi bersama di bagian atas halaman.

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
- Deployment Vercel memerlukan environment variables yang sama dengan
  `.env.local`. Atur `NEXT_PUBLIC_APP_URL` ke domain produksi.
- Endpoint cron dilindungi oleh header `x-cron-secret` atau authorization
  bearer token. `vercel.json` menjadwalkan pengingat kunjungan Sleman dan
  auto-close harian; gunakan scheduler eksternal tiap 5 menit untuk
  `/api/cron/sla-check`.

Lihat [supabase/README.md](./supabase/README.md) untuk urutan migrasi, setup
Telegram, lampiran, rating, dan catatan database lainnya.
