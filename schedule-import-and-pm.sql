-- =============================================================================
-- Northern Wolves — Phase 4: PM names + schedule entries from Russ's Excel
-- =============================================================================
-- Run this in the Supabase SQL Editor AFTER schedule-schema.sql.
-- Idempotent: safe to re-run. Schedule entries with source='excel_import_v1'
-- are deleted and recreated. Existing entries you've created manually are
-- preserved (they have source = NULL).
-- =============================================================================

-- 1. Project columns: PM name + email
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pm_name  TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pm_email TEXT;

-- 2. Source column on schedule_entries (so the import is re-runnable)
ALTER TABLE schedule_entries ADD COLUMN IF NOT EXISTS source TEXT;

-- 3. PM updates per project (extracted from notes column)
UPDATE projects SET pm_name = 'Chris'   WHERE short_code IN
  ('CFP','7PP','LAFB','MT','SLF','EVC','SOMPO','K9R','CBP','ASG','FAS','SPT','645MAD','MO','DBI');
UPDATE projects SET pm_name = 'Whitney' WHERE short_code IN
  ('PG','GH','SCH','SVC','QPL','WPPC','RACL','PVMVS','ARC','ECDL');
UPDATE projects SET pm_name = 'Andrei'  WHERE short_code IN
  ('MINJ','SIH','YU','SRDS','TBM','JCMP','CFCJH');
-- Russ on remaining projects (default fallback for projects not assigned)
UPDATE projects SET pm_name = 'Russ'    WHERE pm_name IS NULL AND short_code IS NOT NULL;

-- 4. Wipe prior import to make this re-runnable
DELETE FROM schedule_entries WHERE source = 'excel_import_v1';

-- =============================================================================
-- Helper: tech_id by name lookup (used inline in INSERT statements below)
-- =============================================================================
-- Pattern: (SELECT id FROM schedule_techs WHERE first_name='X' AND last_name='Y')

-- =============================================================================
-- 5. Schedule entries from Russ's Excel "Manpower as of today" + needs notes
-- All dates assume start = 2026-04-27 (Monday) for new work, today (2026-04-26)
-- for in-progress work. Russ can edit individual entries afterwards.
-- =============================================================================

-- ── BCM Brooklyn Conservatory of Music ───────────────────────────────────────
-- Existing crew: Manuel Cruz (foreman), Santos, Giovanny — ductwork in progress
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_ids, assigned_tech_names, foreman_id, status, scope_summary,
  manpower_needed, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='BCM'),
  'sheetmetal', '2026-04-26', '2026-05-18',
  ARRAY[
    (SELECT id FROM schedule_techs WHERE first_name='Juan Manuel' AND last_name='Cruz Rosales'),
    (SELECT id FROM schedule_techs WHERE first_name='Santos' AND last_name='Guinea Velasquez'),
    (SELECT id FROM schedule_techs WHERE first_name='Giovanny' AND last_name='Guinea Velasquez')
  ],
  ARRAY['Juan Manuel Cruz Rosales','Santos Guinea Velasquez','Giovanny Guinea Velasquez'],
  (SELECT id FROM schedule_techs WHERE first_name='Juan Manuel' AND last_name='Cruz Rosales'),
  'in-progress', 'Ductwork install', 3, 'excel_import_v1', 'normal'
);
-- Future need: 4 pipefitters for 3 weeks starting 4/27
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_ids, assigned_tech_names, status, scope_summary,
  manpower_needed, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='BCM'),
  'pipe-fitters', '2026-04-27', '2026-05-18',
  ARRAY[]::UUID[], ARRAY[]::TEXT[],
  'scheduled', 'Need 4 pipefitters for 3 weeks', 4, 'excel_import_v1', 'high'
);

