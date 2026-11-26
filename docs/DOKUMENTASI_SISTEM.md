# Dokumentasi Sistem IT Ticketing (Terverifikasi)

Repo: `li-sandi/it-tiketing` · Fokus operasional: **Debito Jogja** (1 entitas site aktif, 400 user).

---

## 1. Ringkasan & Ruang Lingkup

Sistem tiket internal untuk tim IT yang menggantikan pelaporan chat/lisan agar seluruh gangguan, permintaan, SLA, beban kerja, dan dokumentasi solusi tercatat terstruktur.

- **Site Aktif:** `Debito Jogja` (`jumlah_user = 400`, `punya_it = true`). Penggabungan dari Terban & Ngampilan dilakukan di migrasi `0020`.
- **Site Non-Aktif (Siap Multi-Site):** `Sleman` tetap tersimpan di database dengan `aktif = false` dan `feature_flags.sleman_routing_enabled = false`. Dapat diaktifkan kembali kapan saja lewat `/admin/sites` dan `/admin/pengaturan`.

---

## 2. Peran Pengguna

| Peran | Hak Akses Utama |
|---|---|
| Publik (tanpa login) | Membuat tiket di `/lapor`, memantau status & memberi rating di `/status/[token]` |
| `user` | Membuat tiket di `/tiket/baru`, melihat `/tiket` (ringkasan aman), membaca `/wiki`, memberi rating tiket sendiri |
| `it` | Semua hak `user` + `/antrian`, mengambil & mengerjakan tiket, mengisi poin kesulitan (1–5) & catatan solusi, mengubah status IT (`free`/`off`), membuka kredensial & foto remote tiket yang dipegang, mengakses `/laporan`, `/wiki` (kelola SOP), `/aset`, dan merge tiket |
| `ga` | Mengakses `/aset`, meninjau tiket berstatus `approval_status = 'menunggu'`, dan memutuskan approval (Setujui/Tolak) |
| `admin` | Seluruh hak operasional + `/admin` (Kategori, Site, User, Aset, Jadwal, Pengaturan) |

---

## 3. Aturan Bisnis & SLA

### 3.1 Kelompok Kategori, Prioritas, & Stok Sparepart
Pelapor memilih **Kelompok Kategori** (`Network & VPN`, `Hardware & Periferal`, `Software & Aplikasi`, `Laptop Lifecycle & Performa`, `Akses & Keamanan`; kelompok `Internal IT` hanya tampil untuk IT/Admin), lalu memilih **Jenis Masalah** di dalamnya:
- **Stok Sparepart & Auto-Pengadaan (`inventory_stocks`, `0028`):** Kategori terhubung (`Upgrade RAM`, `Headset`, `Mouse`, `Kabel Power`, `Charger Laptop`) mengecek stok saat tiket dibuat. Jika stok > 0 tiket langsung `baru` dan IT dapat memakai 1-klik *"Ambil & Catat Pemakaian"*. Jika stok = 0, trigger `init_ticket_asset_and_approval()` otomatis menetapkan `status = 'menunggu_pengadaan'`, `sla_paused_at = now()`, `approval_status = 'menunggu'`, dan `estimasi_pengadaan = tanggal 1 bulan depan (WIB)`. Halaman `/stok` dikelola GA, IT, dan Admin.
- **Kenaikan otomatis ke P0 (divalidasi server & trigger DB `set_sla_batas`):**
  - *Internet lambat*: `jumlah_user_terdampak / sites.jumlah_user > 0.5` (> 200 user untuk Debito Jogja 400 user) → `P0`
  - *Masalah VPN*: `jumlah_user_terdampak > 5` → `P0`
  - *Aktivasi / non-aktivasi VPN*: `jumlah_task > 10` → `P0`, `<= 10` → `P1`

### 3.2 Target SLA, Jeda, Aging, & Auto-Close
| Prioritas | SLA Respon | SLA Resolusi & Auto-Close | Ambang Peringatan |
|---|---|---|---|
| `P0` | 5 menit | 30 menit | 2 menit |
| `P1` | 15 menit | 2 jam | 5 menit |
| `P2` | 30 menit | 4 jam | 15 menit |
| `P3` | 2 jam | 1 hari kerja (WIB, lewati Sabtu–Minggu & daftar libur di `settings.working_hours`) | 15 menit |

- **Pause / Resume SLA (`trg_handle_sla_pause`):** Saat tiket berpindah dari `diproses` ke `menunggu_user`, `menunggu_pengadaan`, atau `dijadwalkan_kunjungan`, timer SLA berhenti dan `sla_paused_at` dicatat. Saat kembali ke `diproses`, `sla_resolusi_batas` digeser otomatis sebesar durasi jeda.
- **Queue Aging (`age_overdue_ticket`):** Tiap 5 menit di `/api/cron/sla-check`, tiket `baru` yang melewati `sla_respon_batas` naik satu level (`P3→P2→P1→P0`), mencatat event `aging`, dan mengirim notifikasi `sla_aging`.
- **Auto-Close Sesuai Target SLA (`auto_close_due_tickets`):** Tiket `selesai` yang belum dikonfirmasi pelapor ditutup otomatis sesuai SLA resolusi masing-masing prioritas, membersihkan foto remote (`foto_remote`), dan mengirim notifikasi `auto_close`.

