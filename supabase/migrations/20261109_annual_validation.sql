-- @mine — applied 2026-11-09 via Supabase migration
-- "annual_validation_entries_and_followup_year" (Phase 2.1).
-- Adds the missing schema for annual validation / follow-up entries and the
-- follow-up year column on inspections. See docs/SUPABASE-MIGRATION.md.

CREATE TABLE IF NOT EXISTS public.annual_validation_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  year integer NOT NULL,
  due_date date,
  result public.validation_status NOT NULL DEFAULT 'pending',
  remarks text,
  validated_by uuid REFERENCES public.profiles(id),
  validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS annual_validation_entries_project_year_key
  ON public.annual_validation_entries (project_id, year);

ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS annual_follow_up_year integer;

ALTER TABLE public.annual_validation_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY annual_validation_select ON public.annual_validation_entries
  FOR SELECT USING (current_user_role() IS NOT NULL);
CREATE POLICY annual_validation_insert ON public.annual_validation_entries
  FOR INSERT WITH CHECK (has_role(VARIADIC ARRAY['head_engineer'::user_role, 'validator'::user_role]));
CREATE POLICY annual_validation_update ON public.annual_validation_entries
  FOR UPDATE USING (has_role(VARIADIC ARRAY['head_engineer'::user_role, 'validator'::user_role]))
  WITH CHECK (has_role(VARIADIC ARRAY['head_engineer'::user_role, 'validator'::user_role]));
CREATE POLICY annual_validation_delete ON public.annual_validation_entries
  FOR DELETE USING (has_role(VARIADIC ARRAY['head_engineer'::user_role]));
