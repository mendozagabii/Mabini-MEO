-- One non-archived Head Engineer profile at a time, including inactive accounts.
-- This fails safely if duplicates already exist; resolve them before applying.
-- Archived former Head Engineers may remain archived but cannot be restored until
-- the current role is released. This index does not enforce at least one account.
create unique index if not exists profiles_one_current_head_engineer
  on public.profiles ((role))
  where role = 'head_engineer' and archived_at is null;