-- ── CGCS CENTRALE 89 E 42nd ──────────────────────────────────────────────────
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_ids, assigned_tech_names, foreman_id, status, scope_summary,
  manpower_needed, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='CGCS'),
  'sheetmetal', '2026-04-26', '2026-05-19',
  ARRAY[
    (SELECT id FROM schedule_techs WHERE first_name='Joseph' AND last_name='Taylor'),
    (SELECT id FROM schedule_techs WHERE first_name='Maximo' AND last_name='Benitez')
  ],
  ARRAY['Joseph Taylor','Maximo Benitez'],
  (SELECT id FROM schedule_techs WHERE first_name='Joseph' AND last_name='Taylor'),
  'in-progress', 'Ductwork install', 2, 'excel_import_v1', 'normal'
);
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_ids, assigned_tech_names, status, scope_summary,
  manpower_needed, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='CGCS'),
  'pipe-fitters', '2026-04-28', '2026-05-19',
  ARRAY[]::UUID[], ARRAY[]::TEXT[],
  'scheduled', 'Need 4 pipefitters for 3 weeks', 4, 'excel_import_v1', 'high'
);

-- ── DR Dante Restaurant ──────────────────────────────────────────────────────
-- Need crew to complete wiring & start-up: 2-3 days
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_ids, assigned_tech_names, status, scope_summary,
  manpower_needed, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='DR'),
  'wiring-startup', '2026-04-27', '2026-04-29',
  ARRAY[]::UUID[], ARRAY[]::TEXT[],
  'scheduled', 'Complete wiring + Start-up (2-3 days)', 2, 'excel_import_v1', 'high'
);

-- ── DBI Commercial Whitebox ──────────────────────────────────────────────────
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_ids, assigned_tech_names, status, scope_summary,
  manpower_needed, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='DBI'),
  'sheetmetal', '2026-04-26', '2026-05-04',
  ARRAY[
    (SELECT id FROM schedule_techs WHERE first_name='Farhod' AND last_name='Davlatmurodov'),
    (SELECT id FROM schedule_techs WHERE first_name='Faridun' AND last_name='Jumaev')
  ],
  ARRAY['Farhod Davlatmurodov','Faridun Jumaev'],
  'in-progress', 'Ductwork install', 2, 'excel_import_v1', 'normal'
);
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_ids, assigned_tech_names, status, scope_summary,
  manpower_needed, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='DBI'),
  'pipe-fitters', '2026-04-27', '2026-05-04',
  ARRAY[]::UUID[], ARRAY[]::TEXT[],
  'scheduled', 'Install piping — 2 pipefitters for 6-7 days', 2, 'excel_import_v1', 'high'
);

-- ── FC Flight Club Union Sq ──────────────────────────────────────────────────
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_ids, assigned_tech_names, foreman_id, status, scope_summary,
  manpower_needed, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='FC'),
  'sheetmetal', '2026-04-26', '2026-05-15',
  ARRAY[
    (SELECT id FROM schedule_techs WHERE first_name='Vsevolod' AND last_name='Talsky'),
    (SELECT id FROM schedule_techs WHERE first_name='Sergii'   AND last_name='Tiutiunnyk'),
    (SELECT id FROM schedule_techs WHERE first_name='Pradeep'  AND last_name='Lall'),
    (SELECT id FROM schedule_techs WHERE first_name='Firdavs'  AND last_name='Oshurmamadov')
  ],
  ARRAY['Vsevolod Talsky','Sergii Tiutiunnyk','Pradeep Lall','Firdavs Oshurmamadov'],
  (SELECT id FROM schedule_techs WHERE first_name='Vsevolod' AND last_name='Talsky'),
  'in-progress', 'Ductwork install', 4, 'excel_import_v1', 'normal'
);
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_ids, assigned_tech_names, status, scope_summary,
  manpower_needed, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='FC'),
  'pipe-fitters', '2026-04-27', '2026-05-04',
  ARRAY[]::UUID[], ARRAY[]::TEXT[],
  'scheduled', 'Push piping install — need 2 additional pipefitters', 2, 'excel_import_v1', 'high'
);

-- ── IPA India Pentecostal ────────────────────────────────────────────────────
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_ids, assigned_tech_names, status, scope_summary,
  manpower_needed, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='IPA'),
  'pipe-fitters', '2026-04-26', '2026-04-30',
  ARRAY[
    (SELECT id FROM schedule_techs WHERE first_name='Ruslan' AND last_name='Atnagulov'),
    (SELECT id FROM schedule_techs WHERE first_name='Viktor' AND last_name='Ilin')
  ],
  ARRAY['Ruslan Atnagulov','Viktor Ilin'],
  'in-progress', 'Piping — another 3-4 days', 2, 'excel_import_v1', 'normal'
);
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_names, is_subcontractor, subcontractor_name,
  status, scope_summary, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='IPA'),
  'sheetmetal', '2026-04-26', '2026-04-30',
  ARRAY['🏗️ JM Haley'], TRUE, 'JM Haley',
  'in-progress', 'Ductwork — subcontractor', 'excel_import_v1', 'normal'
);

