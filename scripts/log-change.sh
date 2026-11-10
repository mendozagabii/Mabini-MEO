#!/usr/bin/env bash
# @mine — Append a MY-CHANGES.md entry automatically from what is in the working tree.
#
# This is the "log every action" helper: it fills in the date and the changed files
# (new / modified / deleted, straight from git) and inserts the entry at the top of
# the Change Log (newest first). You only supply a title and a reason.
#
# Usage:
#   ./scripts/log-change.sh -t "Add barangay filter to road list" \
#                           --why "Requested by the MEO head; filters projects by barangay."
#
# Options:
#   -t, --title TEXT      short title (required)
#       --why TEXT        what & why, 1-3 sentences (required unless --dry-run)
#       --type TEXT       Added | Modified | Deleted | Experiment | Config | Docs
#                         (default: guessed from the changed files)
#       --status TEXT     default "✅ Kept"
#       --original TEXT   the "Original code affected:" line, default "none"
#       --files TEXT      override the auto-detected file list
#       --date YYYY-MM-DD default: today (UTC)
#       --dry-run         print the entry instead of writing it
#       --no-stage        do not `git add MY-CHANGES.md` afterwards
#
# Exit codes: 0 ok · 1 error · 2 nothing to log
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
LOG="MY-CHANGES.md"
MARKER="<!-- NEW-ENTRY-MARKER"

TITLE=""; WHY=""; TYPE=""; STATUS="✅ Kept"; ORIGINAL="none"
FILES_OVERRIDE=""; DATE_OVERRIDE=""; DRY=0; STAGE=1

while [ $# -gt 0 ]; do
  case "$1" in
    -t|--title)    TITLE="${2:-}"; shift 2 ;;
    --why)         WHY="${2:-}"; shift 2 ;;
    --type)        TYPE="${2:-}"; shift 2 ;;
    --status)      STATUS="${2:-}"; shift 2 ;;
    --original)    ORIGINAL="${2:-}"; shift 2 ;;
    --files)       FILES_OVERRIDE="${2:-}"; shift 2 ;;
    --date)        DATE_OVERRIDE="${2:-}"; shift 2 ;;
    --dry-run)     DRY=1; shift ;;
    --no-stage)    STAGE=0; shift ;;
    -h|--help)     sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "log-change: unknown option '$1' (try --help)" >&2; exit 1 ;;
  esac
done

[ -f "$LOG" ] || { echo "log-change: $LOG not found in $ROOT" >&2; exit 1; }
grep -qF "$MARKER" "$LOG" || {
  echo "log-change: marker '$MARKER ...' is missing from $LOG." >&2
  echo "            Put it directly under the '## 📋 Change Log' heading first." >&2
  exit 1
}

DATE="${DATE_OVERRIDE:-$(date -u +%Y-%m-%d)}"

# Paths that count as "code / behaviour" (same list as check-changelog.sh).
CODE_RE='^(src/|supabase/|scripts/|\.githooks/|index\.ts$|next\.config\.js$|tsconfig\.json$|tailwind\.config\.js$|postcss\.config\.js$|components\.json$|database-schema\.sql$|package\.json$|\.env\.example$)'

# --- which files changed? (staged + unstaged + untracked, else last commit) ---
rows=""   # lines of: <path>\t<label>
while IFS= read -r line; do
  [ -n "$line" ] || continue
  st="${line:0:2}"
  path="${line:3}"
  # renames come as "old -> new": keep the new name
  case "$path" in *" -> "*) path="${path##* -> }" ;; esac
  case "$st" in
    '??'|*A*) label="new" ;;
    *D*)      label="deleted" ;;
    *R*)      label="renamed" ;;
    *)        label="modified" ;;
  esac
  rows+="$path"$'\t'"$label"$'\n'
done < <(git -c core.quotepath=false status --porcelain=v1 2>/dev/null || true)

if [ -z "$rows" ]; then
  while IFS=$'\t' read -r st path; do
    [ -n "${path:-}" ] || continue
    case "$st" in
      A*) label="new" ;; D*) label="deleted" ;; R*) label="renamed" ;; *) label="modified" ;;
    esac
    rows+="$path"$'\t'"$label"$'\n'
  done < <(git show --pretty=format: --name-status HEAD | grep -E '^[A-Z]' || true)
fi

if [ -n "$FILES_OVERRIDE" ]; then
  files_md="$FILES_OVERRIDE"
else
  files_md="$(printf '%s' "$rows" | awk -F'\t' 'NF {
             printf "%s`%s` (%s)", (n++ ? ", " : ""), $1, $2 }')"
fi

if [ -z "$files_md" ]; then
  echo "log-change: no changed files found and none passed with --files." >&2
  echo "            Nothing to log — make the change first, or pass --files 'note'." >&2
  exit 2
fi

# --- guess the type ---------------------------------------------------------
code_count=0; new_count=0; total=0
while IFS=$'\t' read -r path label; do
  [ -n "${path:-}" ] || continue
  total=$((total + 1))
  printf '%s' "$path" | grep -qE "$CODE_RE" && code_count=$((code_count + 1))
  [ "$label" = "new" ] && new_count=$((new_count + 1))
done <<< "$rows"

if [ -z "$TYPE" ]; then
  if [ "$code_count" -eq 0 ]; then
    TYPE="Docs"
  elif [ "$new_count" -eq "$total" ]; then
    TYPE="Added"
  else
    TYPE="Modified"
  fi
fi

[ -n "$TITLE" ] || { echo "log-change: --title is required" >&2; exit 1; }
if [ -z "$WHY" ] && [ "$DRY" -eq 0 ]; then
  echo "log-change: --why is required (1-3 sentences: what changed and why)" >&2
  exit 1
fi
[ -n "$WHY" ] || WHY="_(todo: what & why)_"

ENTRY="### $DATE — [mine] $TITLE
- **Type:** $TYPE
- **Files:** $files_md
- **What & why:** $WHY
- **Status:** $STATUS
- **Original code affected:** $ORIGINAL"

if [ "$DRY" -eq 1 ]; then
  printf '%s\n' "$ENTRY"
  exit 0
fi

# --- insert directly below the marker (newest first) -------------------------
ENTRY="$ENTRY" awk -v marker="$MARKER" '
  { print }
  !done && index($0, marker) {
    print ""
    print ENVIRON["ENTRY"]
    done = 1
  }
' "$LOG" > "$LOG.tmp"
mv "$LOG.tmp" "$LOG"

if [ "$STAGE" -eq 1 ]; then
  git add "$LOG" 2>/dev/null || true
  echo "✅ logged in $LOG (and staged)"
else
  echo "✅ logged in $LOG"
fi
echo "   review it, then commit it together with the change:"
echo "   git commit -m \"[mine] $TITLE\""
