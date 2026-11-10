<!-- @mine — SQLite -> Supabase migration, done 2026-11-09. Login page design unchanged. -->

# 🔀 Supabase Migration — 2026-11-09

**Decision (by owner):** Full migration — Supabase data + Supabase Auth, keep the
existing login page design, use the data already seeded in Supabase (SQLite data abandoned).

## Target
- Project **WBLRMS** `jowcyoziuqzoezxboffx` — `https://jowcyoziuqzoezxboffx.supabase.co`
- Keys in `.env.local` (gitignored): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable), `SUPABASE_SERVICE_ROLE_KEY` (server-only).
  Template: `.env.example`.

## How it works now
```
Browser ──▶ Next API routes (same URLs/shapes as before)
              │  httpOnly cookies: wblrms-access-token / wblrms-refresh-token
              ├─ user-scoped Supabase client (user JWT → RLS applies) for table data
              └─ service-role client (server-only) for admin tasks + bookkeeping RPCs
Postgres: RLS policies + triggers (activity log, road-condition sync, updated_at)
```
- **Login** (`POST /api/auth/login`): DB RPC `resolve_login_email` (username→email,
  case-insensitive) → lockout check `is_login_locked` → Supabase Auth
  `signInWithPassword` → failures recorded by `register_failed_login` (3 tries / 15 min),
  success by `register_successful_login` → session cookies set. Same response shape
  the LoginPage already used, so **the UI is untouched**.
- **Session restore**: `GET /api/auth/me` (new) — `App.tsx` calls it on load; login
  now survives refresh, refresh-token rotation supported.
- **Logout** (`POST /api/auth/logout`, new) clears cookies; called by `App.tsx`.
- **Every data route now requires a session** (401 anonymous — verified locally);
  user management additionally requires `head_engineer`.
- **Unlock**: needs a Head Engineer session **or** a valid master code
  (`verify_master_code`, bcrypt in `system_settings`) — the old anonymous-unlock
  bypass is closed. Changing the code (`PATCH /api/auth/unlock`) requires a Head
  Engineer session and goes through `set_master_code`.
- **Password reset**: Supabase Auth email link → `/reset-password` (page now also
  reads the recovery token from the URL hash / PKCE `code`).

## Table correlation (app ↔ Supabase) — via `src/lib/supabase-data.ts`
| App concept | Supabase |
|---|---|
| "LocalRoad" record (id) | `projects` (id) joined `roads`, `barangays`, `project_categories`, `contractors` — road fields and project fields are split/merged |
| Inspection (`localRoadId`) | `inspections.project_id` + `inspection_items` (component ratings) |
| Maintenance (`localRoadId`) | `maintenance_records.project_id` |
| User | `auth.users` + `profiles` (create goes through Admin API; DB trigger makes the profile) |
| Activity log | `activity_logs` (explicit inserts + automatic DB triggers) |
| Archived X | `archived_at` on projects/roads/profiles; **added to inspections & maintenance_records by migration `app_compat_archive_and_deferred`** |

Value mappings: condition `Good/Fair/Poor/Bad` ↔ `good/fair/poor/bad`;
validation `Validated` ↔ `approved`, `Return for Revision` ↔ `rejected`;
maintenance `Scheduled/In Progress/Completed/Deferred` ↔ `scheduled/in_progress/completed/deferred`
(`deferred` enum value added by the same migration); inspection types ↔
`type_acceptance/routine/follow_up/initial`; roles ↔ `head_engineer/encoder/inspector/validator`.

## DB changes I made in Supabase (documented, [mine])
1. Migration `app_compat_archive_and_deferred`: `archived_at` on `inspections` +
   `maintenance_records`; `deferred` added to `maintenance_status` enum.
2. Data fix: validator's `profiles.username` `Validator@gmail.com` → `validator`
   (username login for that account was broken).
3. Auth config: **public sign-up disabled**, redirect allow-list
   `http://localhost:3000/**`. ⚠️ Add your production domain there before deploying.

## ⚠️ Known limitations / not yet migrated
- **Not live-tested end-to-end from this sandbox**: the sandbox cannot reach
  `*.supabase.co` directly, so real login/CRUD must be smoke-tested by running
  `npm run dev` on a normal network (steps below). Verified locally instead:
  `tsc` ✅, production build ✅ (all API routes now `ƒ` dynamic), anonymous calls
  return 401 ✅, DB RPCs verified via SQL (`resolve_login_email`, `verify_master_code`,
  profile↔auth id match ✅). Seeded account passwords are whatever was set when the
  Auth users were created (not visible to me) — reset via Supabase Dashboard if unknown.
- ~~Annual follow-up auto-inspections + annual validation entries~~ — **done
  2026-11-09 (Phase 2.1)**: migration `annual_validation_entries_and_followup_year`
  added `annual_validation_entries` (+ RLS) and `inspections.annual_follow_up_year`;
  `ensureAnnualFollowUps()` in `supabase-data.ts` regenerates due entries/follow-ups
  on list reads, and annual-validation submissions are stored (no more 400).
- ~~App attachments not uploaded to Storage~~ — **done 2026-11-09 (Phase 2.2)**:
  project/inspection files are decoded server-side, uploaded to the `wblrms-files`
  bucket, recorded in `attachments`, and returned as 1-hour signed URLs.
  Limitation: removing an already-stored file in the form does not delete it yet.
- ~~AI recommendations not persisted~~ — **done 2026-11-09 (Phase 2.3)**: POST
  `/api/ai-priority` saves the run to `ai_analysis_runs`/`ai_priority_results`
  (best-effort); GET returns the latest saved run, which `App.tsx` prefers over
  the localStorage fallback.
- `role_module_access` table is not yet consumed — the UI still uses its built-in
  role→module map in `App.tsx`.
- RLS duplicate-policy cleanup (see `SUPABASE-CHECK-2026-11-09.md` #6) not done.
- No master code is set yet (`verify_master_code` = false for everything):
  a Head Engineer should set one via User Management → change master password.
- Old SQLite files remain in the repo, unused, as reference:
  `src/lib/local-database.ts`, `demo-data.ts`, `lockout.ts`, `master-password.ts`,
  `database-schema.sql`, and the `better-sqlite3` dependency.

## Deployment env (Vercel) — done 2026-11-09
Vercel project `mabini-meo` now has, for **Production + Preview + Development**:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (sensitive), `NEXT_PUBLIC_SITE_URL=https://mabini-meo.vercel.app`.
Supabase Auth Site URL = `https://mabini-meo.vercel.app`; redirect allow-list includes
localhost + the Vercel domain. ⚠️ These only take effect on the next deployment, and
the migrated code reaches Production only when this branch is merged to `main`.

## Smoke-test checklist (on a normal network)
```bash
cp .env.example .env.local   # fill keys (already done locally on this machine)
npm run dev
# 1. Log in with a seeded account (e.g. admin) — lands on dashboard with Supabase data
# 2. Create/edit/archive a project; add an inspection; add maintenance
# 3. As non-admin, confirm User Management is inaccessible; as admin, create a user and log in as them
# 4. Wrong password x3 → locked 15 min; lock banner appears (lock-status now live)
# 5. Forgot password → email link → /reset-password → set new password → log in
# 6. Refresh the page while logged in → session persists; Logout → back to login
```