### 3.3 Kredensial Remote (AnyDesk & UltraViewer)
- **ID Statis (`anydesk_id`, `uv_id`):** Diisi otomatis berdasarkan `nomor_aset` dari tabel `assets` atau tiket sebelumnya.
- **Password Sementara & Foto Layar Remote:** Password AnyDesk/UltraViewer dienkripsi dengan AES-256-GCM (`REMOTE_CREDENTIAL_ENCRYPTION_KEY`) sebelum disimpan, kedaluwarsa dalam 24 jam, dan otomatis dihapus (`null`) saat tiket berstatus `selesai` atau `ditutup`. Foto layar remote (`jenis = 'foto_remote'`) hanya dapat diakses pembuat tiket, IT pemegang tiket, dan Admin melalui `/api/tiket/[id]/remote-reveal` (mencatat event `kredensial_dilihat`) dan terhapus otomatis dari storage saat tiket selesai/ditutup.

---

## 4. Endpoint API Utama

| Metode & Path | Akses | Fungsi |
|---|---|---|
| `POST /api/tiket/publik` | Publik (rate limit 20 umum / 100 P0 darurat per 15 menit) | Pembuatan tiket publik + enkripsi password + upload foto masalah & foto remote |
| `POST /api/tiket/remote-ids` | Login / token tiket publik | Auto-fill ID AnyDesk/UV & deteksi RAM aset |
| `POST /api/tiket/remote-credentials` | Login (pembuat tiket) | Simpan ID & password remote terenkripsi |
| `POST /api/tiket/[id]/remote-reveal` | IT pemegang tiket / Admin | Dekripsi password, URL bertanda tangan foto remote, catat audit `kredensial_dilihat` |
| `POST /api/tiket/[id]/merge` | IT / Admin | Gabungkan tiket serupa ke tiket induk via RPC `merge_tickets` |
| `POST /api/tiket/[id]/approval` | GA / Admin | Keputusan persetujuan (`disetujui` / `ditolak`) |
| `GET/PATCH /api/it/status` | IT / Admin | Ubah status ketersediaan manual (`free`, `off`, `kunjungan`) |
| `GET/POST /api/wiki`, `PATCH/DELETE /api/wiki/[id]` | Login (`GET`) / IT & Admin (tulis) | Pengelolaan Wiki / SOP |
| `POST /api/wiki/self-check` | Publik / Login | Pencarian SOP & ringkasan RAG sebelum kirim tiket |
| `GET/POST /api/aset`, `PATCH/DELETE /api/aset/[id]` | IT / Admin / GA | Inventaris aset & deteksi kandidat upgrade RAM ≤4 GB |
| `POST /api/aset/import` | IT / Admin / GA | Import massal data aset via CSV (maks. 500 baris per batch, upsert by `nomor_aset`) |
| `GET/POST /api/stok`, `POST /api/stok/adjust` | GA / IT / Admin | Manajemen stok sparepart (`RAM`, `Headset`, `Mouse`, `Kabel Power`, `Charger Laptop`) & pencatatan mutasi |
| `GET /api/laporan/export` | IT / Admin | Unduh CSV laporan tiket & SLA |
| `GET /api/cron/sla-check` | `CRON_SECRET` | Peringatan SLA & queue aging tiap 5 menit |
| `GET /api/cron/auto-close` | `CRON_SECRET` | Auto-close sesuai target SLA tiap 5 menit |
| `GET /api/cron/weekly-report` | `CRON_SECRET` | Laporan mingguan Telegram (Jumat 14:30 WIB) |
| `GET /api/cron/kunjungan-sleman` | `CRON_SECRET` | Pengingat H-1 kunjungan & peringatan jadwal hampir habis |
| `POST /api/admin/kategori`, `PATCH /api/admin/kategori/[id]` | Admin | Tambah & edit kategori |
| `GET/POST /api/admin/sites`, `PATCH /api/admin/sites/[id]` | Admin | Kelola site & jumlah user |
| `GET/PATCH /api/admin/settings` | Admin | Feature flags, hari libur, rate limit, weekly report |
| `POST /api/admin/generate-jadwal` | Admin | Generator jadwal 8 minggu dinamis untuk staf IT terpilih |

---

## 5. Pengujian & Verifikasi

- **Unit test:** `npm run test` (Vitest pada `lib/__tests__/*.test.ts`)
- **Lint & Typecheck:** `npm run lint && npx tsc --noEmit`
- **Build:** `npm run build`

---

## 6. Riwayat Perubahan

Seluruh catatan perubahan per tanggal, daftar berkas yang ditambah/diubah/dihapus, dan migrasi terkait terdokumentasi lengkap di [CHANGELOG.md](../CHANGELOG.md).
