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
| Repo today | counts live in [`docs/PROVENANCE.md`](docs/PROVENANCE.md) → *At a glance* (generated from git; never hand-edited) |
| Original files removed | none — the original author's tree is intact |

Every file I ever touched — added or modified, with `+N/−M` line counts and the `@mine`
note — is listed file-by-file in [`docs/PROVENANCE.md`](docs/PROVENANCE.md) (regenerate
with `./scripts/gen-provenance.sh`), and can be re-derived any time with
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

### 2026-11-10 — [mine] Fixed password reset: every link reported "invalid or expired"
- **Type:** Modified (API route rewrite + reset page)
- **Files:** `src/app/api/auth/reset-password/route.ts`, `src/app/reset-password/page.tsx`, `MY-CHANGES.md` (this entry)
- **What & why:** A freshly sent reset link always failed with *"This password reset link is invalid or has expired."* Root cause is in the library, not the link: the route built `createUserClient(accessToken)` (anon key + `global.headers.Authorization`) and called `auth.updateUser()`, but gotrue-js 2.119 resolves that call through `_useSession()` and throws `AuthSessionMissingError` whenever no session is stored — `persistSession: false` guarantees that. The token was therefore never used, so the age of the link was irrelevant. Fix: resolve the recovery JWT with `anon.auth.getUser(accessToken)` (it accepts an explicit JWT), then set the password with the service-role client via `admin.auth.admin.updateUserById(id, { password })`; the PKCE `?code=` path does the same after `exchangeCodeForSession`. Errors are no longer collapsed into one message: a bad/consumed token is 401, a genuine failure is 500. The page now also surfaces GoTrue's own `#error_code=otp_expired&error_description=…` hash (previously swallowed, leaving a dead form), explains a link with no token at all, and the minimum password is 8 characters in both the input and the route (was 6, inconsistent with the rest of the app).
- **Verified:** `npx tsc --noEmit` ✅ · `npm run build` ✅ · default `flowType` confirmed `implicit` and `_updateUser` session requirement read from `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js`
- **Status:** ✅ Kept — needs a merge + redeploy
- **Original code affected:** both files are already `@mine` (migrated), not baseline

### 2026-11-10 — [mine] Fixed account editing: e-mail and password now reach the Supabase Auth identity
- **Type:** Modified (API route `PATCH` + user-management form)
- **Files:** `src/app/api/auth/status/route.ts`, `src/app/components/UserManagementModule.tsx`, `MY-CHANGES.md` (this entry)
- **What & why:** Editing an account from System Management silently half-applied the change, in two ways. (1) **E-mail:** `PATCH` wrote `profiles.email` only, never `auth.users.email` — and since login resolves `username → profiles.email → signInWithPassword()`, the very next login used an address that no auth user had, so **every password failed** and the person got locked out; password reset to the new address also failed silently. (2) **Password:** the edit branch never wrote the password at all, so a password typed by the Head Engineer was accepted by the UI and discarded. Live proof: `ortegajeicel` had `profiles.email = ryanbarraca1905@gmail.com` vs `auth.users.email = ortegajeicel@gmail.com` (MISMATCH) after an edit at 04:46 UTC. Fix: the edit branch now reads the current profile, and when the e-mail changed or a password was supplied it calls `auth.admin.auth.admin.updateUserById(id, { email, email_confirm: true, password })` **before** touching `profiles` — so a failure (e-mail already taken, too-short password) aborts with a real message and can never leave the two sides out of sync. Minimum password length 8, matching the rest of the app; blank password keeps the current one. The form now says so, and the activity log records `email old → new` (never the password).
- **Verified:** `npx tsc --noEmit` ✅ · `npm run build` ✅
- **Status:** ✅ Kept — needs a merge + redeploy; the affected account still has to be repaired (see below)
- **Original code affected:** `src/app/api/auth/status/route.ts` and `UserManagementModule.tsx` are my own migrated files (already carried `@mine` markers)

