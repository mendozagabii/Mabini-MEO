<!-- @mine — Written 2026-11-10 together with the fix for the master-code endpoint. -->

# 🔑 MASTER CODE — walkthrough & setup

The master code is the MEO's **emergency unlock token**. It clears the login lockout on an
account. It is **not** a password, it does not sign anyone in, and it does not grant
admin screens.

---

## 1. What it actually does

```
Wrong password ×3  →  account LOCKED  (15 min × lockout_count: 15 → 30 → 45 min…)
                         │
                         ├── (a) a signed-in Head Engineer unlocks it from inside the app
                         └── (b) the master code unlocks it from the login screen
```

| Piece | Where |
|---|---|
| Hash storage | `system_settings`, key `master_unlock_code_hash` — bcrypt (`crypt`, `gen_salt('bf')`), never plaintext |
| Verify | RPC `verify_master_code(p_code)` — `SECURITY DEFINER`, executable by `service_role` only |
| Set / change | RPC `set_master_code(p_new, p_current, p_updated_by)` — min **8** chars; requires the current code *only if one already exists* |
| Unlock from login screen | `POST /api/auth/unlock` `{ username, masterCode }` — no session needed |
| Set / change in UI | System Management → **Master Security Key** → `PATCH /api/auth/unlock` (Head Engineer session) |
| Check whether one exists | `GET /api/auth/unlock` (Head Engineer session) → `{ hasMasterCode, updatedAt, updatedBy }` |
| Audit | every set/change and every unlock writes an `activity_logs` row |

Lockout is keyed on the **resolved e-mail**, so typing the username `admin` locks
`admin@gmail.com`. That is why the unlock endpoint accepts either form.

---

## 2. What was broken (and is fixed in this branch)

| # | Problem | Fix |
|---|---|---|
| 1 | `PATCH /api/auth/unlock` called `set_master_code` with the **user** client, but EXECUTE is granted to `service_role` only → `permission denied for function set_master_code`. **The button could never work.** | Route now calls it with the service-role client (the route already enforces `head_engineer`) and passes the actor as `p_updated_by`, so `updated_by` is still accurate. Migration: `20261110_master_code_service_role.sql`. |
| 2 | With no code set, the login-screen unlock answered a bare `401 Invalid master unlock code` — indistinguishable from a wrong code, so there was no way to know setup was missing. | Now returns **409** with `masterCodeConfigured: false` and a message telling you to ask the Head Engineer to set one. |
| 3 | The UI demanded a "Current Master Password" even on first setup, and said "Min 6". | First-run mode: current code optional, banner explains it, minimum corrected to 8 (matches the RPC). |
| 4 | Duplicate annual follow-up inspections (4 duplicated pairs found live). | Unique index `inspections_annual_follow_up_uq` + de-dupe, see `20261110_annual_followup_unique.sql`. |

Both migrations are already applied to WBLRMS (`jowcyoziuqzoezxboffx`). The route/UI changes
need the PR merged and redeployed before they appear on `mabini-meo.vercel.app`.

---

## 3. What you need to set up (checklist)

| # | Task | Who | Where |
|---|---|---|---|
| 1 | Merge this branch → Vercel deploys | you | GitHub PR |
| 2 | **Set the first master code** | you (as `admin`) | app → System Management → Master Security Key |
| 3 | Confirm it registered | you | same screen shows *"A master code is already set"* (or `GET /api/auth/unlock`) |
| 4 | Test the whole loop | you | lock `encoder`, unlock it with the code (steps below) |
| 5 | Store the code somewhere the office can reach (envelope / password manager), **not** in chat or the repo | you | — |

### Step 2 — set the first code (two ways)

**A. Through the app (after the deploy)** — recommended, no SQL:

1. Sign in as `admin`.
2. Sidebar → **System Management** → **Master Security Key** → *Change Master Password*.
3. Leave **Current Master Password** empty (the amber banner tells you no code exists yet).
4. Enter the new code twice (≥ 8 characters; a long random string is best) → **Update Master Password**.
5. You should see *"Master code set. You can now unlock a locked account from the login screen."*

