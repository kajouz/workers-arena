#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# S3 Backup Sync Script for WorkersArena
#
# Syncs local backups to S3 for offsite disaster recovery.
# Requires: AWS CLI configured with appropriate credentials.
#
# Usage:
#   ./scripts/backup-s3-sync.sh                     # Sync all local backups to S3
#   ./scripts/backup-s3-sync.sh --dry-run           # Preview what would be synced
#   ./scripts/backup-s3-sync.sh --latest            # Sync only the latest backup
#
# Environment Variables:
#   S3_BACKUP_BUCKET – S3 bucket name (required, e.g., s3://workersarena-backups)
#   S3_BACKUP_PREFIX – Optional prefix/path in the bucket (default: db/)
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
S3_BUCKET="${S3_BACKUP_BUCKET:-}"
S3_PREFIX="${S3_BACKUP_PREFIX:-db}"

DRY_RUN=""
LATEST_ONLY=""

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN="--dryrun" ;;
    --latest)  LATEST_ONLY="1" ;;
    --help|-h)
      echo "Usage: $0 [--dry-run|--latest]"
      exit 0
      ;;
  esac
done

# ── Validate ─────────────────────────────────────────────────────────────────
if [ -z "$S3_BUCKET" ]; then
  echo "❌ ERROR: S3_BACKUP_BUCKET is not set."
  echo "   Example: export S3_BACKUP_BUCKET='s3://workersarena-backups'"
  exit 1
fi

if ! command -v aws &>/dev/null; then
  echo "❌ ERROR: AWS CLI not found."
  echo "   Install: pip install awscli"
  exit 1
fi

# ── Sync ─────────────────────────────────────────────────────────────────────
if [ -n "$LATEST_ONLY" ]; then
  FILEPATH=$(ls -t "$BACKUP_DIR"/workersarena_*.sql.gz 2>/dev/null | head -1)
  if [ -z "$FILEPATH" ]; then
    echo "❌ No backups found in ${BACKUP_DIR}/"
    exit 1
  fi
  echo "☁️  Syncing latest backup to S3: $(basename "$FILEPATH")"
  aws s3 cp "$FILEPATH" "${S3_BUCKET}/${S3_PREFIX}/$(basename "$FILEPATH")" $DRY_RUN
else
  echo "☁️  Syncing all backups to ${S3_BUCKET}/${S3_PREFIX}/"
  aws s3 sync "$BACKUP_DIR" "${S3_BUCKET}/${S3_PREFIX}" \
    --include "workersarena_*.sql.gz" \
    $DRY_RUN
fi

echo "✅ S3 sync complete!"
