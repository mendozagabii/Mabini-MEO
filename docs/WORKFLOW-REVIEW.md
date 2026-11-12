# WBLRMS — End-to-End Workflow Review Sheet

**System:** Local Road Management System (WBLRMS) — Office of the Municipal Engineer, Municipality of Mabini, Batangas
**Version of this sheet:** 1.0 · 2026-11-12
**Purpose:** To confirm, step by step, that the workflow the system implements is the workflow the office actually needs — **before** the remaining features (inspector assignment and email notifications) are built on top of it.

> **How to use this sheet**
> Read sections 1–8 first. Then answer the checklist in **section 10**. For each item write **Yes / No / Not sure** and one line of explanation. Where a screenshot helps, attach it. Do not treat section 9 as bugs — those are known, already-listed gaps.

---

## 1. What the system is

WBLRMS is a web application used by the Municipal Engineering Office to record:

- **Local road projects** (project details, contractor, budget, dates, attachments)
- **Inspections** (field assessment of a road/project, with evidence)
- **Annual validation** of completed projects (every year after completion)
- **Maintenance** activities (scheduling and recording)
- **Users, roles, activity logs and archived records**

Four user roles operate it. A project moves through the roles in a fixed order, which is what sections 3–6 describe.

---

## 2. Roles

| Role | Modules they can open | What they do |
|---|---|---|
| **Head Engineer** | Dashboard, Analytics, Project, Inspection, Maintenance, AI, System | Supervises. Views records, manages users, archives/permanently deletes records, and (proposed) **assigns inspectors**. Cannot create or edit project/inspection/maintenance records. |
| **Encoder** | Dashboard, Project, Maintenance | Encodes project details, updates returned projects, records maintenance. |
| **Inspector** | Dashboard, Inspection | Conducts inspections, records the condition assessment and evidence. |
| **Validator** | Dashboard, Validation | Reviews annual submissions: **Validated** or **Return for Revision**. |

---

## 3. The flow we are proposing

### Workflow A — with a return for revision

```
Encoder encodes the project details
        │
        ▼
System opens the validation task 30 days before the anniversary of the
Actual Completion Date (automatic)
        │
        ▼
Validator reviews ──► RETURN FOR REVISION ──► Encoder updates the project
        │                                            │
        │◄───────────────────────────────────────────┘
        ▼
Validator marks it VALIDATED
        │
        ▼
Head Engineer assigns an INSPECTOR
        │
        ▼
Inspector conducts the inspection and records the results
        │
        ▼
The inspection becomes available for MAINTENANCE scheduling
(only when findings are not all "Good")
        │
        ▼
Maintenance is scheduled and recorded
        │
        ▼
Next year: the cycle repeats at the next anniversary
```

### Workflow B — no revision needed

Same sequence, skipping the *Return → Update → Re-submit* loop.

**The single question this sheet exists to answer:** is this sequence, and the actor at each step, correct?

---

## 4. Step-by-step detail

Status legend: ✅ implemented · ⚠️ implemented but different from the description here · ❌ not built yet

| # | Step | Who | What should happen | Status today | What we need you to confirm |
|---|---|---|---|---|---|
| 1 | Encode project | Encoder | Project details, contractor, budget, dates, attachments are saved | ✅ | Are these the right fields, in the right order? |
| 2 | Validation trigger | System | A validation task appears **30 days before** the anniversary of the Actual Completion Date, every year | ⚠️ first year opens **29** days before; later years **30** | Which is correct — 29 or 30? (see §6) |
| 3 | Review | Validator | Approve, or return with remarks | ✅ | Should the validator also be able to edit, or only decide? |
| 4 | Return for revision | Validator | Project goes back to the encoder with remarks, and shows a "For Revision" badge | ✅ | Is a badge enough, or is a notification also required? (see §5) |
| 5 | Update and re-submit | Encoder | Encoder edits the project; it returns to the validator automatically | ✅ | Should the encoder be able to re-submit without changing anything? |
| 6 | Validate | Validator | Project is marked validated; it moves on | ✅ | Should a validated project be locked against further encoder edits? |
| 7 | **Assign inspector** | Head Engineer | Head Engineer picks an inspector from a list; only that inspector sees the project | ❌ **not built** | Is this the right step and the right person? Can one inspector be assigned per project, or several? |
| 8 | Inspection | Inspector | Inspector sees only assigned work, records the condition assessment with evidence | ⚠️ inspectors see **all** inspections today | What should an inspector see before assignment exists? |
| 9 | Record results | Inspector | The inspection is saved and becomes the project's latest condition | ✅ | Should the encoder be notified when results are recorded? |
| 10 | Maintenance hand-off | Encoder | Inspections rated Fair / Poor / Bad become available for maintenance scheduling | ✅ | Should maintenance be scheduled by the encoder or the head engineer? |
| 11 | Maintenance | Encoder | Maintenance is scheduled and later recorded | ✅ | Are the maintenance fields and statuses correct? |
| 12 | Next cycle | System | The project re-enters validation at the next anniversary | ✅ | Does the yearly cycle start again from step 2? |

