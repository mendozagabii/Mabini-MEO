-- @mine — staged only; do not apply without the owner's database approval.
-- Delete in the application is a recoverable UPDATE of archived_at. Staff
-- already edit these records; explicitly allow those same roles to archive them.
-- These additive policies do not grant permanent DELETE.
drop policy if exists "Staff: encoder updates maintenance" on public.maintenance_records;
create policy "Staff: encoder updates maintenance" on public.maintenance_records
  for update to authenticated
  using (public.has_role('encoder'::public.user_role))
  with check (public.has_role('encoder'::public.user_role));

drop policy if exists "Staff: inspector updates inspections" on public.inspections;
create policy "Staff: inspector updates inspections" on public.inspections
  for update to authenticated
  using (public.has_role('inspector'::public.user_role))
  with check (public.has_role('inspector'::public.user_role));

-- Project archive is also an UPDATE. Existing road/project write policies are
-- retained; this explicitly permits encoders to update their project records.
drop policy if exists "Staff: encoder updates projects" on public.projects;
create policy "Staff: encoder updates projects" on public.projects
  for update to authenticated
  using (public.has_role('encoder'::public.user_role))
  with check (public.has_role('encoder'::public.user_role));
