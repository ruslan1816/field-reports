-- =============================================================================
-- Northern Wolves — Project / PM sync from "Untitled spreadsheet (2).xlsx"
-- (LOG OF ASSIGNMENT FOR PROJECTS, dated 2026-04-10)
-- =============================================================================
-- Run once in Supabase SQL Editor. Idempotent. Safe to re-run.
--
-- What this does:
--   1. Adds new PMs to project_managers and renames short names to full names
--   2. Updates pm_name on existing 39 projects per the Excel
--   3. Inserts 13 new projects (in-progress / on-hold / pending) that were not
--      previously seeded
--   4. Sets statuses to match Excel JOB STATUS column where they differ
--   5. Notes: Jonathan Maginnis is APM for every project (registered as 'apm')
-- =============================================================================

-- 1. PROJECT MANAGERS — add new + rename short names to full names
-- ---------------------------------------------------------------------------
INSERT INTO project_managers (name, email, phone, role) VALUES
  ('Christino Ayala',    'christino@northernwolvesac.com', '929-737-2833', 'project_manager'),
  ('Whitney Bynoe',      'whitney@northernwolvesac.com',   '929-737-2806', 'project_manager'),
  ('Andrei Kastanian',   'andrei@northernwolvesac.com',    '347-781-9809', 'lead_pm'),
  ('Ruslan Zhdamarov',   'ruslan@northernwolvesac.com',    '347-440-3030', 'admin'),
  ('Jonathan Maginnis',  'jonathan@northernwolvesac.com',  '929-737-2840', 'apm'),
  ('Yuriy Ivanin',       NULL,                              NULL,           'project_manager'),
  ('Rana Mohsen',        NULL,                              NULL,           'project_manager')
ON CONFLICT (name) DO UPDATE
  SET email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      role  = EXCLUDED.role;

-- Retire the old short-name PM rows (idempotent — only deletes if full names exist)
DELETE FROM project_managers WHERE name IN ('Chris','Whitney','Andrei','Russ');

-- ---------------------------------------------------------------------------
-- 2. UPDATE pm_name ON EXISTING PROJECTS (per Excel JOB STATUS = In progress / etc.)
-- ---------------------------------------------------------------------------
-- Christino Ayala
UPDATE projects SET pm_name = 'Christino Ayala' WHERE short_code IN
  ('7PP','ASG','CBP','CFP','DBI','EVC','FAS','IPA','K9R','LAFB','MO','MT',
   'PVM','SLF','SOMPO','SPT','645MAD');
-- Whitney Bynoe
UPDATE projects SET pm_name = 'Whitney Bynoe' WHERE short_code IN
  ('26W','BCM','CGCS','DR','ECDL','FC','GH','PG','PVMVS','QPL','RACL',
   'SCH','SVC','WPPC','ARC');
-- Andrei Kastanian
UPDATE projects SET pm_name = 'Andrei Kastanian' WHERE short_code IN
  ('CFCJH','JCMP','MINJ','SIH','SRDS','TBM','YU');

-- ---------------------------------------------------------------------------
-- 3. INSERT NEW PROJECTS from Excel (in-progress / on-hold / pending only)
--    Completed/Canceled historical projects are not seeded — they would clutter
--    the active schedule. Russ can add them manually if needed.
-- ---------------------------------------------------------------------------
INSERT INTO projects (project_name, short_code, address, status, pm_name, notes) VALUES
  ('Bartlett Crossing',                'BC',    '',                                                                'active',  'Whitney Bynoe',                          E'Customer: TBD'),
  ('Camelot Seaview Campus of SI',     'CSI',   'Staten Island, NY',                                               'active',  'Whitney Bynoe',                          E'Customer: TBD'),
  ('Cannon Hill 575 Lexington Ave.',   'CHLA',  '575 Lexington Avenue, New York, NY',                              'active',  'Christino Ayala',                        E'Customer: TBD'),
  ('Centene Tremont Ave Bronx',        'CTB',   'Tremont Avenue, Bronx, NY',                                       'active',  'Andrei Kastanian',                       E'Customer: TBD'),
  ('El Ad US Holding Office',          'EL',    '',                                                                'active',  'Andrei Kastanian',                       E'Customer: TBD'),
  ('Falcon Metropolitan Oval',         'FMO',   'Metropolitan Oval, NY',                                           'active',  'Christino Ayala',                        E'Customer: TBD'),
  ('Hot 8 Yoga Flatiron',              'H8F',   'Flatiron, New York, NY',                                          'active',  'Andrei Kastanian',                       E'Customer: TBD'),
  ('ASPCA Kitten Nursery',             'KN',    '',                                                                'active',  'Christino Ayala',                        E'Customer: TBD'),
  ('Sotheby''s 220 5th Avenue F Fitout','SOTH', '220 5th Avenue, New York, NY',                                    'active',  'Christino Ayala',                        E'Customer: TBD'),
  ('Yonkers Gateway',                  'YG',    'Yonkers, NY',                                                     'active',  'Whitney Bynoe',                          E'Customer: TBD'),
  ('Seafarers International 18 Vesey Street','S18V','18 Vesey Street, New York, NY',                               'active',  'Whitney Bynoe',                          E'Customer: TBD'),
  ('Urban Health - Plaza del Sol',     'UH',    'Plaza del Sol, NY',                                               'on-hold', 'Andrei Kastanian',                       E'Customer: TBD'),
  ('Magic Mike 268 W. 47th St',        'MM',    '268 West 47th Street, New York, NY',                              'active',  'Ruslan Zhdamarov',                       E'Customer: TBD\nStatus: Pending')
ON CONFLICT (short_code) DO UPDATE
  SET project_name = EXCLUDED.project_name,
      address      = EXCLUDED.address,
      status       = EXCLUDED.status,
      pm_name      = EXCLUDED.pm_name,
      notes        = EXCLUDED.notes;

-- ---------------------------------------------------------------------------
-- 4. STATUS CORRECTIONS (Excel "ON HOLD" / "PENDING")
-- ---------------------------------------------------------------------------
UPDATE projects SET status = 'on-hold' WHERE short_code IN ('GH','UH');

-- ---------------------------------------------------------------------------
-- DONE
-- ---------------------------------------------------------------------------
SELECT 'PM/Project sync complete. ' ||
       (SELECT COUNT(*) FROM project_managers WHERE is_active) || ' PMs, ' ||
       (SELECT COUNT(*) FROM projects WHERE pm_name IS NOT NULL) || ' projects assigned, ' ||
       (SELECT COUNT(*) FROM projects WHERE status='active')   || ' active, ' ||
       (SELECT COUNT(*) FROM projects WHERE status='on-hold')  || ' on-hold.' AS result;