---

## 5. Email notifications (proposed)

Six events would send one email each. Every email uses the same design: the office header, a bold **Notification** heading, the short body, **one** event headline, and the standard footer.

| # | Event | From | To | Headline in the email |
|---|---|---|---|---|
| 1 | Encoder submits a project (automatic, 30 days before the first anniversary) | Encoder | Validator | `[Project Name] – For Validation` |
| 2 | Validator returns the project | Validator | Encoder | `[Project Name] – For Revision` |
| 3 | Encoder updates a returned project | Encoder | Validator | `[Project Name] – Project Information Updated` |
| 4 | Validator validates the project | Validator | Head Engineer | `[Project Name] – Validated` |
| 5 | Head Engineer assigns an inspector | Head Engineer | Inspector | `[Project Name] – Inspector Assigned` |
| 6 | Inspector records the results | Inspector | Encoder | `[Project Name] – Inspection Recorded` |

**Body text (same for all six):**

> Good day!
> The project details have been successfully submitted, updated, or recorded in the system. Kindly review the details and take the necessary action.

**Footer (same for all six):**
> Office of the Municipal Engineer · Mabini, Batangas
> This is an automated message. Please do not reply to this email.

**Sender mailbox proposed for the system:** `omemabinibatangas@gmail.com`
**Questions:** Is the **To** recipient in each row correct? Should anyone be **CC'd** (for example the Head Engineer on events 1–3)? Is one email per event enough, or should a daily summary also be sent?

---

## 6. Date rules

| Rule | Intended value | In the system today |
|---|---|---|
| Validation opens before the anniversary of the Actual Completion Date | **30 days** before | **29 days** in the first year, 30 days in later years |
| Inspection date allowed | **29 days** before the anniversary | 30 days |
| Maintenance "Date Started" | allowed from **1 day after** the inspection date | ✅ same |
| Very old dates | dates **before 2000** are rejected | ✅ same |

**Decision needed:** the validation/inspection values above appear **swapped** between the specification and the implementation. Please state the correct pair, e.g. *"validation = 30, inspection = 29"*.

**Worked example to check:** a project completed **11 November 2026** — should its first validation appear on **12 October 2027** (30 days before) or **13 October 2027** (29 days before)?

---

## 7. Screen specifications to review

**A. Summary / Overview table (Inspection module)**

Columns, in order:

| Name of project | Date of inspection | Amount contracted | Findings / Remarks |
|---|---|---|---|
| Poblacion Road | 2027-10-12 | Php 1,250,000.00 | *blank when every category is Good* |

Rule to confirm: **if all rated categories are "Good", the Findings column stays empty.** Findings only list the categories that were rated Fair / Poor / Bad or that carry a remark.

**B. Inspection condition assessment (Inspection form)**

- **11 categories:** Concrete, Asphalt, Gravel, Earth, Shoulder, Side Drain, Sidewalk, **Drainage**, **Solar Lights**, **Slope Protection**, **Retaining Wall**.
- Each category is rated **Good / Fair / Poor / Bad / N/A**, with a description of what each rating means.
- Under each category: an optional **remark** and optional **attachments** (PDF / JPG / PNG, 10 MB each).
- For **"Monitoring and Maintenance Inspection"**, the system currently requires a remark **and at least one attachment** for every category that is not N/A.
- **Confirm:** should that evidence rule apply to all inspection types, or only to the monitoring/maintenance type?

---

## 8. What will be adjusted, per role

The table below is what **each role** will gain, lose or see differently once this flow is finalised. It is the practical counterpart of §4: the same work, seen from the person doing it.

Status legend as before: ✅ already in place · ⚠️ partly in place / needs a decision · ❌ to be built

### 8.1 Head Engineer

*Net effect:* gains the assignment step and the printable reports; stops hand-deleting archived records.

| Adjustment | Where it is seen | Why | Status |
|---|---|---|---|
| **Assign an inspector** to a validated project — pick a person, the project moves to that inspector's list | Project detail + Inspection list: a new **Assign Inspector** action | This is step 7, the missing link that currently blocks Workflow A and the assignment email | ❌ |
| Receives a **"Validated"** email when a validator approves a project | Email inbox | Tells them there is something to assign without opening the system | ❌ |
| **Print the whole overview**, and print **one year only** | Inspection → Overview: report/print buttons | The board and the Mayor's office ask for a yearly summary; only single records can be printed today | ❌ |
| The **30-day archive rule becomes real** — archived records disappear on their own | System → Archived Records | The screen already promises "kept 30 days, then permanently deleted", but nothing performs the deletion, so it is done by hand today | ⚠️ |
| Activity logs show **project / inspection / maintenance names** instead of internal IDs | System → Activity Logs | Auditing is unreadable today for inspection and maintenance rows | ⚠️ |
| **PCAB License No.** and **Completion Percentage** disappear from the project view | Project detail | The fields are no longer maintained, but the columns still exist | ⚠️ |
| No change to user management, analytics or the dashboard | — | Already working | ✅ |

