<!-- @mine — created 2026-11-10 at the owner's request: a read-first brief so a new Arena
     session (possibly on a different account) knows what is done, what is UNVERIFIED,
     and what it must not do without an explicit go-ahead. Keep this file current. -->

# ⚠️ READ THIS FIRST — session handoff

> **2026-11-10 current follow-up — supersedes historical notes below:**
> The owner approved merging the role and icon-button work on `arena/1e3bf832-mabini-meo`.
> Earlier PR #10 is **closed without merging**; relevant project-save fixes and its reference-data
> migration were carried into this branch. The owner has not authorized applying any additional
> database migrations; `20261110_staff_archive_permissions.sql` remains unapplied and real-role
> CRUD / direct database RLS restrictions still need review and approval.
> Latest Vercel preview READY: https://mabini-4clloo4gr-gabii0805s-projects.vercel.app
> (upload-based snapshot, not a Git branch deployment). It uses the live production database;
> even reads may create scheduled follow-ups. Test writes only with the owner's approval.
> Head Engineer read/delete only in Project, Inspection and Maintenance; Encoder create/read/
> update/archive in Project and Maintenance; Inspector create/read/update/archive in Inspection.
> The inspection card itself opens its details modal. A Head Engineer inspection archive does not
> invoke the general project-edit path; verify derived road-condition synchronization separately.
> The owner-approved current merge does not authorize any future merge or database work.

> **Any agent starting a task in this repo: read this file completely before touching code.**
> It is the shortest path to "what is left and what to do". If you change something
> consequential, update this file in the same commit as the change.

- **Project:** Mabini MEO — Municipal Engineering Office system (WBLRMS: local roads, projects, inspections, maintenance, validation).
- **Repo:** `mendozagabii/Mabini-MEO` · Next.js 14 (App Router) + React 18 + TypeScript
- **Database:** Supabase project `jowcyoziuqzoezxboffx`
- **Hosting:** Vercel project `mabini-meo` (team `gabii0805s-projects`) → live at <https://mabini-meo.vercel.app>
- **Last updated:** 2026-11-10
- **Historical PR #10 branch:** `arena/f7b64daf-mabini-meo` (closed without merging)
- **Historical pull request:** **#10** — closed without merging; relevant work carried forward as described above.

---

## 0. Resume prompt (the keyword is **HANDOFF**)

If the owner opens a new session and types just **`HANDOFF`**, the agent must reply with a short
status read-out and then ask **one** question: *verify, or merge?* — nothing else.

Equivalent full prompt, if the keyword is not recognised:

```text
HANDOFF — read docs/SESSION-HANDOFF.md completely before doing anything, then check
git log --oneline -5 on the current session branch and check the relevant PR.
Then: summarise in 5 lines what is done, what is still unverified by me, and what needs
my explicit approval. Do NOT start new work, do NOT merge, do NOT touch the database
until I say which. My pending task is verification and any explicitly approved follow-up.
```

Variants the owner may use:

| He types | You do |
|---|---|
| `HANDOFF` | Read this file, give the 5-line status, ask *verify or merge?* |
| `HANDOFF verify` | Walk him through §4's tick-list step by step, in order, on the live app |
| `HANDOFF merge` | Confirm which current PR the owner means; do not attempt to merge closed PR #10 |
| `HANDOFF next` | Only after §4 is confirmed: propose the next gated item from §6 and wait for a go |

Do not treat `HANDOFF` as approval for anything beyond reading and reporting.

---

## 1. The one thing to understand

The owner (Gab) has been asking for adjustments in phases and **has not finished verifying the latest
round**. Nothing is "done" until *he* says so after clicking through the live app. Your job on a new
session is usually: (a) help him verify, (b) fix what the verification exposes, (c) get an explicit
merge approval per pull request.

**Never merge a PR, run a destructive DB step, or move to the next phase on your own initiative.**

---

## 2. Current state at a glance

