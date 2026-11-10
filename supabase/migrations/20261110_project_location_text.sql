-- @mine — Store the complete project location independently of its primary barangay.
-- Staged only: do not apply to any database without explicit owner approval.
-- Existing projects keep using the barangay name until their location is edited.
alter table public.projects add column if not exists location text;
