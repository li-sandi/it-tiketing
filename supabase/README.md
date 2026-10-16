# Setup Database

Jalankan berurutan di Supabase SQL Editor (klik "New query", paste, Run):

1. `migrations/0001_schema.sql` — bikin semua tabel & index
2. `migrations/0002_seed.sql` — isi data site & kategori
3. `migrations/0003_triggers.sql` — nomor tiket otomatis & SLA
4. `migrations/0004_access_policies.sql` — batasi akses data berdasarkan akun dan peran

Kalau pakai Supabase CLI:

    supabase db push

## Urutan penting

File dijalankan **berurutan**. 0001 harus selesai sebelum 0002 (karena insert butuh tabel), 0003 sesudah tabel tickets dibuat, dan 0004 setelah semua tabel tersedia.

## Reset database

**Peringatan: perintah berikut menghapus seluruh objek dan data di schema `public`. Gunakan hanya pada project database disposable/tes, dan jangan jalankan pada database berisi data penting.**

Kalau mau reset total:

    drop schema public cascade;
    create schema public;

Lalu jalankan ketiga file lagi dari awal.
