-- @mine — PREPARED 2026-11-09, **DO NOT RUN UNTIL THE OWNER SAYS GO**.
-- Demo reset for Supabase project WBLRMS (jowcyoziuqzoezxboffx):
--   1) backs up current roads/projects/inspections/ai rows into demo_backup_2026_*,
--   2) deletes ALL transactional/test data EXCEPT accounts (auth.users/profiles)
--      and reference data (barangays, project_categories, contractors, role_module_access),
--   3) seeds 10 synthetic-but-realistic roads/projects with inspections (+items),
--      maintenance, progress updates and AI priority results.
-- Deterministic UUIDs (md5-based) make the wipe+seed reproducible.
-- Run as ONE execution. See docs/DEMO-DATA-PLAN.md.

BEGIN;

-- ---------- safety snapshot (droppable after the demo) ----------
DROP TABLE IF EXISTS demo_backup_2026_roads;
DROP TABLE IF EXISTS demo_backup_2026_projects;
DROP TABLE IF EXISTS demo_backup_2026_inspections;
DROP TABLE IF EXISTS demo_backup_2026_ai_results;
CREATE TABLE demo_backup_2026_roads AS SELECT * FROM public.roads;
CREATE TABLE demo_backup_2026_projects AS SELECT * FROM public.projects;
CREATE TABLE demo_backup_2026_inspections AS SELECT * FROM public.inspections;
CREATE TABLE demo_backup_2026_ai_results AS SELECT * FROM public.ai_priority_results;

-- ---------- wipe (FK-safe order; accounts & reference data untouched) ----------
DELETE FROM public.ai_priority_results;
DELETE FROM public.ai_analysis_runs;
DELETE FROM public.attachments;
DELETE FROM public.inspection_items;
DELETE FROM public.inspections;
DELETE FROM public.maintenance_records;
DELETE FROM public.project_progress_updates;
DELETE FROM public.projects;
DELETE FROM public.roads;
DELETE FROM public.activity_logs;
DELETE FROM public.login_attempts;

-- deterministic id helper for this script
CREATE OR REPLACE FUNCTION pg_temp.du(text) RETURNS uuid
LANGUAGE sql IMMUTABLE AS
$$ SELECT (regexp_replace(md5('wblrms-demo-' || $1),
          '(.{8})(.{4})(.{4})(.{4})(.{12})', '\1-\2-\3-\4-\5'))::uuid $$;

-- ---------- 10 roads ----------
INSERT INTO public.roads (id, road_network_id, road_name, barangay_id, components, description, date_built, length_km, width_m, current_condition, last_inspection_date)
SELECT pg_temp.du('road-' || v.n), v.net, v.road, b.id, v.components, v.descr, v.built::date, v.len, v.wid, v.cond::public.road_condition, v.last_insp::date
FROM (VALUES
  (1,'MR-PB-001','Poblacion Main Road','Poblacion','concrete,shoulder,side_drain','Main arterial road serving the municipal hall and public market.','2018-06-15',2.85,7.30,'good','2026-09-10'),
  (2,'MR-MG-002','Mainaga Access Road','Mainaga','concrete,shoulder','Access road to Mainaga coastal sitios and fish landing.','2015-04-22',1.60,5.50,'fair','2026-08-22'),
  (3,'MR-MN-003','Mainit Barangay Road','Mainit','concrete,side_drain','Barangay road connecting Mainit proper to the national highway.','2012-09-30',1.25,5.00,'poor','2026-07-30'),
  (4,'MR-LG-004','Ligaya Farm Road','Ligaya','gravel,earth','Farm-to-market road serving coconut and banana farms.','2009-03-14',2.10,4.50,'bad','2026-06-15'),
  (5,'MR-BG-005','Bagalangit Road','Bagalangit','concrete,shoulder','Barangay road to Bagalangit elementary school.','2020-07-08',2.20,5.50,'poor','2026-08-05'),
  (6,'MR-AE-006','Anilao East Coastal Road','Anilao East','concrete,shoulder,sidewalk','Coastal road serving dive resorts and coastal sitios.','2019-11-19',1.85,6.10,'good','2026-09-02'),
  (7,'MR-TP-007','Talaga Proper Road','Talaga Proper','concrete,side_drain','Barangay road with drainage along rice fields.','2014-05-27',1.45,5.00,'fair','2026-08-18'),
  (8,'MR-ST-008','San Teodoro Access Road','San Teodoro','gravel,earth','Access road to upland sitios of San Teodoro.','2008-08-11',1.90,4.20,'poor','2026-05-26'),
  (9,'MR-GS-009','Gasang Farm-to-Market Road','Gasang','concrete,shoulder','Farm-to-market road for Gasang agricultural produce.','2017-02-16',2.40,5.80,'fair','2026-08-29'),
  (10,'MR-SL-010','Solo Barangay Road','Solo','concrete,sidewalk','Barangay road connecting Solo proper to Poblacion.','2021-10-05',1.10,5.40,'good','2026-09-05')
) AS v(n, net, road, barangay, components, descr, built, len, wid, cond, last_insp)
JOIN public.barangays b ON b.name = v.barangay;

