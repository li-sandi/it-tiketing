#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:?Gunakan: ./scripts/restore-db.sh <path-file.sql.gz>}"
DATABASE_URL="${DATABASE_URL:?DATABASE_URL wajib diset}"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "File backup tidak ditemukan: $BACKUP_FILE"
  exit 1
fi

echo "PERINGATAN: Pemulihan akan menimpa data pada DATABASE_URL target."
read -r -p "Ketik 'RESTORE' untuk melanjutkan: " CONFIRM
if [[ "$CONFIRM" != "RESTORE" ]]; then
  echo "Dibatalkan."
  exit 1
fi

gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
echo "Pemulihan selesai dari $BACKUP_FILE"
