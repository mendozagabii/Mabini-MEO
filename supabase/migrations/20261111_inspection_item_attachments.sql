-- @mine — 2026-11-11: four new inspection categories, plus remark/attachments
-- underneath every category.
--
-- Owner-approved (explicit "apply the migration now" on 2026-11-11). Applied live as
-- migration `inspection_item_remarks_attachments` on project jowcyoziuqzoezxboffx.
--
-- Why only these two changes:
--   * inspection_items.remarks (text) already existed — per-category remarks needed no
--     schema change, they were simply never written or read by the app.
--   * per-category attachments need a link from public.attachments back to the exact
--     inspection_items row. Existing project/inspection/maintenance links are untouched.
--
-- Additive only: no column dropped, no row rewritten, no policy changed. Existing
-- inspections keep their seven items and show the four new categories as "Not assessed".
-- Ratings still come from condition_rating (good/fair/poor/bad/n/a), so the generated
-- inspection_items.score and refresh_inspection_summary() keep working unchanged.

alter type public.road_component add value if not exists 'drainage';
alter type public.road_component add value if not exists 'solar_lights';
alter type public.road_component add value if not exists 'slope_protection';
alter type public.road_component add value if not exists 'retaining_wall';

alter table public.attachments
  add column if not exists inspection_item_id uuid
  references public.inspection_items(id) on delete cascade;

create index if not exists attachments_inspection_item_idx
  on public.attachments (inspection_item_id);