-- ── LAFB LA Fitness ──────────────────────────────────────────────────────────
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_ids, assigned_tech_names, status, scope_summary,
  manpower_needed, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='LAFB'),
  'sheetmetal', '2026-04-26', '2026-05-09',
  ARRAY[
    (SELECT id FROM schedule_techs WHERE first_name='Jose'   AND last_name='Ortega'),
    (SELECT id FROM schedule_techs WHERE first_name='Wilson' AND last_name='Guarchar')
  ],
  ARRAY['Jose Ortega','Wilson Guarchar'],
  'in-progress', 'Ductwork install', 2, 'excel_import_v1', 'normal'
);

-- ── MT Matchaful (subcontractor) ─────────────────────────────────────────────
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_names, is_subcontractor, subcontractor_name,
  status, scope_summary, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='MT'),
  'sheetmetal', '2026-04-26', '2026-05-09',
  ARRAY['🏗️ ADLS (Jason)'], TRUE, 'ADLS (Jason)',
  'in-progress', 'Ductwork — subcontractor', 'excel_import_v1', 'normal'
);

-- ── SLF Skinny Louie ─────────────────────────────────────────────────────────
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_ids, assigned_tech_names, status, scope_summary,
  manpower_needed, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='SLF'),
  'sheetmetal', '2026-04-26', '2026-05-04',
  ARRAY[(SELECT id FROM schedule_techs WHERE first_name='Fido' AND last_name='Mulloev')],
  ARRAY['Fido Mulloev'],
  'in-progress', 'Ductwork', 1, 'excel_import_v1', 'normal'
);

-- ── SIH Seafarers ────────────────────────────────────────────────────────────
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_ids, assigned_tech_names, status, scope_summary,
  manpower_needed, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='SIH'),
  'pipe-fitters', '2026-04-26', '2026-05-04',
  ARRAY[(SELECT id FROM schedule_techs WHERE first_name='Antonio' AND last_name='Valle Robles')],
  ARRAY['Antonio Valle Robles'],
  'in-progress', 'Piping', 1, 'excel_import_v1', 'normal'
);

-- ── QPL Queens Public Library ────────────────────────────────────────────────
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_ids, assigned_tech_names, status, scope_summary,
  manpower_needed, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='QPL'),
  'pipe-fitters', '2026-04-26', '2026-05-09',
  ARRAY[
    (SELECT id FROM schedule_techs WHERE first_name='Jean'  AND last_name='Ramirez'),
    (SELECT id FROM schedule_techs WHERE first_name='Jesus' AND last_name='Valerio')
  ],
  ARRAY['Jean Ramirez','Jesus Valerio'],
  'in-progress', 'Piping', 2, 'excel_import_v1', 'normal'
);
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_names, is_subcontractor, subcontractor_name,
  status, scope_summary, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='QPL'),
  'sheetmetal', '2026-04-26', '2026-05-09',
  ARRAY['🏗️ Master Precision (Luis)'], TRUE, 'Master Precision (Luis)',
  'in-progress', 'Ductwork — subcontractor', 'excel_import_v1', 'normal'
);

-- ── PVM Pura Vida 5th Ave ────────────────────────────────────────────────────
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_ids, assigned_tech_names, status, scope_summary,
  manpower_needed, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='PVM'),
  'wiring-startup', '2026-04-27', '2026-04-28',
  ARRAY[
    (SELECT id FROM schedule_techs WHERE first_name='Vova'  AND last_name IS NULL),
    (SELECT id FROM schedule_techs WHERE first_name='Maxim' AND last_name IS NULL)
  ],
  ARRAY['Vova','Maxim'],
  'scheduled', 'Piping + Wiring + Start-up — 2 days', 2, 'excel_import_v1', 'normal'
);