-- ---------- 10 projects (one per road) ----------
INSERT INTO public.projects (id, project_name, road_id, category_id, description, barangay_id,
  date_started, target_completion_date, extensions_count, actual_completion_date, status,
  contractor_id, source_of_funds, appropriation, contracted_amount, adjusted_project_cost,
  completion_date, completion_percentage, turnover_date, validation_status, validated_by, validated_at, validation_remarks)
SELECT pg_temp.du('project-' || v.n), v.proj, pg_temp.du('road-' || v.n), c.id, v.descr, b.id,
  v.started::date, v.target::date, v.ext, v.actual::date, v.status::public.project_status,
  ct.id, v.fund, v.appro, v.contracted, v.adjusted,
  v.completion::date, v.pct, v.turnover::date, v.val::public.validation_status,
  CASE WHEN v.val <> 'pending' THEN (SELECT id FROM public.profiles WHERE username = 'validator') END,
  CASE WHEN v.val <> 'pending' THEN (v.actual::date + 1) ::timestamptz END,
  v.val_remarks
FROM (VALUES
  (1,'Poblacion Main Road Concreting & Drainage Rehab','National Road','Poblacion','Full rehabilitation of 2.85 km arterial road with new side drains and shoulder widening.','2024-01-15','2024-09-30',0,'2024-09-28','turned_over','Batangas Road Builders Inc.','National Road Fund',3200000,2950000,3100000,'2024-09-28',100,'2024-10-05','approved','Project completed on time with no significant defects.'),
  (2,'Mainaga Access Road Rehabilitation','Provincial Road','Mainaga','Rehabilitation and asphalt overlay of the Mainaga access road.','2025-03-03','2025-10-31',1,'2025-11-08','completed','Calabarzon Infrastructure Corp.','Provincial Development Fund',1250000,1180000,1220000,'2025-11-08',100,NULL,'approved','Completed with minor punch-list items rectified.'),
  (3,'Mainit Road Surface Repair & Drainage','Barangay Road','Mainit','Concrete surface repair and drainage improvement for Mainit Barangay Road.','2026-02-02','2026-11-27',0,NULL,'on_track','Southern Tagalog Contractors','20% Municipal Development Fund',880000,820000,840000,NULL,72,NULL,'pending',NULL),
  (4,'Ligaya Farm Road Full Rehabilitation','Municipal Road','Ligaya','Full rehabilitation of Ligaya farm-to-market road including base re-gravelling and concreting.','2027-01-11','2027-08-30',0,NULL,'planned','Mabini Engineering & Construction','Municipal Development Fund',470000,430000,440000,NULL,0,NULL,'pending',NULL),
  (5,'Bagalangit Road Surface Repair','Barangay Road','Bagalangit','Concrete patching and shoulder repair for 2.20 km barangay road.','2026-03-02','2026-10-30',0,NULL,'on_track','Southern Tagalog Contractors','Barangay Development Fund',680000,650000,670000,NULL,65,NULL,'pending',NULL),
  (6,'Anilao East Coastal Road Concreting','Municipal Road','Anilao East','Concreting of coastal road with sidewalk for resort access.','2025-01-20','2025-08-29',0,'2025-08-22','completed','Batangas Road Builders Inc.','Municipal Development Fund',1620000,1540000,1580000,'2025-08-22',100,NULL,'approved','Passed final inspection; quantities verified.'),
  (7,'Talaga Proper Road Widening & Shoulder Rehab','Barangay Road','Talaga Proper','Road widening and shoulder rehabilitation along Talaga Proper.','2026-01-12','2026-07-31',1,NULL,'delayed','Calabarzon Infrastructure Corp.','Provincial Development Fund',1010000,960000,985000,NULL,45,NULL,'pending',NULL),
  (8,'San Teodoro Access Road Opening & Gravelling','Barangay Road','San Teodoro','Opening and gravelling of upland access road.','2027-02-01','2027-09-29',0,NULL,'planned','Mabini Engineering & Construction','Barangay Development Fund',410000,380000,395000,NULL,0,NULL,'pending',NULL),
  (9,'Gasang Farm-to-Market Road Concreting','Municipal Road','Gasang','Concreting of farm-to-market road, two lanes with shoulder.','2026-01-05','2026-10-16',0,NULL,'on_track','Southern Tagalog Contractors','Provincial Development Fund',1180000,1120000,1150000,NULL,88,NULL,'pending',NULL),
  (10,'Solo Barangay Road Concreting','Barangay Road','Solo','Concreting of Solo barangay road with sidewalk.','2024-06-03','2024-12-20',0,'2024-12-18','turned_over','Mabini Engineering & Construction','Barangay Development Fund',575000,540000,555000,'2024-12-18',100,'2025-01-10','approved','Turned over to the barangay with complete documents.')
) AS v(n, proj, category, barangay, descr, started, target, ext, actual, status, contractor, fund, appro, contracted, adjusted, completion, pct, turnover, val, val_remarks)
JOIN public.project_categories c ON c.name = v.category
JOIN public.barangays b ON b.name = v.barangay
JOIN public.contractors ct ON ct.name = v.contractor;

