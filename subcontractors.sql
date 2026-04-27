-- =============================================================================
-- Northern Wolves — Subcontractors registry
-- =============================================================================
-- Run once in Supabase SQL Editor. Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS subcontractors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  display_name  TEXT GENERATED ALWAYS AS (
                  CASE WHEN contact_name IS NULL OR contact_name = ''
                       THEN name
                       ELSE name || ' (' || contact_name || ')'
                  END
                ) STORED,
  contact_name  TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  trade         TEXT,        -- 'sheetmetal', 'piping', 'controls', 'mixed', 'other'
  is_active     BOOLEAN DEFAULT TRUE,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure name uniqueness so seed re-runs are idempotent
ALTER TABLE subcontractors DROP CONSTRAINT IF EXISTS subs_name_unique;
ALTER TABLE subcontractors ADD CONSTRAINT subs_name_unique UNIQUE (name);

-- RLS: any authenticated user can read; only manager/admin can write
ALTER TABLE subcontractors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subs_read_all"    ON subcontractors;
DROP POLICY IF EXISTS "subs_write_admin" ON subcontractors;
CREATE POLICY "subs_read_all"    ON subcontractors FOR SELECT TO authenticated USING (true);
CREATE POLICY "subs_write_admin" ON subcontractors FOR ALL    TO authenticated USING (is_manager_or_admin()) WITH CHECK (is_manager_or_admin());

-- =============================================================================
-- Seed data — subs mentioned in Russ's Excel
-- =============================================================================
INSERT INTO subcontractors (name, contact_name, trade, notes) VALUES
  ('ADLS',                       'Jason', 'sheetmetal', NULL),
  ('JM Haley',                   NULL,    'sheetmetal', NULL),
  ('Atlantic Air',               'Anwar', 'mixed',      'HVAC mechanical'),
  ('Master Precision',           'Luis',  'sheetmetal', NULL),
  ('AME',                        NULL,    'controls',   'BMS / DDC controls'),
  ('Evens Cooling & Heating LLC', NULL,   'mixed',      NULL)
ON CONFLICT (name) DO UPDATE
  SET contact_name = EXCLUDED.contact_name,
      trade = EXCLUDED.trade,
      notes = EXCLUDED.notes;

-- =============================================================================
-- PROJECT MANAGERS registry
-- =============================================================================
CREATE TABLE IF NOT EXISTS project_managers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  role          TEXT,        -- 'project_manager', 'lead_pm', 'estimator', 'admin'
  is_active     BOOLEAN DEFAULT TRUE,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE project_managers DROP CONSTRAINT IF EXISTS pm_name_unique;
ALTER TABLE project_managers ADD CONSTRAINT pm_name_unique UNIQUE (name);

ALTER TABLE project_managers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pms_read_all"    ON project_managers;
DROP POLICY IF EXISTS "pms_write_admin" ON project_managers;
CREATE POLICY "pms_read_all"    ON project_managers FOR SELECT TO authenticated USING (true);
CREATE POLICY "pms_write_admin" ON project_managers FOR ALL    TO authenticated USING (is_manager_or_admin()) WITH CHECK (is_manager_or_admin());

-- Seed PMs from Russ's Excel notes (Chris, Whitney, Andrei) + Russ himself
INSERT INTO project_managers (name, role) VALUES
  ('Chris',   'project_manager'),
  ('Whitney', 'project_manager'),
  ('Andrei',  'lead_pm'),
  ('Russ',    'admin')
ON CONFLICT (name) DO UPDATE
  SET role = EXCLUDED.role;

SELECT 'Subs + PMs registry installed. ' ||
       (SELECT COUNT(*) FROM subcontractors  WHERE is_active) || ' subs, ' ||
       (SELECT COUNT(*) FROM project_managers WHERE is_active) || ' PMs.' AS result;
