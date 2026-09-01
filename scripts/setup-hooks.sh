#!/bin/sh
#
# Setup script: installs the pre-commit git hook
# Run this once after cloning the repo:
#   bash scripts/setup-hooks.sh
#

set -e

HOOK_SOURCE="$(git rev-parse --show-toplevel)/scripts/hooks/pre-commit"
HOOK_TARGET="$(git rev-parse --show-toplevel)/.git/hooks/pre-commit"

if [ ! -f "$HOOK_SOURCE" ]; then
  echo "❌ Hook source not found: $HOOK_SOURCE"
  exit 1
fi

cp "$HOOK_SOURCE" "$HOOK_TARGET"
chmod +x "$HOOK_TARGET"

echo "✅ Pre-commit hook installed!"
echo ""
echo "The hook will run automatically on every commit:"
echo "  1. TypeScript type checking"
echo "  2. Unit tests (vitest)"
echo ""
echo "To skip the hook for a single commit:"
echo "  git commit --no-verify -m \"your message\""
echo ""
