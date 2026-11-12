# WBLRMS — Workflow Review Sheet

**System:** Local Road Management System — Office of the Municipal Engineer, Mabini, Batangas
**Version:** 2.0 · 2026-11-12
**Why you are reading this:** so we can check, together, that the system follows the work the way the office really does it — **before** we add the last two big pieces (assigning inspectors, and the email notifications).

> **In one line:** this sheet shows (1) how a project moves through the system, (2) who touches it at each step, (3) what will change for each person, and (4) which decisions belong together. At the end there are **27 short questions**. Answer those and the rest can be built.

**How to read it**

| Section | What it gives you | Read if you are… |
|---|---|---|
| §1–§2 | The system and the four roles | everyone |
| §3 | The flow, step by step | everyone |
| §4 | What changes for **your own** role | the person answering |
| §5–§6 | The emails and the dates | everyone |
| §7 | The two screens we need to confirm | encoder, inspector, validator |
| **§8** | **How the items depend on each other** | **everyone — this is the important one** |
| §9 | What is already known to be missing | everyone (so you don't re-report it) |
| §10–§11 | The 27 questions, and how to answer | everyone |

**Three status words are used throughout:**

- **DONE** — already working in the system today
- **DECIDE** — working, but we need your answer to fix it properly
- **TO BUILD** — not built yet

---

## 1. The system in plain words

The system is where the office records its road work. It holds four kinds of records:

- **Projects** — the road project itself: name, contractor, budget, dates, documents
- **Inspections** — what the road actually looks like when someone goes to see it
- **Validation** — the yearly check that a finished project's details are still correct
- **Maintenance** — repairs done after an inspection found problems

A project does not move randomly. It follows an order: someone writes it down, someone checks it, someone inspects it, and after that it is revisited every year. That order is what §3 describes.

---

## 2. The four roles

| Role | What they can open | What they do |
|---|---|---|
| **Head Engineer** | Dashboard, Analytics, Project, Inspection, Maintenance, AI, System | Watches over everything, manages users, archives records, and **assigns inspectors** (the part we are building) |
| **Encoder** | Dashboard, Project, Maintenance | Writes down the project details, fixes them when returned, records maintenance |
| **Inspector** | Dashboard, Inspection | Goes to the site, fills in the condition of the road, attaches photos |
| **Validator** | Dashboard, Validation | Checks the yearly submission and either approves it or sends it back |

Two things to notice:

- **Nobody has every power.** The Head Engineer cannot write project details; the Encoder cannot approve them; the Inspector cannot schedule repairs.
- **Each person's menu is already limited to their own work.** This part already works.

---

## 3. The flow, step by step

### 3.1 The picture

```
①  Encoder writes the project details
        │
        ▼
②  System opens the validation 30 days before the anniversary
   of the Actual Completion Date   (automatic — nobody clicks)
        │
        ▼
③  Validator checks it
        │
        ├──── returns it for revision ──► ④ Encoder fixes the details
        │                                        │
        │◄───────────────────────────────────────┘
        ▼
⑤  Validator approves it
        │
        ▼
⑥  Head Engineer assigns an inspector              ← NOT BUILT YET
        │
        ▼
⑦  Inspector inspects the road and records the result
        │
        ▼
⑧  If the findings are not all "Good", the inspection can be
   scheduled for maintenance
        │
        ▼
⑨  Maintenance is scheduled, then recorded
        │
        ▼
⑩  Next year the same project comes back at the next anniversary
```

Steps ③ and ④ can repeat. If the validator is satisfied on the first check, the loop is skipped — that is the only difference between "workflow A" (with revision) and "workflow B" (without).

### 3.2 The same flow, with the details

| # | Step | Who | What should happen | Status |
|---|---|---|---|---|
| 1 | Write the project | Encoder | Name, contractor, budget, dates, documents are saved | **DONE** |
| 2 | Validation opens | System | It appears **30 days before** the anniversary of the completion date, every year | **DECIDE** — first year opens 29 days before, later years 30 (§6) |
| 3 | Check it | Validator | Approve, or send it back with remarks | **DONE** |
| 4 | Send it back | Validator | The project returns to the encoder, marked "For Revision" | **DONE** |
| 5 | Fix it | Encoder | The encoder edits the details and it goes back to the validator | **DONE** |
| 6 | Approve it | Validator | The project is marked validated | **DONE** |
| 7 | **Assign an inspector** | Head Engineer | The Head Engineer chooses who will inspect the road | **TO BUILD** |
| 8 | Inspect the road | Inspector | The inspector sees the assigned work, rates the road, adds remarks and photos | **DECIDE** — inspectors see *everything* today, because there is no assignment yet |
| 9 | Save the result | Inspector | The result becomes the project's latest condition | **DONE** |
| 10 | Offer it for maintenance | System / Encoder | Inspections rated Fair, Poor or Bad can be scheduled for repair | **DONE** |
| 11 | Record the repair | Encoder | Maintenance is scheduled with a date, then recorded as done | **DONE** |
| 12 | Repeat next year | System | The project enters validation again at the next anniversary | **DONE** |

**The one step that stops everything:** step 7. Without it, the inspector cannot be told what to inspect, and one of the six emails cannot be sent. Most of §8 is about this step.

---

## 4. What changes for each role

Short version: **every role gains information, one role loses visibility (on purpose), and nobody loses a task they already do.**

### 4.1 Head Engineer

> **Now:** you can see everything, but you cannot tell the system *who* should inspect a road, and you delete old records by hand.
> **After:** you assign the inspector, you get told when there is something to assign, and you can print the summary.

**New**
- **Assign an inspector.** A new button on a validated project. You pick a person; the project moves to that person's list. *(TO BUILD)*
- **"Validated" email.** It tells you a project is ready for assignment without opening the system. *(TO BUILD)*
- **Print the whole overview, and print one year only.** Today only a single record can be printed. *(TO BUILD)*

**Changed**
- **Archived records will expire by themselves.** The screen already says "kept for 30 days, then permanently deleted", but nothing performs the deletion today — so it is done by hand. *(DECIDE — §10 Q26)*
- **Activity logs will show names, not internal IDs.** Project rows are already readable; inspection and maintenance rows still show a code. *(DECIDE)*
- **PCAB License No. and Completion Percentage will disappear** from the project view. The fields are no longer kept up to date. *(DECIDE — Q25)*

**Unchanged**
- User management, analytics, dashboard, archive and permanent delete — all working.

### 4.2 Encoder

> **Now:** you find out that a project came back by looking at the list.
> **After:** the system tells you, by email, at the moment it happens.

**New**
- **"For Revision" email** with the project name. *(TO BUILD)*
- **"Inspection Recorded" email.** It tells you an inspection is done — you are the one who schedules the repair next. *(TO BUILD)*
- **Saving an updated project notifies the validator automatically.** *(TO BUILD)*

**Changed**
- **"For Revision" badge and the validator's remarks** — already there, we keep it.
- **A validated project may be locked** against further edits. *(DECIDE — Q4)*
- **PCAB License No. and Completion Percentage removed** from the form. *(DECIDE — Q25)*
- **Up to 5 locations per project**, and the filter finds the project from any of them. Today there is one barangay per project. *(DECIDE — Q27)*
- **Lists will load faster.** The list currently requests a secure link for every attachment while loading. *(DECIDE)*

**Unchanged**
- Maintenance scheduling: still yours, still only for Fair / Poor / Bad inspections, still starting the day after the inspection.

### 4.3 Inspector

> **Now:** you see every inspection in the municipality, including other people's unfinished work.
> **After:** you see only the work assigned to you — and you are told by email when it arrives.

**New**
- **Only assigned inspections are visible.** This is the biggest change of the four roles. *(TO BUILD — needs §4.1 first)*
- **"Inspector Assigned" email** naming the project. *(TO BUILD)*

**Changed**
- **11 categories to rate:** Concrete, Asphalt, Gravel, Earth, Shoulder, Side Drain, Sidewalk, Drainage, Solar Lights, Slope Protection, Retaining Wall. The last four were added. *(DONE)*
- **Every category needs a rating**, even when there is nothing to report — that is what **N/A** is for. *(DONE)*
- **For Monitoring and Maintenance inspections, a remark *and* at least one attachment** are required for every category that is not N/A. The system refuses to save without them. *(DECIDE — should this apply to all inspection types? Q23)*
- **Findings stay blank while everything is Good.** The summary lists only the categories rated Fair / Poor / Bad, or those with a remark. *(DONE)*

**Unchanged**
- Rating scale **Good / Fair / Poor / Bad / N/A**, with a remark and attachments under each category.
- Your recorded result becomes the project's current condition and opens it for maintenance.

### 4.4 Validator

> **Now:** the queue fills itself, but you have to notice it.
> **After:** the system tells you when there is something to check, and tells the Head Engineer when you approve.

**New**
- **"For Validation" email** when a project enters the queue. *(TO BUILD)*
- **"Project Information Updated" email** when a returned project comes back to you. *(TO BUILD)*

**Changed**
- **The queue will open 30 days before the anniversary, not 29.** *(DECIDE — §6, Q15–Q18)*
- **Approving a project hands it to the Head Engineer automatically.** Today the status changes, but nobody is told. *(DECIDE)*

**Unchanged**
- Two decisions only — **return for revision** or **validate** — and the system checks them on the server, not just on the screen.
- The current year is the working year; earlier years stay as read-only history.

### 4.5 Everyone

| Item | Status |
|---|---|
| Every action is written to the activity log (over 6,700 entries so far) | **DONE** |
| Records are archived first; permanent deletion is the Head Engineer's job and asks for confirmation | **DONE** |
| Each role sees only its own modules in the menu | **DONE** |
| Role limits are also enforced **in the database**, not only in the interface | **DECIDE** — the database-level rule for staff accounts is still missing, so today the interface is the only guard |

---

## 5. The six emails

All six look the same: the office header, a bold **Notification**, one short paragraph, **one** headline, and the footer below.

| # | When it is sent | From → To | The headline |
|---|---|---|---|
| 1 | Encoder submits a project (automatic, 30 days before the first anniversary) | Encoder → Validator | `[Project] – For Validation` |
| 2 | Validator sends it back | Validator → Encoder | `[Project] – For Revision` |
| 3 | Encoder updates a returned project | Encoder → Validator | `[Project] – Project Information Updated` |
| 4 | Validator approves it | Validator → Head Engineer | `[Project] – Validated` |
| 5 | Head Engineer assigns an inspector | Head Engineer → Inspector | `[Project] – Inspector Assigned` |
| 6 | Inspector saves the result | Inspector → Encoder | `[Project] – Inspection Recorded` |

**Email 5 needs step 7 to exist first.** The other five only need the flow that is already built.

**Body — the same for all six:**

> Good day!
> The project details have been successfully submitted, updated, or recorded in the system. Kindly review the details and take the necessary action.

**Footer — the same for all six:**

> Office of the Municipal Engineer · Mabini, Batangas
> This is an automated message. Please do not reply to this email.

**Sender mailbox proposed:** `omemabinibatangas@gmail.com`

---

## 6. The dates

| Rule | Should be | Is today |
|---|---|---|
| Validation opens before the anniversary of the completion date | 30 days before | **29** days in the first year, 30 later |
| An inspection may be dated | 29 days before the anniversary | 30 days |
| Maintenance "Date Started" | from the day **after** the inspection | same — correct |
| Very old dates | dates **before 2000** are rejected | same — correct |

The first two rows look **swapped** between your specification and the code. We need the correct pair from you, for example *"validation 30, inspection 29"*.

**A concrete example to check**

A project completed on **11 November 2026**. Its first validation should appear on:

- **12 October 2027** — if the rule is 30 days before, or
- **13 October 2027** — if the rule is 29 days before.

Which one? (Q17)

---

## 7. The two screens to confirm

### 7.1 The summary table (Inspection → Overview)

| Name of project | Date of inspection | Amount contracted | Findings / Remarks |
|---|---|---|---|
| Poblacion Road | 2027-10-12 | Php 1,250,000.00 | *blank when all categories are Good* |

**The rule to confirm:** if every rated category is **Good**, the Findings column stays **empty**. Findings list only the categories rated Fair / Poor / Bad, or those carrying a remark. A good road should look like a clean line, not a paragraph.

### 7.2 The condition assessment (Inspection form)

- **11 categories**, each rated **Good / Fair / Poor / Bad / N/A**
- Each rating has its own short description, so two inspectors judge the same road the same way
- Under each category: an optional **remark** and optional **attachments** (PDF / JPG / PNG, up to 10 MB each)
- For **Monitoring and Maintenance Inspection**, a remark **and** an attachment are currently required for every category that is not N/A — the server refuses the save otherwise

**The question:** should that evidence rule apply to **all** inspection types, or only to monitoring and maintenance? (Q23)

---

## 8. How the items depend on each other

This is the section that saves time. The 27 questions are not 27 separate jobs — they group into **six clusters**. Answer a cluster's key question and the smaller ones usually answer themselves.

### 8.1 Cluster A — Who assigns whom

**Touches:** Q2, Q3, Q7, Q8, Q9 — and the build of step 7, email 5, and the Inspector's whole screen.

```
   Validator approves  (already works)
            │
            ▼
   Head Engineer assigns an inspector        ← the missing piece
            │
            ├──► Inspector sees only their work   (cannot exist without it)
            ├──► Email 5 "Inspector Assigned"     (cannot exist without it)
            └──► Other inspectors stop seeing it  (cannot exist without it)
```

**What this means:** *assigning* and *seeing only assigned work* are **one job, not two**. We cannot show the inspector a personal list until somebody decides who owns which project. So Q2, Q3, Q8 and Q9 should be answered together.

**If the answer to Q3 is "more than one inspector per project"**, the design changes: the project no longer has *an* inspector, it has *a list* of them — and then email 5 must ask "assigned to whom?", and Q9 ("disappears from the others") means "disappears from *everyone not on that list*".

### 8.2 Cluster B — The dates are a chain, not three settings

**Touches:** Q15, Q16, Q17, Q18 — and the moment email 1 is sent.

```
   Anniversary of completion
            │
            ├── minus 30 (or 29) days ──► Validation opens ──► Email 1 "For Validation"
            │
            └── minus 29 (or 30) days ──► Earliest allowed inspection date
                                                    │
                                                    └── plus 1 day ──► Maintenance may start
```

**What this means:** these three dates are one chain. Change the first number and the inspection date and the maintenance start date move with it. That is why we ask for a **pair** of numbers, not one.

**Related:** if the first year and the later years use different offsets (Q18 = "only the first year"), the flow chart in §3.1 is right but the table in §6 needs a second line — the system will then show two different dates for the same project in different years.

### 8.3 Cluster C — How much proof an inspection needs

**Touches:** Q22, Q23 — and it quietly affects storage, speed, and archiving.

- Requiring a remark **and** an attachment for **every** non-N/A category means roughly **10 photos per inspection** instead of 2–3.
- That makes three other items more urgent: **attachment upload speed** (§4.2), the **30-day archive deletion** (Q26), and the **printable yearly report** (Q24).
- If photos are permanent evidence, they must **not** be deleted after 30 days — see the conflict in §8.5.

**So Q23 is not only about the form.** It decides how much the system stores and how long it must keep it.

### 8.4 Cluster D — The six emails are the flow, read aloud

**Touches:** Q1, Q10, Q11, Q12, Q13, Q14.

**What this means:** each email is **one step** of §3.1. If a step changes, its email changes. If a step is removed, its email disappears.

- Email 1 → step 2 · Email 2 → step 4 · Email 3 → step 5 · Email 4 → step 6 · Email 5 → step 7 · Email 6 → step 9.
- **Email 5 is the only one blocked by missing work.** The other five can be built on the flow as it stands.
- **Q14 (an in-system bell instead of email) is an alternative, not an addition.** If a bell inside the system is enough, we do not need the mail setup at all — that would remove the mailbox question (Q13) and the hosting configuration from the work.

### 8.5 Cluster E — The summary, the print, and the archive **conflict**

**Touches:** Q19, Q20, Q21, Q22, Q24, Q26.

```
   Summary columns (Q19, Q21)
            │
            ▼
   Findings rule: blank when all Good (Q20) ──► what the printed report shows (Q24)
            │
            ▼
   Printed report of a PAST year  ✕  records deleted after 30 days (Q26)
```

**The conflict, stated plainly:** if archived records are permanently deleted after 30 days, then **you cannot print last year's summary next year** — the data is gone. Today nobody notices, because printing past years is not built. Once printing exists, you must choose:

- **keep the records** (and drop the 30-day deletion), so history is printable, **or**
- **keep the 30-day deletion** (and accept that only the current and recent records can be printed), **or**
- **keep the summary, delete only the attached files** — a middle option: the row with its figures and findings survives, the photos do not.

We recommend the third, but it is the office's call. **Q24 and Q26 must be answered together.**

### 8.6 Cluster F — Cleanup items are independent

**Touches:** Q25, Q27, and the "reading" items (activity log names, lock after validation).

- **Q25 (remove PCAB License No. and Completion Percentage)** — safe and independent. Nothing else depends on it. Answering "yes" only removes two unused fields.
- **Q27 (5 locations per project)** — independent, but bigger than it sounds: it touches the project form, the project filter and the activity log. It was attempted once and cancelled, because it needs its own design.
- **The activity-log names** and **the lock after validation** are cosmetic/behavioural and can be done any time.

### 8.7 What unblocks what — the shortest path

| If you answer… | We can then build… | Which also settles |
|---|---|---|
| **Q2, Q3, Q7, Q8, Q9** | Step 7 (assign inspector) + email 5 + the Inspector's personal list | Inspector's screen, the "for everyone" list behaviour, the email recipient |
| **Q15, Q16, Q17, Q18** | The correct yearly dates | When email 1 is sent; when the inspection is allowed; when maintenance may start |
| **Q23** | The evidence rule on the inspection form | How much is stored, how fast lists load, how long records must be kept |
| **Q10–Q14** | The five emails that are not blocked | Whether we need mail hosting at all (if Q14 = bell in the system) |
| **Q24 + Q26** | The printable reports | How long history survives |
| **Q19–Q22** | The summary table | What the printed report looks like |
| **Q4, Q25, Q27** | The cleanup items | Nothing else — these stand alone |

**Practical advice:** you can leave Q21, Q22, Q25 and Q27 for later. The four rows at the top of that table are the ones that hold up the rest.

---

## 9. Already known — please do not report these as new problems

1. **Assigning inspectors is not built.** Until it is, inspectors see all inspections. *(step 7)*
2. **Email notifications are not built.** The only email the system sends today is the password reset.
3. **The 30-day archive deletion does not happen automatically.** The text on screen promises it; the permanent delete is a manual Head Engineer action with a confirmation.
4. **One location per project.** Up to 5 is not supported yet; the filter uses the single recorded barangay.
5. **Activity logs** name projects correctly, but inspection and maintenance rows show an internal code instead of a name.
6. **PCAB License No. and Completion Percentage** are hidden from the screens but still exist in the database.
7. **Printing is per record only** — one inspection, or one maintenance. "Print the whole overview" and "print one year only" do not exist yet.

---

## 10. The 27 questions

> **Answers were collected on 2026-11-12.** The recorded decisions — and the seven items still open — are in `docs/WORKFLOW-DECISIONS.md`. Keep this section for reference; do not answer it again.

Write **Yes / No / Not sure** and one line of explanation. The bracket after each question shows the other questions it affects, so you can see what your answer settles.

### A. The flow
1. Is the order *write → check → (return → fix → check) → assign → inspect → record → schedule → repair* correct? ☐ Yes ☐ No *(affects Q10)*
2. Is the **Head Engineer** the right person to assign inspectors? ☐ Yes ☐ No — if not, who? *(affects Q7)*
3. Can a project need **more than one** inspector (two sections, or a re-inspection)? ☐ Yes ☐ No *(affects Q8, Q9, email 5)*
4. After a project is **validated**, may the encoder still edit it? ☐ Yes ☐ No *(standalone)*
5. When a project is returned, must the encoder change something before re-submitting? ☐ Yes ☐ No *(affects email 3)*
6. Does maintenance always follow an inspection, or can it be scheduled on its own? ☐ Always follows ☐ Can be independent

### B. Assignment
7. Assignment happens **after validation** — correct? ☐ Yes ☐ No, it happens: ______
8. Should an inspector see **only** their assigned work, or all inspections in their barangay? ______ *(affects Q9)*
9. When someone is assigned, should the project disappear from the other inspectors' lists at once? ☐ Yes ☐ No

### C. The emails
10. Are the six emails in §5 the complete set? ☐ Yes ☐ No — missing: ______ *(affects Q1)*
11. Are the recipients correct? ______
12. Should the Head Engineer also receive a copy of emails 1–3? ☐ Yes ☐ No
13. Is `omemabinibatangas@gmail.com` the correct sender mailbox? ☐ Yes ☐ No
14. Should there also be a notification **inside the system** (a bell), or is email enough? ______ *(if "bell", Q13 may become unnecessary)*

### D. The dates
15. Validation opens **____** days before the anniversary. *(affects Q17)*
16. An inspection may be dated **____** days before the anniversary. *(affects Q17)*
17. For the example in §6, the correct date is **________** (12 or 13 October 2027).
18. Do these same numbers apply to **every** year, or only the first? ______ *(affects §6 table)*

### E. The screens
19. Are the four summary columns correct, and in the right order? ☐ Yes ☐ No — correct order: ______ *(affects Q24)*
20. Should Findings stay blank when everything is Good? ☐ Yes ☐ No *(affects Q24)*
21. Should the amount show as `Php 1,250,000.00`? ☐ Yes ☐ No — preferred: ______
22. Are the 11 categories complete? ☐ Yes ☐ No — add/remove: ______ *(affects Q23)*
23. Should a remark **and** an attachment be required for every category that is not N/A? ☐ Always ☐ Only for monitoring & maintenance ☐ Never *(affects Q24, Q26)*
24. Which reports must be printable? ☐ Overview, all records ☐ Overview, one year only ☐ Both ☐ Neither *(answer with Q26)*

### F. Cleanup
25. May the **PCAB License No.** and **Completion Percentage** columns be removed? (the data is no longer maintained) ☐ Yes ☐ No *(standalone)*
26. Should archived records really be **deleted automatically after 30 days**? ☐ Yes ☐ No — keep for: ______ *(answer with Q24 — see §8.5)*
27. Is a maximum of **5 locations** per project correct? ☐ Yes ☐ No — correct maximum: ______ *(standalone)*

---

## 11. How to send your answers back

Reply with the numbers only:

```
2. Yes
3. Yes — one road can have two inspectors (north and south)
15. 30
16. 29
17. 12 October 2027
23. Only for monitoring & maintenance
24. Both
26. No — please keep the record forever, only the photos can go
```

**Please add a screenshot whenever the answer is "No"**, and say what you expected to see instead. A screenshot explains in one image what takes three paragraphs.

**Answer these first if you are short on time:** Q2, Q3, Q7, Q8, Q9 (assignment — the missing step), then Q15–Q18 (the dates). Everything else can follow.

---

*End of sheet — thank you for reviewing. Version 2.0, 2026-11-12.*
