<!-- @mine — Supabase inspection by me on 2026-11-09. Read-only; nothing in Supabase was changed. -->

# 🗄️ Supabase Check — 2026-11-09

## Which project is it?
Account has 3 projects. The one prepared for this system is clearly:

| Project | Ref | Region | Status |
|---|---|---|---|
| **WBLRMS** | `jowcyoziuqzoezxboffx` | ap-south-1 (Mumbai) | ✅ ACTIVE_HEALTHY, all services healthy |
| `mendozagabii's Project` | `uadqkfndrdrabripqazz` | ap-northeast-2 | ⚠️ INACTIVE (paused — DB not queryable) |
| `ordering-system` | `vjmlyeejgpxdskapsyiw` | ap-south-1 | ⚠️ INACTIVE (paused — DB not queryable) |

Project URL: `https://jowcyoziuqzoezxboffx.supabase.co` · Postgres 17

## ✅ What's inside WBLRMS (pretty well designed)
- **17 normalized tables** (vs the app's current 7 SQLite JSON-blob tables):
  `profiles, roads, projects, project_categories, barangays, contractors,
  inspections, inspection_items, maintenance_records, project_progress_updates,
  attachments, activity_logs, login_attempts, role_module_access,
  system_settings, ai_analysis_runs, ai_priority_results` + 4 reporting views
  (`v_project_overview`, `v_condition_summary`, `v_monthly_maintenance_cost`, `v_ai_priority_inputs`).
- **13 enums** (`user_role`, `road_condition`, `project_status`, `maintenance_status`,
  `validation_status`, `condition_rating`, …), proper PK/FK/UNIQUE constraints
  (54 total, sensibly `CASCADE` / `SET NULL` / `RESTRICT`).
- **RLS enabled on all 17 tables**, 51 policies, **none** with `qual = true` —
  role-checked via helper functions (`has_role()`, `current_user_role()`, `is_active_user()`).
- **22 DB functions**: `handle_new_user`, `log_activity`, `register_failed_login`,
  `is_login_locked`, `unlock_account`, `verify_master_code`, `set_master_code`,
  `sync_road_from_inspection`, `sync_project_progress`, triggers, etc.
- Auth: **4 auth users ↔ 4 profiles** (admin/encoder/inspector/validator). Private storage
  bucket `wblrms-files`. Seed data: 34 barangays, 5 categories, 4 contractors,
  10 roads, 10 projects, 17 inspections, 10 AI priority results, 61 activity logs, 14 role-module rows.

## ⚠️ Issues / gaps found

1. **🔴 Not connected to the app at all.** The repo has **zero** Supabase references:
   no `@supabase/supabase-js` dependency, no `.env` files, no client code. The app still
   runs 100% on local SQLite (`src/lib/local-database.ts`). Using this DB = a data-layer
   migration, not a config flip.
2. **🟠 Schema is NOT drop-in compatible with the current app.** It's a normalized redesign
   (`roads` ≠ `projects`, ratings split into `inspection_items`, money as `numeric`, dates
   as `date`). Value mismatches vs the app, e.g.:
   - `maintenance_status` = `scheduled/in_progress/completed` — the app also uses **Deferred**.
   - `validation_status` = `pending/approved/rejected` — the app uses `Validated` /
     `Return for Revision` / `Pending Validation`.
   - `condition_rating` = `good/fair/poor/bad/n-a` vs app numeric 0–10 ratings.
   → The API layer (`src/app/api/*` + `local-database.ts`) must be rewritten/mapped.
3. **🟠 Seed data is incomplete:** `maintenance_records` 0 rows, `inspection_items` 0 rows
   (all 17 inspections have no per-component ratings), `project_progress_updates` 0,
   `attachments` 0, `system_settings` 0 (so master-code settings may be unset),
   `login_attempts` 0.
4. **🟡 Data mistake in `profiles`:** the validator's `username` is
   `Validator@gmail.com` (an email, capitalized) instead of `validator` — the other 3 are correct.
5. **🟡 `profiles` has redundant name columns:** both `name` and `full_name` are `NOT NULL`
   and currently hold identical values — inserts must always set both.
6. **🟡 Duplicate policy sets:** most tables carry two generations of policies
   (e.g. `roads_select` + "Active users read roads", `profiles_select` +
   "Read own profile or admin profiles"). Permissive policies OR together, so the
   *weakest* wins — `profiles_select` (any active user reads **all** profiles) silently
   overrides the "own profile or admin" intention. No `true` policies, so it's not wide
   open, but it should be cleaned up before relying on role privacy.
7. **🟡 Auth config:** public **sign-up is enabled** (`disable_signup = false`), Site URL is
   `http://localhost:3000`, redirect allow-list is empty, password min length 6,
   leaked-password (HIBP) check off. Self-registered users get no profile ⇒
   `current_user_role()` is null ⇒ RLS blocks data, but signup should still be closed
   for an internal office system.
8. **🟡 No migration history** (`list_migrations` empty) and no schema copy in this repo —
   the DB was built in the Supabase SQL editor and can't be reproduced/reset from code.
   Recommend exporting it into `supabase/migrations/` in this repo.
9. ℹ️ Region is Mumbai (`ap-south-1`) — works fine, Singapore/Tokyo would be slightly
   closer to PH users, but not worth recreating the project over.

## Verdict
The database itself is **well-built and genuinely ready as a target** — much better
than the app's SQLite JSON blobs. But today it is **completely disconnected** from
this codebase, and its enums/shapes need mapping in a rewritten data layer.
Next step (when approved): plan the SQLite→Supabase migration — likely
`@supabase/supabase-js` + Supabase Auth sessions, which would also fix audit findings
#1/#2/#6 in `docs/AUDIT-2026-11-09.md`.
