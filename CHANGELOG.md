# Changelog

Seluruh perubahan signifikan pada proyek **IT Ticketing** dicatat pada berkas ini.

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
