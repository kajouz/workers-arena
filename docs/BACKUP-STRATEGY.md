# Backup Strategy for WorkersArena

## Overview

WorkersArena uses PostgreSQL as its primary database. This document outlines the automated backup strategy, procedures for manual backups, and disaster recovery plans.

## Backup Types

| Type | Command | Frequency | Retention |
|------|---------|-----------|-----------|
| **Full backup** | `./scripts/backup-db.sh` | Daily at 2 AM | 30 days |
| **Schema-only** | `./scripts/backup-db.sh --schema-only` | Weekly (Monday) | 90 days |
| **Data-only** | `./scripts/backup-db.sh --data-only` | On-demand | 7 days |
| **S3 offsite** | `./scripts/backup-s3-sync.sh` | After each backup | 90 days |

## Quick Reference

### Manual Backup

```bash
# Full backup (compressed)
./scripts/backup-db.sh

# Schema-only (structure without data)
./scripts/backup-db.sh --schema-only

# Data-only (without structure)
./scripts/backup-db.sh --data-only
```

### Restore from Backup

```bash
# List available backups
./scripts/restore-db.sh --list

# Restore latest backup
./scripts/restore-db.sh --latest

# Restore specific backup
./scripts/restore-db.sh backups/workersarena_full_20260821_020000.sql.gz
```

### Offsite Sync (S3)

```bash
# Sync all backups to S3
S3_BACKUP_BUCKET="s3://workersarena-backups" ./scripts/backup-s3-sync.sh

# Sync only latest backup
S3_BACKUP_BUCKET="s3://workersarena-backups" ./scripts/backup-s3-sync.sh --latest

# Preview sync (dry run)
S3_BACKUP_BUCKET="s3://workersarena-backups" ./scripts/backup-s3-sync.sh --dry-run
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `BACKUP_DIR` | ❌ | `./backups` | Local backup storage directory |
| `BACKUP_RETENTION_DAYS` | ❌ | `30` | Days to keep old backups |
| `S3_BACKUP_BUCKET` | ✅ (for S3) | — | S3 bucket name (e.g., `s3://workersarena-backups`) |
| `S3_BACKUP_PREFIX` | ❌ | `db` | Path prefix in the S3 bucket |

## Setup Instructions

### 1. Create Backup Directory

```bash
mkdir -p backups logs
```

### 2. Set Environment Variables

Add to your `.env` or shell profile:

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/workers_arena_v2"
BACKUP_DIR="./backups"
BACKUP_RETENTION_DAYS="30"
S3_BACKUP_BUCKET="s3://workersarena-backups"  # Optional
```

### 3. Set Up Automated Backups (cron)

```bash
# Edit crontab
crontab -e

# Add these entries:

# Daily full backup at 2 AM
0 2 * * * cd /path/to/workers-arena && ./scripts/backup-db.sh >> logs/backup.log 2>&1

# Weekly schema-only backup on Monday at 3 AM
0 3 * * 1 cd /path/to/workers-arena && ./scripts/backup-db.sh --schema-only >> logs/backup.log 2>&1

# Sync to S3 after daily backup (at 2:30 AM)
30 2 * * * cd /path/to/workers-arena && ./scripts/backup-s3-sync.sh >> logs/backup.log 2>&1
```

### 4. Vercel / Production (GitHub Actions)

For production deployments, add a GitHub Actions workflow:

```yaml
# .github/workflows/backup.yml
name: Daily Database Backup

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC
  workflow_dispatch:       # Manual trigger

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run backup
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          S3_BACKUP_BUCKET: ${{ secrets.S3_BACKUP_BUCKET }}
          S3_BACKUP_PREFIX: "db"
        run: |
          ./scripts/backup-db.sh
          ./scripts/backup-s3-sync.sh
```

## Backup Storage Strategy

### 3-2-1 Rule

Follow the 3-2-1 backup rule:
- **3** copies of your data (primary + 2 backups)
- **2** different storage types (local disk + S3)
- **1** offsite copy (S3 or another region)

### Storage Layout

```
backups/
├── workersarena_full_20260821_020000.sql.gz      # Daily full backups
├── workersarena_full_20260822_020000.sql.gz
├── workersarena_schema-only_20260821_030000.sql.gz  # Weekly schema backups
└── ...

s3://workersarena-backups/db/
├── workersarena_full_20260821_020000.sql.gz      # Offsite copies
├── workersarena_full_20260822_020000.sql.gz
└── ...
```

## Disaster Recovery Procedures

### Scenario 1: Database Corruption

```bash
# 1. Stop the application
# 2. Restore from latest backup
./scripts/restore-db.sh --latest
# 3. Apply pending migrations
npx prisma migrate deploy
# 4. Restart the application
```

### Scenario 2: Accidental Data Deletion

```bash
# 1. Restore data-only backup (preserves structure)
./scripts/restore-db.sh backups/workersarena_data-only_*.sql.gz
# 2. Or restore full backup if structure also changed
./scripts/restore-db.sh backups/workersarena_full_*.sql.gz
```

### Scenario 3: Complete Database Loss

```bash
# 1. Create a new PostgreSQL database
createdb workers_arena_v2
# 2. Restore from S3 backup
aws s3 cp s3://workersarena-backups/db/workersarena_full_latest.sql.gz .
gunzip workersarena_full_latest.sql.gz
psql workers_arena_v2 < workersarena_full_latest.sql
# 3. Apply migrations
npx prisma migrate deploy
# 4. Update DATABASE_URL in environment
```

## Monitoring & Alerts

### Backup Verification

The backup script logs to `logs/backup.log`. Monitor for:
- ✅ "Backup complete" messages
- ❌ "ERROR" or "Failed" messages
- 📊 "Backups on disk" counts

### Recommended Alerts

- **No backup in 24 hours** → Check cron and DATABASE_URL
- **Backup size < 1KB** → Empty or failed backup
- **Disk usage > 80%** → Reduce retention or add storage
- **S3 sync failure** → Check AWS credentials

## Security Considerations

- Backups contain **all data** including PII — store securely
- Encrypt backups at rest (S3 server-side encryption)
- Restrict access to backup storage (IAM policies)
- Rotate backup credentials periodically
- Never commit backup files to Git (they're in `.gitignore`)

## Performance Impact

- `pg_dump` with gzip compression typically takes **1-5 minutes** for a 1GB database
- Backup runs during off-peak hours (2 AM) to minimize impact
- Use `--schema-only` for quick structural backups without data
- S3 sync uploads are incremental — only changed files are transferred
