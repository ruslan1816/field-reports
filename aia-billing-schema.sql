-- ═══════════════════════════════════════════════════════════════════
-- AIA Billing (G702/G703) — schema for progress-invoicing feature
-- ═══════════════════════════════════════════════════════════════════
--
-- Design:
--   aia_projects      — per-project billing setup (contract sum, retainage, etc.)
--   aia_applications  — one row per monthly Application for Payment (G702)
--   aia_line_items    — Schedule of Values line items (G703)
--
-- Apply once via Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

-- ─── aia_projects ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aia_projects (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  original_contract_sum  NUMERIC(12,2) NOT NULL,
  retainage_rate         NUMERIC(5,4)  NOT NULL DEFAULT 0.05,   -- 5% default
  contract_date          DATE,
  contract_for           TEXT,
  client_name            TEXT,
  client_address         TEXT,
  architect_name         TEXT,
  architect_address      TEXT,
  contractor_name        TEXT NOT NULL DEFAULT 'Northern Wolves, Inc.',
  contractor_address     TEXT NOT NULL DEFAULT '55 9th Str., Unit 55A-2, Brooklyn, New York 11215',
  billing_notes          TEXT,
  created_by             UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id)
);

CREATE INDEX IF NOT EXISTS idx_aia_projects_project ON aia_projects(project_id);

-- ─── aia_applications ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aia_applications (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  aia_project_id         UUID        NOT NULL REFERENCES aia_projects(id) ON DELETE CASCADE,
  application_no         INTEGER     NOT NULL,
  period_from            DATE        NOT NULL,
  period_to              DATE        NOT NULL,
  application_date       DATE        NOT NULL DEFAULT CURRENT_DATE,
  previous_certificates  NUMERIC(12,2) NOT NULL DEFAULT 0,      -- G702 Line 7

  -- Change Order Summary numbers
  co_prev_additions      NUMERIC(12,2) NOT NULL DEFAULT 0,
  co_prev_deductions     NUMERIC(12,2) NOT NULL DEFAULT 0,
  co_this_additions      NUMERIC(12,2) NOT NULL DEFAULT 0,
  co_this_deductions     NUMERIC(12,2) NOT NULL DEFAULT 0,

  status                 TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','submitted','certified','paid','void')),
  submitted_at           TIMESTAMPTZ,
  certified_at           TIMESTAMPTZ,
  paid_at                TIMESTAMPTZ,
  amount_certified       NUMERIC(12,2),
  architect_notes        TEXT,

  created_by             UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(aia_project_id, application_no)
);

CREATE INDEX IF NOT EXISTS idx_aia_applications_project ON aia_applications(aia_project_id, application_no);
CREATE INDEX IF NOT EXISTS idx_aia_applications_status  ON aia_applications(status);

-- ─── aia_line_items ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aia_line_items (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id         UUID        NOT NULL REFERENCES aia_applications(id) ON DELETE CASCADE,
  item_no                TEXT        NOT NULL,            -- '1', '2', '14.1.1', etc.
  budget_code            TEXT,
  description            TEXT        NOT NULL,
  scheduled_value        NUMERIC(12,2) NOT NULL DEFAULT 0,
  prev_amount            NUMERIC(12,2) NOT NULL DEFAULT 0,  -- from previous applications
  this_amount            NUMERIC(12,2) NOT NULL DEFAULT 0,  -- work this period
  stored_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,  -- materials presently stored
  is_change_order        BOOLEAN     NOT NULL DEFAULT FALSE,
  is_parent              BOOLEAN     NOT NULL DEFAULT FALSE, -- for PCCO/PCO header rows
  parent_item_no         TEXT,                              -- for hierarchy grouping
  sort_order             INTEGER     NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aia_line_items_app ON aia_line_items(application_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_aia_line_items_co  ON aia_line_items(application_id, is_change_order);

-- ─── updated_at auto-touch triggers ────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_aia_touch_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_aia_projects_touch ON aia_projects;
CREATE TRIGGER trg_aia_projects_touch BEFORE UPDATE ON aia_projects
  FOR EACH ROW EXECUTE FUNCTION fn_aia_touch_updated();

DROP TRIGGER IF EXISTS trg_aia_applications_touch ON aia_applications;
CREATE TRIGGER trg_aia_applications_touch BEFORE UPDATE ON aia_applications
  FOR EACH ROW EXECUTE FUNCTION fn_aia_touch_updated();

DROP TRIGGER IF EXISTS trg_aia_line_items_touch ON aia_line_items;
CREATE TRIGGER trg_aia_line_items_touch BEFORE UPDATE ON aia_line_items
  FOR EACH ROW EXECUTE FUNCTION fn_aia_touch_updated();

-- ─── Row-level security ────────────────────────────────────────────────────
ALTER TABLE aia_projects     ENABLE ROW LEVEL SECURITY;
ALTER TABLE aia_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE aia_line_items   ENABLE ROW LEVEL SECURITY;

-- Read: all authenticated users (they'll only see the card if they're mgmt/PM anyway)
DROP POLICY IF EXISTS "aia_projects_read"     ON aia_projects;
DROP POLICY IF EXISTS "aia_applications_read" ON aia_applications;
DROP POLICY IF EXISTS "aia_line_items_read"   ON aia_line_items;
CREATE POLICY "aia_projects_read"     ON aia_projects     FOR SELECT TO authenticated USING (true);
CREATE POLICY "aia_applications_read" ON aia_applications FOR SELECT TO authenticated USING (true);
CREATE POLICY "aia_line_items_read"   ON aia_line_items   FOR SELECT TO authenticated USING (true);

-- Write: only management / PMs (checked via profiles.role)
DROP POLICY IF EXISTS "aia_projects_write"     ON aia_projects;
DROP POLICY IF EXISTS "aia_applications_write" ON aia_applications;
DROP POLICY IF EXISTS "aia_line_items_write"   ON aia_line_items;

CREATE POLICY "aia_projects_write" ON aia_projects
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                 AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                      AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')));

CREATE POLICY "aia_applications_write" ON aia_applications
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                 AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                      AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')));

CREATE POLICY "aia_line_items_write" ON aia_line_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                 AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                      AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')));

-- ─── Verify ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n int;
BEGIN
  SELECT COUNT(*) INTO n
  FROM information_schema.tables
  WHERE table_name IN ('aia_projects','aia_applications','aia_line_items');
  RAISE NOTICE 'AIA billing tables present: % of 3', n;
END $$;
