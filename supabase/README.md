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

Kalau pakai Supabase CLI:

    supabase db push

## Urutan penting

File dijalankan **berurutan**. 0001 harus selesai sebelum 0002 (karena insert butuh tabel), 0003 sesudah tabel tickets dibuat, 0004 setelah semua tabel tersedia, 0005 setelah kebijakan akses dasar, 0006 setelah tabel tiket tersedia, 0007 setelah notifikasi dan dedup Telegram siap digunakan, 0008 setelah tabel tiket serta `ticket_events` tersedia, 0009 setelah tabel `attachments` serta kebijakan akses dasar tersedia, dan 0010 setelah bucket/policy upload dibuat.

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

## Reset database

**Peringatan: perintah berikut menghapus seluruh objek dan data di schema `public`. Gunakan hanya pada project database disposable/tes, dan jangan jalankan pada database berisi data penting.**

Kalau mau reset total:

    drop schema public cascade;
    create schema public;

Lalu jalankan kesepuluh file migration lagi dari awal sesuai urutan di atas.
