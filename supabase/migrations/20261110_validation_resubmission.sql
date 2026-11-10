-- Tracks encoder resubmission without overwriting the validator's decision or remarks.
-- Do not apply to the shared production database without explicit approval.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS validation_resubmitted_at timestamptz;
ALTER TABLE public.annual_validation_entries ADD COLUMN IF NOT EXISTS resubmitted_at timestamptz;
