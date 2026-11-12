# WBLRMS — Decisions from the workflow review

**Date:** 2026-11-12 (rev. 2) · **Branch:** `arena/0da75355-mabini-meo` · **Source:** answers to `docs/WORKFLOW-REVIEW.md` §10, then to follow-up questions B1–B7
**Status:** 26 of 27 items decided · **one item open (B6, §3)** · **no code written yet**

---

## 1. How the answers were read

- **STATED** — the owner said it in a reply. It overrides the sheet.
- **DEFAULT** — not mentioned, so the answer proposed in the sheet stands (§4).
- A later answer overrides an earlier one. **Q6 is the case:** the checklist said maintenance "can be independent", but B1 corrected it to *"maintenance cannot exist without an inspection"*. **B1 wins**, and it matches what the code already does — so no work is needed there.

---

## 2. The decisions

| # | Question | Answer | Source | What it means | Status |
|---|---|---|---|---|---|
| 1 | Step order correct? | Yes | DEFAULT | Flow unchanged | Ready |
| 2 | Head Engineer assigns? | Yes | DEFAULT | New write permission, assignment only | Ready |
| 3 | One or several inspectors? | **One per project** | STATED (B2) | A single inspector reference per project | Ready |
| 4 | Edit after validation? | **Locked until the next validation opens** | STATED (B3) | The project unlocks when the next yearly validation is created | Ready |
| 5 | Change required before re-submit? | Yes | STATED | Identical re-submit refused by the server | Ready |
| 6 | Maintenance always follows an inspection? | **Yes — cannot exist without one** | STATED (B1) | **Reverses the earlier answer; matches the code — no change** | Ready |
| 7 | Assignment after validation? | Yes | DEFAULT | Assign action on validated projects only | Ready |
| 8 | Inspector sees only assigned? | Yes | STATED | Inspection list filtered by assignment | Ready |
| 9 | Hidden from other inspectors? | Yes | STATED | Same mechanism | Ready |
| 10 | Six emails complete? | Yes | DEFAULT | No seventh email | Ready |
| 11 | Recipients correct? | Yes | DEFAULT | As listed | Ready |
| 12 | Copy Head Engineer on 1–3? | not answered | DEFAULT | **No copy** | Ready |
| 13 | Sender mailbox correct? | Yes | DEFAULT | Credentials go in the hosting environment, never in chat | Ready |
| 14 | Email enough (no bell)? | Yes | STATED | Mail delivery only | Ready |
| 15 | Validation 30 days early? | **30** | STATED | First year changes 29 → 30 | Ready |
| 16 | Inspection 29 days early? | **29** | STATED | Replaces "completion + 11 months" | Ready |
| 17 | Example date | 12 October 2027 | DEFAULT | Follows from Q15 + Q18 | Ready |
| 18 | Same every year? | Yes | STATED | First year is the only change | Ready |
| 19 | Four columns, order? | Yes | DEFAULT | No change | Ready |
| 20 | Findings when all Good? | **Show what the inspection recorded** | STATED (B4) | No invented text; the recorded findings are shown | Ready |
| 21 | `Php 1,250,000.00`? | Yes | DEFAULT | No change | Ready |
| 22 | 11 categories complete? | Yes | DEFAULT | No change | Ready |
| 23 | Evidence mandatory when? | Only for monitoring & maintenance | STATED | Matches the server rule — no change | Ready |
| 24 | Printable reports | Both — all records and per year | STATED | Limited to records that still exist (B5a) | Ready |
| 25 | Remove unused columns? | **Completion Percentage + Actual Project Cost** | STATED (B6) | See §3 — PCAB is now unclear | **Open** |
| 26 | Delete archived after 30 days? | Yes — and printing accepts the loss | STATED (B5a) | Scheduled permanent deletion | Ready |
| 27 | Max 5 locations? | **Yes — coverage of the project, not separate inspections** | STATED (B7) | A list of up to 5 covered barangays; one inspection per project | Ready |