-- ---------- inspections (1-3 per project, inspector = seeded inspector) ----------
INSERT INTO public.inspections (id, project_id, inspection_date, inspection_type, inspector_id,
  overall_score, overall_condition, remarks, validation_status, validated_by, validated_at, validation_remarks)
SELECT pg_temp.du('insp-' || v.k), pg_temp.du('project-' || v.n), v.d::date,
  v.typ::public.inspection_type,
  (SELECT id FROM public.profiles WHERE username = 'inspector'),
  v.score,
  (CASE WHEN v.score >= 7.5 THEN 'good' WHEN v.score >= 5 THEN 'fair' WHEN v.score >= 3 THEN 'poor' ELSE 'bad' END)::public.road_condition,
  v.remarks, v.val::public.validation_status,
  CASE WHEN v.val <> 'pending' THEN (SELECT id FROM public.profiles WHERE username = 'validator') END,
  CASE WHEN v.val <> 'pending' THEN (v.d::date + 3)::timestamptz END,
  v.val_remarks
FROM (VALUES
  ('1-a',1,'2024-09-26','type_acceptance',9.4,'Acceptance inspection before turnover.','approved','All components in good condition.'),
  ('1-b',1,'2026-09-10','routine',9.1,'Annual routine inspection; road remains in good condition.','approved','No defects observed.'),
  ('2-a',2,'2025-11-06','type_acceptance',6.8,'Acceptance inspection after overlay works.','approved','Minor surface unevenness rectified.'),
  ('2-b',2,'2026-08-22','routine',6.4,'Routine inspection; early raveling on shoulder sections.','approved','For preventive maintenance next cycle.'),
  ('3-a',3,'2026-03-16','initial',4.3,'Initial inspection prior to repair works; multiple cracked slabs.','approved','Baseline condition documented.'),
  ('3-b',3,'2026-07-30','routine',4.6,'Interim inspection during repair; drainage works ongoing.','pending',NULL),
  ('4-a',4,'2026-06-15','initial',2.8,'Initial inspection; earth surface severely rutted during rainy season.','approved','Recommended for full concreting.'),
  ('5-a',5,'2026-04-11','initial',4.1,'Initial inspection; concrete patching required on 14 slabs.','approved','Baseline documented.'),
  ('5-b',5,'2026-08-05','routine',4.8,'Interim inspection; patching partially completed.','pending',NULL),
  ('6-a',6,'2025-08-20','type_acceptance',8.9,'Acceptance inspection for coastal concreting.','approved','Excellent workmanship noted.'),
  ('6-b',6,'2026-09-02','routine',8.7,'Routine inspection; sidewalk and shoulder intact.','approved','No action required.'),
  ('7-a',7,'2026-02-14','initial',5.6,'Initial inspection before widening works.','approved','Baseline documented.'),
  ('7-b',7,'2026-08-18','routine',5.2,'Progress inspection; works delayed by right-of-way clearing.','rejected','Return for revision: update accomplishment report and photo documentation.'),
  ('8-a',8,'2026-05-26','initial',3.6,'Initial inspection; access impassable to light vehicles after heavy rain.','approved','Prioritized for gravelling.'),
  ('9-a',9,'2026-03-21','initial',5.9,'Initial inspection before concreting.','approved','Baseline documented.'),
  ('9-b',9,'2026-08-29','routine',6.1,'Interim inspection; concreting at 88% with good quality control.','pending',NULL),
  ('10-a',10,'2024-12-16','type_acceptance',9.2,'Acceptance inspection before barangay turnover.','approved','Complete documents submitted.'),
  ('10-b',10,'2026-09-05','follow_up',9.0,'Follow-up inspection one year after turnover.','approved','Road remains in good condition.')
) AS v(k, n, d, typ, score, remarks, val, val_remarks);

