#!/usr/bin/env bash
# @mine — Generate docs/PROVENANCE.md: a file-by-file map of "inherited vs mine".
#
# Usage:
#   ./scripts/gen-provenance.sh              # write docs/PROVENANCE.md
#   ./scripts/gen-provenance.sh out.md       # write somewhere else
#   HEAD_REF=origin/main ./scripts/gen-provenance.sh
#
# Everything is derived from git + the "@mine" markers in the files themselves,
# so the report can never drift away from the code.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASELINE="${BASELINE:-ce9a4749bdced2c0ee8c358dec447bfb82eb56ea}"
HEAD_REF="${HEAD_REF:-HEAD}"
OUT="${1:-docs/PROVENANCE.md}"

if ! git cat-file -e "${BASELINE}^{commit}" 2>/dev/null; then
  cat >&2 <<EOF
gen-provenance: baseline commit $BASELINE is not in this clone.
A shallow clone does not contain it — run:

    git fetch --unshallow

EOF
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

git ls-tree -r --name-only "$BASELINE" | LC_ALL=C sort > "$tmp/base.txt"
git ls-tree -r --name-only "$HEAD_REF"  | LC_ALL=C sort > "$tmp/head.txt"
git diff --numstat --diff-filter=ACMD "$BASELINE" "$HEAD_REF" > "$tmp/numstat.tsv" 2>/dev/null || true
cut -f3- "$tmp/numstat.tsv" | LC_ALL=C sort > "$tmp/changed.txt"
LC_ALL=C comm -23 "$tmp/base.txt" "$tmp/changed.txt" > "$tmp/untouched.txt"

# --- helpers ---------------------------------------------------------------

area_of() {
  case "$1" in
    src/app/api/*)          echo "API routes — \`src/app/api/\`" ;;
    src/app/components/ui/*) echo "Stock shadcn/ui kit — \`src/app/components/ui/\` (library code)" ;;
    src/app/components/*)   echo "Feature modules — \`src/app/components/\`" ;;
    src/app/reset-password/*) echo "Password-reset page — \`src/app/reset-password/\`" ;;
    src/app/*)              echo "App shell — \`src/app/\`" ;;
    src/lib/*)              echo "Data layer & helpers — \`src/lib/\`" ;;
    src/styles/*|src/imports/*|src/main.tsx) echo "Inherited Vite leftovers — \`src/\`" ;;
    docs/*)                 echo "Documentation — \`docs/\`" ;;
    scripts/*|.githooks/*)  echo "Tooling — \`scripts/\`, \`.githooks/\`" ;;
    supabase/*)             echo "Supabase SQL — \`supabase/\`" ;;
    *)                      echo "Root config & assets" ;;
  esac
}

# First "@mine" comment in the file, cleaned up, as the human-readable note.
note_of() {
  local f="$1" n=""
  case "$f" in
    MY-CHANGES.md)      printf '%s' "the change log itself — one entry per adjustment"; return ;;
    docs/PROVENANCE.md) printf '%s' "this generated report"; return ;;
    package.json)       printf '%s' "added the \`@supabase/supabase-js\` dependency"; return ;;
    package-lock.json)  printf '%s' "lockfile for the new \`@supabase/supabase-js\` dependency"; return ;;
  esac
  [ -f "$f" ] || { printf '%s' "—"; return; }
  local hit="" ln="" nxt=""
  case "$f" in
    *.md) hit="$(grep -m1 -In -E '^[[:space:]]*<!--.*@mine' "$f" 2>/dev/null || true)" ;;
    *)    hit="$(grep -m1 -In "@mine" "$f" 2>/dev/null || true)" ;;
  esac
  if [ -z "$hit" ]; then printf '%s' "—"; return; fi
  ln="${hit%%:*}"; n="${hit#*:}"
  # the comment continues on the next line? then mark the note with an ellipsis
  nxt="$(sed -n "$((ln + 1))p" "$f" 2>/dev/null || true)"
  if printf '%s' "$nxt" | grep -qE '^[[:space:]]*(//|\*|#|--|<!--)'; then n="$n …"; fi
  n="$(printf '%s' "$n" \
    | sed -E 's/^[[:space:]]*(\/\/+|\/\*+|\*+|#|--|<!--|%)[[:space:]]*//; s/[[:space:]]*\*+\/[[:space:]]*$//; s/[[:space:]]*-->[[:space:]]*$//' \
    | sed -E 's/^@mine[[:space:]]*[—–:-]*[[:space:]]*//' \
    | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//; s/\|/\\|/g')"
  [ -n "$n" ] || n="(has @mine marker)"
  # capitalise the first letter, notes are rendered as table cells
  printf '%s%s' "$(printf '%s' "${n:0:1}" | tr '[:lower:]' '[:upper:]')" "${n:1}"
}

