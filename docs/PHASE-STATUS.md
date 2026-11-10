<!-- @mine — Phase verification (2026-11-10). Every row below was checked against the live
     Vercel project, the live Supabase project WBLRMS, or git — not against memory. -->

# ✅ PHASE STATUS — verified 2026-11-10

Checked against: Vercel API (project `mabini-meo`), Supabase Management API (project
**WBLRMS** `jowcyoziuqzoezxboffx`), and this git repo.

| Phase | Verdict | Evidence |
|---|---|---|
| 1 — Config (dashboards) | ✅ **DONE** | §1 |
| 2 — System fixes | ✅ **DONE** | §2 |
| 3 — Database cleanup | ✅ **EXECUTED today** | §3 |
| 4 — Testing (live site) | ⏳ **Yours to run** — kit ready | [`PHASE-4-TEST-PLAN.md`](PHASE-4-TEST-PLAN.md) |
| 5 — Post-demo backlog | ⏸️ after the demo (5.5 already done) | §5 |

---

## 1. Phase 1 — config ✅

| # | Task | Verified as | Evidence |
|---|---|---|---|
| 1.1 | `AI_GATEWAY_API_KEY` in Vercel | ✅ done | 3 separate **sensitive** entries on project `mabini-meo`, targets `production`, `preview`, `development` (created 2026-11-10). Value not read, not printed. |
| 1.2 | Custom SMTP | ✅ done | Supabase Auth → SMTP: `smtp.gmail.com:587`, user `ortegajeicelmae@gmail.com`, password stored, sender name **"Office of the Municipal Engineer"**, admin e-mail set. |
| 1.3 | Branded password-reset template | ✅ done | `mailer_templates_custom_contents.RECOVERY = true`; subject **"Reset your Mabini MEO password"**; the HTML is the Mabini MEO / WBLRMS block from [`EMAIL-TEMPLATES.md`](EMAIL-TEMPLATES.md). Matching header/footer and 1-hour expiry note. |

Supporting auth settings, also verified: `site_url = https://mabini-meo.vercel.app`,
redirect allow-list `http://localhost:3000/**, https://mabini-meo.vercel.app/**`,
`disable_signup = true`, `mailer_autoconfirm = false`, refresh-token rotation on.