**B. Through SQL (works right now, before the deploy)** — Supabase → SQL Editor:

```sql
select public.set_master_code('PUT-YOUR-NEW-CODE-HERE', null, null);
```

That is the bootstrap only. From then on, changes require the current code, and the
`--` comment must not contain your real code — type it in the editor, don't commit it.

### Step 3 — verify end-to-end (10 minutes)

1. Log out. Try to sign in as `encoder` with a **wrong** password **3 times**
   → the page should say the account is locked and offer *"Unlock with master code"*.
2. Click it, enter `encoder` + the master code → *"Account unlocked."*
3. Sign in as `encoder` with the correct password → dashboard loads.
4. (Optional, cleans up the demo state) repeat with the same code once more to see
   *"Account is not currently locked."*

> Careful: lockouts escalate — each round multiplies the wait (15 → 30 → 45 min). If you
> lock the only Head Engineer (`admin`) three times, **you cannot unlock yourself from the
> app** (no session) unless a master code is set. Bootstrap recovery is in §5.

### Step 4 — rotating the code later

System Management → Master Security Key → enter the current code, the new one twice → Update.
Everyone who needs it should be told out-of-band; there is no "list codes" screen by design.

---

## 4. Troubleshooting

| Symptom | Meaning | Do this |
|---|---|---|
| 409 *"No master code has been set…"* on unlock | nothing configured yet | §3 step 2 |
| 401 *"Invalid master unlock code."* | code is set, the value is wrong | retype; values are case-sensitive |
| 403 *"Only the Head Engineer can…"* | you're signed in as encoder/inspector/validator | sign in as `admin` |
| 400 *"The master code must be at least 8 characters long."* | too short | use ≥ 8 |
| 401 *"Current master password is incorrect."* | changing, but the current code is wrong | use the current code, or §5 if it's lost |
| 400 *"permission denied for function set_master_code"* | you're on the **old** deployment | merge + redeploy this branch |
| `master123` is rejected | it's the legacy SQLite default; it is **not** honoured by Supabase | it was never a valid code here — set a real one |

---

## 5. Break-glass recovery (code forgotten)

Whoever has dashboard access can reset it without knowing the old value:

```sql
-- 1) forget the existing code (this is the break-glass step — audit it manually)
delete from public.system_settings where key = 'master_unlock_code_hash';

-- 2) then set a new one, either through the app (the amber "no master code" banner
--    lets you set it without the current code) or with the bootstrap call:
select public.set_master_code('NEW-CODE-AT-LEAST-8-CHARS', null, null);

-- 3) if you're locked out too, unlock any account while you're here:
select public.unlock_account('admin@gmail.com');
```

`set_master_code` is deliberately not callable with the public anon key, so this requires
the SQL console / service role. Treat it like changing the office locks: logged, announced,
and done by one authorised person.

---

## 6. Known limitations (worth a follow-up)

1. **No rate limit on `POST /api/auth/unlock`.** A code is bcrypt-verified but nothing throttles
   attempts. With an 8-character code that's still slow to brute-force, but a per-IP limiter
   (5 tries / 15 min) is the right next step.
2. **It unlocks, it doesn't re-authenticate.** Unlocking does not change the account's password —
   whoever locked it by guessing still can't get in.
3. `updated_by` is recorded, but the *unlock* only logs the username of the actor when a session
   exists; a pre-login unlock logs nothing (there is no user). If you need that trail, log
   attempts in `activity_logs` with the identifier being unlocked.
4. The legacy `src/lib/master-password.ts` (`master123`, `data/master-password.txt`,
   `ADMIN_UNLOCK_CODE`) is now **dead code** — nothing imports it. Safe to delete in the
   Phase 5 cleanup so nobody is tempted to "restore" the old default.
