# 🟢 MY CHANGES — Personal Change Log

> **Purpose:** This repo was forked / uploaded by someone else. Everything in the
> **baseline commit** is *inherited (not mine)*. Everything logged in this file —
> and every commit whose message starts with `[mine]` — was **added or changed by me**
> (with AI assistance on branch `arena/7f3b570f-mabini-meo`).
>
> **Rule I follow from now on:** No adjustment or experiment is "done" until it has
> an entry in the log below, in the same commit as the change itself.

---

## 🔖 Baseline (inherited — NOT mine)

| Item | Value |
|---|---|
| Baseline commit | `ce9a4749bdced2c0ee8c358dec447bfb82eb56ea` |
| Commit message | `Add files via upload` |
| Author | Jeicel Mae A. Ortega <23-41034@g.batstate-u.edu.ph> |
| Date | 2026-11-09 |
| Files at baseline | 107 (full list: [`docs/baseline-files.txt`](docs/baseline-files.txt)) |
| My branch | `arena/7f3b570f-mabini-meo` (branched from that commit) |

Anything that was already in that commit = **original author's work**, even if I later edit it
(edits are logged below; the file itself is still originally theirs).

## 🔍 How to tell what's mine (3 ways)

1. **This file** — the log table below, newest first.
2. **Git history** — my commits start with `[mine]`:
   ```bash
   git log --oneline main..HEAD          # all my commits
   git log --oneline --grep='\[mine\]'   # same, by tag
   ```
3. **Diff against the original** — everything I ever touched, in one command:
   ```bash
   ./scripts/my-diff.sh          # summary: files I added / modified / deleted
   ./scripts/my-diff.sh --full   # the actual line-by-line diff vs baseline
   ```

**Marking inside code:** new files I create get a `@mine` header comment.
Edits inside an original file get a nearby `// @mine:` comment when practical,
so you can `grep -rn "@mine" src/` and find my fingerprints.

---

## 📋 Change Log

### 2026-11-09 — [mine] Set Supabase environment variables in Vercel + Supabase redirect allow-list
- **Type:** Config (Vercel + Supabase dashboards; no code change)
- **Files:** none in repo (`.env.local` restored locally, gitignored)
- **What & why:** Vercel project `mabini-meo` (`prj_AFSkqKltO6ab9FD8QlF3ZZTjCJrB`) had **0 env vars**. Added for Production + Preview + Development: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable), `SUPABASE_SERVICE_ROLE_KEY` (type: sensitive, server-only), `NEXT_PUBLIC_SITE_URL=https://mabini-meo.vercel.app`. Verified via `list_env_vars` (4 vars, all targets). In Supabase Auth: Site URL set to `https://mabini-meo.vercel.app`, redirect allow-list = `http://localhost:3000/**, https://mabini-meo.vercel.app/**` so deployed password-reset links work.
- **⚠️ Still pending:** the migrated code is only on this branch — Vercel Production still deploys `main` (old SQLite version). Env vars take effect on the **next deployment**; the Supabase code goes live only after this branch is pushed/merged to `main` (or deployed as preview).
- **Status:** ✅ Kept
- **Original code affected:** none


<!-- Add new entries at the TOP. One entry per adjustment/experiment, same commit as the change.
     Entry format:
     ### YYYY-MM-DD — [mine] <short title>
     - **Type:** Added | Modified | Deleted | Experiment | Config | Docs
     - **Files:** `path/to/file` (new), `path/to/other` (modified)
     - **What & why:** 1–3 sentences.
     - **Status:** ✅ Kept | 🧪 Experimental | ↩️ Reverted (say why)
     - **Original code affected:** none / describe what part of the baseline changed
-->

