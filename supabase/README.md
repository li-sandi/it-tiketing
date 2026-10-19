# Setup Database

Jalankan berurutan di Supabase SQL Editor (klik "New query", paste, Run):

1. `migrations/0001_schema.sql` — bikin semua tabel & index
2. `migrations/0002_seed.sql` — isi data site & kategori
3. `migrations/0003_triggers.sql` — nomor tiket otomatis & SLA
4. `migrations/0004_access_policies.sql` — batasi akses data berdasarkan akun dan peran
5. `migrations/0005_telegram_polling.sql` — state polling dan tautan Telegram sekali pakai
6. `migrations/0006_telegram_notification_deliveries.sql` — pencatatan dan deduplikasi pengiriman notifikasi
7. `migrations/0007_sla_and_autoclose.sql` — notifikasi SLA dan auto-close otomatis
8. `migrations/0008_auto_close_atomic.sql` — penutupan tiket dan event secara atomik
9. `migrations/0009_ticket_attachments_storage.sql` — bucket privat dan RLS lampiran gambar tiket
10. `migrations/0010_server_validated_attachment_upload.sql` — batasi upload lewat endpoint server tervalidasi
11. `migrations/0011_user_ticket_rating.sql` — tutup tiket oleh pembuat dengan rating dan event atomik
12. `migrations/0012_public_tickets.sql` — identitas pembuat publik dan token akses privat
13. `migrations/0013_public_ticket_rating.sql` — penutupan tiket publik dengan rating atomik
14. `migrations/0014_remove_kota_baru_site.sql` — hapus site Kota Baru dan kosongkan relasi site user/tiket/jadwal tanpa menghapus record terkait
15. `migrations/0015_replace_sleman_schedule.sql` — fungsi atomik untuk mengganti jadwal kunjungan Sleman dalam satu periode
16. `migrations/0016_route_sleman_tickets.sql` — route tiket baru ke petugas kunjungan Sleman dan tetapkan SLA akhir hari untuk P1

Kalau pakai Supabase CLI:

    supabase db push

## Urutan penting

File dijalankan **berurutan**. 0001 harus selesai sebelum 0002 (karena insert butuh tabel), 0003 sesudah tabel tickets dibuat, 0004 setelah semua tabel tersedia, 0005 setelah kebijakan akses dasar, 0006 setelah tabel tiket tersedia, 0007 setelah notifikasi dan dedup Telegram siap digunakan, 0008 setelah tabel tiket serta `ticket_events` tersedia, 0009 setelah tabel `attachments` serta kebijakan akses dasar tersedia, 0010 setelah bucket/policy upload dibuat, 0011 setelah tabel tiket serta kebijakan dasar tersedia, 0012 setelah tabel tiket tersedia, 0013 setelah kolom token publik ditambahkan, 0014 setelah tabel users/tickets/jadwal dibuat, 0015 setelah tabel `it_schedule` serta peran `service_role` tersedia, dan 0016 setelah jadwal Sleman dan `ticket_events` tersedia.

Migrasi `0014` menghapus baris site Kota Baru. User, tiket, dan jadwal yang
merujuk ke site tersebut tetap disimpan dengan `site_id` bernilai `NULL`.
Migrasi `0015` membuat fungsi `replace_sleman_schedule`, yang hanya dapat
dijalankan oleh `service_role`. Fungsi ini mengganti jadwal kunjungan Sleman
secara atomik; aplikasi memakainya untuk generator jadwal pada Admin Panel.
Migrasi `0016` menambahkan trigger yang, saat tiket dibuat pada tanggal
kunjungan site-nya, menugaskan tiket ke IT yang terjadwal dan mencatat assignment
di timeline. Tiket P1 mendapat batas resolusi pukul 23:59:59.999999 WIB pada
hari tersebut; P0 dan prioritas lain mempertahankan SLA normal. Jika ada jadwal
duplikat atau petugas yang sudah bukan IT, pembuatan tiket gagal agar tidak
terjadi routing yang salah. Untuk notifikasi Telegram langsung, petugas harus
sudah menghubungkan bot. Tiket Sleman di luar hari kunjungan dikirim ke IT yang
tersedia tanpa auto-assignment.

## Telegram (polling lokal)

Set environment berikut di `.env.local` dan jangan commit file tersebut:

    TELEGRAM_BOT_TOKEN=...
    TELEGRAM_BOT_USERNAME=nama_bot_tanpa_at
    SUPABASE_SERVICE_ROLE_KEY=...
    NEXT_PUBLIC_APP_URL=http://localhost:3000

