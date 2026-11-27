# Changelog

Seluruh perubahan signifikan pada proyek **IT Ticketing** dicatat pada berkas ini.

---

## [2026-11-26] — Optimasi Performa Navigasi, Cache Components, E2E & Tier-5

### Ditambahkan & Diubah (Added & Changed)
- **Arsitektur Caching, Proxy & Data Access Layer (M1):**
  - `proxy.ts` & `lib/__tests__/proxy.test.ts` — batas jaringan Node.js ringan yang melewati pemanggilan Supabase saat cookie `sb-*-auth-token` tidak ada (nol overhead untuk rute publik), memakai `supabase.auth.getClaims()` untuk validasi/refresh sesi tanpa query DB aplikasi, dan menjaga fallback aman bila env publik Supabase belum diset.
  - `lib/auth.ts` & `lib/__tests__/auth.test.ts` — DAL autentikasi terpusat menggunakan `React.cache()` + `"use cache: private"` (`stale: 60s`) untuk `getCurrentUserSession()` dan `getCurrentUserProfile()` (dengan helper internal `"use cache"` bertag `users` & `user-profile:${userId}`), serta `requireAuthUser()` (`getUser()`) ketat untuk mutasi/Server Actions.
  - `lib/settings.ts` & `lib/__tests__/settings.test.ts` — konsolidasi 4 query tabel `settings` menjadi 1 pembacaan `"use cache"` (`cacheLife("hours")`, `cacheTag("settings")`) cookie-free serta perlindungan terhadap payload `__proto__`.
  - `lib/data/{categories,sites,stocks,wiki,assets,users,schedule}.ts` & `lib/__tests__/data-cache.test.ts` — lapisan data referensi bercache (`"use cache"`, `cacheTag`, `cacheLife`) dan invalidasi `revalidateTag(..., { expire: 0 })` pada endpoint mutasi (`app/api/admin/*`, `app/api/aset*`, `app/api/stok*`, `app/api/wiki*`, `app/api/telegram/sync`).
  - `components/layout/AppShell.tsx` — tombol *Keluar* melakukan full navigation (`window.location.href = "/login"`) untuk mereset state `<Activity>` di sisi klien.
- **Shared App Shell, Partial Prerendering & Streaming (M2):**
  - `app/(app)/layout.tsx` & pemindahan seluruh rute terautentikasi ke route group `app/(app)/*` — `AppShellFrame` dipasang sekali agar sidebar dan top bar tetap menempel saat berpindah halaman tanpa double-mount di `app/(app)/admin/layout.tsx`, dengan slot dinamis di balik `<Suspense>`.
  - Penghapusan `export const instant = false` dan `await connection()` top-level, paralelisasi query (`Promise.all` / `Promise.allSettled`), streaming panel sekunder (`/tiket/[id]`, `/status/[token]` tanpa waterfall `useEffect`), penambahan `loading.tsx` di `/aset`, `/wiki`, `/lapor`, dan `/admin`, serta pemakaian `next/form` `<Form>` untuk filter soft navigation di `/tiket` dan `/laporan`.