### 8.2 Encoder

*Net effect:* gets told when a project comes back or when an inspection has been recorded, instead of finding out by checking the list.

| Adjustment | Where it is seen | Why | Status |
|---|---|---|---|
| Receives a **"For Revision"** email with the project name | Email inbox | The return currently shows only as a badge in the list | ❌ |
| Receives an **"Inspection Recorded"** email once the inspector saves results | Email inbox | Closes the loop; the encoder is the one who schedules maintenance next | ❌ |
| Re-submitting an updated project **automatically notifies the validator** | Project form → Save | Removes the "did they see it?" follow-up | ❌ |
| Sees a **"For Revision"** badge and the validator's remarks before editing | Project list → project detail | Already implemented; being kept as-is | ✅ |
| The project may be **locked after validation** — no further encoder edits | Project form | Prevents editing a record that has already been approved (needs the answer to item 4) | ⚠️ |
| **PCAB License No.** and **Completion Percentage** removed from the form | Project form | Duplicated from 8.1 | ⚠️ |
| Up to **5 locations** per project, and the filter matches any of them | Project form + project list filter | Today one barangay per project; the multi-location rework was cancelled once already | ⚠️ |
| Maintenance scheduling stays the encoder's job, still only for Fair / Poor / Bad inspections, still starting from the day after the inspection | Maintenance module | Already correct | ✅ |
| Lists load faster (attachments no longer fetched row by row) | Project list, Inspection list | The current list view requests a secure link per attachment while loading | ⚠️ |

### 8.3 Inspector

*Net effect:* the biggest change of the four roles — the inspector stops seeing the whole municipality and starts seeing a worklist.

| Adjustment | Where it is seen | Why | Status |
|---|---|---|---|
| **Only assigned inspections are visible**; the rest of the module is out of reach | Inspection module, first screen | Today every inspector sees every inspection, including other people's unfinished work | ❌ |
| Receives an **"Inspector Assigned"** email naming the project | Email inbox | The work arrives by email instead of by refreshing the list | ❌ |
| Records the assessment across the **11 categories** — Concrete, Asphalt, Gravel, Earth, Shoulder, Side Drain, Sidewalk, Drainage, Solar Lights, Slope Protection, Retaining Wall | Inspection form | Four categories were added (Drainage, Solar Lights, Slope Protection, Retaining Wall) | ✅ |
| Rates each category **Good / Fair / Poor / Bad / N/A**, with a remark and attachments underneath | Inspection form | Unchanged in shape | ✅ |
| For **Monitoring and Maintenance Inspection**, a remark **and at least one attachment** are required for every category that is not N/A | Inspection form, on save | Evidence is enforced by the server, not just the screen — the save is refused if it is missing | ⚠️ decide whether this should apply to all inspection types (item 23) |
| A rating must be given for **every** category, even when there is nothing to report (that is what **N/A** is for) | Inspection form, on save | Prevents half-finished assessments being saved | ✅ |
| Findings for a project stay **blank while everything is Good** | Inspection → Overview summary table | Keeps the summary readable: only Fair / Poor / Bad and remarked categories are listed | ✅ |
| Recorded results become the project's current condition and open it for maintenance scheduling | Inspection list → Maintenance | Already wired | ✅ |

### 8.4 Validator

*Net effect:* the queue arrives on a fixed date each year, and the hand-offs no longer depend on somebody remembering to say so.

| Adjustment | Where it is seen | Why | Status |
|---|---|---|---|
| Receives a **"For Validation"** email when a project enters the queue (automatic, 30 days before the first anniversary) | Email inbox | The queue fills itself; the validator no longer has to look for it | ❌ |
| Receives a **"Project Information Updated"** email when a returned project is re-submitted | Email inbox | Makes the second review impossible to miss | ❌ |
| The queue opens **30 days before** the anniversary instead of **29** (needs the answer to items 15–18) | Validation module | The specification and the code disagree by one day | ⚠️ |
| **Returns a project for revision** with remarks, or **validates** it — two decisions, nothing else | Validation module | Already implemented, including the server-side check | ✅ |
| Validating a project **hands it to the Head Engineer automatically** | Validation module → Project | Today it simply changes status; nothing tells the head engineer | ⚠️ |
| Works on the current year only; earlier years stay read-only history | Validation module, year selector | Keeps the yearly cycle from being reopened by accident | ✅ |

