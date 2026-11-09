#!/usr/bin/env bash
# @mine — Show everything I changed vs the inherited baseline commit.
# Usage:
#   ./scripts/my-diff.sh          # summary (files added / modified / deleted by me)
#   ./scripts/my-diff.sh --full   # full line-by-line diff vs baseline
set -euo pipefail

BASELINE="ce9a4749bdced2c0ee8c358dec447bfb82eb56ea"

if [ "${1:-}" = "--full" ]; then
  git diff --stat "$BASELINE"
  echo
  git diff "$BASELINE"
else
  echo "Changes vs inherited baseline ($BASELINE):"
  echo
  git diff --name-status "$BASELINE" || true
  echo
  echo "Commits I made (tagged [mine]):"
  git log --oneline "$BASELINE"..HEAD || true
fi