- **Perbaikan Bug & Hardening Tier-5 (M3):**
  - `components/tiket/PublicTicketForm.tsx` & `components/tiket/TicketForm.tsx` — reset `loading` dan input form saat submit berhasil serta `useLayoutEffect` cleanup sesuai panduan `<Activity>` agar tombol submit tidak pernah tertinggal disabled `"Mengirim..."` saat kembali lewat `<Link>`.
  - `app/status/[token]/page.tsx`, `app/(app)/tiket/page.tsx`, `app/api/tiket/publik/route.ts`, `app/api/tiket/publik/[token]/route.ts`, `app/api/tiket/publik/[token]/rating/route.ts`, `app/api/tiket/remote-ids/route.ts`, dan `app/api/wiki/self-check/route.ts` — pembungkusan `createAdminClient()` dalam `try/catch` agar ketiadaan `SUPABASE_SERVICE_ROLE_KEY` merender UI error/JSON `500` (`Cache-Control: no-store`) secara anggun tanpa React error #441.
  - `lib/laporan-metrics.ts`, `app/(app)/laporan/page.tsx`, dan `app/api/laporan/export/route.ts` — validasi/normalisasi batas `tahun` (`2000–2100`) dan `kuartal` (`1–4`) mencegah `RangeError: Invalid time value`.
  - `app/api/telegram/sync/route.ts` — memindahkan `revalidateTag("user-profile:...")` dan `revalidateTag("users")` tepat setelah `redemption.result === "linked"` sebelum `kirimPesan()` agar cache tetap terinvalidasi meski API Telegram gagal.
  - `app/api/notifications/subscribe/route.ts` (`DELETE`), `app/api/stok/route.ts` (`POST`), `app/api/stok/adjust/route.ts` (`POST`), `app/api/tiket/lampiran/route.ts` (`POST`), `app/api/notif/tiket-baru/route.ts` (`POST`), `app/api/telegram/link/route.ts` (`POST`), dan `app/api/telegram/sync/route.ts` (`POST`) — penegakan pemeriksaan CSRF `Origin` (`403`) dan header `Cache-Control: no-store`.
- **Suite Pengujian E2E & Adversarial Tier-5:**
  - `vitest.e2e.config.ts` & `tests/e2e/{helpers/*,tier1-route-reachability-auth,tier2-boundary-and-errors,tier3-cross-feature-rsc-flows,tier4-browser-scenarios}.test.ts` — cakupan penuh 20 rute aplikasi, matriks proteksi 35/35 endpoint API non-cron, validasi boundary/CSRF/PPR, dan skenario browser CDP headless.
  - `lib/__tests__/actions.test.ts` & `lib/__tests__/api-hardening.test.ts` serta perluasan `auth.test.ts`, `settings.test.ts`, dan `laporan.test.ts`.

### Ringkasan Benchmark Performa (Before F1 vs After M3)
- **Klasifikasi Build (`next build`):** Rute halaman `ƒ Dynamic` turun dari `10` menjadi **`0`** (`4` `○ Static` termasuk `/lapor`, `17` `◐ Partial Prerender`).
- **Transisi Browser Headless (`/` → `/lapor`):** Cold `13.179 ms` → **`82,5 ms`** (`-99,4%`, `0` request saat klik); Warm `2.685 ms` → **`25,9 ms`** (`-99,0%`).
- **HTTP Document & RSC (`/lapor`, `/admin/pengaturan`):** Document `/lapor` cold `4.343,6 ms` → **`225,9 ms`** (`-94,8%`), warm `499,3 ms` → **`23,4 ms`** (`-95,3%`); Document `/admin/pengaturan` warm `1.092,8 ms` → **`44,7 ms`** (`-95,9%`).

---

## [2026-11-26] — Penguatan Keamanan, Audit Admin, Peningkatan UX, & CI

### Ditambahkan & Diubah (Added & Changed)
- **Keamanan & Privasi Kredensial Remote:**
  - `lib/remote-id-policy.ts` (`sanitizeRemoteLookupResult`) & `lib/__tests__/remote-ids-privacy.test.ts` — mencegah kebocoran ID statis AnyDesk/UltraViewer untuk pemanggil anonim atau pengguna non-pemilik pada `POST /api/tiket/remote-ids`, sambil mempertahankan metadata non-sensitif (`ramGb`, `assetName`, `hasSavedRemoteId`).
  - Pembatasan rate limit per endpoint (`checkEndpointRateLimit` di `lib/rate-limit.ts`) untuk `POST /api/tiket/remote-ids` (30/15 menit) dan `GET /api/aset/lookup` (60/15 menit), serta pembatasan akses `GET /api/aset/lookup` khusus staf terautentikasi (`it`, `admin`, `ga`).
  - Penautan ID statis AnyDesk/UltraViewer otomatis di sisi server (`app/api/tiket/publik/route.ts`, `app/api/tiket/remote-credentials/route.ts`) berdasarkan `nomorAset` dan `RemoteCredentialFields.tsx`.
