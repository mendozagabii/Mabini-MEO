-- Approved: retain existing rows while allowing maintenance to be scheduled
-- before its editable activity dates have been entered.
alter table public.maintenance_records add column if not exists start_date date;
alter table public.maintenance_records alter column scheduled_date drop not null;