---

## 3. The one item still open — B6

**What was asked (Q25):** may **PCAB License No.** and **Completion Percentage** be removed?

**What was answered (B6):** *"The Completion Percentage and Actual Project Cost is not needed and it doesn't have relationship to other records."*

Three differences to settle, because they decide which columns actually get dropped:

| Field | Where it lives | In the answer? | Question |
|---|---|---|---|
| **PCAB License No.** | `contractors.pcab_license_no` — it belongs to the **contractor** record, not the project | **not mentioned** | Does it stay? Removing it changes the contractor screen, not the project screen. |
| **Completion Percentage** | `projects.completion_percentage` (shown on the project view) **and** `project_progress_updates.completion_percentage` (each progress entry) | mentioned | Remove both, or only the one on the project? |
| **Actual Project Cost** | `projects.adjusted_project_cost`, labelled "Actual Project Cost" on screen | mentioned | Confirm this is the one. |

**Also asked:** **"Amount contracted"** (`projects.contracted_amount`) must **stay** — it is a required column of the summary table. Only the *adjusted* cost would go. Confirm.

**And:** the removal still follows the safe order — export to CSV, hide from screens and API, then drop the columns in a separate migration. No destructive step runs without an explicit go-ahead.

---

## 4. Defaults applied (spot-check these)

Q1 · Q2 · Q7 · Q10 · Q11 · **Q12 no CC** · Q13 · Q17 = 12 Oct 2027 · Q19 · Q21 · Q22.

---

## 5. What changes in the code, exactly

| Decision | Today | After |
|---|---|---|
| Q15 | First-year validation opens 29 days before the anniversary | 30, every year |
| Q16 | Earliest inspection = completion **+ 11 months** (28–31 days before the anniversary, depending on the month) | Exactly 29 days before the anniversary |
| Q5 | A returned project can be re-submitted unchanged | Refused |
| Q8, Q9 | Every inspector sees every inspection | Only the project assigned to them |
| Q3, Q7, Q2 | No assignment exists | Head Engineer assigns one inspector per validated project |
| Q4 | Projects stay editable after validation | Locked until the next yearly validation opens |
| Q6 | Maintenance requires an eligible inspection | **Unchanged** — confirmed correct |
| Q20 | Findings built from remarks; blank when there are none | **Unchanged behaviour** — show what was recorded; no invented text |
| Q23 | Evidence mandatory for monitoring & maintenance only | **Unchanged** — confirmed correct |
| Q24 | Printing is per record | Whole overview, and one year |
| Q26 | Nothing is deleted automatically | Archived records and their files are deleted 30 days after archiving |
| Q25 | Two unused columns still present | Removed *(waiting on §3)* |
| Q27 | One barangay per project | Up to 5 covered barangays, filter matches any |
| Q14 | Only the Supabase password-reset email | Six event emails via `nodemailer` (already a dependency, never used) |

---

## 6. Planned execution order

Each step is a separate commit and a separate review. Steps can be merged in this order without waiting for the ones below.

| Step | Work | Database | Blocked by |
|---|---|---|---|
| **1** | **The two dates** (Q15, Q16, Q18): first-year validation 29 → 30; earliest inspection date becomes exactly 29 days before the anniversary instead of completion + 11 months | none | — |
| **2** | **Re-submit change check** (Q5): a returned project cannot be re-submitted unchanged | none | — |
| **3** | **Validation lock** (Q4): locked after validation, released when the next yearly validation is created | none | — |
| **4** | **Assign inspector** (Q2, Q3, Q7): one inspector per project, Head Engineer only, activity log entry, button on validated projects | one nullable column on the projects table | step 3 |
| **5** | **Inspector scope** (Q8, Q9): listing filtered to the assigned project | none | step 4 |
| **6** | **Email subsystem + six emails** (Q10–Q14): transport, the six templates, the shared header/footer | none | step 4 for email 5; mailbox credentials set in the hosting environment |
| **7** | **Print both views** (Q24): whole overview, and one year | none | — |
| **8** | **30-day purge** (Q26): scheduled job, report-only mode first, then live | none (deletes data, not schema) | explicit go-ahead before the live run |
| **9** | **Field removal** (Q25) | hide first, drop later | §3 |
| **10** | **Five locations** (Q27): list of covered barangays, max 5, filter matches any | new `project_locations` table + backfill from the current single barangay | — |