- **Audit Log Admin & Kontrol Menu Jadwal:**
  - `supabase/migrations/0031_admin_audit_logs.sql` (sudah diterapkan ke Supabase live `nfpepubznnrmbrutnywl`) — tabel `admin_audit_logs` beserta kebijakan RLS khusus admin.
  - `lib/admin-audit.ts` (`logAdminAction`), halaman `/admin/audit` (`app/admin/audit/page.tsx`), serta pencatatan audit pada endpoint `/api/admin/kategori`, `/api/admin/sites`, `/api/admin/users/[id]`, dan `/api/admin/settings`.
  - Menu & akses `/admin/jadwal` disembunyikan secara default dan mengikuti flag `feature_flags.sleman_routing_enabled` di `AppShell.tsx`, `app/admin/layout.tsx`, dan `app/admin/page.tsx`.
- **UX Antrian, SLA, Feedback, & Skeleton Loading:**
  - `StatusBadge.tsx` — pembeda warna biru untuk prioritas `P2`.
  - `TicketBoardClient.tsx` — tabel interaktif desktop (pencarian, filter status/prioritas, pengurutan kolom) dan daftar kartu responsif untuk `/antrian` dan `/tiket`.
  - `SlaTimer.tsx` — bilah progres visual SLA pada `/tiket/[id]`.
  - `PriorityPreviewBanner.tsx` — pratinjau prioritas & target SLA langsung di `PublicTicketForm` dan `TicketForm`.
  - `app/page.tsx` — penambahan informasi jam layanan IT & cakupan bantuan di beranda.
  - `ToastProvider.tsx` & `ConfirmDialog.tsx` — notifikasi toast global di `app/layout.tsx` serta dialog konfirmasi aksesibel pada `RemoteCredentialPanel`, `UserRatingForm`, `MergeTicketPanel`, dan feedback toast pada `TicketActions`.
  - Skeleton pemuatan (`loading.tsx`) pada `/dashboard`, `/antrian`, `/tiket`, `/stok`, dan `/laporan`.
- **DevOps, CI, & Verifikasi Database:**
  - `.github/workflows/ci.yml` — workflow CI otomatis (`npm run test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` pada Node 22).
  - `scripts/verify-rls.sql` — kueri verifikasi status RLS dan jumlah policy 12 tabel inti.

---

## [2026-11-26] — Pembaruan Desain Antarmuka Corporate Service Desk

### Ditambahkan & Diubah (Added & Changed)
- **Sistem Desain & Tema Terpadu (`app/globals.css`, `app/layout.tsx`, `components/theme/ThemeToggle.tsx`):**
  - Palet warna Corporate Service Desk (netral slate + aksen biru korporat `#1D4ED8`) dengan kontras terverifikasi WCAG AA pada mode terang dan gelap, skrip inisialisasi tema tanpa *flash*, dukungan penuh `tabular-nums`, feedback tekan `:active`, fokus keyboard `:focus-visible`, serta `prefers-reduced-motion`.
- **Layout Navigasi Responsif (`components/layout/`):**
  - `AppShell.tsx` — sidebar tetap di desktop (`240px`) + drawer responsif (`Escape` & backdrop) di mobile yang memfilter menu berdasarkan peran (`Operasional`, `Inventaris & Stok`, `Administrasi`), menampilkan profil + tombol *Keluar*, serta top bar lengket berisi judul halaman & pengalih tema.
  - `PublicHeader.tsx` & `BrandMark.tsx` — header terpadu dan identitas visual untuk halaman publik (`/`, `/lapor`, `/status/[token]`, `/login`).
