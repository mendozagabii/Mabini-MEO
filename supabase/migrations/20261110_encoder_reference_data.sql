-- @mine — 2026-11-10
-- Encoder role: allow adding local road projects (and therefore archiving them).
--
-- Why this is needed:
--   * `roads.barangay_id` is NOT NULL.
--   * The only write policy on `barangays` was `barangays_admin` (FOR ALL, head_engineer only).
--     When an encoder typed a barangay that did not exist yet, `resolveBarangayId()` could not
--     insert it and returned null → the roads INSERT died on the NOT NULL constraint → the API
--     answered 500 "Unable to create this project. Your role may not permit it."
--   * `project_categories` had the same shape (`categories_admin`, head_engineer only).
--
-- Permissive policies are OR-ed together, so these INSERT policies simply widen the door for
-- the encoder role; the existing head_engineer policies keep working untouched.
-- UPDATE / DELETE on reference data deliberately stay head_engineer-only (shared vocabularies
-- should not be renamed or removed by accident).
--
-- Applied live on project jowcyoziuqzoezxboffx; verified by simulating the encoder JWT:
-- a barangay + road pair inserts successfully inside a transaction that was rolled back.

drop policy if exists "Barangays: encoders add" on public.barangays;
create policy "Barangays: encoders add" on public.barangays
  for insert to authenticated
  with check (public.has_role('head_engineer'::public.user_role, 'encoder'::public.user_role));

drop policy if exists "Categories: encoders add" on public.project_categories;
create policy "Categories: encoders add" on public.project_categories
  for insert to authenticated
  with check (public.has_role('head_engineer'::public.user_role, 'encoder'::public.user_role));
