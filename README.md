# IT Ticketing

Aplikasi pelaporan dan pengelolaan tiket bantuan IT berbasis Next.js, Supabase,
dan Telegram.

## Fitur

- Form laporan publik di `/lapor` dan halaman status privat `/status/[token]`.
- Antrian dan pengelolaan tiket untuk staf IT.
- Prioritas, SLA, notifikasi Telegram, dan auto-close tiket.
- Lampiran foto serta AnyDesk ID/UV ID yang terhubung dengan nomor aset.
- Dashboard publik dengan informasi yang aman ditampilkan.
- Tema terang dan gelap yang dapat dipilih pengguna.
- Admin Panel di `/admin` untuk mengelola kategori, user, dan jadwal kunjungan
  Sleman.
- Generator jadwal Selasa/Kamis selama delapan minggu, bergantian antara Miko
  dan Fuad.
- Tiket site Sleman pada hari kunjungan otomatis ditugaskan dan dinotifikasikan
  kepada IT yang bertugas; tiket P1 mendapat batas resolusi akhir hari WIB.
- Rate limiting form publik menggunakan Upstash Redis.

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

2. Buat file `.env.local` pada root project dan isi variabel yang diperlukan:

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
   commit secret, dan jangan gunakan prefix `NEXT_PUBLIC_` untuk key rahasia.
   `TELEGRAM_*` diperlukan untuk fitur Telegram; `CRON_SECRET` diperlukan untuk
   endpoint cron. Upstash diperlukan agar rate limiting form publik berfungsi.

3. Siapkan project Supabase dan jalankan migrasi SQL secara berurutan sesuai
   petunjuk di [supabase/README.md](./supabase/README.md).

4. Jalankan aplikasi:

   ```bash
   npm run dev
   ```

5. Buka [http://localhost:3000](http://localhost:3000).

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
  Baru; migrasi ini mengosongkan relasi site pada user, tiket, dan jadwal terkait
  sambil mempertahankan record-nya.
- Terapkan migrasi `0015_replace_sleman_schedule.sql` sebelum menggunakan
  generator jadwal.
- Terapkan migrasi `0016_route_sleman_tickets.sql` untuk routing tiket Sleman
  ke petugas kunjungan dan SLA resolusi P1 pada hari kunjungan.
- Deployment Vercel memerlukan environment variables yang sama dengan
  `.env.local`. Atur `NEXT_PUBLIC_APP_URL` ke domain produksi.
- Endpoint `/api/cron/sla-check` dan `/api/cron/auto-close` dilindungi oleh
  header `x-cron-secret`. Konfigurasikan scheduler eksternal untuk menjalankan
  endpoint tersebut secara berkala.

Lihat [supabase/README.md](./supabase/README.md) untuk urutan migrasi, setup
Telegram, lampiran, rating, dan catatan database lainnya.