- **Pembaruan Halaman & Komponen:**
  - Portal utama (`/`) menampilkan tata letak asimetris dengan ringkasan target SLA layanan P0–P3.
  - Halaman `/login` dilengkapi `<label>` aksesibel dan tautan lapor cepat.
  - Seluruh halaman internal (`/dashboard`, `/tiket`, `/tiket/baru`, `/tiket/[id]`, `/antrian`, `/stok`, `/aset`, `/laporan`, `/wiki`, `/admin/*`) terintegrasi dalam `AppShell`, dengan pembaruan visual pada `StatusBadge`, `ItStatusToggle`, `CategoryGroupSelector`, `StockConsumeButton`, `PublicTicketForm`, `TicketForm`, `PublicTicketStatus`, dan `StokClient` (tanpa emoji dekoratif).
- **Paket Lanjutan Operasional (Admin Relasi Stok, Import CSV Aset, Wiki SOP Seed & Penuntasan Komponen):**
  - `supabase/migrations/0030_seed_initial_wiki_sop.sql` — seed 10 artikel SOP terpublikasi berdasarkan *Daily Ticket Report* Debito Jogja untuk mengisi basis pengetahuan `/wiki` dan fitur *Cek Mandiri*. Sudah diterapkan ke Supabase live (`nfpepubznnrmbrutnywl`).
  - `lib/aset-csv.ts`, `lib/__tests__/aset-csv.test.ts`, dan `POST /api/aset/import` — parser CSV + endpoint import massal inventaris aset (maksimal 500 baris per batch, dukungan BOM, pemisah `,`/`;`, template CSV unduhan, serta UI import pada `AssetClient`).
  - Pengelolaan relasi `stock_kode` langsung di `/admin/kategori` (`KategoriTable`, `POST /api/admin/kategori`, `PATCH /api/admin/kategori/[id]`).
  - Penuntasan gaya Corporate Service Desk pada seluruh komponen dalam (`SitesTable`, `UserTable`, `SettingsForm`, `GenerateJadwalClient`, `WikiClient`, `TicketActions`, `ApprovalActions`, `MergeTicketPanel`, `RemoteCredentialFields`, `RemoteCredentialPanel`, `SelfCheckPanel`, `SlaTimer`, `UserRatingForm`, `PromoteWikiButton`, `HubungkanTelegram`, `BrowserNotificationToggle`).

---

## [2026-11-26] — Revamp Kategori Daily Report & Stok Sparepart Auto-Pengadaan

### Ditambahkan & Diubah (Added & Changed)
- **Migrasi Database (`supabase/migrations/`):**
  - `0027_revamp_categories_daily_report.sql` — pembaruan 19 kategori IT berdasarkan *Daily Ticket Report* Debito Jogja ke 6 kelompok (`Network & VPN`, `Hardware & Periferal`, `Software & Aplikasi`, `Laptop Lifecycle & Performa`, `Akses & Keamanan`, `Internal IT`), menonaktifkan 3 kategori duplikat 0-tiket tanpa memutus FK tiket lama, serta menambahkan `Kabel Power bermasalah / ganti kabel power` dan `Headset bermasalah / ganti headset`. Kategori `tipe = 'internal'` disembunyikan dari form publik (`/lapor`, `POST /api/tiket/publik`) dan pelapor non-IT/Admin di `/tiket/baru`.
  - `0028_sparepart_stock_and_auto_procurement.sql` — tabel `inventory_stocks` & `stock_movements`, relasi `stock_kode` pada `categories` & `tickets` (untuk `ram`, `headset`, `mouse`, `kabel_power`, `charger_laptop`, plus item standar `keyboard` & `baterai_fan`), pembaruan trigger `init_ticket_asset_and_approval()` untuk auto-pengadaan (`status = 'menunggu_pengadaan'`, `sla_paused_at = now()`, `approval_status = 'menunggu'`, `estimasi_pengadaan = tanggal 1 bulan depan WIB`) saat stok kosong (`0`), trigger log event `trg_log_auto_procurement_event`, serta RPC atomik `adjust_inventory_stock()` dengan kontrol akses `ga` / `it` / `admin`.
  - `0029_harden_stock_rpc_permissions.sql` — pencabutan izin eksekusi `anon`/`PUBLIC` pada `adjust_inventory_stock()` dan `log_auto_procurement_event()`, serta validasi `auth.role() <> 'service_role' AND auth.uid() IS NULL`.
  - **Status Eksekusi Supabase Live:** Migrasi `0027`–`0029` telah diterapkan langsung ke project `nfpepubznnrmbrutnywl` dan diverifikasi.