### 2026-11-10 — [mine] Web icon: the Mabini seal as the browser-tab icon
- **Type:** Added (assets only — no existing file edited, no UI/design change)
- **Files:** `src/app/icon.png` (new, 256×256), `src/app/apple-icon.png` (new, 180×180), `docs/MASTER-CODE-GUIDE.md`, `MY-CHANGES.md` (this entry)
- **What & why:** The app had **no favicon at all** — no `public/` folder, no `src/app/icon.*`, and `layout.tsx` declares only `title`/`description` — so the tab showed the browser/Vercel default. Both files are generated from `src/imports/logo.png` (300×300 RGBA) with a Lanczos3 downscale and a 128-colour palette (133 KB → 9.5 KB, alpha preserved, no visible banding) so the seal stays crisp and costs almost nothing. They rely on the Next.js App Router convention, so `/icon.png` and `/apple-icon.png` are served and linked automatically — `layout.tsx` is untouched and `src/imports/logo.png` (the in-app logo in LoginPage/Sidebar) is unchanged.
- **Verified:** `npm run build` ✅ and both routes appear in the build output (`○ /icon.png`, `○ /apple-icon.png`).
- **Status:** ✅ Kept — live after the next merge + redeploy
- **Original code affected:** none

### 2026-11-10 — [mine] Master code bootstrapped in Supabase at the owner's request
- **Type:** DB state change (no code change)
- **Files:** `docs/MASTER-CODE-GUIDE.md` (status line + storage section), `MY-CHANGES.md` (this entry)
- **DB (live):** `select public.set_master_code('<the owner's chosen code>', null, null)` → the first row in `system_settings` now exists (`key='master_unlock_code_hash'`, bcrypt `$2a$06$…`, 60 chars, `updated_by = null` because a SQL bootstrap has no `auth.uid()`, `updated_at` 2026-11-10 04:31 UTC). **The value itself is deliberately not written in this repo or this log.**
- **Verified:** `verify_master_code('…')` → `true` for the chosen code and `false` for a wrong one, so the login-screen unlock path is now live end-to-end.
- **Note:** because the code was shared in writing, treat it as provisional — rotate it from System Management → Master Security Key before the system goes public. Rotation keeps the same row (upsert), so no schema change is involved.
- **Status:** ✅ Kept
- **Original code affected:** none

### 2026-11-10 — [mine] Master code: walkthrough + setup guide
- **Type:** Docs
- **Files:** `docs/MASTER-CODE-GUIDE.md` (new), `MY-CHANGES.md` (this entry)
- **What & why:** Wrote the guide the owner asked for: what the master code is (an unlock token, not a password), how the lockout it rescues works (3 fails → 15 min × lockout_count), where the bcrypt hash lives (`system_settings.master_unlock_code_hash`), the two ways to unlock, the setup checklist (merge → set the first code in System Management → verify → rotate), an end-to-end test script (lock `encoder`, unlock with the code), a troubleshooting table keyed to the actual response codes, and the break-glass SQL for a forgotten code. Also records four known limitations, the main one being that `POST /api/auth/unlock` has no rate limit yet.
- **Status:** ✅ Kept
- **Original code affected:** none