Steps 1–3 need no database change and no further answer, so they can start as soon as the plan is approved. Step 10 is last because it touches the project form, the project list and the filter at once.

**Known prerequisite for step 8:** the migration `20261110_staff_archive_permissions.sql` is still unapplied (the staff-level archive policies are missing), and the purge job must also remove attachment **files** from storage, not only their rows.

---

## 7. New UI requirements received 2026-11-12

Recorded as tasks 11–16 so they do not renumber the ten-step plan above.

| # | Requirement (as stated) | Screens touched | Depends on |
|---|---|---|---|
| **11** | Head Engineer's Project Management: replace the cards with a **table like Validation Management**. Columns: **Project Name · Location (the barangay under road information) · Contract Amount · Completion Date · Inspector** (a dropdown of registered inspectors in every row — this *is* the assignment action). Rows are clickable and open the project details. | Head Engineer project list | **Step 4** (assignment) — the dropdown and the assignment are the same feature |
| **12** | Project form **Location**: the encoder may enter **up to 5 locations**, with an **Add** button, and each accepts a long string (e.g. *"Sitio Dao, Anilao East, Mabini, Batangas"*). Viewing and printing show **one box with one line per location**; the **road name shows the same lines in one box**; **road network ID and road name each get their own row** in add, view, edit and print. | Project form, project view, project print | none |
| **13** | Project Management (Head Engineer **and** Encoder): replace the **location filter** with a **date filter**, the same one used in Maintenance Management. | Head Engineer + Encoder project lists | none |
| **14** | Maintenance **overview table interface** made to match the Inspection overview. In both overviews put a **print button in the header, on the right** — Inspection beside *Findings*, Maintenance beside *Remarks*. **Printing is Head Engineer only.** | Inspection overview, Maintenance overview | Step 7 (print both views) |
| **15** | The **Location shown in lists is the Barangay** under road information: project list, maintenance list, and the validation table. | those three lists | none |
| **16** | Validation Management: the **name in the table must be the Project Name** (not the road or location name). | Validation table | none |

### Design note — Location and Barangay are currently the same value

Today `location` and `barangay` are both read from the single `barangays.name` link (`projects.barangay_id`). Requirement 12 (five free-text coverage lines) and requirement 15 (lists show the barangay) only both work if the two are **split**:

- **Location** = a list of up to 5 free-text lines, stored in a new `project_locations` table (project, position, label).
- **Barangay** = the existing single link, kept as-is, and used by the lists and the filters.

That is the reading implemented unless the office says otherwise. Two details to confirm when task 12 starts:

1. Are the five lines **free text only**, with no barangay dropdown behind them? (Today the form asks for a barangay as well.)
2. Does the **Barangay field stay required**, so every project still has one for the lists and the totals?

### Where these fit in the plan

1. Steps 1–3 as listed in §6. **Step 1 is done** (commit `3c31d07`).
2. **Task 11** ships together with step 4 — the Inspector dropdown in the table is the assignment UI, so building them apart would mean writing the same screen twice.
3. **Tasks 15 and 16** are small and independent; they can go with any of the next commits.
4. **Task 13** (date filter) goes with task 11, since the project list is being reworked anyway.
5. **Task 12** (five locations) is the largest of the group and needs its migration; it follows step 4–5.
6. **Task 14** goes with step 7, where printing is built.
