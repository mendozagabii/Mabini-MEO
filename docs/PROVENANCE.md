<!-- @mine — GENERATED FILE. Regenerate with: ./scripts/gen-provenance.sh (do not hand-edit). -->

# 🧾 PROVENANCE — what is inherited vs. what is mine

Generated from git on **2026-11-10** · baseline `ce9a474` · every row below is verifiable with git

> **Inherited** = present in the baseline commit `ce9a474` ("Add files via upload",
> Jeicel Mae A. Ortega) and **not** touched by me.
> **Mine** = added or modified by me (with AI assistance), now merged into `main`
> through PR [#1](https://github.com/mendozagabii/Mabini-MEO/pull/1) and
> PR [#2](https://github.com/mendozagabii/Mabini-MEO/pull/2).
>
> The per-entry narrative lives in [`../MY-CHANGES.md`](../MY-CHANGES.md); this page is
> the **file-level map** of the code as it sits in the repo right now.

## 📊 At a glance

| | Files | Meaning |
|---|---:|---|
| Total tracked now | **141** | everything in the repo |
| 🟦 Inherited, untouched | **88** | original author's work, byte-for-byte |
| 🟩 Added by me | **34** | files that did not exist at baseline |
| 🟨 Modified by me | **19** | original files I edited (still their file) |
| 🟥 Deleted by me | **0** | — |

**I deleted none of the original files** — the original author's tree is preserved.

### Three ways to verify any row yourself

```bash
./scripts/my-diff.sh                 # name-status of everything I touched
git diff --stat ce9a474 HEAD         # line counts, per file
git diff ce9a474 HEAD -- <file>      # the actual lines
grep -rn "@mine" src/                # markers inside the code I wrote/edited
```

**[Full diff on GitHub: baseline → main](https://github.com/mendozagabii/Mabini-MEO/compare/ce9a474...main)**

---

## 🟩 Added by me (34 files)

Files that are entirely mine — safe to treat as "new work", nothing inherited inside them.

#### API routes — `src/app/api/`

| File | Type | Δ lines | Note (from the `@mine` marker) |
|---|---|---|---|
| `src/app/api/auth/logout/route.ts` | added | +12 / -0 | New route for the Supabase session: clears the session cookies. |
| `src/app/api/auth/me/route.ts` | added | +22 / -0 | New route: who am I? Used by the app shell to restore the session … |

#### App shell — `src/app/`

| File | Type | Δ lines | Note (from the `@mine` marker) |
|---|---|---|---|
| `src/app/apple-icon.png` | added | binary | — |
| `src/app/icon.png` | added | binary | — |

#### Data layer & helpers — `src/lib/`

| File | Type | Δ lines | Note (from the `@mine` marker) |
|---|---|---|---|
| `src/lib/api.ts` | added | +37 / -0 | Shared helpers for API routes after the Supabase migration. |
| `src/lib/session-expiry.ts` | added | +51 / -0 | Client-side guard for a dead Supabase session. … |
| `src/lib/supabase-data.ts` | added | +862 / -0 | Translation layer: Supabase (normalized Postgres) <-> the record shapes … |
| `src/lib/supabase.ts` | added | +187 / -0 | Supabase connection layer (added during SQLite → Supabase migration). … |

#### Documentation — `docs/`

| File | Type | Δ lines | Note (from the `@mine` marker) |
|---|---|---|---|
| `docs/AUDIT-2026-11-09.md` | added | +72 / -0 | Audit by me on 2026-11-09, of the inherited baseline code. No original code was changed. |
| `docs/BASELINE.md` | added | +43 / -0 | Baseline snapshot taken 2026-11-09: the inherited repo (107 files) before any of my changes. |
| `docs/DEMO-DATA-PLAN.md` | added | +88 / -0 | EXECUTED 2026-11-10 (Phase 3), after the owner's go signal. |
| `docs/EMAIL-TEMPLATES.md` | added | +80 / -0 | Created 2026-11-09. Custom Supabase Auth email templates for Mabini MEO. |
| `docs/MASTER-CODE-GUIDE.md` | added | +146 / -0 | Written 2026-11-10 together with the fix for the master-code endpoint. |
| `docs/PHASE-4-TEST-PLAN.md` | added | +103 / -0 | Phase 4 live-smoke-test kit, written 2026-11-10 against the freshly seeded data. |
| `docs/PHASE-STATUS.md` | added | +143 / -0 | Phase verification (2026-11-10). Every row below was checked against the live |
| `docs/PROVENANCE.md` | added | (this file) | this generated report |
| `docs/SUPABASE-CHECK-2026-11-09.md` | added | +80 / -0 | Supabase inspection by me on 2026-11-09. Read-only; nothing in Supabase was changed. |
| `docs/SUPABASE-MIGRATION.md` | added | +111 / -0 | SQLite -> Supabase migration, done 2026-11-09. Login page design unchanged. |
| `docs/baseline-files.txt` | added | +107 / -0 | — |

#### Root config & assets

| File | Type | Δ lines | Note (from the `@mine` marker) |
|---|---|---|---|
| `.env.example` | added | +5 / -0 | Copy to .env.local and fill in (Supabase Dashboard → WBLRMS → Settings → API). … |
| `.gitignore` | added | +27 / -0 | Added by me (repo had no .gitignore at baseline). See MY-CHANGES.md. |
| `MY-CHANGES.md` | added | +340 / -0 | the change log itself — one entry per adjustment |

#### Supabase SQL — `supabase/`

| File | Type | Δ lines | Note (from the `@mine` marker) |
|---|---|---|---|
| `supabase/demo/seed-demo-data.sql` | added | +231 / -0 | EXECUTED 2026-11-10 (owner gave the go signal for Phase 3). … |
| `supabase/migrations/20261109_annual_validation.sql` | added | +31 / -0 | Applied 2026-11-09 via Supabase migration … |
| `supabase/migrations/20261110_annual_followup_unique.sql` | added | +31 / -0 | Fix (2026-11-10): duplicate annual follow-up inspections. … |
| `supabase/migrations/20261110_encoder_reference_data.sql` | added | +28 / -0 | 2026-11-10 … |
| `supabase/migrations/20261110_login_identifier_resolution.sql` | added | +75 / -0 | Login identifier resolution: username, display name, or e-mail. … |
| `supabase/migrations/20261110_master_code_service_role.sql` | added | +52 / -0 | Fix (2026-11-10): the "Update Master Password" button never worked. … |

#### Tooling — `scripts/`, `.githooks/`

| File | Type | Δ lines | Note (from the `@mine` marker) |
|---|---|---|---|
| `.githooks/pre-commit` | added | +8 / -0 | Pre-commit guard: refuse a commit that changes code without a MY-CHANGES.md … |
| `scripts/check-changelog.sh` | added | +110 / -0 | Guard: no code adjustment is "done" until MY-CHANGES.md documents it. … |
| `scripts/gen-provenance.sh` | added | +263 / -0 | Generate docs/PROVENANCE.md: a file-by-file map of "inherited vs mine". … |
| `scripts/log-change.sh` | added | +159 / -0 | Append a MY-CHANGES.md entry automatically from what is in the working tree. … |
| `scripts/my-diff.sh` | added | +59 / -0 | Show everything I changed vs the inherited baseline commit. … |
| `scripts/setup-hooks.sh` | added | +31 / -0 | Turn the "log every change" rule on (or off) for this clone. … |

## 🟨 Modified by me (19 files)

These are **originally the other author's files** that I edited. The file still counts as
theirs in origin; only the lines listed in the note / diff are mine.

#### API routes — `src/app/api/`

| File | Type | Δ lines | Note (from the `@mine` marker) |
|---|---|---|---|
| `src/app/api/activity-logs/route.ts` | modified | +36 / -20 | Rewritten for Supabase; now requires a session (was unauthenticated). … |
| `src/app/api/ai-priority/route.ts` | modified | +78 / -35 | Added the session check (was unauthenticated); AI logic unchanged. … |
| `src/app/api/auth/lock-status/route.ts` | modified | +18 / -6 | Fixed + moved to Supabase: this route was statically prerendered … |
| `src/app/api/auth/login/route.ts` | modified | +95 / -63 | Rewritten: Supabase Auth sign-in (was SQLite password check). … |
| `src/app/api/auth/request-password-reset/route.ts` | modified | +24 / -43 | Rewritten: delegates to Supabase Auth email reset (was custom Gmail … |
| `src/app/api/auth/reset-password/route.ts` | modified | +81 / -17 | Rewritten for Supabase Auth recovery sessions. Accepts either the … |
| `src/app/api/auth/status/route.ts` | modified | +217 / -61 | Rewritten for Supabase (was SQLite users table). User administration … |
| `src/app/api/auth/unlock/route.ts` | modified | +121 / -46 | Rewritten for Supabase. Previously, non-admin accounts could be … |
| `src/app/api/health/route.ts` | modified | +11 / -8 | Was hardcoded to 'development'/'local-nextjs-sqlite'. |
| `src/app/api/inspections/route.ts` | modified | +118 / -145 | Rewritten for Supabase (was SQLite). See src/lib/supabase-data.ts. |
| `src/app/api/local-road/route.ts` | modified | +131 / -163 | Rewritten for Supabase (was SQLite). App "road" records are … |
| `src/app/api/maintenance/route.ts` | modified | +126 / -125 | Rewritten for Supabase (was SQLite). See src/lib/supabase-data.ts. |

#### App shell — `src/app/`

| File | Type | Δ lines | Note (from the `@mine` marker) |
|---|---|---|---|
| `src/app/App.tsx` | modified | +74 / -0 | Set when an authenticated call answers 401 (see lib/session-expiry). |

#### Feature modules — `src/app/components/`

| File | Type | Δ lines | Note (from the `@mine` marker) |
|---|---|---|---|
| `src/app/components/LocalRoadForm.tsx` | modified | +3 / -0 | Supabase Storage path for the file (Phase 2, 2026-11-09); … |
| `src/app/components/LocalRoadList.tsx` | modified | +24 / -17 | Supabase Storage path for the file (Phase 2, 2026-11-09); … |
| `src/app/components/UserManagementModule.tsx` | modified | +74 / -11 | These are the labels the API/session already use (ROLE_FROM_DB); the old … |

#### Password-reset page — `src/app/reset-password/`

| File | Type | Δ lines | Note (from the `@mine` marker) |
|---|---|---|---|
| `src/app/reset-password/page.tsx` | modified | +21 / -6 | Supabase recovery links carry the session in the URL hash … |

#### Root config & assets

| File | Type | Δ lines | Note (from the `@mine` marker) |
|---|---|---|---|
| `package-lock.json` | modified | +103 / -0 | lockfile for the new `@supabase/supabase-js` dependency |
| `package.json` | modified | +1 / -0 | added the `@supabase/supabase-js` dependency |

---

## 🟦 Inherited, untouched (88 files)

Original author's work, exactly as received (including the ~40 stock shadcn/ui
components and the Vite leftovers `src/main.tsx` / `src/styles/*`).

<details>
<summary><b>Show the full list of 88 untouched files</b></summary>

**App shell — `src/app/`**

- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/page.tsx`

**Data layer & helpers — `src/lib/`**

- `src/lib/activity-log-client.ts`
- `src/lib/ai.ts`
- `src/lib/demo-data.ts`
- `src/lib/local-database.ts`
- `src/lib/lockout.ts`
- `src/lib/master-password.ts`

**Feature modules — `src/app/components/`**

- `src/app/components/AIPredictionModule.tsx`
- `src/app/components/AnalyticsDashboard.tsx`
- `src/app/components/ConfirmActionDialog.tsx`
- `src/app/components/Dashboard.tsx`
- `src/app/components/InspectionModule.tsx`
- `src/app/components/LoginPage.tsx`
- `src/app/components/MaintenanceModule.tsx`
- `src/app/components/PrintDocument.tsx`
- `src/app/components/ProjectProgressModule.tsx`
- `src/app/components/ReportsModule.tsx`
- `src/app/components/Sidebar.tsx`
- `src/app/components/SystemArchitecture.tsx`

**Inherited Vite leftovers — `src/`**

- `src/imports/Municipality of Mabini - Copy.jpg`
- `src/imports/Municipality of Mabini.jpg`
- `src/imports/Municipality of Mabini1.jpg`
- `src/imports/logo.png`
- `src/main.tsx`
- `src/styles/fonts.css`
- `src/styles/globals.css`
- `src/styles/index.css`
- `src/styles/tailwind.css`
- `src/styles/theme.css`

**Root config & assets**

- `README.md`
- `components.json`
- `database-schema.sql`
- `index.ts`
- `next-env.d.ts`
- `next.config.js`
- `postcss.config.js`
- `tailwind.config.js`
- `tsconfig.json`

**Stock shadcn/ui kit — `src/app/components/ui/` (library code)**

- `src/app/components/ui/accordion.tsx`
- `src/app/components/ui/alert-dialog.tsx`
- `src/app/components/ui/alert.tsx`
- `src/app/components/ui/aspect-ratio.tsx`
- `src/app/components/ui/avatar.tsx`
- `src/app/components/ui/badge.tsx`
- `src/app/components/ui/breadcrumb.tsx`
- `src/app/components/ui/button.tsx`
- `src/app/components/ui/calendar.tsx`
- `src/app/components/ui/card.tsx`
- `src/app/components/ui/carousel.tsx`
- `src/app/components/ui/chart.tsx`
- `src/app/components/ui/checkbox.tsx`
- `src/app/components/ui/collapsible.tsx`
- `src/app/components/ui/command.tsx`
- `src/app/components/ui/context-menu.tsx`
- `src/app/components/ui/dialog.tsx`
- `src/app/components/ui/drawer.tsx`
- `src/app/components/ui/dropdown-menu.tsx`
- `src/app/components/ui/form.tsx`
- `src/app/components/ui/hover-card.tsx`
- `src/app/components/ui/input-otp.tsx`
- `src/app/components/ui/input.tsx`
- `src/app/components/ui/label.tsx`
- `src/app/components/ui/menubar.tsx`
- `src/app/components/ui/navigation-menu.tsx`
- `src/app/components/ui/pagination.tsx`
- `src/app/components/ui/popover.tsx`
- `src/app/components/ui/progress.tsx`
- `src/app/components/ui/radio-group.tsx`
- `src/app/components/ui/resizable.tsx`
- `src/app/components/ui/scroll-area.tsx`
- `src/app/components/ui/select.tsx`
- `src/app/components/ui/separator.tsx`
- `src/app/components/ui/sheet.tsx`
- `src/app/components/ui/sidebar.tsx`
- `src/app/components/ui/skeleton.tsx`
- `src/app/components/ui/slider.tsx`
- `src/app/components/ui/sonner.tsx`
- `src/app/components/ui/switch.tsx`
- `src/app/components/ui/table.tsx`
- `src/app/components/ui/tabs.tsx`
- `src/app/components/ui/textarea.tsx`
- `src/app/components/ui/toggle-group.tsx`
- `src/app/components/ui/toggle.tsx`
- `src/app/components/ui/tooltip.tsx`
- `src/app/components/ui/use-mobile.ts`
- `src/app/components/ui/utils.ts`

</details>

---

## 🕓 Commit provenance

### Merged pull requests (my work entering `main`)

| PR | Branch merged | Merge commit |
|---|---|---|
| [#9](https://github.com/mendozagabii/Mabini-MEO/pull/9) | `arena/d0e432af-mabini-meo` | `0fd23e7` |
| [#8](https://github.com/mendozagabii/Mabini-MEO/pull/8) | `arena/2189dcc5-mabini-meo` | `c959a40` |
| [#7](https://github.com/mendozagabii/Mabini-MEO/pull/7) | `arena/bd8f6847-mabini-meo` | `10eb585` |
| [#6](https://github.com/mendozagabii/Mabini-MEO/pull/6) | `arena/2f0c41f0-mabini-meo` | `a24dde1` |
| [#5](https://github.com/mendozagabii/Mabini-MEO/pull/5) | `arena/d405d1b2-mabini-meo` | `af8ad92` |
| [#4](https://github.com/mendozagabii/Mabini-MEO/pull/4) | `arena/c5868898-mabini-meo` | `faee7e6` |
| [#3](https://github.com/mendozagabii/Mabini-MEO/pull/3) | `arena/08607812-mabini-meo` | `8d603dd` |
| [#2](https://github.com/mendozagabii/Mabini-MEO/pull/2) | `arena/3f13779c-mabini-meo` | `427be76` |
| [#1](https://github.com/mendozagabii/Mabini-MEO/pull/1) | `arena/7f3b570f-mabini-meo` | `8fe2830` |

### My commits (everything after the baseline, merges excluded)

| Date | Subject | Files |
|---|---|---:|
| 2026-11-09 | [mine] Supabase migration + Vercel env vars documented (see docs/SUPABASE-MIGRATION.md) | 30 |
| 2026-11-09 | [mine] Log PR #1 opening in MY-CHANGES.md | 1 |
| 2026-11-09 | [mine] Prep demo-data cleanup plan + seed script (not executed); log AI status | 3 |
| 2026-11-10 | [mine] Add custom Supabase email templates doc | 2 |
| 2026-11-10 | [mine] Phase 2: annual validation + Storage attachments + AI run persistence | 10 |
| 2026-11-10 | [mine] Add change-tracking toolkit: provenance report, auto log entry, commit guard | 11 |
| 2026-11-10 | [mine] Toolkit refinements: stable provenance regeneration + @mine markers | 3 |
| 2026-11-10 | [mine] Phase 1+2 verified, Phase 3 executed (backup + demo seed), Phase 4 test kit | 6 |
| 2026-11-10 | [mine] Fix master code endpoint (service role + first-run setup), de-duplicate annual follow-ups, add walkthrough | 7 |
| 2026-11-10 | [mine] Add Mabini seal as web icon; bootstrap master code (DB, value not recorded) | 5 |
| 2026-11-10 | [mine] Account editing: apply email + password to the Supabase Auth identity | 4 |
| 2026-11-10 | [mine] Fix password reset: links never applied because updateUser needs a session | 4 |
| 2026-11-10 | [mine] Fix role editing: one role resolver, no silent encoder fallback, restore demoted accounts | 5 |
| 2026-11-10 | [mine] Handle a dead session: 401 shows a 'Session ended' dialog instead of a cryptic error | 4 |
| 2026-11-10 | [mine] Log in with username, display name, or e-mail | 4 |
| 2026-11-10 | [mine] Username equals the display name (unique identity); retire legacy handles | 4 |
| 2026-11-10 | [mine] Encoder can add local road projects (RLS insert on barangays/categories) and gets a Delete button beside Edit | 6 |
| 2026-11-10 | [mine] Never report failure after a project is saved; explain barangay failures instead of blaming the role | 4 |

---

*Regenerate after any change:* `./scripts/gen-provenance.sh`