-- ---------- inspection items: 7 standard components per inspection ----------
-- Ratings are derived from the inspection's overall score (side drains one notch
-- lower on poor roads) so the demo story is internally consistent.
INSERT INTO public.inspection_items (id, inspection_id, component, rating, score, remarks)
SELECT pg_temp.du('item-' || i.id::text || '-' || c.comp),
       i.id,
       c.comp::public.road_component,
       (CASE
          WHEN adj >= 7.5 THEN 'good'
          WHEN adj >= 5 THEN 'fair'
          WHEN adj >= 3 THEN 'poor'
          ELSE 'bad' END)::public.condition_rating,
       adj,
       NULL
FROM public.inspections i
CROSS JOIN (VALUES ('concrete',0.0),('asphalt',-0.3),('gravel',-0.6),('earth',-0.9),('shoulder',-0.5),('side_drain',-1.2),('sidewalk',-0.4))
  AS c(comp, delta)
CROSS JOIN LATERAL (SELECT GREATEST(0, LEAST(10, COALESCE(i.overall_score,0) + c.delta)) AS adj) s;

-- ---------- maintenance records (10) ----------
INSERT INTO public.maintenance_records (id, project_id, inspection_id, contractor_id,
  maintenance_type, activities, remarks, scheduled_date, completed_date, cost, status, validation_status)
SELECT pg_temp.du('maint-' || v.k), pg_temp.du('project-' || v.n), NULL, ct.id,
  v.typ::public.maintenance_type, v.act, NULL, v.sched::date, v.done::date, v.cost,
  v.status::public.maintenance_status, 'pending'::public.validation_status
FROM (VALUES
  ('m1',2,'preventive','Shoulder re-gravelling and vegetation clearing','2026-10-12',NULL,85000,'scheduled'),
  ('m2',3,'corrective','Crack sealing and slab replacement (Sta. 0+120 to 0+340)','2026-07-06','2026-07-19',210000,'completed'),
  ('m3',3,'routine','Drainage declogging along Mainit proper','2026-09-14',NULL,45000,'scheduled'),
  ('m4',5,'corrective','Concrete patching of cracked slabs','2026-06-08','2026-06-27',175000,'completed'),
  ('m5',5,'preventive','Shoulder grading and compaction','2026-10-05',NULL,62000,'in_progress'),
  ('m6',7,'routine','Clearing of right-of-way obstructions (deferred pending barangay coordination)','2026-08-03',NULL,38000,'deferred'),
  ('m7',9,'preventive','Asphalt patching on approach sections','2026-05-11','2026-05-23',98000,'completed'),
  ('m8',1,'routine','Quarterly road condition monitoring and minor sweeping works','2026-09-21','2026-09-25',30000,'completed'),
  ('m9',8,'emergency','Temporary gravelling of washed-out section after heavy rain','2026-11-16',NULL,120000,'scheduled'),
  ('m10',6,'preventive','Sidewalk and shoulder repainting of markings','2026-10-19',NULL,54000,'in_progress')
) AS v(k, n, typ, act, sched, done, cost, status)
LEFT JOIN public.contractors ct ON ct.name = CASE
  WHEN v.n IN (2,7) THEN 'Calabarzon Infrastructure Corp.'
  WHEN v.n IN (3,5,9) THEN 'Southern Tagalog Contractors'
  WHEN v.n IN (8) THEN 'Mabini Engineering & Construction'
  ELSE 'Batangas Road Builders Inc.' END;