- **Pustaka, API & UI Stok Sparepart:**
  - `lib/stok.ts` & `lib/__tests__/stok.test.ts` — evaluasi status stok, kalkulasi tanggal 1 bulan berikutnya (WIB), resolusi status awal tiket, dan 4 unit test baru.
  - `GET/POST /api/stok` dan `POST /api/stok/adjust` — endpoint baca riwayat mutasi, tambah item, dan mutasi stok atomik (dengan deteksi tiket `menunggu_pengadaan` saat restock).
  - `/stok` (`app/stok/page.tsx`, `components/stok/StokClient.tsx`) — dashboard stok sparepart untuk GA, IT, & Admin.
  - `components/tiket/StockConsumeButton.tsx` — tombol 1-klik *"Ambil 1 & Catat Pemakaian"* pada `/tiket/[id]`.
  - Pembaruan `PublicTicketForm`, `TicketForm`, `PublicTicketStatus`, `TicketActions`, `app/tiket/[id]`, `app/antrian` (seksi *Menunggu Pengadaan Sparepart*), `app/dashboard`, `app/admin`, `lib/notifikasi.ts`, `KategoriTable`, dan `WikiClient`.

---

## [2026-11-26] — Rilis Fase 0 s.d. Fase 5 (Fokus Debito Jogja)

### Ditambahkan (Added)
- **Migrasi Database (`supabase/migrations/`):**
  - `0020_debito_jogja_core_and_sla.sql` — konsolidasi site tunggal `Debito Jogja` (400 user), pengelompokan kategori (`categories.grup`), tabel `settings`, fungsi hari kerja WIB (`add_working_days_wib`), validasi penuh eskalasi prioritas di trigger `set_sla_batas()`, jeda/lanjut SLA otomatis (`handle_sla_pause`), RPC queue aging (`age_overdue_ticket`), dan RPC auto-close sesuai target SLA (`auto_close_due_tickets`).
  - `0021_remote_credentials_and_security.sql` — pembatasan akses `foto_remote` di tabel `attachments` & `storage.objects`, audit `kredensial_dilihat`, pembersihan `password_terenkripsi` saat tiket selesai/ditutup (`scrub_remote_passwords_on_complete`), serta RPC status IT manual (`set_manual_it_status`).
  - `0022_wiki_and_ticket_merge.sql` — tabel `knowledge_articles` dengan *full-text search* (trigger `knowledge_articles_search_trigger` + indeks GIN), RPC `merge_tickets`, dan trigger sinkronisasi penyelesaian tiket anak (`sync_merged_children`).
  - `0023_sleman_hardening.sql` — tabel `schedule_reminder_deliveries` untuk deduplikasi pengingat H-1 per `(site_id, tanggal, it_id)`.
  - `0024_assets_approval_multichannel.sql` — tabel inventaris `assets`, penautan otomatis aset & status approval pada `tickets` (`init_ticket_asset_and_approval`), perluasan policy baca GA pada `tickets` & `ticket_events`, serta tabel `push_subscriptions` dan `notification_logs`.
  - `0025_deactivate_non_jogja_sites.sql` — menonaktifkan sementara site selain `Debito Jogja` (`Depok`, `Jakarta`, `Sleman` diset `aktif = false`) tanpa menghapus data.
  - `0026_add_ga_user_role.sql` — memperluas constraint `users_peran_check` untuk menambahkan peran `ga`.
  - **Status Eksekusi Supabase Live:** Migrasi `0020`–`0026` telah diterapkan langsung ke project Supabase `it-ticketing` (`nfpepubznnrmbrutnywl`) dan diverifikasi melalui `list_migrations`, pemeriksaan 18 tabel & fungsi RPC, serta `get_advisors`.
