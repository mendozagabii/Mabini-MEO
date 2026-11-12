-- @mine — step 9, the last part of "export → hide → drop" (WORKFLOW-DECISIONS B6).
--
-- DROPS THREE COLUMNS. Do not apply this until:
--   1. the Head Engineer has downloaded the CSV from
--      Project Management → "Retired fields (CSV)", and
--   2. HEAD has committed to dropping the data (this cannot be undone).
--
-- pcab_license_no lives on contractors (one license per firm), not per project,
-- and two views read the projects columns, so the view is rebuilt first.
--
-- Nothing in the application reads or writes these columns any more: the app stopped
-- writing them earlier, and step 9 removed the reads (src/lib/supabase-data.ts) and
-- the last two boxes on the project detail screen (LocalRoadList.tsx).
--
-- A copy of the old values also survives in public.demo_backup_2026_projects.

begin;

-- 1. The overview view reads both project columns, so it is rebuilt without them.
drop view if exists public.v_project_overview;

create view public.v_project_overview as
select p.id as project_id,
       p.project_name,
       rd.id as road_id,
       rd.road_network_id,
       rd.road_name,
       b.name as barangay,
       coalesce(pc.name, p.category_other) as category,
       p.status,
       p.contracted_amount,
       c.name as contractor_name,
       rd.current_condition,
       rd.last_inspection_date,
       coalesce(m.cnt, 0::bigint) as maintenance_count,
       coalesce(m.total_cost, 0::numeric) as maintenance_cost,
       coalesce(i.cnt, 0::bigint) as inspection_count,
       p.validation_status
  from public.projects p
  join public.roads rd on rd.id = p.road_id
  left join public.barangays b on b.id = coalesce(p.barangay_id, rd.barangay_id)
  left join public.project_categories pc on pc.id = p.category_id
  left join public.contractors c on c.id = p.contractor_id
  left join lateral (
    select count(*) as cnt, sum(maintenance_records.cost) as total_cost
      from public.maintenance_records
     where maintenance_records.project_id = p.id
  ) m on true
  left join lateral (
    select count(*) as cnt
      from public.inspections
     where inspections.project_id = p.id
  ) i on true
 where p.archived_at is null;

-- 2. Completion Percentage and Actual Project Cost (both places: form and view are
--    already gone from the app). Amount Contracted stays, as decided.
alter table public.projects drop column if exists completion_percentage;
alter table public.projects drop column if exists adjusted_project_cost;

-- 3. PCAB License No. — on the contractor record.
alter table public.contractors drop column if exists pcab_license_no;

commit;
