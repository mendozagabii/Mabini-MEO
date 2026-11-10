<!-- @mine — PREP ONLY (2026-11-09). Nothing in Supabase has been deleted or inserted yet.
     Waiting for the owner's signal before executing. -->

# 🎬 Demo Data Plan — STATUS: ⏸️ PREPPED, WAITING FOR SIGNAL

## 📌 Standing notes
1. **AI key (noted as requested):** `AI_GATEWAY_API_KEY` **does not exist** anywhere yet
   (not in repo, not in Vercel env, not locally). AI tab (`meta/llama-4-scout` via Vercel AI
   Gateway) stays dormant until the owner creates a key in Vercel AI Gateway and adds it
   to the `mabini-meo` Vercel project. Supabase keys cannot substitute for it.
2. **This plan:** on signal → wipe all test/transactional data in Supabase **except the
   accounts**, then seed **10 synthetic-but-realistic** datasets for the client demo.
3. The ready-to-run script is prepared at `supabase/demo/seed-demo-data.sql`
   (**NOT executed** — will be run in one go when the owner says go).

## 📊 Current inventory (read-only check, 2026-11-09)
| Table | Rows | Verdict on signal |
|---|---:|---|
| `auth.users` / `profiles` | 4 / 4 | ✅ **KEEP** — admin, encoder, inspector, validator |
| `barangays` | 34 | ✅ KEEP (real Mabini barangays — reference data) |
| `project_categories` | 5 | ✅ KEEP (National/Provincial/City/Municipal/Barangay) |
| `contractors` | 4 | ✅ KEEP (already synthetic-sounding PH contractors; reused by seed) |
| `role_module_access` | 14 | ✅ KEEP (role config) |
| `roads` / `projects` | 10 / 10 | 🗑️ DELETE, reseed (10 new) |
| `inspections` / `inspection_items` | 17 / 0 | 🗑️ DELETE, reseed (~18 inspections, each with 7 component items) |
| `maintenance_records` | 0 | ➕ SEED 10 |
| `project_progress_updates` | 0 | ➕ SEED ~8 (for active projects) |
| `ai_analysis_runs` / `ai_priority_results` | 1 / 10 | 🗑️ DELETE, reseed 1 run + 10 results* |
| `attachments` | 0 | ⏭️ Skip (Storage upload not wired in app yet) |
| `activity_logs` | 62 | 🗑️ TRUNCATE (triggers will re-log the seed inserts; then a few demo entries remain) |
| `login_attempts` | 0 | 🗑️ Clear anyway (clean lockout state for demo) |
| `system_settings` | 0 | ⏭️ Leave empty (master code still to be set by Head Engineer in-app) |

\* *Note: the app's AI tab currently reads browser `localStorage`, not these tables —
seeding them only matters if we also wire the AI tab to Supabase. Seeding anyway so the
data is there. If the AI key is added before the demo, better: clear these and generate live.*

## 🧯 Safety before deleting (will do at signal time, in this order)
1. Export a snapshot of the rows about to be deleted (`roads`, `projects`, `inspections`,
   `ai_*`) into backup tables `demo_backup_2026_roads` etc. (kept until demo is done,
   droppable after). So the old seed can be restored if needed.
2. Delete in FK-safe order: `ai_priority_results` → `ai_analysis_runs` → `attachments` →
   `inspection_items` → `inspections` → `maintenance_records` → `project_progress_updates`
   → `activity_logs` → `projects` → `roads`; clear `login_attempts`.
3. Run the seed script as a **single execution** (uses deterministic UUIDs derived from
   `md5('wblrms-demo-…')`, so reruns are reproducible and the wipe+seed is idempotent).
4. Verify: row counts, one login per role, dashboard/inspection/maintenance screens load.

## 🌱 The 10 synthetic datasets (almost-real, Mabini-flavoured)
Roads/projects (one project per road), spread across statuses & conditions so every
chart/filter has data:

| # | Road (Barangay) | Category | Project | Status | Condition | Contractor | Contracted ₱ |
|---|---|---|---|---|---|---:|---:|
| 1 | Poblacion Main Road (Poblacion) | National Road | Concreting & Drainage Rehab | turned_over | good | Batangas Road Builders Inc. | 2,950,000 |
| 2 | Mainaga Access Road (Mainaga) | Provincial Road | Access Road Rehabilitation | completed | fair | Calabarzon Infrastructure Corp. | 1,180,000 |
| 3 | Mainit Barangay Road (Mainit) | Barangay Road | Surface Repair & Drainage | on_track (72%) | poor | Southern Tagalog Contractors | 820,000 |
| 4 | Ligaya Farm Road (Ligaya) | Municipal Road | Full Rehabilitation | planned | bad | Mabini Engineering & Construction | 430,000 |
| 5 | Bagalangit Road (Bagalangit) | Barangay Road | Surface Repair | on_track (65%) | poor | Southern Tagalog Contractors | 650,000 |
| 6 | Anilao East Coastal Road (Anilao East) | Municipal Road | Coastal Road Concreting | completed | good | Batangas Road Builders Inc. | 1,540,000 |
| 7 | Talaga Proper Road (Talaga Proper) | Barangay Road | Road Widening & Shoulder Rehab | delayed (45%) | fair | Calabarzon Infrastructure Corp. | 960,000 |
| 8 | San Teodoro Access Road (San Teodoro) | Barangay Road | Access Road Opening & Gravelling | planned | poor | Mabini Engineering & Construction | 380,000 |
| 9 | Gasang Farm-to-Market Road (Gasang) | Municipal Road | FMR Concreting | on_track (88%) | fair | Southern Tagalog Contractors | 1,120,000 |
| 10 | Solo Barangay Road (Solo) | Barangay Road | Barangay Road Concreting | turned_over | good | Mabini Engineering & Construction | 540,000 |

Supporting data per project (in the prepared script):
- **Inspections (~18):** 1–3 per project, dated 2025–2026, inspector = the seeded
  `inspector` account, each with all **7 component items** (concrete/asphalt/gravel/earth/
  shoulder/side_drain/sidewalk) rated consistently with an overall score (2.8–9.6);
  validation mix: approved / pending / one rejected ("Return for Revision" story for demo).
- **Maintenance (10):** scheduled ×3, in_progress ×2, completed ×4, deferred ×1;
  types routine/preventive/corrective/emergency; costs ₱45,000–₱380,000; completed ones
  have completion dates.
- **Progress updates (~8):** dated reports for the on_track/delayed projects matching
  their completion %.
- **AI results (10):** risk High for the poor/bad roads, Medium for fair, Low for good —
  coherent with conditions so the AI story checks out even before the live AI key arrives.
- Dates, fund sources (National Road Fund, 20% Municipal Development Fund, Provincial
  Development Fund, Barangay Development Fund), PCAB-style amounts and durations are all
  plausible for a Batangas municipality. All names are synthetic; barangays are the real
  34 of Mabini (already in DB).

## ▶️ When the owner says "go", I will:
1. Create the backup snapshot tables (step 1 above).
2. Execute `supabase/demo/seed-demo-data.sql` (wipe + seed, single run).
3. Re-check counts + sample rows, verify logins, and report back with a demo walkthrough
   (which account to use for which screen). No other code changes needed — the deployed
   app reads Supabase directly.
