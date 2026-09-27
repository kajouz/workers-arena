#!/bin/sh
#
# Setup script: installs the pre-commit and pre-push git hooks
# Run this once after cloning the repo:
#   bash scripts/setup-hooks.sh
#

set -e

HOOKS_DIR="$(git rev-parse --git-path hooks)"

for HOOK in pre-commit pre-push; do
  HOOK_SOURCE="$(git rev-parse --show-toplevel)/scripts/hooks/$HOOK"
  if [ ! -f "$HOOK_SOURCE" ]; then
    echo "❌ Hook source not found: $HOOK_SOURCE"
    exit 1
  fi
  cp "$HOOK_SOURCE" "$HOOKS_DIR/$HOOK"
  chmod +x "$HOOKS_DIR/$HOOK"
done

echo "✅ Pre-commit and pre-push hooks installed!"
echo ""
echo "The hook will run automatically on every commit:"
echo "  1. Scripts gate (parse + import graph) — when scripts/** or package.json is staged"
echo "  2. TypeScript type checking — when .ts/.tsx is staged"
echo "  3. Unit tests (vitest) — when .ts/.tsx is staged"
echo ""
echo "and on every push:"
echo "  - Quick e2e suite (tests/e2e-smoke.test.ts, dev build only)"
echo ""
echo "To skip a hook for a single commit or push:"
echo "  git commit --no-verify -m \"your message\""
echo "  git push --no-verify"
echo ""
