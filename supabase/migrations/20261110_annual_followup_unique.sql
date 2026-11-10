-- @mine — Fix (2026-11-10): duplicate annual follow-up inspections.
--
-- Symptom: a single page load created two follow-up inspections for the same
-- (project, year) — e.g. Poblacion 2025 ×2, 2026 ×2, Solo 2025 ×2, Anilao East 2026 ×2.
--
-- Cause: ensureAnnualFollowUps() does check-then-insert, and /api/local-road and
-- /api/inspections are fetched concurrently on load, so both requests ran the generator
-- before either insert was visible. Nothing at the DB level forbade the duplicate.
--
-- Fix: 1) remove the duplicates that already exist (only untouched placeholders — a row
--          somebody actually inspected is never deleted), keeping the earliest;
--      2) add a partial unique index so the losing racer now gets a constraint error,
--          which ensureAnnualFollowUps() already swallows (`.then(undefined, () => undefined)`).

-- 1) de-duplicate: keep the oldest placeholder per (project_id, annual_follow_up_year)
delete from public.inspections i
using public.inspections j
where i.inspection_type = 'follow_up'
  and j.inspection_type = 'follow_up'
  and i.annual_follow_up_year is not null
  and i.project_id = j.project_id
  and i.annual_follow_up_year = j.annual_follow_up_year
  and i.inspector_id is null
  and i.overall_score is null
  and i.validation_status = 'pending'
  and (i.created_at, i.id) > (j.created_at, j.id);

-- 2) make it impossible from now on
create unique index if not exists inspections_annual_follow_up_uq
  on public.inspections (project_id, annual_follow_up_year)
  where inspection_type = 'follow_up' and annual_follow_up_year is not null;