-- ---------- project progress updates (active/delayed projects) ----------
INSERT INTO public.project_progress_updates (id, project_id, reported_on, completion_percentage, amount_spent, status, notes, reported_by)
SELECT pg_temp.du('prog-' || v.k), pg_temp.du('project-' || v.n), v.d::date, v.pct, v.spent,
  v.status::public.project_status, v.notes,
  (SELECT id FROM public.profiles WHERE username = 'encoder')
FROM (VALUES
  ('p1',3,'2026-06-30',41,344400,'on_track','First billing accomplished; drainage works ongoing.'),
  ('p2',3,'2026-09-30',72,604800,'on_track','Surface repair at 72%; on schedule for November completion.'),
  ('p3',5,'2026-06-30',38,254600,'on_track','Patching works started on priority slabs.'),
  ('p4',5,'2026-09-30',65,435500,'on_track','Patching 65% complete; shoulder works to follow.'),
  ('p5',7,'2026-05-31',45,443250,'delayed','Delayed by right-of-way clearing; recovery plan requested from contractor.'),
  ('p6',7,'2026-08-31',45,443250,'delayed','No progress this period pending barangay coordination.'),
  ('p7',9,'2026-06-30',57,655500,'on_track','Concreting ahead of schedule.'),
  ('p8',9,'2026-09-30',88,1012000,'on_track','Near completion; final curing and shoulder works remaining.')
) AS v(k, n, d, pct, spent, status, notes);

-- ---------- AI priority results (mirrors road conditions; regenerate live once AI key exists) ----------
INSERT INTO public.ai_analysis_runs (id, run_by, model, total_projects, notes)
VALUES (pg_temp.du('ai-run-1'), (SELECT id FROM public.profiles WHERE username = 'admin'),
        'meta/llama-4-scout', 10, 'Demo seed run (synthetic) — regenerate with live AI when AI_GATEWAY_API_KEY is set.');

INSERT INTO public.ai_priority_results (id, run_id, project_id, risk_level, priority_score, justification, recommendation, factors, decision)
SELECT pg_temp.du('ai-result-' || p.id::text), pg_temp.du('ai-run-1'), p.id,
  (CASE r.current_condition WHEN 'bad' THEN 'high' WHEN 'poor' THEN 'high' WHEN 'fair' THEN 'medium' ELSE 'low' END)::public.risk_level,
  (CASE r.current_condition WHEN 'bad' THEN 92 WHEN 'poor' THEN 81 WHEN 'fair' THEN 55 ELSE 22 END),
  'Road condition is ' || r.current_condition::text || ' based on the latest inspection (road age and inspection recency considered).',
  (CASE r.current_condition
     WHEN 'bad' THEN 'Program full rehabilitation within the next budget cycle.'
     WHEN 'poor' THEN 'Schedule corrective maintenance and detailed inspection.'
     WHEN 'fair' THEN 'Include in preventive maintenance program.'
     ELSE 'Continue routine monitoring.' END),
  jsonb_build_object('condition', r.current_condition::text, 'last_inspection_date', r.last_inspection_date),
  'pending'::public.ai_decision
FROM public.projects p JOIN public.roads r ON r.id = p.road_id;

COMMIT;

-- Expected after running:
--   roads 10, projects 10, inspections 18, inspection_items 126,
--   maintenance_records 10, project_progress_updates 8,
--   ai_analysis_runs 1, ai_priority_results 10,
--   profiles 4 (untouched), auth.users 4 (untouched).