-- ── EVC NY Endo ──────────────────────────────────────────────────────────────
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_names, is_subcontractor, subcontractor_name,
  status, scope_summary, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='EVC'),
  'sheetmetal', '2026-04-26', '2026-05-09',
  ARRAY['🏗️ ADLS (Jason)'], TRUE, 'ADLS (Jason)',
  'in-progress', 'Ductwork — subcontractor', 'excel_import_v1', 'normal'
);

-- ── SRDS Saddle River Day School ─────────────────────────────────────────────
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_ids, assigned_tech_names, status, scope_summary,
  manpower_needed, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='SRDS'),
  'wiring-startup', '2026-04-26', '2026-05-09',
  ARRAY[(SELECT id FROM schedule_techs WHERE first_name='Alberto' AND last_name='Meschino')],
  ARRAY['Alberto Meschino'],
  'in-progress', 'Wiring/Piping', 1, 'excel_import_v1', 'normal'
);

-- ── RACL RA Cohen (subcontractor) ────────────────────────────────────────────
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_names, is_subcontractor, subcontractor_name,
  status, scope_summary, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='RACL'),
  'sheetmetal', '2026-04-26', '2026-05-09',
  ARRAY['🏗️ Master Precision (Luis)'], TRUE, 'Master Precision (Luis)',
  'in-progress', 'Ductwork — subcontractor', 'excel_import_v1', 'normal'
);

-- ── JCMP J-Crew Marlboro (subcontractor) ─────────────────────────────────────
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_names, is_subcontractor, subcontractor_name,
  status, scope_summary, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='JCMP'),
  'sheetmetal', '2026-04-26', '2026-05-09',
  ARRAY['🏗️ Atlantic Air (Anwar)'], TRUE, 'Atlantic Air (Anwar)',
  'in-progress', 'Ductwork — subcontractor', 'excel_import_v1', 'normal'
);

-- ── SOMPO Clune ──────────────────────────────────────────────────────────────
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_names, is_subcontractor, subcontractor_name,
  status, scope_summary, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='SOMPO'),
  'sheetmetal', '2026-04-26', '2026-05-09',
  ARRAY['🏗️ ADLS (Jason)'], TRUE, 'ADLS (Jason)',
  'in-progress', 'Ductwork — subcontractor', 'excel_import_v1', 'normal'
);
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_ids, assigned_tech_names, status, scope_summary,
  manpower_needed, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='SOMPO'),
  'pipe-fitters', '2026-04-28', '2026-05-02',
  ARRAY[]::UUID[], ARRAY[]::TEXT[],
  'scheduled', 'Need 2 pipefitters for 3-4 days', 2, 'excel_import_v1', 'high'
);

-- ── ECDL El Califa de Leon ───────────────────────────────────────────────────
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_ids, assigned_tech_names, status, scope_summary,
  manpower_needed, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='ECDL'),
  'disconnect-demo', '2026-04-27', '2026-05-01',
  ARRAY[]::UUID[], ARRAY[]::TEXT[],
  'scheduled', 'Need to start disconnects/demo', 2, 'excel_import_v1', 'high'
);

-- ── MO Medical Office ────────────────────────────────────────────────────────
INSERT INTO schedule_entries (project_id, crew_type, start_date, end_date,
  assigned_tech_ids, assigned_tech_names, status, scope_summary,
  manpower_needed, source, priority)
VALUES (
  (SELECT id FROM projects WHERE short_code='MO'),
  'sheetmetal', '2026-04-26', '2026-05-09',
  ARRAY[
    (SELECT id FROM schedule_techs WHERE first_name='Ruslan' AND last_name='Olenchuk'),
    (SELECT id FROM schedule_techs WHERE first_name='Ihor'   AND last_name='Olenchuk')
  ],
  ARRAY['Ruslan Olenchuk','Ihor Olenchuk'],
  'in-progress', 'Ductwork install', 2, 'excel_import_v1', 'normal'
);

-- =============================================================================
-- DONE
-- =============================================================================
SELECT 'Phase 4 import complete. ' ||
       (SELECT COUNT(*) FROM schedule_entries WHERE source='excel_import_v1') ||
       ' entries imported. ' ||
       (SELECT COUNT(*) FROM projects WHERE pm_name IS NOT NULL) ||
       ' projects have PM assigned.' AS result;