- **Pustaka Inti (`lib/`):**
  - `lib/crypto.ts` — enkripsi & dekripsi AES-256-GCM (*fail-closed*) untuk password remote sementara.
  - `lib/image-validation.ts` — validasi *magic bytes* gambar (JPEG, PNG, WebP, GIF, maks 5 MB) bersama.
  - `lib/settings.ts` — pembacaan konfigurasi dinamis (`feature_flags`, `working_hours`, `rate_limit`, `weekly_report`).
  - `lib/rate-limit.ts` — rate limiter form publik dengan kuota umum (20) & darurat P0 (100) serta backend `memory` untuk on-premise.
  - `lib/remote-cleanup.ts` — pembersihan otomatis file & metadata `foto_remote` saat tiket selesai/auto-close.
  - `lib/email.ts` — pengirim email notifikasi opsional (Resend REST API atau webhook) dengan logging ke `notification_logs`.
  - `lib/laporan-metrics.ts` & `lib/laporan.ts` — agregasi beban kerja IT (urut nama, tanpa peringkat), kepatuhan SLA, dan `escapeCsvCell` anti-formula injection.
- **Endpoint API (`app/api/`):**
  - `POST /api/tiket/remote-credentials` & `POST /api/tiket/[id]/remote-reveal` — penyimpanan terenkripsi dan pembukaan kredensial/foto remote dengan audit log.
  - `POST /api/tiket/[id]/merge` — penggabungan tiket aktif serupa ke tiket induk.
  - `POST /api/tiket/[id]/approval` — keputusan approval GA/Admin (`disetujui` / `ditolak`).
  - `GET/PATCH /api/it/status` — pengelolaan status manual staf IT (`free` / `off` / `kunjungan`).
  - `GET/POST /api/wiki`, `PATCH/DELETE /api/wiki/[id]`, dan `POST /api/wiki/self-check` — manajemen Wiki SOP dan Cek Mandiri (Postgres FTS + opsional Gemini RAG).
  - `GET/POST /api/aset`, `PATCH/DELETE /api/aset/[id]`, dan `GET /api/aset/lookup` — CRUD inventaris aset & deteksi RAM.
  - `GET /api/laporan/export` — unduh laporan CSV aman.
  - `POST/DELETE /api/notifications/subscribe` — pendaftaran langganan notifikasi browser.
  - `GET /api/cron/weekly-report` — pengirim laporan mingguan Telegram otomatis.
  - `POST /api/admin/kategori`, `GET/POST /api/admin/sites`, `PATCH /api/admin/sites/[id]`, `GET/PATCH /api/admin/settings` — kontrol Admin Panel lengkap.
- **Halaman & Komponen UI (`app/`, `components/`, `public/`):**
  - Halaman baru: `/laporan`, `/wiki`, `/aset`, `/admin/sites`, `/admin/pengaturan`.
  - Komponen baru: `CategoryGroupSelector`, `RemoteCredentialPanel`, `SelfCheckPanel`, `MergeTicketPanel`, `ApprovalActions`, `PromoteWikiButton`, `ItStatusToggle`, `BrowserNotificationToggle`, dan `public/sw.js`.
- **Automasi, On-Premise & Dokumentasi:**
  - `.github/workflows/weekly-report.yml` — jadwal otomatis Jumat 14:30 WIB (07:30 UTC).
  - `Dockerfile`, `.dockerignore`, `docker-compose.onprem.yml` — kemasan container standalone + PostgreSQL 16 + Redis 7 + sidecar cron.
  - `scripts/run-migrations.mjs`, `scripts/backup-db.sh`, `scripts/restore-db.sh` — skrip migrasi, backup retensi 14 hari, dan restore drill.
  - `.env.example`, `docs/DOKUMENTASI_SISTEM.md`, `docs/RUNBOOK_ONPREM.md`.