### 2026-11-09 — [mine] Migrated the system from SQLite to Supabase (data + Auth)
- **Type:** Modified (data layer + auth) / Added (Supabase lib, routes, docs) / DB migration in Supabase
- **Files:** `package.json` + `package-lock.json` (added `@supabase/supabase-js`), `.env.example` (new), `.env.local` (new, gitignored — real keys), `src/lib/supabase.ts` (new), `src/lib/supabase-data.ts` (new, app↔Supabase translation), `src/lib/api.ts` (new), all routes in `src/app/api/` rewritten (local-road, inspections, maintenance, activity-logs, ai-priority, health, auth/login, auth/status, auth/lock-status, auth/unlock, auth/request-password-reset, auth/reset-password) + new `auth/logout`, `auth/me`; small marked edits in `src/app/App.tsx` (session restore, refresh-after-login, logout) and `src/app/reset-password/page.tsx` (Supabase recovery tokens); `docs/SUPABASE-MIGRATION.md` (new)
- **Supabase changes:** migration `app_compat_archive_and_deferred` (`archived_at` on inspections/maintenance, `deferred` enum), fixed validator's username (`Validator@gmail.com` → `validator`), disabled public sign-up, set redirect allow-list
- **What & why:** Owner confirmed full migration keeping the login design. App records are translated to the normalized schema (project+road join, inspection_items, profiles/Auth). Login is now a real Supabase Auth session in httpOnly cookies with DB-backed lockout; every API route requires a session (anonymous = 401, verified), user admin requires Head Engineer — fixes audit findings #1–#6. Login page visuals untouched.
- **Status:** 🧪 Experimental — `tsc` ✅, build ✅, 401 checks ✅, DB RPCs verified via SQL; end-to-end login/CRUD still needs a smoke test on a normal network (sandbox can't reach supabase.co; checklist in `docs/SUPABASE-MIGRATION.md`). Old SQLite files kept unused as reference.
- **Original code affected:** all API routes replaced; `App.tsx`/`reset-password/page.tsx` got small `@mine` additions; UI/components otherwise untouched

### 2026-11-09 — [mine] Checked my Supabase database (read-only inspection)
- **Type:** Docs (inspection only — nothing changed in Supabase or in code)
- **Files:** `docs/SUPABASE-CHECK-2026-11-09.md` (new), `MY-CHANGES.md` (this entry)
- **What & why:** Inspected all 3 Supabase projects. The one for this system is **WBLRMS** (`jowcyoziuqzoezxboffx`, ACTIVE_HEALTHY): 17 normalized tables, RLS on all, 51 role policies, 22 functions, seeded roads/projects/inspections/users. Key findings: it is **not connected to the app at all** (no supabase-js dep, no env, app still on SQLite), its enums/shapes are **not drop-in compatible** (no `Deferred` maintenance status, validation values differ), seed data incomplete (0 maintenance, 0 inspection_items), validator's username wrongly set to `Validator@gmail.com`, duplicate `name`/`full_name` columns, duplicated policy sets, public signup enabled, no migration history in repo. Other 2 projects are paused/INACTIVE.
- **Status:** ✅ Kept (migration not yet started — awaiting decision)
- **Original code affected:** none

### 2026-11-09 — [mine] Audited the baseline for errors (no code fixes yet)
- **Type:** Docs (audit only — no original code touched)
- **Files:** `docs/AUDIT-2026-11-09.md` (new), `MY-CHANGES.md` (this entry), `.gitignore` (added `tsconfig.tsbuildinfo`)
- **What & why:** Ran tsc (✅), production build (✅), and live curl tests. Found: 🔴 no session/auth on any API route (full unauthenticated CRUD + user creation, live-verified), seeded default passwords (`admin123`…), default master code `master123`, unlock endpoint bypass for non-admins; 🟠 `/api/auth/lock-status` statically prerendered so it never reports lockouts (live-verified), `database-schema.sql` missing 3 tables, in-memory lockout; 🟡 dead Vite files, unused components, no ESLint config. Full details in `docs/AUDIT-2026-11-09.md`. Test DB/artifacts from the audit were deleted.
- **Status:** ✅ Kept (findings open — fixes not yet decided)
- **Original code affected:** none

### 2026-11-09 — [mine] Set up personal change-tracking system
- **Type:** Docs / Config (all new files, no original code touched)
- **Files:** `MY-CHANGES.md` (new), `docs/BASELINE.md` (new), `docs/baseline-files.txt` (new), `scripts/my-diff.sh` (new), `.gitignore` (new — repo had none)
- **What & why:** Scanned the forked repo and recorded the inherited baseline (`ce9a474`, 107 files) so every future adjustment by me can be distinguished from the original author's work. Added a helper script to diff against the baseline at any time. Added a standard Next.js `.gitignore` so experiment artifacts (`node_modules`, `.next`, `.env.local`, local SQLite data) don't pollute the history.
- **Status:** ✅ Kept
- **Original code affected:** none

---

## 🧪 Experiments in progress

| Experiment | Started | Where | Status / notes |
|---|---|---|---|
| _(none yet)_ | | | |

## ↩️ Reverted / abandoned

| Change | Date reverted | Why |
|---|---|---|
| _(none yet)_ | | |
