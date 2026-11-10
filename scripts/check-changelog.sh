#!/usr/bin/env bash
# @mine — Guard: no code adjustment is "done" until MY-CHANGES.md documents it.
#
# Usage:
#   ./scripts/check-changelog.sh --staged     # check the staged diff (pre-commit hook)
#   ./scripts/check-changelog.sh              # check every commit since the baseline
#   ./scripts/check-changelog.sh --range A..B # check a specific range
#
# A commit (or a staged change) that touches code must also touch MY-CHANGES.md.
# Docs-only changes are exempt. Merge commits are ignored.
#
# Exit codes: 0 clean · 1 undocumented change found
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASELINE="${BASELINE:-ce9a4749bdced2c0ee8c358dec447bfb82eb56ea}"
LOG="MY-CHANGES.md"
MODE="range"
RANGE=""

case "${1:-}" in
  --staged) MODE="staged"; shift ;;
  --range)  MODE="range"; RANGE="${2:-}"; shift 2 ;;
  -h|--help) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  "") ;;
  *) echo "check-changelog: unknown option '$1'" >&2; exit 1 ;;
esac

# Paths that count as "code / behaviour" — touching one of these requires a log entry.
CODE_RE='^(src/|supabase/|scripts/|\.githooks/|index\.ts$|next\.config\.js$|tsconfig\.json$|tailwind\.config\.js$|postcss\.config\.js$|components\.json$|database-schema\.sql$|package\.json$|\.env\.example$)'

is_code() { printf '%s' "$1" | grep -qE "$CODE_RE"; }

fail_lines=()

if [ "$MODE" = "staged" ]; then
  mapfile -t files < <(git diff --cached --name-only --diff-filter=ACMRD)
  [ "${#files[@]}" -eq 0 ] && exit 0

  code=0; logged=0
  for f in "${files[@]}"; do
    [ "$f" = "$LOG" ] && logged=1
    is_code "$f" && code=1
  done

  if [ "$code" -eq 1 ] && [ "$logged" -eq 0 ]; then
    cat >&2 <<EOF
❌ MY-CHANGES.md is not updated, but this commit changes code:

$(printf '   • %s\n' "${files[@]}")

   Log it first (it fills in the file list for you):

   ./scripts/log-change.sh -t "<short title>" --why "<what & why>"

   Logged already but the file is not staged?  git add MY-CHANGES.md
   Genuinely no entry needed (e.g. formatting)?  git commit --no-verify
EOF
    exit 1
  fi
  exit 0
fi

# --- range mode -------------------------------------------------------------
if [ -z "$RANGE" ]; then
  if git rev-parse --verify -q origin/main >/dev/null 2>&1; then
    RANGE="origin/main..HEAD"
  else
    RANGE="$BASELINE..HEAD"
  fi
fi

if ! git cat-file -e "${BASELINE}^{commit}" 2>/dev/null && [ "$RANGE" = "$BASELINE..HEAD" ]; then
  echo "check-changelog: baseline $BASELINE missing from this clone — run: git fetch --unshallow" >&2
  exit 1
fi

checked=0; violations=0
while IFS= read -r c; do
  [ -n "$c" ] || continue
  checked=$((checked + 1))
  mapfile -t files < <(git show --pretty=format: --name-only "$c" | grep -v '^$' || true)
  [ "${#files[@]}" -eq 0 ] && continue

  code=0; logged=0
  for f in "${files[@]}"; do
    [ "$f" = "$LOG" ] && logged=1
    is_code "$f" && code=1
  done

  if [ "$code" -eq 1 ] && [ "$logged" -eq 0 ]; then
    violations=$((violations + 1))
    subj="$(git log -1 --format='%h %s' "$c")"
    fail_lines+=("$subj")
    fail_lines+=("$(printf '        %s\n' "${files[@]}")")
  fi
done < <(git rev-list --no-merges "$RANGE")

if [ "$violations" -gt 0 ]; then
  echo "❌ $violations commit(s) in $RANGE changed code without updating $LOG:"
  echo
  printf '   %s\n' "${fail_lines[@]}"
  echo
  echo "   Fix the history or add the missing entries, then re-run."
  exit 1
fi

echo "✅ change log in sync — $checked commit(s) checked in range $RANGE"
