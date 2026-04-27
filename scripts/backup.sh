#!/bin/sh
# Hot-backup for the Premier Tree Specialists SQLite database.
#
# Uses sqlite3's `.backup` command which is safe to run while the app has
# the database open (it acquires a read lock and copies pages).
#
# Configuration (env vars, with sensible defaults for the Railway setup):
#   DATABASE_PATH   path to the live DB (default /data/leads.db)
#   BACKUP_DIR      where to write the backup (default /backups)
#   RETENTION_DAYS  delete backups older than this (default 30)
#
# Usage:
#   docker compose exec app /workspace/scripts/backup.sh
#   railway run /workspace/scripts/backup.sh
#
set -eu

DATABASE_PATH="${DATABASE_PATH:-/data/leads.db}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DATABASE_PATH" ]; then
  echo "ERROR: database not found at $DATABASE_PATH" >&2
  exit 1
fi

TS=$(date +%Y%m%d-%H%M%S)
TARGET="$BACKUP_DIR/leads-$TS.db"

# Hot-backup using sqlite3's .backup command (safe under concurrent access).
sqlite3 "$DATABASE_PATH" ".backup '$TARGET'"

# Compress
gzip -f "$TARGET"

# Retention sweep
find "$BACKUP_DIR" -maxdepth 1 -name "leads-*.db.gz" -type f -mtime "+$RETENTION_DAYS" -delete 2>/dev/null || true

echo "Backup complete: $TARGET.gz"
