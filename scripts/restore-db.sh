#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# PostgreSQL Restore Script for WorkersArena
#
# Usage:
#   ./scripts/restore-db.sh backups/workersarena_full_20260821_020000.sql.gz
#   ./scripts/restore-db.sh --latest                     # Restore most recent backup
#   ./scripts/restore-db.sh --list                       # List available backups
#
# Environment Variables:
#   DATABASE_URL – PostgreSQL connection string (required)
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"

# ── Helpers ──────────────────────────────────────────────────────────────────
list_backups() {
  echo "📦 Available backups in ${BACKUP_DIR}/:"
  echo ""
  if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR"/*.sql.gz 2>/dev/null)" ]; then
    echo "   No backups found."
    exit 0
  fi
  ls -lht "$BACKUP_DIR"/*.sql.gz | awk '{print "   " $NF " (" $5 ") "}'
  echo ""
}

# ── Validate ─────────────────────────────────────────────────────────────────
if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ ERROR: DATABASE_URL is not set."
  exit 1
fi

if ! command -v psql &>/dev/null; then
  echo "❌ ERROR: psql not found. Install PostgreSQL client tools."
  exit 1
fi

# ── Parse args ───────────────────────────────────────────────────────────────
FILEPATH=""

case "${1:-}" in
  --list|-l)
    list_backups
    exit 0
    ;;
  --latest)
    FILEPATH=$(ls -t "$BACKUP_DIR"/workersarena_*.sql.gz 2>/dev/null | head -1)
    if [ -z "$FILEPATH" ]; then
      echo "❌ No backups found in ${BACKUP_DIR}/"
      exit 1
    fi
    echo "📋 Using latest backup: $(basename "$FILEPATH")"
    ;;
  --help|-h)
    echo "Usage: $0 <backup-file.sql.gz>"
    echo "       $0 --latest"
    echo "       $0 --list"
    exit 0
    ;;
  "")
    echo "❌ ERROR: No backup file specified."
    echo "   Usage: $0 <backup-file.sql.gz>"
    echo "   Or:    $0 --latest"
    exit 1
    ;;
  *)
    FILEPATH="$1"
    ;;
esac

if [ ! -f "$FILEPATH" ]; then
  echo "❌ ERROR: Backup file not found: $FILEPATH"
  exit 1
fi

FILESIZE=$(du -h "$FILEPATH" | cut -f1)
echo "⚠️  WARNING: This will OVERWRITE the current database!"
echo "   File: $(basename "$FILEPATH") (${FILESIZE})"
echo "   Database: $(echo "$DATABASE_URL" | sed 's/:[^@]*@/:***@/')"
echo ""

# Safety prompt (skip in CI)
if [ -t 0 ] && [ "${CI:-}" != "true" ]; then
  read -p "Type 'yes' to confirm restore: " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Restore cancelled."
    exit 0
  fi
fi

# ── Restore ──────────────────────────────────────────────────────────────────
echo "🔄 Restoring from $(basename "$FILEPATH")..."
gunzip -c "$FILEPATH" | psql "$DATABASE_URL" --quiet 2>&1

echo ""
echo "✅ Restore complete!"
echo "   Run 'npx prisma migrate deploy' to apply any pending migrations."
echo "   Run 'npx prisma db seed' to re-seed demo data (optional)."
