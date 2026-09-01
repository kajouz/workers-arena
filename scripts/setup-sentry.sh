#!/bin/sh
#
# Sentry Setup Script for WorkersArena
#
# This script helps configure Sentry error monitoring.
# Run it once after creating a Sentry project.
#
# Prerequisites:
#   1. Create a Sentry account at https://sentry.io
#   2. Create a new project: JavaScript → Next.js
#   3. Copy the DSN from the project settings
#
# Usage:
#   bash scripts/setup-sentry.sh
#
# Or set env vars manually in Vercel dashboard:
#   Settings → Environment Variables → Add:
#     SENTRY_DSN = https://xxx@sentry.io/xxx
#     NEXT_PUBLIC_SENTRY_DSN = https://xxx@sentry.io/xxx
#     SENTRY_ENVIRONMENT = production
#     SENTRY_ORG = your-org-slug
#     SENTRY_PROJECT = workers-arena
#     SENTRY_AUTH_TOKEN = sntrys_xxx (for source map uploads)
#

set -e

echo ""
echo "🔧 Sentry Setup for WorkersArena"
echo "================================"
echo ""

# Check if Vercel CLI is available
if ! command -v vercel &> /dev/null; then
  echo "⚠️  Vercel CLI not found. Install it with:"
  echo "   npm i -g vercel"
  echo ""
  echo "   Or set the env vars manually in the Vercel dashboard."
  exit 1
fi

# Prompt for DSN
echo "📋 Step 1: Get your Sentry DSN"
echo "   1. Go to https://sentry.io → Your Organization → Projects"
echo "   2. Select or create a 'workers-arena' project"
echo "   3. Go to Settings → Client Keys (DSN)"
echo "   4. Copy the DSN URL"
echo ""
read -p "   Paste your Sentry DSN: " SENTRY_DSN

if [ -z "$SENTRY_DSN" ]; then
  echo "❌ DSN is required. Exiting."
  exit 1
fi

# Prompt for org slug
echo ""
read -p "   Enter your Sentry org slug (e.g., 'my-org'): " SENTRY_ORG

# Prompt for auth token
echo ""
echo "📋 Step 2: Get a Sentry Auth Token (for source map uploads)"
echo "   1. Go to https://sentry.io/settings/auth-tokens/"
echo "   2. Create a new token with 'org:read' and 'project:releases' scopes"
echo ""
read -p "   Paste your Sentry auth token (or press Enter to skip): " SENTRY_AUTH_TOKEN

# Set env vars in Vercel
echo ""
echo "🔧 Setting environment variables in Vercel..."

VERCEL_vars=(
  "SENTRY_DSN=$SENTRY_DSN"
  "NEXT_PUBLIC_SENTRY_DSN=$SENTRY_DSN"
  "SENTRY_ENVIRONMENT=production"
  "SENTRY_ORG=$SENTRY_ORG"
  "SENTRY_PROJECT=workers-arena"
)

if [ -n "$SENTRY_AUTH_TOKEN" ]; then
  VERCEL_vars+=("SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN")
fi

for var in "${VERCEL_vars[@]}"; do
  key="${var%%=*}"
  value="${var#*=}"
  echo "   Setting $key..."
  vercel env add "$key" production <<< "$value" 2>/dev/null || \
    echo "   ⚠️  Could not set $key via CLI. Set it manually in Vercel dashboard."
done

echo ""
echo "✅ Sentry configuration complete!"
echo ""
echo "Next steps:"
echo "  1. Deploy to trigger a new build with Sentry enabled"
echo "  2. Check https://sentry.io to verify events are coming in"
echo "  3. Source maps will be uploaded automatically on build"
echo ""
echo "To test locally, add to .env.local:"
echo "  SENTRY_DSN=$SENTRY_DSN"
echo "  NEXT_PUBLIC_SENTRY_DSN=$SENTRY_DSN"
echo "  SENTRY_ENVIRONMENT=development"
echo ""
