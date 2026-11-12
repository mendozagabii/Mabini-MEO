-- Preserve the existing inspection_type enum (including annual follow-up identity)
-- while recording the inspector's displayed inspection type separately.
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS inspection_purpose text;