: > "$tmp/rows.tsv"
while IFS=$'\t' read -r add del path; do
  [ -n "${path:-}" ] || continue
  if [ "$add" = "-" ]; then delta="binary"; else delta="+$add / -$del"; fi
  # the report's own row would change its own line count on every regeneration
  [ "$path" = "docs/PROVENANCE.md" ] && delta="(this file)"
  if grep -Fxq -- "$path" "$tmp/base.txt"; then
    if grep -Fxq -- "$path" "$tmp/head.txt"; then kind="modified"; else kind="deleted"; fi
  else
    kind="added"
  fi
  printf '%s\t%s\t%s\t%s\t%s\n' "$(area_of "$path")" "$path" "$kind" "$delta" "$(note_of "$path")" >> "$tmp/rows.tsv"
done < "$tmp/numstat.tsv"

emit_rows() { # $1 = kind filter (added|modified|deleted)
  LC_ALL=C sort -t$'\t' -k1,1 -k2,2 "$tmp/rows.tsv" \
    | awk -F'\t' -v want="$1" '
        $3 == want {
          if ($1 != last) {
            if (last != "") print ""
            printf "#### %s\n\n| File | Type | Δ lines | Note (from the `@mine` marker) |\n|---|---|---|---|\n", $1
            last = $1
          }
          printf "| `%s` | %s | %s | %s |\n", $2, $3, $4, $5
        }'
}

count_of() { awk -F'\t' -v want="$1" '$3 == want' "$tmp/rows.tsv" | wc -l | tr -d ' '; }

n_head=$(wc -l < "$tmp/head.txt" | tr -d ' ')
n_base=$(wc -l < "$tmp/base.txt" | tr -d ' ')
n_added=$(count_of added)
n_modified=$(count_of modified)
n_deleted=$(count_of deleted)
n_untouched=$(wc -l < "$tmp/untouched.txt" | tr -d ' ')
short_base="$(git rev-parse --short "$BASELINE")"
today="$(date -u +%Y-%m-%d)"

# --- write the report ------------------------------------------------------