| Item | State |
|---|---|
| Production (`mabini-meo.vercel.app`) | commit `0fd23e7` — the merge of PR #9 |
| PR #10 | **closed, unmerged**; relevant code carried into the current branch |
| Database changes from PR #10 | **already applied live** (see §3) |
| Phases 1–3 of the original plan | done and merged (PRs #1–#8) |
| Phase 4 (owner's acceptance testing) | **owner's job — not started** |
| Phase 5 | deferred |
| Accounts | 5 active, none archived: `mae ortega` (head engineer), `ryan` (head engineer), `christine agkis` (encoder), `gabriel mendoza` (inspector), `jeicel ortega` (validator) |

---

## 3. What is live in the database but *not yet* in any deployment

Applied directly to Supabase (so it is effective **right now**, before any merge):

- `Barangays: encoders add` — INSERT policy on `barangays` for `head_engineer` + `encoder`
- `Categories: encoders add` — INSERT policy on `project_categories` for `head_engineer` + `encoder`
- Saved as a repo migration: `supabase/migrations/20261110_encoder_reference_data.sql`

Data changes made earlier the same day (already verified):

- Every username now equals the display name, lower-case (`mae ortega`, `ryan`, `christine agkis`, …). Legacy handles `admin`, `encoder`, `inspector`, `validator` **no longer resolve** — sign in with the name or the e-mail.

**Consequence:** the app's *behaviour* is partly ahead of the deployed code. If something seems
inconsistent between what the code says and what the app does, this is why.

---

## 4. ⚠️ Unverified — the owner has not checked these yet

Ask him to confirm these on <https://mabini-meo.vercel.app> (the Delete button needs PR #10 deployed first):

- [ ] **Encoder can add a local road project** — sign in as `christine agkis`, add a project using a **new** barangay name. Expect: success, project appears in the list.
- [ ] **Delete button sits beside Edit** for the encoder — visible, labelled "Delete", works.
- [ ] Deleting archives the project (recoverable from System → archived records), it does not hard-delete.
- [ ] Error messages are honest: a genuinely missing barangay now says *"A barangay is required for a road project."* (400), not *"Your role may not permit it."*
- [ ] Head Engineer (`mae ortega`) can view and delete but cannot add or edit in the three modules.

Known background: the encoder once saw "Unable to create this project. Your role may not permit it."
**while the project still appeared in the list**. Diagnosis (from the live DB log, not a guess): the
failed attempt wrote nothing — the typed barangay could not be inserted, so `barangay_id` was null and
`roads.barangay_id` is `NOT NULL`; the row in the list came from the retry that succeeded afterwards.
PR #10 removes both ways that misleading message could be produced.

---

## 5. What to do next (in order)

1. Confirm whether the current role/UI PR has merged and its production deployment is READY.
2. Wait for the owner’s verification (§4); do not apply the staged migration without explicit approval.
3. If verification fails, fix that with a `MY-CHANGES.md` entry and obtain approval for its PR.
4. Only then move on to the gated items in §6.

---

## 6. Gated / still pending (needs an explicit "go" each time)

| Item | Gate |
|---|---|
| Phase 3.2 — delete/retire demo data | needs an explicit "go" |
| Phase 3.3 — re-seed demo data | needs an explicit "go"; `supabase/demo/seed-demo-data.sql` must **never** be re-run unprompted |
| Master unlock code rotation | owner's; the current code must never be printed in chat, code, docs, changelog or PR text |
| Phase 4 — acceptance testing | owner runs it (`docs/PHASE-4-TEST-PLAN.md`) |
| Phase 5 | deferred |

### Offered but never approved (do not start unasked)

- Rate-limit `POST /api/auth/unlock`
- `/api/auth/lock-status` keys on the **e-mail** while the login page looks up a **username** → the pre-check never matches; align them
- `master_code_audit` as an append-only table
- Delete the dead file `src/lib/master-password.ts`
- Block self-edit of your own e-mail/password (it revokes your own session → 401s)
- Clean up the legacy duplicate RLS policies on `roads` (`Encoders create roads`, `Encoders delete roads`, `Road managers update roads`, `Active users read roads`, which use `has_app_role(text)` / `is_active_user()` alongside the modern `has_role()` policies)

---

## 7. Hard rules — do not break these

1. **Every change gets a `MY-CHANGES.md` entry in the same commit.** The owner must be able to tell his additions apart from the inherited codebase.
2. Commits the owner authors start with `[mine]`; new files carry an `@mine` marker; edits inside inherited files get a `// @mine:` marker.
3. **Never print secrets.** No API keys, no service-role key, no master code, no user passwords — not in chat, code, `MY-CHANGES.md`, activity log, or PR bodies.
4. **One approval per PR.** Previous merges (#1–#9) were each approved individually. Never infer consent from an earlier merge.
5. **Do not redesign the login page.** Redirect/session fixes must not change its look.
6. **Verify before advancing phases**; only move on after the previous phase is confirmed.
7. **State uncertainty honestly.** If you have not run something, say so — this project's whole log is built on evidence.
8. Keep generated artifacts and large data out of Git; follow `.gitignore`.

---

## 8. Where things live

| Area | Files |
|---|---|
| App shell, routing, role→module access | `src/app/App.tsx` (`hasAccess`) |
| Local road / project UI | `src/app/components/LocalRoadList.tsx`, `LocalRoadForm.tsx` |
| Users, roles, archived records | `src/app/components/UserManagementModule.tsx` |
| Data access (Supabase mapping) | `src/lib/supabase-data.ts` |
| Auth/session plumbing | `src/lib/supabase.ts`, `src/lib/api.ts`, `src/lib/session-expiry.ts` |
| API routes | `src/app/api/**` (`local-road`, `inspections`, `maintenance`, `auth/*`) |
| Migrations | `supabase/migrations/*.sql` |
| Change log (owner's audit trail) | `MY-CHANGES.md` (every entry and the required format) |
| Provenance / baseline diff | `docs/PROVENANCE.md`, `docs/BASELINE.md`, `scripts/my-diff.sh` |
| Test plan / phase status | `docs/PHASE-4-TEST-PLAN.md`, `docs/PHASE-STATUS.md` |
| Master code guide | `docs/MASTER-CODE-GUIDE.md` |

### Commands you will need

```bash
npm ci                 # always install first — a bare `npx tsc` grabs a bogus tsc@2.0.4 from npm
npx tsc --noEmit       # type check
npm run build          # production build
bash scripts/check-changelog.sh    # changelog must match the commits
bash scripts/gen-provenance.sh     # regenerate docs/PROVENANCE.md (amend until `git status` is clean)
bash scripts/my-diff.sh            # diff against the recorded baseline
```

---

## 9. Traps that have already bitten this project

- `npx tsc` without local `node_modules` installs a placeholder package and "succeeds" meaninglessly.
- `gh --jq` rejects expressions containing `//` — use `gh api` or plain `--json`.
- The sandbox **cannot reach `vercel.app`** — use the Vercel connector instead of `curl`.
- `gen-provenance.sh` writes the commit's file count, so it needs one or two amend-and-regenerate rounds before `git status` is clean.
- PostgREST hides RLS mistakes: a blocked embed returns `null`, not an error. Check `pg_policies` instead of trusting a green response.
- `roads.barangay_id` is `NOT NULL`; `barangays`/`project_categories` writes were Head-Engineer-only until 2026-11-10.
- Deleting a project is an **archive** (`archived_at`), not a row delete — `archiveRoad()` is an UPDATE, which is why the encoder role can do it.
- Self-editing your own e-mail or password revokes your session and produces 401s that look like RBAC failures. Not a bug in the roles.

---

## 10. Do not redo (already merged)

- PR #1–#8: migration to Supabase, demo data, inspections/attachments, annual validation, master-code flow, icons, password-reset rewrite, role-editing fix, dead-session dialog.
- PR #9: login by username / display name / e-mail, and usernames = display names with 409 duplicate-name protection.

Redoing any of these will conflict with what is already live.

---

## 11. Definition of done for a task here

1. The behaviour the owner asked for actually works — shown by evidence, not assumption (query, probe, or log).
2. `npx tsc --noEmit` ✅ and `npm run build` ✅.
3. `MY-CHANGES.md` entry in the same commit; `scripts/check-changelog.sh` passes.
4. Pushed to the session branch, PR opened (or updated), and the PR body states **what was verified and how**.
5. Left unmerged until the owner says "merge".
