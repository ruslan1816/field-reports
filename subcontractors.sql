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
  ('ADLS',             'Jason', 'sheetmetal', NULL),
  ('JM Haley',         NULL,    'sheetmetal', NULL),
  ('Atlantic Air',     'Anwar', 'mixed',      'HVAC mechanical'),
  ('Master Precision', 'Luis',  'sheetmetal', NULL),
  ('AME',              NULL,    'controls',   'BMS / DDC controls')
ON CONFLICT (name) DO UPDATE
  SET contact_name = EXCLUDED.contact_name,
      trade = EXCLUDED.trade,
      notes = EXCLUDED.notes;

SELECT 'Subs registry installed. ' ||
       (SELECT COUNT(*) FROM subcontractors WHERE is_active) || ' active subs.' AS result;