{
cat <<EOF
<!-- @mine — GENERATED FILE. Regenerate with: ./scripts/gen-provenance.sh (do not hand-edit). -->

# 🧾 PROVENANCE — what is inherited vs. what is mine

Generated from git on **$today** · baseline \`$short_base\` · every row below is verifiable with git

> **Inherited** = present in the baseline commit \`ce9a474\` ("Add files via upload",
> Jeicel Mae A. Ortega) and **not** touched by me.
> **Mine** = added or modified by me (with AI assistance), now merged into \`main\`
> through PR [#1](https://github.com/mendozagabii/Mabini-MEO/pull/1) and
> PR [#2](https://github.com/mendozagabii/Mabini-MEO/pull/2).
>
> The per-entry narrative lives in [\`../MY-CHANGES.md\`](../MY-CHANGES.md); this page is
> the **file-level map** of the code as it sits in the repo right now.

## 📊 At a glance

| | Files | Meaning |
|---|---:|---|
| Total tracked now | **$n_head** | everything in the repo |
| 🟦 Inherited, untouched | **$n_untouched** | original author's work, byte-for-byte |
| 🟩 Added by me | **$n_added** | files that did not exist at baseline |
| 🟨 Modified by me | **$n_modified** | original files I edited (still their file) |
| 🟥 Deleted by me | **$n_deleted** | — |

EOF
if [ "$n_deleted" -eq 0 ]; then echo "**I deleted none of the original files** — the original author's tree is preserved."; echo; fi
cat <<'EOF'
### Three ways to verify any row yourself

```bash
./scripts/my-diff.sh                 # name-status of everything I touched
git diff --stat ce9a474 HEAD         # line counts, per file
git diff ce9a474 HEAD -- <file>      # the actual lines
grep -rn "@mine" src/                # markers inside the code I wrote/edited
```

EOF
printf '**[Full diff on GitHub: baseline → main](https://github.com/mendozagabii/Mabini-MEO/compare/%s...main)**\n\n---\n\n' "$short_base"

if [ "$n_added" -gt 0 ]; then
cat <<EOF
## 🟩 Added by me ($n_added files)

Files that are entirely mine — safe to treat as "new work", nothing inherited inside them.

EOF
emit_rows added
echo
fi

if [ "$n_modified" -gt 0 ]; then
cat <<EOF
## 🟨 Modified by me ($n_modified files)

These are **originally the other author's files** that I edited. The file still counts as
theirs in origin; only the lines listed in the note / diff are mine.

EOF
emit_rows modified
echo
fi

if [ "$n_deleted" -gt 0 ]; then
cat <<EOF
## 🟥 Deleted by me ($n_deleted files)

EOF
emit_rows deleted
echo
fi

cat <<EOF
---

## 🟦 Inherited, untouched ($n_untouched files)

Original author's work, exactly as received (including the ~40 stock shadcn/ui
components and the Vite leftovers \`src/main.tsx\` / \`src/styles/*\`).

<details>
<summary><b>Show the full list of $n_untouched untouched files</b></summary>

EOF
# group untouched files by area
while IFS= read -r f; do
  printf '%s\t%s\n' "$(area_of "$f")" "$f"
done < "$tmp/untouched.txt" | LC_ALL=C sort -t$'\t' -k1,1 -k2,2 \
  | awk -F'\t' '
      { if ($1 != last) { if (last != "") print ""; printf "**%s**\n\n", $1; last = $1 }
        printf "- `%s`\n", $2 }'
cat <<'EOF'

</details>

---

## 🕓 Commit provenance

### Merged pull requests (my work entering `main`)

| PR | Branch merged | Merge commit |
|---|---|---|
EOF
git log --merges --format='__ROW__%s' "$BASELINE".."$HEAD_REF" | grep '^__ROW__' | while IFS= read -r line; do
  subj="${line#__ROW__}"
  num="$(printf '%s' "$subj" | sed -nE 's/^Merge pull request #([0-9]+).*/\1/p')"
  [ -n "$num" ] || continue
  branch="$(printf '%s' "$subj" | sed -nE 's/.* from [^/]+\/(.*)$/\1/p')"
  merge_short="$(git log --merges --format='%h %s' "$BASELINE".."$HEAD_REF" | awk -v n="#$num " 'index($0, n){print $1; exit}')"
  printf '| [#%s](https://github.com/mendozagabii/Mabini-MEO/pull/%s) | `%s` | `%s` |\n' "$num" "$num" "$branch" "$merge_short"
done

cat <<'EOF'

### My commits (everything after the baseline, merges excluded)

| Date | Subject | Files |
|---|---|---:|
EOF

git log --no-merges --reverse --format='%h|%ad|%s' --date=short "$BASELINE".."$HEAD_REF" | while IFS='|' read -r h d s; do
  nf=$(git show --pretty=format: --name-only "$h" | grep -c . || true)
  printf '| %s | %s | %s |\n' "$d" "${s//|/\\|}" "$nf"
done

cat <<EOF

---

*Regenerate after any change:* \`./scripts/gen-provenance.sh\`
EOF
} > "$OUT"

echo "✅ wrote $OUT  ($n_untouched inherited · $n_added added · $n_modified modified · $n_deleted deleted)"
