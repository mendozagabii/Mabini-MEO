<!-- @mine — Phase 4 live-smoke-test kit, written 2026-11-10 against the freshly seeded data. -->

# 🧪 PHASE 4 — Live test plan (you, on the deployed site)

**Site:** https://mabini-meo.vercel.app — deployed commit `427be76` (Supabase + Phase 2).
**Data:** freshly seeded demo set (see [`PHASE-STATUS.md`](PHASE-STATUS.md) §3).

Do this in a **normal browser on a normal network** (not the sandbox — it cannot reach
`*.supabase.co`). Open DevTools → Network on the first pass; anything red there is worth a
screenshot.

---

## 4.0 Before you start — set the passwords

The 4 accounts exist in Supabase Auth, but their passwords aren't recorded anywhere
(and seeded defaults like `admin123` were a flagged risk). Pick **one** way to set them:

| Option | Steps |
|---|---|
| **A — Supabase Dashboard** (fastest, no mail) | Dashboard → Authentication → Users → pick user → **Reset password** (or "Send recovery"). Do it for all 4. |
| **B — Forgot password on the site** (also tests 4.3) | Log-in page → "Forgot password" → enter the account's **e-mail** → follow the branded mail → set a new password. Do this for at least one account; it exercises SMTP + the template + the `/reset-password` page. |

> Log-in is by **username**, not e-mail (`resolve_login_email` maps it), so
> `admin` / `encoder` / `inspector` / `validator` are what you type in the username box.

| Username | Role in system | E-mail (for reset) | Employee ID |
|---|---|---|---|
| `admin` | Head Engineer | `admin@gmail.com` | EMP-0015 |
| `encoder` | Encoder | `encoder@gmail.com` | EMP-0016 |
| `inspector` | Inspector | `inspector@gmail.com` | EMP-0017 |
| `validator` | Validator | `validator@gmail.com` | EMP-0018 |

Role → modules as configured in `role_module_access`:

| Role | Modules that should be visible |
|---|---|
| Head Engineer (`admin`) | dashboard, project, inspection, maintenance, **analytics**, **AI**, **system management** |
| Encoder | dashboard, project, maintenance |
| Inspector | dashboard, **inspection** |
| Validator | dashboard, **validation** |

## 4.1 Log in with each account

For each of the 4: sign in → dashboard renders with data (not an empty state) → **refresh
the page** (the session must survive a reload — that's `/api/auth/me` restoring the
httpOnly cookie) → log out → confirm you land back on the login page and a protected API
call now returns **401** (DevTools → Network, `/api/local-road`).

- [ ] `admin` + refresh survives + logout works
- [ ] `encoder`
- [ ] `inspector`
- [ ] `validator`
- [ ] menu shows only the modules listed above for each role
- [ ] `encoder` cannot open system management / AI (no menu + direct `/api` calls 403)

## 4.2 Smoke test the flows (as `admin`, then as the specific role)

Use the seeded set as your fixture — it already contains every state you need.

| Flow | What to do | What you should see |
|---|---|---|
| Roads / projects list | Open project management | 10 projects across 5 statuses (`on_track` 3, `completed` 2, `turned_over` 2, `planned` 2, `delayed` 1), barangays, contractors, ₱ amounts |
| Create | Add a road + project (any barangay not used yet, e.g. Bagong Silang) | record appears in the list and survives a refresh (it's in Postgres) |
| Edit | Change the new project's status / completion % | list + dashboard update |
| Inspection | As `inspector`: open inspection management, create an inspection on a project, rate the 7 components | overall score/condition computed; **7 items** saved |
| Validation | As `validator`: open validation, approve one and reject another | status flips to approved/rejected; `validated_by`/`validated_at` set; the seeded **rejected** inspection (Talaga Proper, 2026-08-18) shows the "return for revision" story |
| Annual validation (Phase 2 fix) | Open the annual validation area / turn-over project | entries auto-generated per year, **no 400 error** (this was the old bug) |
| Attachments (Phase 2 fix) | Upload a file on a project, then an inspection | file lands in bucket `wblrms-files`, row in `attachments`, and the thumbnail/download works after a refresh (signed URL) |
| Maintenance | Create/edit a maintenance record (scheduled → in_progress → completed) | status transitions, cost, contractor shown |
| Reports / print | Open reports, print one document | PDF/print preview with the MEO branding |
| Analytics (admin only) | Open analytics | charts populated from the 10 projects / 18 inspections |

- [ ] all of the above behave as described
- [ ] nothing shows "Failed to fetch" / 500 in DevTools

## 4.3 "Forgot password" end-to-end (after 4.0 option B)

- [ ] request arrives from **"Office of the Municipal Engineer"** (Gmail SMTP, not Supabase's default)
- [ ] subject is **"Reset your Mabini MEO password"**, body is the navy/blue Mabini MEO template
- [ ] the button links to `mabini-meo.vercel.app/reset-password...` (not localhost)
- [ ] setting a new password succeeds and the new password logs in
- [ ] an expired/used link shows a friendly error, not a crash

## 4.4 "Generate AI Priorities" as Head Engineer

Only `admin` has the AI module. The key is now in Vercel for all 3 environments, so the
call should reach Vercel AI Gateway (`meta/llama-4-scout`).

- [ ] button completes (no 503), results appear ranked by risk
- [ ] results **survive a refresh and a second browser** — they're read back from
      `ai_analysis_runs` / `ai_priority_results` (Phase 2 fix), not from localStorage only
- [ ] the list shows a mix of risk levels; the seeded run is visible before you regenerate
- [ ] if it fails: check Vercel → Deployments → the current build's env has
      `AI_GATEWAY_API_KEY`, and check the function logs for the upstream error

---

## What to send back if something breaks

The single most useful thing: **which account**, **which screen**, and the **browser
network entry** (status + response body). With that, the fix is usually one API route.
Log every fix in `MY-CHANGES.md` (the pre-commit hook enforces it) and redeploy via PR.
