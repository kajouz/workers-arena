#!/bin/sh
#
# Setup script: installs the pre-commit and pre-push git hooks
# Run this once after cloning the repo:
#   bash scripts/setup-hooks.sh
#
# Points git at scripts/hooks via core.hooksPath instead of copying the files
# into .git/hooks. Copies went stale silently: a hook fix merged to main never
# reached a checkout that had run this script before it (the pre-commit hook
# kept reporting "All unit tests passed" on a failing run long after the fix).
# With hooksPath, every checkout and worktree runs the committed hooks of the
# branch it is on.
#

set -e

ROOT="$(git rev-parse --show-toplevel)"

for HOOK in pre-commit pre-push; do
  if [ ! -x "$ROOT/scripts/hooks/$HOOK" ]; then
    echo "❌ Hook missing or not executable: $ROOT/scripts/hooks/$HOOK"
    exit 1
  fi
done

git config core.hooksPath scripts/hooks

# Remove the old copies so nobody mistakes them for the live hooks.
OLD_HOOKS_DIR="$(git rev-parse --git-common-dir)/hooks"
for HOOK in pre-commit pre-push; do
  rm -f "$OLD_HOOKS_DIR/$HOOK"
done

echo "✅ Pre-commit and pre-push hooks installed (core.hooksPath=scripts/hooks)!"
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