### 8.5 All roles (system-wide)

| Adjustment | Why | Status |
|---|---|---|
| Every action is written to the activity log | Already working — 6,700+ entries recorded | ✅ |
| Role restrictions are also enforced **at the database level**, not only in the interface | The database policies for staff-level access are still missing, so today the interface is the only guard | ⚠️ |
| Records are never hard-deleted by accident: archive first, permanent deletion only by the Head Engineer with a confirmation | Already implemented | ✅ |
| Each role still sees only its own modules in the menu | Already implemented | ✅ |

---

## 9. Known gaps — do not report these as new bugs

1. **Inspector assignment does not exist yet** (step 7). Until it is built, inspectors see all inspections.
2. **Email notifications are not built yet.** The only email the system sends today is the password-reset email.
3. **Archived records:** the screen says *"kept for 30 days, then automatically and permanently deleted"*, but no automatic deletion job exists yet. Deleting permanently is a manual, Head-Engineer-only action with a confirmation prompt.
4. **One location per project.** Up to 5 locations per project is not supported yet; the filter matches the single recorded barangay.
5. **Activity logs** name projects correctly, but inspection and maintenance entries show an internal ID instead of a readable name.
6. **PCAB License No. and Completion Percentage** are hidden in the screens but still exist as database columns.
7. **Printing** exists per record (a single inspection or a single maintenance record). "Print the whole overview" and "print one year only" are not built yet.

---

## 10. Checklist — please answer these

### A. The flow
1. Is the order *Encode → Validate → (Return → Update → Validate) → Assign → Inspect → Record → Schedule → Maintenance* correct? ☐ Yes ☐ No
2. Is the **Head Engineer** the correct person to assign inspectors? ☐ Yes ☐ No — if not, who?
3. Can a project need **more than one** inspector (e.g. two sections, or a re-inspection)? ☐ Yes ☐ No
4. After a project is **validated**, may the encoder still edit it? ☐ Yes ☐ No
5. When a validation is returned, must the encoder change something before re-submitting? ☐ Yes ☐ No
6. Does maintenance always follow an inspection, or can it be scheduled independently? ☐ Always follows ☐ Can be independent

### B. Assignment
7. Assignment happens **after validation** — correct? ☐ Yes ☐ No, it happens: ______
8. Should an inspector see **only** assigned inspections, or all inspections of their barangay? ______
9. When an inspector is assigned, should the project disappear from other inspectors' lists immediately? ☐ Yes ☐ No

### C. Notifications
10. Are the six events in §5 the complete set? ☐ Yes ☐ No — missing: ______
11. Are the recipients correct? ______
12. Should the Head Engineer receive a copy of the first three events? ☐ Yes ☐ No
13. Is `omemabinibatangas@gmail.com` the correct sender mailbox? ☐ Yes ☐ No
14. Should a notification also appear **inside the system** (a bell/inbox), or is email enough? ______

### D. Dates
15. Validation opens **____** days before the anniversary.
16. Inspection is allowed **____** days before the anniversary.
17. For the example in §6, the date should be **____** (12 or 13 October 2027).
18. Do these same day-offsets apply to **every** year, or only the first? ______

### E. Screens and reports
19. Are the four summary columns correct and in the right order? ☐ Yes ☐ No — correct order: ______
20. Should Findings stay blank when everything is Good? ☐ Yes ☐ No
21. Should amount contracted show as `Php 1,250,000.00`? ☐ Yes ☐ No — preferred format: ______
22. Are the 11 assessment categories complete? ☐ Yes ☐ No — add/remove: ______
23. Should remark + attachment be required for every category that is not N/A? ☐ Always ☐ Only for monitoring & maintenance inspections ☐ Never
24. Which reports must be printable? ☐ Overview — all records ☐ Overview — one year only ☐ Both ☐ Neither

### F. Data cleanup
25. May the database columns **PCAB License No.** and **Completion Percentage** be removed? (the data in them is no longer maintained) ☐ Yes ☐ No
26. Should archived records really be deleted automatically after **30 days**? ☐ Yes ☐ No — retention: ______
27. Is a maximum of **5 locations** per project correct? ☐ Yes ☐ No — correct maximum: ______

---

## 11. How to send your answers back

Reply with the item numbers only, for example:

```
1. Yes
3. Yes — one road can have two inspectors (north and south sections)
15. 30
17. 12 October 2027
21. No — show "₱1,250,000.00"
```

Add a screenshot whenever the answer is "No", and describe what you expected to see instead. Answers to section D and items 7–9, 23 and 26 are the ones that unblock the remaining development, so please prioritise those.
