#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DATABASE_URL="${DATABASE_URL:?DATABASE_URL wajib diset}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%d_%H%M%S)"
TARGET_FILE="${BACKUP_DIR}/it_ticketing_${STAMP}.sql.gz"

echo "Membuat backup database ke ${TARGET_FILE}..."
pg_dump "$DATABASE_URL" --no-owner --no-acl | gzip -9 > "$TARGET_FILE"

echo "Membersihkan backup lebih lama dari ${RETENTION_DAYS} hari..."
find "$BACKUP_DIR" -name "it_ticketing_*.sql.gz" -type f -mtime "+${RETENTION_DAYS}" -delete

echo "Backup selesai: ${TARGET_FILE}"
