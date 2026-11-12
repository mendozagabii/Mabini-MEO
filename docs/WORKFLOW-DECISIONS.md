# WBLRMS — Decisions from the workflow review

**Date:** 2026-11-12 · **Branch:** `arena/0da75355-mabini-meo` · **Source:** answers to `docs/WORKFLOW-REVIEW.md` §10
**Status:** decisions recorded, **not yet implemented**. Seven items are blocked pending clarification (§3).

---

## 1. How the answers were read

The instruction was: *"all numbers that are not answered is right."* So:

- **STATED** — the number appears in the owner's reply. It overrides the sheet.
- **DEFAULT** — the number is absent, so the answer proposed in the sheet stands. Listed in §4 so a wrong default is easy to spot.
- Two questions had **no proposal** in the sheet (Q3 and Q4), so silence cannot mean "right". They are asked again in §3.

---

## 2. The 27 decisions

| # | Question | Answer | Source | What it means for the build | Status |
|---|---|---|---|---|---|
| 1 | Is the step order correct? | Yes | DEFAULT | Flow unchanged, except step 10–11 (see Q6) | Ready |
| 2 | Head Engineer assigns inspectors? | Yes | DEFAULT | New write permission for the Head Engineer on assignment only | Ready |
| 3 | One or several inspectors per project? | **not answered** | — | Decides the data model: one column vs a join table | **Blocked — B2** |
| 4 | May the encoder edit after validation? | **not answered** | — | Decides whether the yearly update is possible at all | **Blocked — B3** |
| 5 | Must something change before re-submitting? | Yes, must change | STATED | Server compares the returned fields; identical re-submit is refused | Ready |
| 6 | Does maintenance always follow an inspection? | Can be independent | STATED | **Conflicts with the code** — an inspection is currently mandatory | **Blocked — B1** |
| 7 | Assignment happens after validation? | Yes | DEFAULT | The Assign action appears on validated projects only | Ready |
| 8 | Inspector sees only assigned work? | Yes | STATED | The Inspection module is filtered by assignment | Ready (needs Q3) |
| 9 | Project hidden from other inspectors? | Yes | STATED | Same mechanism as Q8 | Ready (needs Q3) |
| 10 | Are the six emails the complete set? | Yes | DEFAULT | No seventh email, even for unscheduled maintenance | Ready |
| 11 | Are the recipients correct? | Yes | DEFAULT | Validator / Encoder / Head Engineer / Inspector as listed | Ready |
| 12 | Copy the Head Engineer on emails 1–3? | **not answered, no proposal** | — | Default taken: **no copy** | Ready (confirm) |
| 13 | Is the sender mailbox correct? | Yes | DEFAULT | Needs real SMTP credentials in the hosting environment | Ready |
| 14 | Is email enough (no in-system bell)? | Yes, email is enough | STATED | Mail delivery must be built; no notification inbox | Ready |
| 15 | Validation opens how many days early? | **30 days** | STATED | First year must change from 29 → 30 | Ready |
| 16 | Inspection allowed how many days early? | **29 days** | STATED | See the code delta in §5 — it is not 29 days today | Ready |
| 17 | The worked example date | 12 October 2027 | DEFAULT | Derived from Q15 = 30 and Q18 = every year | Ready |
| 18 | Same offsets every year? | Yes, every year | STATED | Matches later years; the first year is what changes | Ready |
| 19 | Four summary columns, in order? | Yes | DEFAULT | No change to the overview header | Ready |
| 20 | Findings must have input even when Good | **always show something** | STATED | Must replace the current "blank when Good" rule | **Blocked — B4** |
| 21 | Amount format `Php 1,250,000.00`? | Yes | DEFAULT | No change | Ready |
| 22 | Are the 11 categories complete? | Yes | DEFAULT | No change | Ready |
| 23 | When is evidence mandatory? | Only for monitoring & maintenance | STATED | Matches the current server rule — no change | Ready (confirm wording) |
| 24 | Which reports are printable? | Both — all records and per year | STATED | Depends on Q26 (see B5) | **Blocked — B5** |
| 25 | Remove PCAB No. and Completion %? | Yes, remove | STATED | Irreversible column drop — needs approval | **Blocked — B6** |
| 26 | Delete archived records after 30 days? | Yes, after 30 days | STATED | Directly conflicts with Q24 (see B5) | **Blocked — B5** |
| 27 | Maximum 5 locations per project? | Yes, 5 | STATED | Needs the multi-location design that was cancelled before | **Blocked — B7** |

