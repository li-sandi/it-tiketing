# Runbook Operasional & Deployment On-Premise

Dokumen ini memandu menjalankan sistem **IT Ticketing** di server lokal / on-premise menggunakan Docker Compose maupun deployment manual.

## 1. Persiapan Environment

Salin `.env.example` menjadi `.env.local` dan lengkapi seluruh nilai:

- `REMOTE_CREDENTIAL_ENCRYPTION_KEY`: buat 64 karakter hex acak, misalnya:
  ```bash
  openssl rand -hex 32
  ```
- `CRON_SECRET`: buat secret acak panjang:
  ```bash
  openssl rand -hex 32
  ```
- Untuk on-premise single-node tanpa Upstash cloud, atur `RATE_LIMIT_BACKEND=memory`.

## 2. Migrasi Database Berurutan

Terapkan seluruh file migrasi SQL (`0001` sampai `0024`) secara berurutan:

```bash
export DATABASE_URL="postgresql://postgres:password@localhost:5432/it_ticketing"
node scripts/run-migrations.mjs
```

Atau jalankan masing-masing file di Supabase SQL Editor secara berurutan jika memakai Supabase Cloud.

## 3. Menjalankan dengan Docker Compose (On-Premise)

```bash
docker compose -f docker-compose.onprem.yml up -d --build
```

Layanan yang berjalan:
1. `app` — Next.js standalone server di port `3000`
2. `postgres` — PostgreSQL 16 (data tersimpan di volume `pgdata`)
3. `redis` — Redis 7
4. `cron` — Sidecar yang memanggil `/api/cron/sla-check` dan `/api/cron/auto-close` setiap 5 menit

Untuk laporan mingguan otomatis di server lokal tanpa GitHub Actions, tambahkan crontab di host:
```cron
30 7 * * 5 curl -fsS -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/weekly-report
```

## 4. Backup & Uji Pemulihan (Disaster Recovery)

### Backup Harian (Retensi 14 Hari)
```bash
chmod +x scripts/backup-db.sh scripts/restore-db.sh
DATABASE_URL="postgresql://..." ./scripts/backup-db.sh
```

### Uji Pemulihan (Restore Drill)
Lakukan minimal sebulan sekali ke database uji/staging:
```bash
DATABASE_URL="postgresql://..." ./scripts/restore-db.sh ./backups/it_ticketing_YYYYMMDD_HHMMSS.sql.gz
```

## 5. Kebijakan Retensi & Keamanan Data Pribadi

- Password remote AnyDesk/UltraViewer dienkripsi AES-256-GCM saat aktif, kedaluwarsa maksimal 24 jam, dan dihapus otomatis oleh trigger DB saat tiket selesai/ditutup.
- Foto layar remote (`jenis = 'foto_remote'`) otomatis dihapus dari Storage bucket saat tiket berstatus `selesai` atau saat `auto-close`.
- Token pelacakan tiket publik bersifat rahasia (UUID acak) dan endpoint publik mengirim header `Cache-Control: no-store, private`.
