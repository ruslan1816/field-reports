-- =============================================================================
-- Northern Wolves AC — Schedule System Schema
-- =============================================================================
-- Run this whole file ONCE in the Supabase SQL Editor.
-- Creates: schedule_techs, schedule_entries, schedule_comments, pm_templates
--          + RLS policies + triggers + seed data (38 employees + 40 projects)
-- =============================================================================

-- 1. Add short_code to projects table (idempotent — safe if it already exists)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS short_code TEXT;
CREATE INDEX IF NOT EXISTS idx_projects_short_code ON projects(short_code);

-- =============================================================================
-- TABLE: schedule_techs
-- All field employees (38). Separate from `profiles` (which is for app login users).
-- A tech CAN be linked to a profiles row via profile_id if they have an app account.
-- =============================================================================
CREATE TABLE IF NOT EXISTS schedule_techs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name    TEXT NOT NULL,
  last_name     TEXT,
  full_name     TEXT GENERATED ALWAYS AS (
                  TRIM(BOTH ' ' FROM (COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')))
                ) STORED,
  position      TEXT,           -- raw position from CSV: "Mechanic Piping", "Foreman/ Mech Ductwork"
  primary_skill TEXT NOT NULL CHECK (primary_skill IN (
                  'sheetmetal', 'pipe-fitters', 'wiring-startup',
                  'maintenance', 'service-call', 'foreman', 'survey', 'disconnect-demo'
                )),
  skills        TEXT[] DEFAULT '{}',  -- additional skills the tech can do
  is_foreman    BOOLEAN DEFAULT FALSE,
  is_helper     BOOLEAN DEFAULT FALSE,
  is_active     BOOLEAN DEFAULT TRUE,
  is_subcontractor BOOLEAN DEFAULT FALSE,  -- e.g. ADLS, Atlantic Air subs
  phone         TEXT,
  email         TEXT,
  notes         TEXT,
  profile_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_schedule_techs_skill ON schedule_techs(primary_skill);
CREATE INDEX IF NOT EXISTS idx_schedule_techs_active ON schedule_techs(is_active);

-- =============================================================================
-- TABLE: schedule_entries
-- One row = one block of work for one crew on one project for a date range.
-- =============================================================================
CREATE TABLE IF NOT EXISTS schedule_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,

  crew_type     TEXT NOT NULL CHECK (crew_type IN (
                  'sheetmetal',       -- Sheetmetal / Ductwork crew
                  'pipe-fitters',     -- Pipe-fitters
                  'wiring-startup',   -- Wiring / Start-up
                  'service-call',
                  'survey',
                  'disconnect-demo',  -- Disconnects / demo
                  'maintenance'
                )),

  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  start_time    TIME,
  end_time      TIME,

  -- Assigned crew — array of schedule_techs.id (UUIDs).
  -- assigned_tech_names is a denormalized snapshot for display + for subs without tech IDs.
  assigned_tech_ids   UUID[] DEFAULT '{}',
  assigned_tech_names TEXT[] DEFAULT '{}',
  foreman_id    UUID REFERENCES schedule_techs(id) ON DELETE SET NULL,

  -- Subcontractor info
  is_subcontractor   BOOLEAN DEFAULT FALSE,
  subcontractor_name TEXT,    -- e.g. "Atlantic Air (Anwar)", "ADLS (Jason)"

  -- Status & priority
  status        TEXT DEFAULT 'scheduled' CHECK (status IN (
                  'scheduled', 'in-progress', 'completed',
                  'cancelled', 'delayed', 'blocked'
                )),
  priority      TEXT DEFAULT 'normal' CHECK (priority IN ('urgent','high','normal','low')),

  -- Description
  scope_summary TEXT,  -- short one-liner shown in cards/timeline
  notes         TEXT,  -- longer description / requirements

  -- Manpower planning ("need 4 pipefitters for 3 weeks")
  manpower_needed INT,   -- e.g. 4 (vs array_length(assigned_tech_ids) when filled)

  -- Audit
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),

  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_dates  ON schedule_entries(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_proj   ON schedule_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_crew   ON schedule_entries(crew_type);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_status ON schedule_entries(status);
-- GIN on UUID array for "find all entries assigned to tech X"
CREATE INDEX IF NOT EXISTS idx_schedule_entries_techs  ON schedule_entries USING GIN (assigned_tech_ids);

-- updated_at auto-bump
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_schedule_entries_touch ON schedule_entries;
CREATE TRIGGER trg_schedule_entries_touch BEFORE UPDATE ON schedule_entries
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- =============================================================================
-- TABLE: schedule_comments
-- Anyone authenticated can leave notes/requests on any entry.
-- =============================================================================
CREATE TABLE IF NOT EXISTS schedule_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id    UUID REFERENCES schedule_entries(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  author_name TEXT,
  body        TEXT NOT NULL CHECK (length(body) > 0),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_schedule_comments_entry ON schedule_comments(entry_id, created_at DESC);

-- =============================================================================
-- TABLE: pm_templates  (Phase 3 — recurring PM contract auto-generation)
-- Created table now so the schema is final; UI is wired in Phase 3.
-- =============================================================================
CREATE TABLE IF NOT EXISTS pm_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         UUID REFERENCES customers(id) ON DELETE SET NULL,
  project_id          UUID REFERENCES projects(id) ON DELETE SET NULL,
  name                TEXT NOT NULL,
  frequency_days      INT NOT NULL CHECK (frequency_days > 0),  -- 90 = quarterly, 180 = semi, 365 = annual
  visit_duration_days INT DEFAULT 1,
  preferred_tech_ids  UUID[] DEFAULT '{}',
  scope_template      TEXT,
  is_active           BOOLEAN DEFAULT TRUE,
  next_visit_date     DATE,
  last_visit_id       UUID REFERENCES schedule_entries(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- ROW LEVEL SECURITY
-- Per Russ's spec:
--   schedule_techs    : authenticated read; manager/admin write
--   schedule_entries  : authenticated read; manager/admin write
--   schedule_comments : authenticated read; authenticated insert (any tech)
--   pm_templates      : manager/admin only
-- "Manager/admin" = profiles.role IN ('manager', 'admin')
-- =============================================================================

ALTER TABLE schedule_techs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_templates      ENABLE ROW LEVEL SECURITY;

-- helper: is the calling user a manager or admin?
CREATE OR REPLACE FUNCTION is_manager_or_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('manager', 'admin')
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- schedule_techs
DROP POLICY IF EXISTS "techs_read_all"     ON schedule_techs;
DROP POLICY IF EXISTS "techs_write_admin"  ON schedule_techs;
CREATE POLICY "techs_read_all"    ON schedule_techs FOR SELECT TO authenticated USING (true);
CREATE POLICY "techs_write_admin" ON schedule_techs FOR ALL    TO authenticated USING (is_manager_or_admin()) WITH CHECK (is_manager_or_admin());

-- schedule_entries
DROP POLICY IF EXISTS "entries_read_all"     ON schedule_entries;
DROP POLICY IF EXISTS "entries_write_admin"  ON schedule_entries;
CREATE POLICY "entries_read_all"    ON schedule_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "entries_write_admin" ON schedule_entries FOR ALL    TO authenticated USING (is_manager_or_admin()) WITH CHECK (is_manager_or_admin());

-- schedule_comments
DROP POLICY IF EXISTS "comments_read_all"     ON schedule_comments;
DROP POLICY IF EXISTS "comments_insert_any"   ON schedule_comments;
DROP POLICY IF EXISTS "comments_modify_owner" ON schedule_comments;
CREATE POLICY "comments_read_all"     ON schedule_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "comments_insert_any"   ON schedule_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "comments_modify_owner" ON schedule_comments FOR UPDATE TO authenticated USING (auth.uid() = author_id);

-- pm_templates
DROP POLICY IF EXISTS "pm_templates_admin" ON pm_templates;
CREATE POLICY "pm_templates_admin" ON pm_templates FOR ALL TO authenticated USING (is_manager_or_admin()) WITH CHECK (is_manager_or_admin());


-- =============================================================================
-- SEED DATA — 38 field employees (one-time INSERT, safe to re-run)
-- =============================================================================
-- Use ON CONFLICT to make this idempotent. The unique key is (first_name, last_name).
ALTER TABLE schedule_techs DROP CONSTRAINT IF EXISTS schedule_techs_name_unique;
ALTER TABLE schedule_techs ADD CONSTRAINT schedule_techs_name_unique UNIQUE (first_name, last_name);

INSERT INTO schedule_techs (first_name, last_name, position, primary_skill, skills, is_foreman, is_helper) VALUES
  ('Ruslan',   'Atnagulov',           'Mechanic Piping',                                'pipe-fitters',  '{}',                                          false, false),
  ('Viacheslav','Bambagaev',          'Mechanic Piping',                                'pipe-fitters',  '{}',                                          false, false),
  ('Maximo',   'Benitez',             'Mechanic Ductwork',                              'sheetmetal',    '{}',                                          false, false),
  ('Juan Manuel','Cruz Rosales',      'Foreman/ Mech Ductwork',                         'foreman',       '{sheetmetal}',                                true,  false),
  ('Farhod',   'Davlatmurodov',       'Mechanic Ductwork',                              'sheetmetal',    '{}',                                          false, false),
  ('Afroz',    'Dzhumaev',            'Mechanic Ductwork',                              'sheetmetal',    '{}',                                          false, false),
  ('Juan',     'Gonzalez',            'Mechanic Piping',                                'pipe-fitters',  '{}',                                          false, false),
  ('Diego',    'Guarchar',            'Mech Ductwork/Piping/Demo',                      'pipe-fitters',  '{sheetmetal,disconnect-demo}',                false, false),
  ('Minor',    'Guarchar',            'Mech Ductwork/Piping/Demo',                      'pipe-fitters',  '{sheetmetal,disconnect-demo}',                false, false),
  ('Wilson',   'Guarchar',            'Mechanic Ductwork',                              'sheetmetal',    '{}',                                          false, false),
  ('Giovanny', 'Guinea Velasquez',    'Mechanic Ductwork',                              'sheetmetal',    '{}',                                          false, false),
  ('Santos',   'Guinea Velasquez',    'Mechanic Ductwork',                              'sheetmetal',    '{}',                                          false, false),
  ('Viktor',   'Ilin',                'Helper Piping',                                  'pipe-fitters',  '{}',                                          false, true),
  ('Faridun',  'Jumaev',              'Mechanic Ductwork',                              'sheetmetal',    '{}',                                          false, false),
  ('Pradeep',  'Lall',                'Mechanic Ductwork',                              'sheetmetal',    '{}',                                          false, false),
  ('Oscar',    'Libreros',            'Mechanic Ductwork',                              'sheetmetal',    '{}',                                          false, false),
  ('Jose',     'Maldonado Morales',   'Mechanic Ductwork',                              'sheetmetal',    '{}',                                          false, false),
  ('Alberto',  'Meschino',            'Technitian/Wiring/Start-up/Service',             'wiring-startup','{service-call}',                              false, false),
  ('Fido',     'Mulloev',             'Mechanic Ductwork',                              'sheetmetal',    '{}',                                          false, false),
  ('Ihor',     'Olenchuk',            'Mechanic Ductwork',                              'sheetmetal',    '{}',                                          false, false),
  ('Ruslan',   'Olenchuk',            'Mechanic Ductwork',                              'sheetmetal',    '{}',                                          false, false),
  ('Jose',     'Ortega',              'Foreman/ Mech Ductwork',                         'foreman',       '{sheetmetal}',                                true,  false),
  ('Firdavs',  'Oshurmamadov',        'Mechanic Ductwork',                              'sheetmetal',    '{}',                                          false, false),
  ('Francis',  'Perez Suarez',        'Mechanic Piping',                                'pipe-fitters',  '{}',                                          false, false),
  ('Jean',     'Ramirez',             'Technitian/Piping/Wiring/Start-up/Service',      'wiring-startup','{service-call,pipe-fitters}',                 false, false),
  ('Rafal',    'Rozniata',            'Maintanance/Demo/Piping/Wiring/Emergency calls', 'maintenance',   '{wiring-startup,pipe-fitters,disconnect-demo}', false, false),
  ('Vitalii',  'Solianyk',            'Helper Piping',                                  'pipe-fitters',  '{}',                                          false, true),
  ('Raul',     'Solorzano',           'Helper Piping',                                  'pipe-fitters',  '{}',                                          false, true),
  ('Vsevolod', 'Talsky',              'Foreman/ Mech Ductwork',                         'foreman',       '{sheetmetal}',                                true,  false),
  ('Isaias',   'Tapia',               'Mechanic Piping',                                'pipe-fitters',  '{}',                                          false, false),
  ('Joseph',   'Taylor',              'Foreman/ Mech Ductwork',                         'foreman',       '{sheetmetal}',                                true,  false),
  ('Sergii',   'Tiutiunnyk',          'Mechanic Ductwork',                              'sheetmetal',    '{}',                                          false, false),
  ('Jesus',    'Valerio',             'Helper Piping/Ductwork/Service',                 'pipe-fitters',  '{service-call,sheetmetal}',                   false, true),
  ('Antonio',  'Valle Robles',        'Mechanic Piping',                                'pipe-fitters',  '{}',                                          false, false),
  ('Andrii',   'Vavryk',              'Helper Piping/Ductwork/Service',                 'pipe-fitters',  '{service-call,sheetmetal}',                   false, true),
  ('Maxim',    NULL,                  'Start-up/Wiring/Piping/Service',                 'wiring-startup','{service-call,pipe-fitters}',                 false, false),
  ('Vova',     NULL,                  'Start-up/Wiring/Piping/Service',                 'wiring-startup','{service-call,pipe-fitters}',                 false, false)
ON CONFLICT (first_name, last_name) DO UPDATE
  SET position = EXCLUDED.position,
      primary_skill = EXCLUDED.primary_skill,
      skills = EXCLUDED.skills,
      is_foreman = EXCLUDED.is_foreman,
      is_helper = EXCLUDED.is_helper;


-- =============================================================================
-- SEED DATA — 40 active projects from Russ's Excel (one-time, idempotent)
-- =============================================================================
-- Make project name unique-ish per short_code so we can re-run safely.
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_short_code_unique;
ALTER TABLE projects ADD CONSTRAINT projects_short_code_unique UNIQUE (short_code);

INSERT INTO projects (name, short_code, customer, address, status, notes) VALUES
  ('26 West 9th Street',                  '26W',   'Alexander Wolf and Son',         '26 West 9th Street, New York, NY 10011',                                'active', NULL),
  ('Brooklyn Conservatory of Music',      'BCM',   'Consigli',                       '1 Prospect Park West, Brooklyn, New York 11215',                        'active', E'Crew: Foreman Manuel Cruz; Mech: Santos, Giovanny\nNeed: Starting 4/27 add 4 pipefitters for 3 weeks'),
  ('CENTRALE - 89 E 42ND STREET',         'CGCS',  'Vanguard Construction',          '89 East 42nd Street, New York, New York 10017',                         'active', E'Crew: Joseph Taylor, Maximo\nNeed: starting 4/27 or 4/28, add 4 pipefitters for 3 weeks'),
  ('I.M.L Culture Fly',                   'CFP',   'Precision Building & Consulting, LLC', '48 West 37th Street 12th & 13th Floors, New York, NY 10018',     'active', 'Need to confirm with PM Chris what is left and duration'),
  ('Dante Restaurant',                    'DR',    'Streamline USA',                 '210 Elizabeth Street, New York, New York 10012',                        'active', 'Need crew to complete wiring and Start-up: 2-3 days duration'),
  ('DBI Commercial Whitebox',             'DBI',   'Nucor Construction',             '19 East 88th Street, New York, New York 10128',                         'active', E'Crew: Mech Farhod, Faridun\nNeed: install piping - 2 pipefitters for 6-7 days'),
  ('Flight Club - 31 Union Sq West',      'FC',    'Streamline USA',                 '31 Union Square West, New York, New York 10003',                        'active', E'Crew: Foreman Seva; Duct mech Sergii, Pradeep, Firdavs\nNeed: push piping install - 2 additional pipefitters'),
  ('Greenspace Self Storage Milltown',    'MINJ',  'ELS Construction',               '142 Ryders Lane, Milltown, New Jersey 8850',                            'active', 'Andrei to confirm what is left and duration'),
  ('India Pentecostal Assembly Church',   'IPA',   'West Rac Contracting Corp',      '310 South Oyster Bay Rd, Syosset, New York 11791',                      'active', E'Crew: Ductwork sub JM Haley; Piping Ruslan A., Viktor\nNeed another 3-4 days'),
  ('JM 370 7th Ave 4th Floor - 7 Penn Plaza', '7PP', 'AFIAA',                        '7 Penn Plaza 4th Floor, New York, New York 10001',                      'active', 'Confirm with PM Chris what is left and duration'),
  ('Paramount Group Altaris',             'PG',    'L&K Partners',                   '31 West 52nd Street, New York, NY 10019',                               'active', 'Confirm with PM Whitney what is left and duration'),
  ('MATLOFF Greenhouse',                  'GH',    'QBG',                            '377 West 11th Street, New York, New York 10014',                        'active', 'Confirm with PM Whitney what is left and duration'),
  ('LA Fitness Eastchester Road',         'LAFB',  'Donnelly Construction',          '1776 Eastchester Road, Bronx, New York 10461',                          'active', E'Crew: Jose Ortega, Wilson Guarchar\nConfirm with PM Chris'),
  ('Matchaful (350 Greenwich Street)',    'MT',    'Folor',                          '350 Greenwich St, New York, New York 10013',                            'active', E'Sub: ADLS (Jason)\nConfirm with PM Chris'),
  ('Story Cannabis',                      'SCH',   'Construction One',               '51-53 14th Street, Hoboken, New Jersey 07030',                          'active', 'Confirm with PM Whitney'),
  ('Skinny Louie - Flatbush Ave',         'SLF',   'Imian Partners LLC',             '218 Flatbush Avenue, Brooklyn, New York 11217',                         'active', E'Crew: Fido\nConfirm with PM Chris'),
  ('Seafarers International House',       'SIH',   'L&K Partners',                   '123 East 15th Street, New York, New York 10003',                        'active', E'Crew: Antonio\nConfirm with Andrei'),
  ('Sadhu Vaswani Center',                'SVC',   'Sachi Group LLC',                '110 Ryders Lane East Brunswick, New Jersey 08816',                      'active', E'Sub: Atlantic Air (Anwar)\nNot started yet, confirm with PM Whitney'),
  ('Queens Public Library',               'QPL',   'Clune Construction',             '95-15 Horace Harding Expwy, Corona, New York 11368',                    'active', E'Piping: Jean, Jesus; Ductwork sub: Master Precision\nConfirm with Whitney'),
  ('Pura Vida 5th Avenue',                'PVM',   'JRM',                            '100 5th Avenue, New York, New York 10011',                              'active', E'Piping/Wiring/Start-up: Vova and Maxim for next 2 days'),
  ('NY Endovascular Center / American Endo', 'EVC', 'Eastman Cooke',                 '505 East 116th Street 4th Floor, New York, New York 10019',            'active', E'Sub: ADLS (Jason)\nConfirm with PM Chris'),
  ('Yeshiva University',                  'YU',    'Vanguard Construction',          '2495 Amsterdam Avenue, New York, New York 10033',                       'active', 'Confirm with Andrei'),
  ('Saddle River Day School',             'SRDS',  'March Construction',             '147 Chestnut Ridge Rd, Saddle River, New Jersey 07458',                 'active', E'Wiring/Piping: Alberto; BMS sub: AME\nConfirm with Andrei'),
  ('Tesla Brooklyn Maintenance',          'TBM',   'Autobuilders General Contracting','Tesla Brooklyn, New York',                                              'active', 'Confirm with Andrei'),
  ('Warby Parker - Port Chester',         'WPPC',  'Horizon Retail Construction',    '526 Boston Post Road, Port Chester, New York 10573',                    'active', 'Schedule Testing and Balancing - PM Whitney'),
  ('RA Cohen',                            'RACL',  'GTL Construction LLC',           '2 Overhill Road, Scarsdale, New York 10583',                            'active', E'Sub: Master Precision (Luis)\nConfirm with PM Whitney'),
  ('J-Crew Marlboro Plaza',               'JCMP',  'Planit Construction USA',        '144 US-9, Englishtown, New Jersey 07726',                               'active', E'Sub: Atlantic Air (Anwar)\nConfirm with Andrei'),
  ('K9 Resort',                           'K9R',   'Gibian LLC',                     '295 Front Street, Brooklyn, New York 11201',                            'active', E'Sub: Master Precision (Luis)\nNot started yet, confirm with PM Chris'),
  ('SOMPO 2nd & 3rd Floors',              'SOMPO', 'Clune Construction',             '1001 Franklin Ave. Garden City, NY 11503',                              'active', E'Sub: ADLS (Jason)\n4/28 or 4/29 need 2 pipefitters for 3-4 days'),
  ('Citizen Belmont Park',                'CBP',   'Folor',                          '2501 Hempstead Turnpike, Elmont, NY 11003',                             'active', 'Not started yet, confirm with PM Chris'),
  ('ACNE Studio Meatpacking',             'ASG',   'Folor',                          '82 Ganservoort St, New York, NY 10014',                                 'active', 'Not started yet, confirm with PM Chris'),
  ('American Red Cross',                  'ARC',   'Russco',                         '520 West 49th Street, New York, NY 10019',                              'active', 'Not started yet, confirm with PM Whitney'),
  ('580 Fifth Ave Suite 1100B',           'FAS',   'Vanguard',                       '580 5th Ave - Suite 1100B, New York, NY 10036',                         'active', 'Not started yet, confirm with PM Chris'),
  ('Strong Pilates',                      'SPT',   'PWC Companies',                  '88 Leonard St, New York, NY 10013',                                     'active', 'Not started yet, confirm with PM Chris'),
  ('Pura Vida (255 Vesey Street)',        'PVMVS', 'Certified Construction',         '255 Vesey Street, New York, NY 10282',                                  'active', 'Not started yet, confirm with PM Whitney'),
  ('645 Madison Avenue 16th Floor',       '645MAD','Sentinel Builders',              '645 Madison Avenue, 16th Fl, New York, NY 10022',                       'active', 'Not started yet, confirm with PM Chris'),
  ('Centene/Fidelis Care 37-49 82nd Street', 'CFCJH','Carlyle Construction',          '37-49 82nd Street, Jackson Heights, NY 11372',                         'active', 'Not started yet, confirm with Andrei'),
  ('El Califa de Leon',                   'ECDL',  'Imian Partners LLC',             '20 West 3rd Street, New York, NY 10010',                                'active', 'Need to start disconnects/demo. Confirm with PM Whitney'),
  ('Medical Office Fitout',               'MO',    'RP Brennan',                     '51-18 190th Street, New York, NY',                                      'active', E'Crew: Ruslan O., Ihor O.\nConfirm with PM Chris')
ON CONFLICT (short_code) DO UPDATE
  SET name = EXCLUDED.name,
      customer = EXCLUDED.customer,
      address = EXCLUDED.address,
      status = EXCLUDED.status,
      notes = EXCLUDED.notes;

-- =============================================================================
-- DONE
-- =============================================================================
SELECT 'Schedule schema installed. ' ||
       (SELECT COUNT(*) FROM schedule_techs) || ' techs, ' ||
       (SELECT COUNT(*) FROM projects WHERE short_code IS NOT NULL) || ' projects with short_code.' AS result;
