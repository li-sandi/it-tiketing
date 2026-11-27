# IT Ticketing

Aplikasi pelaporan, antrian SLA, inventaris aset, Wiki SOP, dan pelaporan beban kerja tim IT berbasis Next.js 16.4.6 (Cache Components & Partial Prefetching), Supabase (`@supabase/ssr`), Redis, dan Telegram.

Fokus operasional saat ini: **Debito Jogja** (400 user, 1 entitas site aktif).

## Fitur Utama

- **Pelaporan Publik & Terautentikasi (`/lapor`, `/tiket/baru`):**
  - Pemilihan kategori 2 langkah berbasis kelompok berdasarkan Daily Ticket Report Debito Jogja (`Network & VPN`, `Hardware & Periferal`, `Software & Aplikasi`, `Laptop Lifecycle & Performa`, `Akses & Keamanan`, serta `Internal IT` khusus IT/Admin).
  - Pengecekan stok sparepart langsung pada kategori terkait (`RAM`, `Headset`, `Mouse`, `Kabel Power`, `Charger Laptop`): jika stok > 0 langsung masuk antrian tindakan; jika stok = 0 otomatis masuk status `menunggu_pengadaan` dengan estimasi pengadaan tanggal 1 bulan depan (WIB).
  - Auto-select site tunggal (`Debito Jogja`), auto-fill ID AnyDesk & UltraViewer berdasarkan nomor aset, kolom password terenkripsi AES-256-GCM (sementara), serta input foto/screenshot layar AnyDesk/UltraViewer.
  - Deteksi perangkat RAM ≤4 GB dari inventaris aset dengan opsi rekomendasi Upgrade RAM.
  - Cek Mandiri (Wiki/SOP + opsional Gemini RAG) sebelum tiket dikirim.
- **Antrian, SLA, Aging & Auto-Close (`/antrian`, `/tiket/[id]`):**
  - Perhitungan kenaikan prioritas P0 tervalidasi penuh di server & database (`>50%` user site untuk Internet lambat, `>5` user untuk VPN, `>10` task untuk aktivasi VPN).
  - SLA Respon & Resolusi otomatis, jeda timer otomatis saat status `menunggu_user` / `menunggu_pengadaan` / `dijadwalkan_kunjungan`, serta SLA P3 berbasis hari kerja WIB (melewati akhir pekan & hari libur).
  - Queue aging otomatis untuk tiket `baru` yang melewati SLA respon, dan auto-close sesuai target SLA resolusi per level prioritas.
  - Kontrol status ketersediaan IT manual (`free` / `off`) dan merge tiket serupa.
- **Dashboard, Laporan Beban Kerja & Wiki (`/dashboard`, `/laporan`, `/wiki`):**
  - Workload View per staf IT (urut abjad, tanpa peringkat), filter mingguan/bulanan/kuartalan, export CSV aman dari formula injection, dan laporan mingguan otomatis Telegram.
  - Basis pengetahuan Wiki/SOP yang bisa dipromosikan langsung dari catatan solusi tiket.
- **Inventaris Aset & Persetujuan GA (`/aset`, `/admin`):**
  - Manajemen aset perangkat & ID remote statis, serta alur approval GA/Admin untuk permintaan seperti Upgrade RAM.
  - Panel Admin lengkap (`/admin/kategori`, `/admin/sites`, `/admin/users`, `/admin/pengaturan`, `/admin/jadwal`).
- **Dukungan On-Premise:**
  - `Dockerfile`, `docker-compose.onprem.yml`, skrip migrasi, serta skrip backup/restore database.

## Halaman dan Akses Berdasarkan Peran

| Route | Siapa yang Dapat Membuka | Kegunaan |
|---|---|---|
| `/` | Semua orang | Halaman awal layanan dan tautan untuk melapor |
| `/lapor` | Semua orang | Membuat tiket publik tanpa login |
| `/status/[token]` | Pemegang token tiket | Melihat status, jadwal kunjungan, riwayat tiket publik, & memberi rating |
| `/login` | Semua orang | Login akun User, IT, GA, atau Admin |
| `/dashboard` | User, IT, GA, Admin | Ringkasan operasional per peran, status IT, notifikasi browser, & tautan Telegram |
| `/tiket` | Semua akun login | Ringkasan tiket aktif dan riwayat tiket selesai milik sendiri |
| `/tiket/baru` | Semua akun login | Membuat tiket atas nama akun |
| `/tiket/[id]` | Pembuat, IT, Admin, GA (approval) | Detail, SLA timer, aksi tiket, kredensial remote teraudit, approval, & merge |
| `/antrian` | IT dan Admin | Antrian baru urut prioritas, status IT manual, & tiket yang sedang ditangani |
| `/laporan` | IT dan Admin | KPI layanan, Workload View tim IT, rincian kategori/prioritas, & export CSV |
| `/wiki` | Semua akun login (`IT`/`Admin` kelola) | Basis pengetahuan Wiki & SOP penyelesaian masalah |
| `/aset` | IT, Admin, dan GA | Inventaris aset perangkat, RAM, dan ID AnyDesk/UV statis |
| `/stok` | GA, IT, dan Admin | Kelola stok sparepart (`RAM`, `Headset`, `Mouse`, `Kabel Power`, `Charger Laptop`) & pantau tiket pengadaan |
| `/admin` | Admin | Ringkasan dan pintu masuk Admin Panel |
| `/admin/kategori` | Admin | Tambah/edit kategori, kelompok kategori, prioritas, & persyaratan form |
| `/admin/sites` | Admin | Kelola site aktif (`Debito Jogja`, 400 user) & nonaktif |
| `/admin/users` | Admin | Kelola peran (`user`, `it`, `ga`, `admin`) & site user |
| `/admin/jadwal` | Admin | Generator jadwal kunjungan multi-site dinamis (tampil saat `sleman_routing_enabled` aktif) |
| `/admin/pengaturan` | Admin | Feature flag, daftar hari libur SLA P3, rate limit, & laporan mingguan |
| `/admin/audit` | Admin | Riwayat log audit perubahan kategori, site, user, & pengaturan admin |

