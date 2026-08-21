#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# PostgreSQL Backup Script for WorkersArena
#
# Usage:
#   ./scripts/backup-db.sh                    # Full backup
#   ./scripts/backup-db.sh --schema-only      # Schema-only backup
#   ./scripts/backup-db.sh --data-only        # Data-only backup
#
# Environment Variables:
#   DATABASE_URL          – PostgreSQL connection string (required)
#   BACKUP_DIR            – Where to store backups (default: ./backups)
#   BACKUP_RETENTION_DAYS – Days to keep old backups (default: 30)
#
# Cron Example (daily at 2 AM):
#   0 2 * * * cd /path/to/workers-arena && ./scripts/backup-db.sh >> logs/backup.log 2>&1
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_TAG=$(date +%Y-%m-%d)

# Parse args
MODE="full"
for arg in "$@"; do
  case "$arg" in
    --schema-only) MODE="schema" ;;
    --data-only)   MODE="data" ;;
    --help|-h)
      echo "Usage: $0 [--schema-only|--data-only]"
      exit 0
      ;;
  esac
done

# ── Validate ─────────────────────────────────────────────────────────────────
if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ ERROR: DATABASE_URL is not set."
  echo "   Set it in your environment or .env file."
  echo "   Example: export DATABASE_URL='postgresql://user:pass@localhost:5432/workers_arena_v2'"
  exit 1
fi

# Check for pg_dump
if ! command -v pg_dump &>/dev/null; then
  echo "❌ ERROR: pg_dump not found. Install PostgreSQL client tools."
  echo "   macOS: brew install postgresql@16"
  echo "   Ubuntu: sudo apt install postgresql-client"
  exit 1
fi

# ── Prepare ──────────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"

SUFFIX=""
PGDUMP_ARGS=(--no-owner --no-privileges --verbose)

case "$MODE" in
  full)
    SUFFIX="full"
    ;;
  schema)
    SUFFIX="schema-only"
    PGDUMP_ARGS+=(--schema-only)
    ;;
  data)
    SUFFIX="data-only"
    PGDUMP_ARGS+=(--data-only)
    ;;
esac

FILENAME="workersarena_${SUFFIX}_${TIMESTAMP}.sql.gz"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

echo "🔄 Starting ${MODE} backup: ${FILENAME}"
echo "   Database: $(echo "$DATABASE_URL" | sed 's/:[^@]*@/:***@/')"
echo "   Output:   ${FILEPATH}"

# ── Backup ───────────────────────────────────────────────────────────────────
pg_dump "${PGDUMP_ARGS[@]}" "$DATABASE_URL" | gzip -9 > "$FILEPATH"

FILESIZE=$(du -h "$FILEPATH" | cut -f1)
echo "✅ Backup complete: ${FILENAME} (${FILESIZE})"

# ── Rotation ─────────────────────────────────────────────────────────────────
echo "🗑️  Removing backups older than ${RETENTION_DAYS} days..."
DELETED=$(find "$BACKUP_DIR" -name "workersarena_*.sql.gz" -type f -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)
echo "   Removed ${DELETED} old backup(s)"

# ── Summary ──────────────────────────────────────────────────────────────────
REMAINING=$(find "$BACKUP_DIR" -name "workersarena_*.sql.gz" -type f | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
echo "📊 Backups on disk: ${REMAINING} (${TOTAL_SIZE})"
echo "   Latest: ${FILEPATH}"
echo ""
echo "To restore: ./scripts/restore-db.sh ${FILEPATH}"
