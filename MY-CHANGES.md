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

### 2026-11-09 — [mine] Phase 2 fixes: annual validation, Storage attachments, AI persistence
- **Type:** DB migration (live) + code. Owner confirmed Phase 1 done (verified: `AI_GATEWAY_API_KEY` present in Vercel prod/preview/dev; Gmail SMTP configured in Supabase; custom reset template applied) and authorized Phase 2 including merging the PR.
- **DB (Supabase WBLRMS):** migration `annual_validation_entries_and_followup_year` — new table `annual_validation_entries` (+ unique (project_id, year), 4 RLS policies), new column `inspections.annual_follow_up_year`. SQL copy: `supabase/migrations/20261109_annual_validation.sql`. No existing data touched.
- **Files:** `src/lib/supabase-data.ts` (annual follow-up generation `ensureAnnualFollowUps`, `saveAnnualValidation`, Storage upload/signed-URL attachments for projects + inspections, `saveAiRun`/`getLatestAiPredictions`), `src/app/api/local-road/route.ts` (annual validation now saved instead of 400), `src/app/api/inspections/route.ts` + `local-road` GET (pass admin client for generation), `src/app/api/ai-priority/route.ts` (POST persists run; new GET latest run), `src/app/App.tsx` (loads latest saved AI run; `storagePath` on ProjectAttachment), `LocalRoadForm.tsx`/`LocalRoadList.tsx` (type only), `docs/SUPABASE-MIGRATION.md` (limitations updated).
- **Verified:** `tsc --noEmit` ✅, `npm run build` ✅, local server: `/api/health` 200, unauthenticated `/api/local-road` `/api/inspections` `/api/ai-priority` → 401 ✅ (full login test still to be done by owner on live site).
- **Status:** ✅ DONE — PR #2 merged 2026-11-09 (merge commit `427be76`, owner-authorized); Vercel production deployment `dpl_AECUvbDxkw1xAhPfoeFfydijtaBB` READY/PROMOTED on mabini-meo.vercel.app with `AI_GATEWAY_API_KEY` active
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
  1. **AI check:** The app *does* include AI features — `src/lib/ai.ts` + `AIPredictionModule` call **Vercel AI Gateway** (`meta/llama-4-scout`) for road maintenance prioritization, but `AI_GATEWAY_API_KEY` is **not set** in the repo or in Vercel (verified via `list_env_vars` — only the 4 Supabase/site vars exist), so "Generate AI Priorities" currently fails with 503. Noted for later; the owner will add the key in Vercel. Also noted: AI results are stored only in browser localStorage, never in the DB.
  2. **Demo-data prep:** Did a read-only inventory of WBLRMS (roads 10, projects 10, inspections 17, items 0, maintenance 0, activity logs 62, AI 1 run/10 results). Prepared (but did **NOT** run) a wipe+seed plan: on the owner's signal, back up current rows, delete all transactional/test data **except the 4 accounts** (and keep barangays/categories/contractors/role access), then seed 10 synthetic-but-realistic roads/projects with inspections (+126 auto-generated items), 10 maintenance records, 8 progress updates, and 10 AI priority results.
- **Status:** ⏸️ Prepared — **waiting for the owner's go signal** before any delete/insert is executed
- **Original code affected:** none

### 2026-11-09 — [mine] Opened pull request #1 for the Supabase migration
- **Type:** Docs (this entry only)
- **Files:** `MY-CHANGES.md` (this entry)
- **What & why:** Pushed branch `arena/7f3b570f-mabini-meo` and opened **PR #1** → https://github.com/mendozagabii/Mabini-MEO/pull/1 ("[mine] Migrate SQLite to Supabase (data + Auth) + change tracking", 30 files, +2219/−743 vs `main`). Waiting for the owner's review/smoke test on the Vercel preview before merging.
- **Status:** 🧪 Open — not yet merged
- **Original code affected:** none (this entry)


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