## Menjalankan Secara Lokal

1. Pasang dependensi:

   ```bash
   npm install
   ```

2. Salin `.env.example` ke `.env.local` dan isi variabel yang diperlukan:

   ```bash
   cp .env.example .env.local
   ```

3. Terapkan migrasi SQL di `supabase/migrations/` secara berurutan (`0001` sampai `0031`), lihat [supabase/README.md](./supabase/README.md). *(Untuk project Supabase `it-ticketing` / `nfpepubznnrmbrutnywl`, migrasi `0020`–`0031` sudah diterapkan langsung ke database live.)*
4. Jalankan server pengembangan:

   ```bash
   npm run dev
   ```

## Perintah Pengembangan & Pengujian

```bash
npm run dev      # server development
npm run test     # unit test (Vitest)
npx vitest run --config vitest.e2e.config.ts # E2E test suite (Tiers 1–4)
npm run lint     # ESLint
npx tsc --noEmit # TypeScript check
npm run build    # production build
```

## Riwayat Perubahan (Changelog)

Rincian lengkap setiap perubahan (migrasi database `0020`–`0031`, endpoint API, perbaikan bug, komponen UI, pengujian, CI, dan paket on-premise) didokumentasikan di [CHANGELOG.md](./CHANGELOG.md).

Ringkasan rilis terbaru (**2026-11-26 — Optimasi Performa Navigasi, Cache Components, E2E & Tier-5**):
- Optimasi performa navigasi lintas halaman Next.js 16.4.6 (`cacheComponents: true`, `partialPrefetching: true`), `proxy.ts` bypass tanpa cookie auth, DAL tercache (`lib/auth.ts`, `lib/settings.ts`, `lib/data/*`) dengan invalidasi tag, shared `app/(app)/layout.tsx` App Shell + `<Suspense>` streaming (`0` halaman `ƒ Dynamic`), reset state `<Activity>`, suite E2E Tiers 1–4 (`vitest.e2e.config.ts`) & hardening Tier-5.
- Penutupan kebocoran ID AnyDesk/UV anonim pada `/api/tiket/remote-ids` & pembatasan akses `/api/aset/lookup`, penautan ID aset di server, audit perubahan admin (`0031_admin_audit_logs.sql`, `/admin/audit`), serta `.github/workflows/ci.yml` dan `scripts/verify-rls.sql`.
- Peningkatan UX operasional: tabel interaktif desktop + kartu mobile di `/antrian` dan `/tiket`, pratinjau prioritas & SLA sebelum kirim, progress bar SLA, toast & dialog konfirmasi aksesibel, serta skeleton loading pada rute utama.
- Pembaruan antarmuka bergaya Corporate Service Desk di seluruh halaman & komponen dalam dengan navigasi Sidebar + Top Bar responsif (`AppShell`), dukungan mode terang/gelap terverifikasi kontras WCAG AA, dan portal beranda SLA.
- Pembaruan kategori IT sesuai *Daily Ticket Report* Debito Jogja + relasi stok sparepart di Admin Kategori + import massal CSV aset (`/aset`) + seed 10 artikel Wiki/SOP (`0030`) + modul stok sparepart (`/stok`) auto-pengadaan bulan depan.
- Konsolidasi site menjadi **Debito Jogja** (400 user), pengelompokan kategori 2 langkah, serta peningkatan halaman `/tiket`, `/antrian`, `/dashboard`, dan `/admin/*`.
- Enkripsi AES-256-GCM untuk password AnyDesk/UV sementara, upload foto layar remote terisolasi (`foto_remote`), audit pembukaan kredensial, dan auto-purge saat tiket selesai.
- Validasi eskalasi prioritas penuh di DB, SLA P3 hari kerja WIB, pause/resume SLA, queue aging, auto-close sesuai target SLA per level, dan rate limit darurat P0.
- Penambahan modul Laporan Beban Kerja (`/laporan`), Wiki SOP & Cek Mandiri (`/wiki`), Merge Tiket, Inventaris Aset & Approval GA (`/aset`), serta dukungan Docker on-premise (`Dockerfile`, `docker-compose.onprem.yml`, skrip backup/restore).

Lihat dokumentasi teknis lengkap di [docs/DOKUMENTASI_SISTEM.md](./docs/DOKUMENTASI_SISTEM.md) dan panduan server lokal di [docs/RUNBOOK_ONPREM.md](./docs/RUNBOOK_ONPREM.md).