`SUPABASE_SERVICE_ROLE_KEY` adalah rahasia dengan akses penuh database. Hanya dipakai oleh endpoint server Telegram; jangan pernah gunakan dengan prefix `NEXT_PUBLIC_` atau kirim nilainya ke browser/chat.

Setelah menambahkan environment, restart `npm run dev`. Jalankan migration 0005 di Supabase SQL Editor, lalu hubungkan bot dari dashboard. Polling memakai token taut sekali pakai yang kedaluwarsa setelah 10 menit.

Jalankan migration 0006 sebelum mengaktifkan notifikasi tiket. Notifikasi tiket baru dipicu dari endpoint yang memverifikasi sesi pembuat tiket dan hanya menerima tiket berstatus baru yang dibuat dalam lima menit terakhir. Pengiriman disimpan per tiket/jenis/penerima untuk mencegah notifikasi ganda; kegagalan pengiriman dapat dicoba lagi.

Setelah itu, jalankan 0007 dan 0008. Migration 0007 menambahkan tipe notifikasi SLA dan auto-close; 0008 menambahkan fungsi untuk menutup tiket dan mencatat event status dalam satu transaksi. Endpoint cron `/api/cron/sla-check` dan `/api/cron/auto-close` memerlukan header `x-cron-secret` yang sama dengan variabel `CRON_SECRET` di `.env.local`. Warning dikirim sekali per tiket, tipe, dan penerima; ambangnya P0 2 menit, P1 5 menit, dan P2/P3 15 menit. Tiket berstatus selesai otomatis ditutup setelah 24 jam.

Jalankan migration 0009 dan 0010 untuk bucket privat `ticket-attachments` (maksimal 5 MB per file; JPEG, PNG, WebP, dan GIF). Upload dilakukan melalui endpoint server terautentikasi yang memverifikasi pemilik tiket serta signature konten file; user hanya dapat membaca lampiran tiket miliknya, sedangkan IT/admin dapat membaca semua lampiran melalui URL bertanda tangan yang berlaku satu jam.

Migration 0011 menambahkan fungsi atomik bagi pembuat untuk menutup tiket berstatus selesai sambil menyimpan rating 1–5 dan event status. Aksi IT hanya ditampilkan kepada akun IT/admin, dan pembuat dapat melihat nama staf yang tercatat pada riwayat tiketnya.

Migration 0012 memungkinkan pembuat tiket publik tanpa akun dengan token akses acak. Formulir `/lapor` membuat tiket melalui `/api/tiket/publik`, dan status tiket dibaca melalui endpoint token `/api/tiket/publik/[token]`. Tabel tiket tetap tidak dapat dibaca langsung oleh role `anon`; jangan membagikan token status karena token tersebut memberi akses baca ke detail tiket. Endpoint publik memvalidasi signature gambar maksimal 5 MB. Pencarian ID aset hanya mengembalikan ID milik tiket yang dapat diakses oleh pembuat yang login atau token tiket publik tersimpan di browser. Tetap terapkan CAPTCHA/rate limiting di edge sebelum membuka formulir ke internet secara luas.

Migration 0013 menambahkan fungsi service-role-only untuk menutup tiket publik berstatus selesai melalui token akses, menyimpan rating 1–5, dan mencatat event dalam satu transaksi. Form IT tidak lagi menampilkan transisi `selesai` ke `ditutup`; pembuat berakun menutup lewat rating terautentikasi dan pelapor publik melalui halaman `/status/[token]`.

ID AnyDesk/UV disimpan di `remote_credentials` per tiket dan dikaitkan kembali ke nomor aset untuk auto-fill. Auto-fill publik membutuhkan token akses tiket publik sebelumnya yang disimpan di browser; akun internal hanya dapat mencari ID dari tiket miliknya, sedangkan IT/admin dapat mencari semua tiket. Password AnyDesk/UV tidak disimpan oleh aplikasi; pelapor harus memberikan password terbaru langsung kepada IT melalui kanal komunikasi yang disepakati.

## Reset database

**Peringatan: perintah berikut menghapus seluruh objek dan data di schema `public`. Gunakan hanya pada project database disposable/tes, dan jangan jalankan pada database berisi data penting.**

Kalau mau reset total:

    drop schema public cascade;
    create schema public;

Lalu jalankan keenam belas file migration lagi dari awal sesuai urutan di atas.