---

## 3. The seven things to settle before building

### B1 — What "maintenance can be independent" means (Q6)

**The conflict.** Today a maintenance record *cannot exist without an inspection*: the form requires an eligible inspection (rated Fair, Poor or Bad, never yet scheduled), and both dates must be at least **one day after the inspection date**. The server refuses anything else.

**The question.** Which of these did you mean?

- **(a)** A repair can be recorded with **no inspection at all** — for example an emergency repair, or damage reported by the barangay. The record attaches to the project. *(recommended)*
- **(b)** Maintenance can follow **any** inspection, including one rated Good — the Fair/Poor/Bad condition is dropped.
- **(c)** Both.

**Also needed:** for a record with no inspection, which of these are still required — type, date started, scheduled date, cost, contractor? And what is the date rule (on or after the project's completion date? any date after 2000?), since "one day after the inspection" has nothing to point at.

### B2 — One inspector or several per project (Q3)

**Why it blocks.** If one, the project stores a single inspector and email 5 says "assigned to Juan". If several, the project stores a list, email 5 must say who, and the inspector's worklist reads from that list. Changing this later means a database migration and a rewrite of the assignment screen.

**Recommendation:** support **several from the start** (a small `project_inspectors` table). Re-inspections and long roads split by section are normal, and the additive design costs little now.

### B3 — Does validation lock the project (Q4)

**Why it blocks — and it is a contradiction, not a detail.** If a validated project is locked to the encoder (the reading the sheet proposed), then **next year nobody can update it**: the yearly cycle begins with the encoder editing the details. The flow only works if either:

- **(a)** the lock is released automatically when the next validation opens (30 days before the next anniversary), or
- **(b)** the project is never locked, and only the activity log records who changed what. *(recommended: (a))*

### B4 — What the Findings column shows when everything is Good (Q20)

**What you said:** findings must have input even when everything is Good. **What the code does:** it builds a sentence from the inspectors' remarks and leaves the cell blank when there are none.

**A detail worth knowing:** for inspections saved today the cell can never be blank, because a remark is already mandatory for every category that is not N/A. The blank cells are **older records** saved before that rule existed.

**The question — what should those show?**

- **(a)** the fixed text **"All categories rated Good"** when ratings exist and all are Good, and **"Not recorded"** when there are no ratings at all *(recommended)*
- **(b)** the list of category names rated Good
- **(c)** the inspector goes back and adds a remark to the old record

**Second question:** the screen trims the findings to 320 characters. Should the **printed** report show the full text even though the screen shows the shortened version? *(recommended: yes)*

### B5 — Deleting after 30 days makes last year's report unprintable (Q24 + Q26)

**The conflict.** You asked for two things that cannot both work fully:

- **Q24:** print the overview **per year**
- **Q26:** permanently delete archived records after **30 days**

If a year's records are deleted, that year cannot be printed afterwards. Today nobody notices because per-year printing does not exist yet.

**Three ways out:**

- **(a)** Delete everything after 30 days — printing works only for the last 30 days' worth of records. *(simplest, loses history)*
- **(b)** **Keep a permanent summary row** per record (project name, inspection date, amount contracted, findings, the ratings) and delete only the **files and per-item detail** after 30 days. Printing any year keeps working; the photos do not survive. *(recommended)*
- **(c)** Do not delete automatically; keep everything.

**Also needed:** do the 30 days count from the moment of archiving, or from the record's own date? And should the Head Engineer be warned some days before the deletion runs?

### B6 — Dropping the two columns is irreversible (Q25)

**What you said:** remove PCAB License No. and Completion Percentage. Agreed — both are unused. But a column drop cannot be undone, and the repo rule is that no destructive database step runs without explicit approval.

**Recommendation, in three steps:**

1. **Export** the two columns to a CSV first, so the historical values are not lost.
2. **Hide them** from the screens and the API now — non-destructive, ships immediately. *(side note: the code reads the PCAB field through a misspelled property, `pcadLicenseNo` — it will be cleaned up in this step)*
3. **Drop the columns** in a separate migration once you confirm the export is acceptable.

**Question:** approve this order, or drop the columns straight away once the export exists?

### B7 — Five locations per project (Q27)

**Why it is bigger than it looks.** A project currently holds exactly one barangay, and the filter uses it. Five locations means a new `project_locations` table, a five-row form, a filter that matches any of them, and readable names in the activity log. An earlier attempt was cancelled because it needs its own design.

**The question that decides the size:** do the five locations need **separate inspections** (one per site), or is **one inspection per project** still enough? If each location needs its own inspection, the inspection record gains a location field — a much larger change.

**Recommendation:** build it **after** assignment and the emails; one inspection per project for now.

---

## 4. Defaults applied (spot-check these)

These numbers were not in your reply, so the answer proposed in the sheet stands:

| Item | Default taken |
|---|---|
| Q1 | The step order is correct as drawn |
| Q2 | The Head Engineer assigns inspectors |
| Q7 | Assignment happens after validation |
| Q10 | The six emails are the complete set |
| Q11 | The recipients are as listed |
| Q12 | The Head Engineer is **not** copied on emails 1–3 |
| Q13 | Sender is `omemabinibatangas@gmail.com` |
| Q17 | 12 October 2027 |
| Q19 | The four columns and their order are correct |
| Q21 | Amount shown as `Php 1,250,000.00` |
| Q22 | The 11 categories are complete |

Q3 and Q4 are absent from this list on purpose — the sheet contained no proposal for them, so there is nothing to default to (§3, B2 and B3).

---

## 5. What changes in the code, exactly

| Decision | Today | After |
|---|---|---|
| Q15 | First-year validation opens **29** days before the anniversary, later years 30 | **30** every year |
| Q16 | Earliest inspection = completion date **+ 11 months** — which is 28 to 31 days before the anniversary, depending on the month | Exactly **29 days** before the anniversary |
| Q5 | A returned project can be re-submitted unchanged | The server refuses a re-submit with no changes |
| Q8, Q9 | Every inspector sees every inspection | Only assigned work is listed |
| Q6 | Maintenance requires an eligible inspection and starts the next day | *(waiting on B1)* |
| Q20 | Findings blank when there are no remarks | Always shows something *(waiting on B4)* |
| Q23 | Evidence mandatory for Monitoring & Maintenance only | **No change** — already correct |
| Q24, Q26 | Printing is per record; nothing is deleted automatically | Both print views + automatic 30-day deletion *(waiting on B5)* |
| Q25 | Two unused columns still in the database and one read-only field on screen | Removed *(waiting on B6)* |
| Q27 | One barangay per project | Up to five locations *(waiting on B7)* |
| Q14 | No email sending except password reset | Six event emails |

---

## 6. Build order implied by these decisions

1. **Date fix (Q15, Q16)** — smallest, safest, closes a real bug. No dependency on anything else.
2. **Assignment + inspector scope + email 5 (Q2, Q3, Q7, Q8, Q9)** — one deliverable; needs B2.
3. **The five remaining emails (Q10–Q14)** — needs the mailbox credentials in the hosting environment, not in this conversation.
4. **Re-submit change check (Q5)** — small.
5. **Findings rule (Q20)** — needs B4.
6. **Maintenance independence (Q6)** — needs B1.
7. **Print both views (Q24) + archive deletion (Q26)** — one deliverable; needs B5.
8. **Column removal (Q25)** — needs B6.
9. **Five locations (Q27)** — needs B7; last, because it touches the most screens.

Steps 1 and 4 can be done immediately: they are decided, they need no database change, and no further answer from the office.