> ⚠️ One thing to know, not a blocker: the SMTP mailbox is a **personal Gmail address**
> (`ortegajeicelmae@…`), presumably the original author's. It works for the demo
> (Gmail app-password ≈ 500 mails/day, far above Supabase's built-in ~2/hour), but if this
> system goes live, point SMTP at a mailbox the MEO controls. Swapping it is a 4-field
> change in the dashboard — no code, no redeploy.

## 2. Phase 2 — system fixes ✅

| # | Task | Verified as | Evidence |
|---|---|---|---|
| 2.1 | Annual validation | ✅ done | Table `annual_validation_entries` exists (9 columns, **4 RLS policies**); column `inspections.annual_follow_up_year` exists; the old `400` rejection is gone — `POST /api/local-road` maps `annualValidation` through `saveAnnualValidation()`; `ensureAnnualFollowUps()` backfills rows on read. |
| 2.2 | Attachments | ✅ done | Storage bucket **`wblrms-files`** exists; table `attachments` (project/inspection/maintenance FK + `storage_path`); `uploadAttachment()` / signed-URL read path in `src/lib/supabase-data.ts`; `ProjectAttachment.storagePath` typed in `LocalRoadForm`/`LocalRoadList`. |
| 2.3 | AI persistence | ✅ done | Tables `ai_analysis_runs` (1 row) + `ai_priority_results` (10 rows) exist; `POST /api/ai-priority` calls `saveAiRun()`, `GET` returns `getLatestAiPredictions()`, and `App.tsx` loads the saved run on start (localStorage kept only as offline fallback). |
| 2.4 | Redeploy + verify live | ✅ done | Latest **production** deployment on Vercel is `READY`, commit **`427be76`** = "Merge pull request #2 … Phase 2: annual validation, Storage attachments, AI persistence", branch `main`, alias `mabini-meo.vercel.app`. |
| 2.5 | Logged / PR / merged | ✅ done | PR [#1](https://github.com/mendozagabii/Mabini-MEO/pull/1) → `8fe2830`, PR [#2](https://github.com/mendozagabii/Mabini-MEO/pull/2) → `427be76`; both in `MY-CHANGES.md` with `[mine]` commits. |

**Only open item from Phase 2's own definition of done:** the end-to-end login/CRUD smoke
test on a normal network — that *is* Phase 4, and it needs you (the sandbox cannot reach
`*.supabase.co`).

## 3. Phase 3 — database cleanup ✅ executed today

### 3.1 Backup (before anything was deleted)
11 snapshot tables, `demo_backup_2026_*`, one per table touched — with **RLS on and no
policies**, and `anon`/`authenticated` revoked, so the backups are readable only from the
SQL console:

| Backup table | Rows saved |
|---|---:|
| `demo_backup_2026_roads` | 10 |
| `demo_backup_2026_projects` | 10 |
| `demo_backup_2026_inspections` | 17 |
| `demo_backup_2026_inspection_items` | 0 |
| `demo_backup_2026_maintenance_records` | 0 |
| `demo_backup_2026_progress_updates` | 0 |
| `demo_backup_2026_ai_runs` | 1 |
| `demo_backup_2026_ai_results` | 10 |
| `demo_backup_2026_attachments` | 0 |
| `demo_backup_2026_activity_logs` | 64 |
| `demo_backup_2026_login_attempts` | 0 |

`CREATE TABLE IF NOT EXISTS` → a re-run never overwrites the original snapshot.

### 3.2 Wipe + 3.3 Seed — one atomic transaction
FK-safe deletes (`ai_priority_results` → … → `roads`, plus `activity_logs`,
`login_attempts`), then [`../supabase/demo/seed-demo-data.sql`](../supabase/demo/seed-demo-data.sql).

**First attempt failed and rolled back cleanly** — `inspection_items.score` is a
*generated* column, so the insert was rejected by Postgres and nothing was deleted
(verified: roads 10 / projects 10 / inspections 17 / activity_logs 64 before and after).
The script now omits that column and is the version committed in this repo.

### 3.4 Verification after seeding

| Table | Before | After | Expected |
|---|---:|---:|---|
| `roads` | 10 | **10** | 10 ✅ |
| `projects` | 10 | **10** | 10 ✅ |
| `inspections` | 17 | **18** | 18 ✅ |
| `inspection_items` | 0 | **126** | 126 (7 per inspection) ✅ |
| `maintenance_records` | 0 | **10** | 10 ✅ |
| `project_progress_updates` | 0 | **8** | 8 ✅ |
| `ai_analysis_runs` | 1 | **1** | 1 ✅ |
| `ai_priority_results` | 10 | **10** | 10 ✅ |
| `profiles` | 4 | **4** | untouched ✅ |
| `barangays` / `project_categories` / `contractors` / `role_module_access` | 34 / 5 / 4 / 14 | **34 / 5 / 4 / 14** | untouched ✅ |

Integrity checks — all passed:

- every inspection has **exactly 7** component items (min 7 / max 7)
- **0** orphan projects, **0** orphan inspections, **0** projects without a contractor
- every non-pending inspection has `validated_by` set (0 gaps)
- spread for the demo: projects `completed=2, delayed=1, on_track=3, planned=2, turned_over=2`;
  roads `bad=1, fair=2, good=3, poor=4`; maintenance `completed=4, deferred=1,
  in_progress=2, scheduled=3`; inspections `approved=14, pending=3, rejected=1`;
  AI `high=5, medium=2, low=3`
- `activity_logs` = **252** — emptied by the wipe, then re-filled by the audit triggers as
  the seed inserted rows (it is the seed's own audit trail, all entries real)
- `annual_validation_entries` = 0 **on purpose** — the app backfills it on first read, so
  the annual-validation feature demos live

### Rolling back Phase 3 (if you ever want the old sample data back)

```sql
BEGIN;
DELETE FROM ai_priority_results; DELETE FROM ai_analysis_runs;
DELETE FROM inspection_items;    DELETE FROM inspections;
DELETE FROM maintenance_records; DELETE FROM project_progress_updates;
DELETE FROM projects;            DELETE FROM roads;
INSERT INTO roads            SELECT * FROM demo_backup_2026_roads;
INSERT INTO projects         SELECT * FROM demo_backup_2026_projects;
INSERT INTO inspections      SELECT * FROM demo_backup_2026_inspections;
INSERT INTO inspection_items SELECT * FROM demo_backup_2026_inspection_items;
INSERT INTO maintenance_records SELECT * FROM demo_backup_2026_maintenance_records;
INSERT INTO project_progress_updates SELECT * FROM demo_backup_2026_progress_updates;
INSERT INTO ai_analysis_runs SELECT * FROM demo_backup_2026_ai_runs;
INSERT INTO ai_priority_results SELECT * FROM demo_backup_2026_ai_results;
COMMIT;
```

Drop the backups only after the demo is signed off (Phase 5.1).

## 4. Phase 4 — live testing → [`PHASE-4-TEST-PLAN.md`](PHASE-4-TEST-PLAN.md)

## 5. Phase 5 — status

| # | Task | Status |
|---|---|---|
| 5.1 | Drop `demo_backup_2026_*` | ⏸️ **after** demo sign-off (see §3 above for the restore SQL) |
| 5.2 | Wire `project_progress_updates` + `role_module_access` | ⏳ not started — now has 8 seeded progress rows waiting to be surfaced in the UI |
| 5.3 | Duplicate RLS policies + unused `nodemailer` | ⏳ not started (policy audit query ready to run; `nodemailer` is now dead weight in `package.json`) |
| 5.4 | Deep review of big frontend modules | ⏳ not started |
| 5.5 | Retro-log the PR #1 merge | ✅ **done** — `MY-CHANGES.md` entry "Phase 2 merged into main" + PR #1 marked merged |
