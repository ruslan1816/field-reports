-- ═══════════════════════════════════════════════════════════════════
-- Estimating — schema for bid/proposal workflow
-- ═══════════════════════════════════════════════════════════════════
--
-- Design:
--   estimates             — one row per bid/proposal
--   estimate_line_items   — hierarchical line items (category → sub-items)
--   estimate_assemblies   — reusable priced units (library)
--
-- Apply once via Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

-- ─── estimates ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS estimates (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID        REFERENCES projects(id) ON DELETE SET NULL,
  estimate_no       TEXT,                                        -- e.g. EST-2026-001
  name              TEXT        NOT NULL,
  client_name       TEXT,
  client_address    TEXT,
  project_address   TEXT,
  bid_due_date      DATE,
  status            TEXT        NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','awarded','lost','void')),

  -- Labor rates (per-estimate override defaults)
  labor_rate_sm      NUMERIC(6,2) NOT NULL DEFAULT 85.00,
  labor_rate_pipe    NUMERIC(6,2) NOT NULL DEFAULT 85.00,
  labor_rate_startup NUMERIC(6,2) NOT NULL DEFAULT 95.00,
  labor_rate_other   NUMERIC(6,2) NOT NULL DEFAULT 75.00,

  -- Markups
  tax_rate           NUMERIC(6,5) NOT NULL DEFAULT 0.08875,      -- NY state + city
  overhead_pct       NUMERIC(6,5) NOT NULL DEFAULT 0.15000,      -- 15%
  profit_pct         NUMERIC(6,5) NOT NULL DEFAULT 0.10000,      -- 10%
  contingency_pct    NUMERIC(6,5) NOT NULL DEFAULT 0.05000,      -- 5%
  bond_pct           NUMERIC(6,5) NOT NULL DEFAULT 0.00000,      -- 0% (only if bonded)

  -- Proposal text
  scope_summary     TEXT,
  inclusions        TEXT,
  exclusions        TEXT,
  notes             TEXT,

  created_by        UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at           TIMESTAMPTZ,
  awarded_at        TIMESTAMPTZ,
  aia_project_id    UUID        REFERENCES aia_projects(id) ON DELETE SET NULL   -- link once won
);

CREATE INDEX IF NOT EXISTS idx_estimates_project  ON estimates(project_id);
CREATE INDEX IF NOT EXISTS idx_estimates_status   ON estimates(status);
CREATE INDEX IF NOT EXISTS idx_estimates_bid_due  ON estimates(bid_due_date) WHERE status IN ('draft','sent');

-- ─── estimate_line_items ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS estimate_line_items (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id            UUID        NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  parent_id              UUID        REFERENCES estimate_line_items(id) ON DELETE CASCADE,
  category               TEXT        NOT NULL
                         CHECK (category IN ('mobilization','equipment','sm','piping','controls',
                                             'insulation','tab','startup','closeout','permits',
                                             'rentals','other')),
  description            TEXT        NOT NULL,
  quantity               NUMERIC(12,4) NOT NULL DEFAULT 0,
  unit                   TEXT,                                    -- 'ea','lf','sf','lb','hr','ls'
  unit_material_cost     NUMERIC(12,4) NOT NULL DEFAULT 0,
  unit_labor_hours       NUMERIC(12,4) NOT NULL DEFAULT 0,
  labor_crew_type        TEXT        NOT NULL DEFAULT 'sm'
                         CHECK (labor_crew_type IN ('sm','pipe','startup','other','none')),
  vendor_name            TEXT,
  vendor_quote_ref       TEXT,
  notes                  TEXT,
  sort_order             INTEGER     NOT NULL DEFAULT 0,
  is_optional            BOOLEAN     NOT NULL DEFAULT FALSE,
  is_alternate           BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estimate_lines_est ON estimate_line_items(estimate_id, sort_order);

-- ─── estimate_assemblies — reusable library ────────────────────────────────
CREATE TABLE IF NOT EXISTS estimate_assemblies (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT        NOT NULL,
  category               TEXT        NOT NULL
                         CHECK (category IN ('mobilization','equipment','sm','piping','controls',
                                             'insulation','tab','startup','closeout','permits',
                                             'rentals','other')),
  description            TEXT,
  quantity_default       NUMERIC(12,4) NOT NULL DEFAULT 1,
  unit                   TEXT,
  unit_material_cost     NUMERIC(12,4) NOT NULL DEFAULT 0,
  unit_labor_hours       NUMERIC(12,4) NOT NULL DEFAULT 0,
  labor_crew_type        TEXT        NOT NULL DEFAULT 'sm',
  vendor_name            TEXT,
  notes                  TEXT,
  is_active              BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by             UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estimate_assemblies_active_cat
  ON estimate_assemblies(category, name) WHERE is_active;

-- ─── touch triggers ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_estimating_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_estimates_touch ON estimates;
CREATE TRIGGER trg_estimates_touch BEFORE UPDATE ON estimates
  FOR EACH ROW EXECUTE FUNCTION fn_estimating_touch();

DROP TRIGGER IF EXISTS trg_estimate_lines_touch ON estimate_line_items;
CREATE TRIGGER trg_estimate_lines_touch BEFORE UPDATE ON estimate_line_items
  FOR EACH ROW EXECUTE FUNCTION fn_estimating_touch();

DROP TRIGGER IF EXISTS trg_estimate_assemblies_touch ON estimate_assemblies;
CREATE TRIGGER trg_estimate_assemblies_touch BEFORE UPDATE ON estimate_assemblies
  FOR EACH ROW EXECUTE FUNCTION fn_estimating_touch();

-- ─── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE estimates             ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_line_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_assemblies   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estimates_read"           ON estimates;
DROP POLICY IF EXISTS "estimate_line_items_read" ON estimate_line_items;
DROP POLICY IF EXISTS "estimate_assemblies_read" ON estimate_assemblies;
CREATE POLICY "estimates_read"           ON estimates           FOR SELECT TO authenticated USING (true);
CREATE POLICY "estimate_line_items_read" ON estimate_line_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "estimate_assemblies_read" ON estimate_assemblies FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "estimates_write"           ON estimates;
DROP POLICY IF EXISTS "estimate_line_items_write" ON estimate_line_items;
DROP POLICY IF EXISTS "estimate_assemblies_write" ON estimate_assemblies;

CREATE POLICY "estimates_write" ON estimates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                 AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                      AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')));

CREATE POLICY "estimate_line_items_write" ON estimate_line_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                 AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                      AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')));

CREATE POLICY "estimate_assemblies_write" ON estimate_assemblies
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                 AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                      AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')));

-- ─── Verify ────────────────────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(*) INTO n FROM information_schema.tables
  WHERE table_name IN ('estimates','estimate_line_items','estimate_assemblies');
  RAISE NOTICE 'Estimating tables present: % of 3', n;
END $$;