### 2026-11-10 — [mine] Fixed duplicate annual follow-up inspections (4 duplicated pairs live)
- **Type:** DB migration (live) + no app logic change needed
- **Files:** `supabase/migrations/20261110_annual_followup_unique.sql` (new), `docs/PHASE-STATUS.md`, `MY-CHANGES.md` (this entry)
- **DB (live):** de-duplicated existing placeholder follow-ups (keeping the oldest per project/year; rows somebody actually inspected are never touched) and added partial unique index `inspections_annual_follow_up_uq` on `(project_id, annual_follow_up_year) WHERE inspection_type='follow_up' AND annual_follow_up_year IS NOT NULL`. Cause was a check-then-insert race between the concurrent `/api/local-road` and `/api/inspections` loads; the losing insert now raises a unique violation that `ensureAnnualFollowUps()` already swallows, so no code change was required.
- **Verified:** follow-ups went 9 → 5 (the 4 duplicated pairs collapsed), 0 duplicates left, index present; the 5 remaining are exactly the 5 years actually due (Solo 2026 is correctly absent — it isn't due until 2026-12-18).
- **Status:** ✅ Kept
- **Original code affected:** none

### 2026-11-10 — [mine] Fixed the master code endpoint (it could never set a code) + first-run setup in the UI
- **Type:** Modified (API route `PATCH`/`POST`/new `GET`) + Modified (user management UI) + DB migration (live)
- **Files:** `src/app/api/auth/unlock/route.ts` (rewritten), `src/app/components/UserManagementModule.tsx` (first-run banner, optional current code, 8-char minimum, `GET` status), `supabase/migrations/20261110_master_code_service_role.sql` (new), `MY-CHANGES.md` (this entry)
- **What & why:** The owner could not work out the master code because it did not exist and could not be created: `PATCH /api/auth/unlock` called `set_master_code` with the user-scoped client, while EXECUTE on that RPC is granted to `service_role` only, so every attempt died with `permission denied for function set_master_code`. The route now calls it with the service-role client (it already enforces `head_engineer` itself) and passes `p_updated_by` so `updated_by` is still recorded. `POST` now distinguishes "no code configured" (409, `masterCodeConfigured:false`) from "wrong code" (401) instead of one anonymous 401; the new `GET` reports `{ hasMasterCode, updatedAt, updatedBy }`. UI: the amber first-run banner, current code optional on first set, minimum corrected from "Min 6" to 8 to match the RPC, and set/change actions are written to `activity_logs`.
- **DB (live):** dropped the 2-arg `set_master_code` and replaced it with `(p_new, p_current, p_updated_by uuid default null)` (defaults keep 2-arg callers working, no ambiguous overload), re-revoked from `anon`/`authenticated`, granted to `service_role`.
- **Verified:** `tsc --noEmit` ✅; single RPC signature with `authenticated=f` / `service_role=t`; master code still unset (0 rows) so the owner sets the first one themselves — no secret was created or stored by me.
- **Status:** ✅ Kept — needs a merge + redeploy to reach `mabini-meo.vercel.app`
- **Original code affected:** none of the baseline files; this is my own route/UI code

### 2026-11-10 — [mine] Phase 4 live test kit
- **Type:** Docs
- **Files:** `docs/PHASE-4-TEST-PLAN.md` (new), `docs/DEMO-DATA-PLAN.md` (header/status updated), `MY-CHANGES.md` (this entry)
- **What & why:** Wrote the checklist for the deployed site: which account to use for what (usernames `admin`/`encoder`/`inspector`/`validator`, their e-mails, and the role→module map read from `role_module_access`), the two ways to set the four passwords, then the flows to smoke-test with the exact seeded fixtures to expect — create/edit, inspection (7 components), validation approve/reject, **annual validation (no more 400)**, **attachments through `wblrms-files`**, maintenance statuses — plus the forgot-password and AI-priorities checks and what to capture if something fails. Also flipped the demo-data plan from "waiting for signal" to executed.
- **Status:** ✅ Kept
- **Original code affected:** none

### 2026-11-10 — [mine] Phase 3 executed: backup + wipe + seed of the 10 demo datasets
- **Type:** DB (live Supabase WBLRMS) + script hardening
- **Files:** `supabase/demo/seed-demo-data.sql` (hardened + notes synced with what ran), `docs/PHASE-STATUS.md` (results + restore SQL), `MY-CHANGES.md` (this entry)
- **DB (live):** created 11 snapshots `demo_backup_2026_*` (RLS enabled with no policies and `anon`/`authenticated` revoked, so backups are console-only), then wiped the transactional/test tables **except the 4 accounts and the reference data** (barangays, categories, contractors, role access), then seeded 10 roads/projects, 18 inspections with 126 items, 10 maintenance records, 8 progress updates, 1 AI run + 10 AI results — all inside one transaction. The first attempt was rejected by Postgres because `inspection_items.score` is a GENERATED column and rolled back with **zero** data loss (verified counts before/after); the script now omits it. Also switched the backups to `CREATE TABLE IF NOT EXISTS` (first snapshot wins, so a re-run can never overwrite the original) and simplified the UUID helper to `md5(...)::uuid`.
- **Verified:** roads 10 · projects 10 · inspections 18 · items 126 (7 per inspection) · maintenance 10 · progress 8 · ai runs 1 / results 10 · profiles 4 · barangays 34 · categories 5 · contractors 4 · role access 14 · activity_logs 252 (audit triggers logging the seed). Integrity: 0 orphan projects/inspections, 0 projects without contractor, every non-pending inspection has `validated_by`, all status/condition/risk buckets populated.
- **Status:** ✅ Kept — backups stay until the demo is signed off (Phase 5.1)
- **Original code affected:** none (the seed script is my own file)

### 2026-11-10 — [mine] Phase 1 + Phase 2 verified complete against the live dashboards
- **Type:** Docs (verification only — nothing changed in Vercel, Supabase or the code)
- **Files:** `docs/PHASE-STATUS.md` (new), `MY-CHANGES.md` (this entry)
- **What & why:** Owner asked to confirm Phases 1–2 before continuing, so I checked the live systems instead of the notes. **Phase 1:** project `mabini-meo` has `AI_GATEWAY_API_KEY` as three separate sensitive variables (production, preview, development); Supabase Auth has custom SMTP (`smtp.gmail.com:587`, sender "Office of the Municipal Engineer") and the branded recovery template with the subject "Reset your Mabini MEO password"; site URL + redirect allow-list correct, sign-up disabled. **Phase 2:** `annual_validation_entries` exists with 4 RLS policies, `inspections.annual_follow_up_year` exists, bucket `wblrms-files` and the `attachments` table exist, `ai_analysis_runs`/`ai_priority_results` exist and are used by the routes, and the production deployment is READY on commit `427be76` (the Phase 2 merge). One note recorded, not a blocker: the SMTP mailbox is a personal Gmail address and should become an MEO-controlled mailbox before go-live.
- **Status:** ✅ Kept
- **Original code affected:** none

### 2026-11-10 — [mine] Toolkit refinements: stable provenance regeneration + @mine markers on the two edited components
- **Type:** Modified
- **Files:** `docs/PROVENANCE.md` (modified), `scripts/gen-provenance.sh` (modified)
- **What & why:** Made docs/PROVENANCE.md byte-identical on every regeneration (it no longer embeds a commit hash of the commit that carries it), cleaned how the @mine note is read (comment syntax, continuation ellipsis, exceptions for package.json / this log), stopped the report's own row from reporting its own line count (which made every regeneration differ by one line), and added explicit @mine markers to the two inherited components that only gained a type field (LocalRoadForm/`LocalRoadList`).
- **Status:** ✅ Kept
- **Original code affected:** none

### 2026-11-10 — [mine] Change-tracking toolkit (provenance map, auto-entry, commit guard)
- **Type:** Added (tooling) / Docs + a small edit to this file's structure
- **Files:** `docs/PROVENANCE.md` (new, generated), `scripts/gen-provenance.sh` (new), `scripts/log-change.sh` (new), `scripts/check-changelog.sh` (new), `.githooks/pre-commit` (new), `scripts/setup-hooks.sh` (new), `scripts/my-diff.sh` (extended), `MY-CHANGES.md` (restructured: status block + workflow + `NEW-ENTRY-MARKER`)
- **What & why:** Turned the manual change log into a system that cannot silently go stale. `gen-provenance.sh` derives a file-by-file "inherited vs mine" report from git + the `@mine` markers (so `docs/PROVENANCE.md` always matches the code); `log-change.sh` writes the next entry from the working tree so logging costs one command; `check-changelog.sh` + the pre-commit hook block any commit that changes code without a log entry. Also refreshed the header: the earlier work is now merged into `main` via PR #1/#2, so the file describes the repo as it stands, not as a pending branch. Header counts were refreshed to the post-toolkit totals (131 / 89 / 24 / 18) at the end of the work, and the GitHub compare link now expands the baseline hash (it was printed literally at first).
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
