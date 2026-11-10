#!/usr/bin/env bash
# @mine — Turn the "log every change" rule on (or off) for this clone.
#
#   ./scripts/setup-hooks.sh          # enable  (git config core.hooksPath .githooks)
#   ./scripts/setup-hooks.sh --off    # disable
#   ./scripts/setup-hooks.sh --status # show current state
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

case "${1:-on}" in
  --off)
    git config --unset core.hooksPath 2>/dev/null || true
    echo "🔕 change-log hook disabled"
    ;;
  --status)
    printf 'core.hooksPath = %s\n' "$(git config --get core.hooksPath || echo '(unset — hook disabled)')"
    ;;
  on|--on|"")
    chmod +x .githooks/pre-commit scripts/*.sh 2>/dev/null || true
    git config core.hooksPath .githooks
    echo "🔒 change-log hook enabled (core.hooksPath = .githooks)"
    echo "   commits that touch code must also update MY-CHANGES.md"
    echo "   bypass a single commit with: git commit --no-verify"
    ;;
  *)
    echo "usage: ./scripts/setup-hooks.sh [--off|--status]" >&2
    exit 1
    ;;
esac
