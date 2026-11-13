-- Approved 2026-11-12 (WORKFLOW-DECISIONS Q2/Q3/Q7, item 4 of the plan):
-- one inspector per project, assigned by the Head Engineer after validation.
-- Nullable and additive: existing rows stay valid and nothing is backfilled,
-- because a project without an inspector simply has not been assigned yet.
alter table public.projects
  add column if not exists inspector_id uuid references public.profiles(id) on delete set null;

-- The inspector's own work list filters on this column.
create index if not exists projects_inspector_id_idx on public.projects (inspector_id);
