#!/usr/bin/env bash
# @mine — Show everything I changed vs the inherited baseline commit.
#
# Usage:
#   ./scripts/my-diff.sh          # summary: files I added / modified / deleted + my commits
#   ./scripts/my-diff.sh --files  # same, plain path list with A/M/D letters
#   ./scripts/my-diff.sh --stat   # line counts per file
#   ./scripts/my-diff.sh --full   # the actual line-by-line diff vs baseline
#   ./scripts/my-diff.sh --pr     # only my commits since the baseline
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASELINE="${BASELINE:-ce9a4749bdced2c0ee8c358dec447bfb82eb56ea}"

if ! git cat-file -e "${BASELINE}^{commit}" 2>/dev/null; then
  cat >&2 <<EOF
my-diff: baseline $BASELINE is not in this clone (shallow clone?).
         Run:  git fetch --unshallow
EOF
  exit 1
fi

case "${1:-}" in
  --full)
    git diff --stat "$BASELINE"
    echo
    git diff "$BASELINE"
    ;;
  --files)
    git diff --name-status --find-renames "$BASELINE"
    ;;
  --stat)
    git diff --stat "$BASELINE"
    ;;
  --pr)
    git log --oneline --no-merges "$BASELINE"..HEAD
    ;;
  "")
    echo "Changes vs inherited baseline ($BASELINE):"
    echo
    git diff --name-status --find-renames "$BASELINE" || true
    echo
    git diff --shortstat "$BASELINE" || true
    echo
    echo "Commits I made (tagged [mine]):"
    git log --oneline --no-merges "$BASELINE"..HEAD || true
    echo
    echo "Tip: ./scripts/gen-provenance.sh rewrites docs/PROVENANCE.md from this."
    ;;
  -h|--help)
    sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
    ;;
  *)
    echo "my-diff: unknown option '$1' (try --help)" >&2
    exit 1
    ;;
esac
