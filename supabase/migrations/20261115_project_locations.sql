-- Approved 2026-11-12 (WORKFLOW-DECISIONS task 12, formerly step 10): a project
-- covers up to five locations, each a free-text line such as
-- "Sitio Dao, Anilao East, Mabini, Batangas". They are coverage notes, not
-- separate inspections and not extra barangays: projects.barangay_id stays the
-- single barangay the lists and filters read.
--
-- Additive only: nothing dropped, no existing row rewritten. Every project with
-- a barangay receives its current barangay as its first location so the new
-- field is never empty on day one.
create table if not exists public.project_locations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  position smallint not null check (position between 1 and 5),
  label text not null check (length(btrim(label)) > 0 and length(label) <= 500),
  created_at timestamptz not null default now()
);

create unique index if not exists project_locations_project_position_idx
  on public.project_locations (project_id, position);
create index if not exists project_locations_project_id_idx
  on public.project_locations (project_id);

alter table public.project_locations enable row level security;

-- Same shape as the projects policies: every signed-in role may read, while the
-- Encoder and the Head Engineer may write.
create policy project_locations_select on public.project_locations
  for select to authenticated using (current_user_role() is not null);
create policy project_locations_insert on public.project_locations
  for insert to authenticated
  with check (has_role(VARIADIC ARRAY['head_engineer'::user_role, 'encoder'::user_role]));
create policy project_locations_update on public.project_locations
  for update to authenticated
  using (has_role(VARIADIC ARRAY['head_engineer'::user_role, 'encoder'::user_role]))
  with check (has_role(VARIADIC ARRAY['head_engineer'::user_role, 'encoder'::user_role]));
create policy project_locations_delete on public.project_locations
  for delete to authenticated
  using (has_role(VARIADIC ARRAY['head_engineer'::user_role, 'encoder'::user_role]));

insert into public.project_locations (project_id, position, label)
select p.id, 1, btrim(b.name)
from public.projects p
join public.barangays b on b.id = p.barangay_id
where b.name is not null and btrim(b.name) <> ''
on conflict (project_id, position) do nothing;