- **Unit Test (Vitest):**
  - `vitest.config.ts` dan 5 suite test (`lib/__tests__/prioritas.test.ts`, `sla.test.ts`, `crypto.test.ts`, `tiket-status.test.ts`, `laporan.test.ts`) dengan total 16 test case.

### Diubah (Changed)
- **Konsolidasi Site:** Menggabungkan Terban dan Ngampilan menjadi satu entitas aktif **Debito Jogja** (`400` user); Sleman dipertahankan nonaktif (`aktif = false`) sampai multi-site diaktifkan kembali. Form `/lapor` dan `/tiket/baru` otomatis memilih site tunggal aktif.
- **Form Pelaporan & Kredensial Remote:** Menambahkan pilihan 2 langkah berdasarkan kelompok kategori (`grup`), auto-fill ID statis AnyDesk/UV, input password terenkripsi sementara, upload foto/screenshot AnyDesk/UV, serta banner rekomendasi Upgrade RAM jika aset terdeteksi memiliki RAM ≤4 GB.
- **Mesin SLA, Cron & Notifikasi:**
  - SLA P3 menggunakan 1 hari kerja WIB (melewati Sabtu–Minggu dan hari libur di `settings`).
  - `.github/workflows/sla-check.yml` kini memanggil `/api/cron/sla-check` (termasuk queue aging) dan `/api/cron/auto-close` (mengikuti SLA tiap level prioritas) setiap 5 menit.
  - `/admin/kategori`, `/admin/users` (dukungan peran `ga`), `/admin/jadwal`, `/dashboard`, `/antrian`, `/tiket`, dan `/tiket/[id]` diperbarui sesuai fitur baru.
  - `next.config.ts` mendukung `BUILD_STANDALONE=true` untuk build Docker on-premise.

### Diperbaiki (Fixed)
- Menampilkan `pembuat_nama` dan `pembuat_kontak` pelapor publik pada halaman detail tiket `/tiket/[id]`.
- Menghentikan `SlaTimer` pada status `menunggu_pengadaan` dan menambahkan jeda/lanjut SLA resolusi di database.
- Memperbaiki `notifP0Broadcast` agar mengirim broadcast untuk **semua tiket `P0`**, termasuk permintaan `Aktivasi / non-aktivasi VPN` (>10 task).
- Memperbaiki deduplikasi pengingat H-1 kunjungan Sleman per `(site_id, tanggal, it_id)` dan menampilkan `kunjungan_pada` pada `/status/[token]`.

### Dihapus (Removed)
- Menghapus branch lokal usang `feat/password-redis` (`5d417c9`).
- Menghapus hardcode nama petugas `"Miko"` dan `"Fuad"` pada generator jadwal (`/api/admin/generate-jadwal` & `GenerateJadwalClient.tsx`) dan menggantinya dengan pemilihan dinamis staf IT dari database.

---

## [2026-10] — Riwayat Awal (MVP & Routing, Migrasi `0001`–`0019`)

- `0001`–`0004`: Skema dasar, seed kategori & site, trigger nomor tiket/SLA, dan RLS policies.
- `0005`–`0008`: Tautan akun Telegram sekali pakai, audit pengiriman notifikasi, cron SLA warning, dan auto-close atomik.
- `0009`–`0013`: Bucket privat `ticket-attachments`, upload tervalidasi server, rating & penutupan tiket login maupun publik via token rahasia.
- `0014`–`0019`: Penghapusan site Kota Baru, jadwal & routing kunjungan Sleman, jumlah task VPN, status IT otomatis, poin kesulitan & catatan solusi, serta pembatasan baca `ticket_events`.
