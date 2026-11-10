# 🟢 MY CHANGES — Personal Change Log

> **Purpose.** This repo was uploaded by someone else. Everything in the **baseline
> commit** is *inherited (not mine)*. Everything logged in this file — and every commit
> tagged `[mine]` — is **my own work** (with AI assistance), now included in the repo.
>
> **The rule:** no adjustment or experiment is "done" until it has an entry in the log
> below, **in the same commit as the change itself**. Since 2026-11-10 that rule is
> enforced by a git hook, not by memory — see [§ Logging a change](#-logging-a-change-the-rule).
>
> **Live file-level map:** [`docs/PROVENANCE.md`](docs/PROVENANCE.md) — which of the
> current files are inherited, which I added, which I modified (regenerated from git).

---

## 📍 Where things stand (2026-11-10)

| Item | Value |
|---|---|
| Inherited baseline | `ce9a474` — "Add files via upload", Jeicel Mae A. Ortega (2026-11-09), 107 files |
| My work merged into `main` | PR [#1](https://github.com/mendozagabii/Mabini-MEO/pull/1) → `8fe2830`, PR [#2](https://github.com/mendozagabii/Mabini-MEO/pull/2) → `427be76` |
| Working branch for new work | `arena/08607812-mabini-meo` |
| Repo today | 125 tracked files = 89 inherited **untouched** + 18 **added by me** + 18 **modified by me** (+0 deleted) |
| Original files removed | none — the original author's tree is intact |

The 36 files I ever touched, with line counts, are listed at the bottom of
[`docs/PROVENANCE.md`](docs/PROVENANCE.md) and can be re-derived any time with
[`scripts/my-diff.sh`](scripts/my-diff.sh).

## 🔍 How to tell what's mine (4 ways)

1. **This file** — the change log below, newest first, one entry per adjustment.
2. **Git history** — my commits start with `[mine]`:
   ```bash
   git log --oneline main..HEAD          # commits on the current branch
   git log --oneline --grep='\[mine\]'   # every commit I ever made
   ```
3. **Diff against the original** — everything I ever touched, in one command:
   ```bash
   ./scripts/my-diff.sh          # summary: files I added / modified / deleted
   ./scripts/my-diff.sh --files  # plain A/M/D path list
   ./scripts/my-diff.sh --stat   # line counts per file
   ./scripts/my-diff.sh --full   # the actual line-by-line diff vs baseline
   ```
4. **Markers inside the code** — new files I create carry a `@mine` header comment;
   edits inside an original file get a nearby `@mine:` comment. So:
   ```bash
   grep -rn "@mine" src/ scripts/ .githooks/
   ```

## 🛠 Logging a change (the rule)

```
1. make the change
2. ./scripts/log-change.sh -t "Short title" --why "What changed and why."
      ↳ fills the date + the changed-file list from git, inserts the entry at the top
        of the Change Log below, and stages MY-CHANGES.md
3. git add -A && git commit -m "[mine] Short title"
4. ./scripts/gen-provenance.sh      # optional, keeps docs/PROVENANCE.md accurate
```

| Tool | What it does |
|---|---|
| `scripts/log-change.sh` | Drafts + inserts a log entry from the current working tree (`--dry-run` to preview). |
| `scripts/check-changelog.sh` | Fails if code changed without a log entry (`--staged` for the hook, or a commit range). |
| `.githooks/pre-commit` | Runs the check automatically on every commit. |
| `scripts/setup-hooks.sh` | One-time per clone: `./scripts/setup-hooks.sh` enables the hook; `--off` disables it. |
| `scripts/gen-provenance.sh` | Regenerates [`docs/PROVENANCE.md`](docs/PROVENANCE.md) (inherited vs mine, per file). |
| `scripts/my-diff.sh` | Quick diff of everything vs the inherited baseline. |

The hook can always be bypassed for a single commit with `git commit --no-verify`
(e.g. whitespace-only changes).

---

## 📋 Change Log

<!-- NEW-ENTRY-MARKER — scripts/log-change.sh inserts new entries directly below this line, newest first. Do not delete this line. -->

### 2026-11-10 — [mine] Change-tracking toolkit (provenance map, auto-entry, commit guard)
- **Type:** Added (tooling) / Docs + a small edit to this file's structure
- **Files:** `docs/PROVENANCE.md` (new, generated), `scripts/gen-provenance.sh` (new), `scripts/log-change.sh` (new), `scripts/check-changelog.sh` (new), `.githooks/pre-commit` (new), `scripts/setup-hooks.sh` (new), `scripts/my-diff.sh` (extended), `MY-CHANGES.md` (restructured: status block + workflow + `NEW-ENTRY-MARKER`)
- **What & why:** Turned the manual change log into a system that cannot silently go stale. `gen-provenance.sh` derives a file-by-file "inherited vs mine" report from git + the `@mine` markers (so `docs/PROVENANCE.md` always matches the code); `log-change.sh` writes the next entry from the working tree so logging costs one command; `check-changelog.sh` + the pre-commit hook block any commit that changes code without a log entry. Also refreshed the header: the earlier work is now merged into `main` via PR #1/#2, so the file describes the repo as it stands, not as a pending branch.
- **Status:** ✅ Kept
- **Original code affected:** none (no file from the baseline was touched)

### 2026-11-10 — [mine] Phase 2 merged into `main` (status update of the 2026-11-09 entry)
- **Type:** Docs (status only — no code change; recorded here so the merge is dated)
- **Files:** `MY-CHANGES.md` (this entry)
- **What & why:** PR [#2](https://github.com/mendozagabii/Mabini-MEO/pull/2) (`arena/3f13779c-mabini-meo`) was merged by the owner as `427be76`, so the annual-validation / Storage-attachment / AI-persistence work is now part of `main` and of the repo. The entry below keeps the original description; this line records the merge. PR [#1](https://github.com/mendozagabii/Mabini-MEO/pull/1) had already been merged as `8fe2830`.
- **Status:** ✅ Kept (merged)
- **Original code affected:** none (status note)

### 2026-11-09 — [mine] Phase 2 fixes: annual validation, Storage attachments, AI persistence
- **Type:** DB migration (live) + code. Owner confirmed Phase 1 done (verified: `AI_GATEWAY_API_KEY` present in Vercel prod/preview/dev; Gmail SMTP configured in Supabase; custom reset template applied) and authorized Phase 2 including merging the PR.
- **DB (Supabase WBLRMS):** migration `annual_validation_entries_and_followup_year` — new table `annual_validation_entries` (+ unique (project_id, year), 4 RLS policies), new column `inspections.annual_follow_up_year`. SQL copy: `supabase/migrations/20261109_annual_validation.sql`. No existing data touched.
- **Files:** `src/lib/supabase-data.ts` (annual follow-up generation `ensureAnnualFollowUps`, `saveAnnualValidation`, Storage upload/signed-URL attachments for projects + inspections, `saveAiRun`/`getLatestAiPredictions`), `src/app/api/local-road/route.ts` (annual validation now saved instead of 400), `src/app/api/inspections/route.ts` + `local-road` GET (pass admin client for generation), `src/app/api/ai-priority/route.ts` (POST persists run; new GET latest run), `src/app/App.tsx` (loads latest saved AI run; `storagePath` on ProjectAttachment), `LocalRoadForm.tsx`/`LocalRoadList.tsx` (type only), `docs/SUPABASE-MIGRATION.md` (limitations updated).
- **Verified:** `tsc --noEmit` ✅, `npm run build` ✅, local server: `/api/health` 200, unauthenticated `/api/local-road` `/api/inspections` `/api/ai-priority` → 401 ✅ (full login test still to be done by owner on live site).
- **Status:** ✅ Merged into `main` via PR #2 (`427be76`)
- **Original code affected:** behavior of my own migration-era files only; no original-author feature removed (annual validation restored to SQLite-era behavior)

### 2026-11-09 — [mine] Custom email templates doc (for Supabase Auth)
- **Type:** Docs only (no code executed, nothing changed in Supabase yet)
- **Files:** `docs/EMAIL-TEMPLATES.md` (new), `MY-CHANGES.md` (this entry)
- **What & why:** Prepared a Mabini MEO-branded password-reset email template (subject + HTML) to paste into Supabase Dashboard → Authentication → Email Templates, plus suggested subjects for the other built-in templates. Context from this session: the system currently uses Supabase's default templates and built-in mailer (~2 emails/hour); custom SMTP is a dashboard-only config the owner will do in Phase 1 (along with creating `AI_GATEWAY_API_KEY` in Vercel — the only API key still needed; Supabase keys are already set).
- **Status:** 📄 Ready to paste — owner applies it in the Supabase dashboard
- **Original code affected:** none

### 2026-11-09 — [mine] AI integration check + demo-data cleanup plan (PREPARED, not executed)
- **Type:** Docs + prepared SQL (no data changed anywhere)
- **Files:** `docs/DEMO-DATA-PLAN.md` (new), `supabase/demo/seed-demo-data.sql` (new), `MY-CHANGES.md` (this entry)
- **What & why:**
  1. **AI check:** The app *does* include AI features — `src/lib/ai.ts` + `AIPredictionModule` call **Vercel AI Gateway** (`meta/llama-4-scout`) for road maintenance prioritization, but `AI_GATEWAY_API_KEY` was **not set** in the repo or in Vercel (verified via `list_env_vars` — only the 4 Supabase/site vars exist), so "Generate AI Priorities" failed with 503. Noted for later; the owner adds the key in Vercel. Also noted: AI results were stored only in browser localStorage, never in the DB (fixed in Phase 2 above).
  2. **Demo-data prep:** Did a read-only inventory of WBLRMS (roads 10, projects 10, inspections 17, items 0, maintenance 0, activity logs 62, AI 1 run/10 results). Prepared (but did **NOT** run) a wipe+seed plan: on the owner's signal, back up current rows, delete all transactional/test data **except the 4 accounts** (and keep barangays/categories/contractors/role access), then seed 10 synthetic-but-realistic roads/projects with inspections (+126 auto-generated items), 10 maintenance records, 8 progress updates, and 10 AI priority results.
- **Status:** ⏸️ Prepared — **waiting for the owner's go signal** before any delete/insert is executed
- **Original code affected:** none

### 2026-11-09 — [mine] Opened pull request #1 for the Supabase migration
- **Type:** Docs (this entry only)
- **Files:** `MY-CHANGES.md` (this entry)
- **What & why:** Pushed branch `arena/7f3b570f-mabini-meo` and opened **PR #1** → https://github.com/mendozagabii/Mabini-MEO/pull/1 ("[mine] Migrate SQLite to Supabase (data + Auth) + change tracking", 30 files, +2219/−743 vs `main`). Waiting for the owner's review/smoke test on the Vercel preview before merging.
- **Status:** ✅ Merged into `main` via PR #1 (`8fe2830`)
- **Original code affected:** none (this entry)

### 2026-11-09 — [mine] Set Supabase environment variables in Vercel + Supabase redirect allow-list
- **Type:** Config (Vercel + Supabase dashboards; no code change)
- **Files:** none in repo (`.env.local` restored locally, gitignored)
- **What & why:** Vercel project `mabini-meo` (`prj_AFSkqKltO6ab9FD8QlF3ZZTjCJrB`) had **0 env vars**. Added for Production + Preview + Development: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable), `SUPABASE_SERVICE_ROLE_KEY` (type: sensitive, server-only), `NEXT_PUBLIC_SITE_URL=https://mabini-meo.vercel.app`. Verified via `list_env_vars` (4 vars, all targets). In Supabase Auth: Site URL set to `https://mabini-meo.vercel.app`, redirect allow-list = `http://localhost:3000/**, https://mabini-meo.vercel.app/**` so deployed password-reset links work.
- **Status:** ✅ Kept (env vars live; the Supabase code went live with PR #1/#2 merges)
- **Original code affected:** none

### 2026-11-09 — [mine] Migrated the system from SQLite to Supabase (data + Auth)
- **Type:** Modified (data layer + auth) / Added (Supabase lib, routes, docs) / DB migration in Supabase
- **Files:** `package.json` + `package-lock.json` (added `@supabase/supabase-js`), `.env.example` (new), `.env.local` (new, gitignored — real keys), `src/lib/supabase.ts` (new), `src/lib/supabase-data.ts` (new, app↔Supabase translation), `src/lib/api.ts` (new), all routes in `src/app/api/` rewritten (local-road, inspections, maintenance, activity-logs, ai-priority, health, auth/login, auth/status, auth/lock-status, auth/unlock, auth/request-password-reset, auth/reset-password) + new `auth/logout`, `auth/me`; small marked edits in `src/app/App.tsx` (session restore, refresh-after-login, logout) and `src/app/reset-password/page.tsx` (Supabase recovery tokens); `docs/SUPABASE-MIGRATION.md` (new)
- **Supabase changes:** migration `app_compat_archive_and_deferred` (`archived_at` on inspections/maintenance, `deferred` enum), fixed validator's username (`Validator@gmail.com` → `validator`), disabled public sign-up, set redirect allow-list
- **What & why:** Owner confirmed full migration keeping the login design. App records are translated to the normalized schema (project+road join, inspection_items, profiles/Auth). Login is now a real Supabase Auth session in httpOnly cookies with DB-backed lockout; every API route requires a session (anonymous = 401, verified), user admin requires Head Engineer — fixes audit findings #1–#6. Login page visuals untouched.
- **Status:** 🧪 Experimental when written → ✅ merged (PR #1); `tsc` ✅, build ✅, 401 checks ✅, DB RPCs verified via SQL; end-to-end login/CRUD smoke test still owed by owner (checklist in `docs/SUPABASE-MIGRATION.md`)
- **Original code affected:** all API routes replaced; `App.tsx`/`reset-password/page.tsx` got small `@mine` additions; UI/components otherwise untouched

### 2026-11-09 — [mine] Checked my Supabase database (read-only inspection)
- **Type:** Docs (inspection only — nothing changed in Supabase or in code)
- **Files:** `docs/SUPABASE-CHECK-2026-11-09.md` (new), `MY-CHANGES.md` (this entry)
- **What & why:** Inspected all 3 Supabase projects. The one for this system is **WBLRMS** (`jowcyoziuqzoezxboffx`, ACTIVE_HEALTHY): 17 normalized tables, RLS on all, 51 role policies, 22 functions, seeded roads/projects/inspections/users. Key findings: it is **not connected to the app at all** (no supabase-js dep, no env, app still on SQLite), its enums/shapes are **not drop-in compatible** (no `Deferred` maintenance status, validation values differ), seed data incomplete (0 maintenance, 0 inspection_items), validator's username wrongly set to `Validator@gmail.com`, duplicate `name`/`full_name` columns, duplicated policy sets, public signup enabled, no migration history in repo. Other 2 projects are paused/INACTIVE.
- **Status:** ✅ Kept (findings drove the migration above)
- **Original code affected:** none

### 2026-11-09 — [mine] Audited the baseline for errors (no code fixes yet)
- **Type:** Docs (audit only — no original code touched)
- **Files:** `docs/AUDIT-2026-11-09.md` (new), `MY-CHANGES.md` (this entry), `.gitignore` (added `tsconfig.tsbuildinfo`)
- **What & why:** Ran tsc (✅), production build (✅), and live curl tests. Found: 🔴 no session/auth on any API route (full unauthenticated CRUD + user creation, live-verified), seeded default passwords (`admin123`…), default master code `master123`, unlock endpoint bypass for non-admins; 🟠 `/api/auth/lock-status` statically prerendered so it never reports lockouts (live-verified), `database-schema.sql` missing 3 tables, in-memory lockout; 🟡 dead Vite files, unused components, no ESLint config. Full details in `docs/AUDIT-2026-11-09.md`. Test DB/artifacts from the audit were deleted.
- **Status:** ✅ Kept (findings #1–#6 fixed by the Supabase migration; 🟡 items remain)
- **Original code affected:** none

### 2026-11-09 — [mine] Set up personal change-tracking system
- **Type:** Docs / Config (all new files, no original code touched)
- **Files:** `MY-CHANGES.md` (new), `docs/BASELINE.md` (new), `docs/baseline-files.txt` (new), `scripts/my-diff.sh` (new), `.gitignore` (new — repo had none)
- **What & why:** Scanned the forked repo and recorded the inherited baseline (`ce9a474`, 107 files) so every future adjustment by me can be distinguished from the original author's work. Added a helper script to diff against the baseline at any time. Added a standard Next.js `.gitignore` so experiment artifacts (`node_modules`, `.next`, `.env.local`, local SQLite data) don't pollute the history.
- **Status:** ✅ Kept (extended 2026-11-10 — see the toolkit entry above)
- **Original code affected:** none

---

## 🧪 Experiments in progress

| Experiment | Started | Where | Status / notes |
|---|---|---|---|
| _(none yet)_ | | | |

## ↩️ Reverted / abandoned

| Change | Date reverted | Why |
|---|---|---|
| _(none yet)_ | | | |

---

## 🧾 Entry format

```
### YYYY-MM-DD — [mine] <short title>
- **Type:** Added | Modified | Deleted | Experiment | Config | Docs
- **Files:** `path/to/file` (new), `path/to/other` (modified)
- **What & why:** 1–3 sentences.
- **Status:** ✅ Kept | 🧪 Experimental | ↩️ Reverted (say why)
- **Original code affected:** none / describe what part of the baseline changed
```

`scripts/log-change.sh` produces exactly this shape automatically.
