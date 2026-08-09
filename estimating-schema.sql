-- ═══════════════════════════════════════════════════════════════════
-- Estimating — schema for bid/proposal workflow
-- Matches Kastriot's Drive Standards (2026-08-09):
--   • Single labor rate $60/hr flat (no per-crew split)
--   • Overhead 20% (30% if OFCI = owner-furnished equipment)
--   • Miscellaneous 2% of Base Subtotal (peer to overhead, not compounded)
--   • Sales tax 8.875% on material + equipment only
--   • Wet-tap $10,000/connection (Piping section, own component)
--   • 7 fixed cost-breakdown categories:
--     1. disconnects  2. equipment  3. ductwork  4. pipework
--     5. equipment_install  6. air_outlets  7. services
-- ═══════════════════════════════════════════════════════════════════

-- ─── estimates ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS estimates (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             UUID          REFERENCES projects(id) ON DELETE SET NULL,
  estimate_no            TEXT,                                            -- 10011, 10012...
  name                   TEXT          NOT NULL,
  client_name            TEXT,
  client_address         TEXT,
  project_address        TEXT,
  bid_due_date           DATE,
  status                 TEXT          NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','sent','awarded','lost','void')),

  -- Rates & markups (from Pricing and Markup Standards)
  labor_rate             NUMERIC(6,2)  NOT NULL DEFAULT 60.00,            -- $/hr per man, flat
  is_ofci                BOOLEAN       NOT NULL DEFAULT FALSE,            -- 30% overhead when true
  overhead_pct           NUMERIC(6,5)  NOT NULL DEFAULT 0.20000,          -- 20% (30% OFCI)
  miscellaneous_pct      NUMERIC(6,5)  NOT NULL DEFAULT 0.02000,          -- 2% of Base Subtotal
  tax_rate               NUMERIC(6,5)  NOT NULL DEFAULT 0.08875,          -- NY 8.875%

  -- Proposal text
  scope_summary          TEXT,
  inclusions             TEXT,
  exclusions             TEXT,
  notes                  TEXT,

  -- Multi-estimator ownership (matches Kastriot/Alikhan/Ruslan folders)
  estimator_name         TEXT,
  quote_number           INTEGER       UNIQUE,                             -- auto-assigned from sequence

  created_by             UUID          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  sent_at                TIMESTAMPTZ,
  awarded_at             TIMESTAMPTZ,
  aia_project_id         UUID          REFERENCES aia_projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_estimates_project ON estimates(project_id);
CREATE INDEX IF NOT EXISTS idx_estimates_status  ON estimates(status);
CREATE INDEX IF NOT EXISTS idx_estimates_bid_due ON estimates(bid_due_date) WHERE status IN ('draft','sent');

-- Auto-assign quote_number from a shared sequence starting at 10011
-- (Kastriot's Drive workspace log ended at 10010 for L'Catteron; next is 10011)
CREATE SEQUENCE IF NOT EXISTS estimates_quote_no_seq START WITH 10011;

CREATE OR REPLACE FUNCTION fn_assign_quote_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $qn$
BEGIN
  IF NEW.quote_number IS NULL THEN
    NEW.quote_number := nextval('estimates_quote_no_seq');
  END IF;
  RETURN NEW;
END; $qn$;

DROP TRIGGER IF EXISTS trg_estimates_quote_no ON estimates;
CREATE TRIGGER trg_estimates_quote_no BEFORE INSERT ON estimates
  FOR EACH ROW EXECUTE FUNCTION fn_assign_quote_number();

-- ─── estimate_line_items ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS estimate_line_items (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id            UUID          NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  parent_id              UUID          REFERENCES estimate_line_items(id) ON DELETE CASCADE,

  -- Fixed 7 categories matching Kastriot's Cost Breakdown Template
  category               TEXT          NOT NULL
                         CHECK (category IN (
                           'disconnects',
                           'equipment',
                           'ductwork',
                           'pipework',
                           'equipment_install',
                           'air_outlets',
                           'services'
                         )),

  description            TEXT          NOT NULL,
  quantity               NUMERIC(12,4) NOT NULL DEFAULT 0,
  unit                   TEXT,                                             -- 'ea','lf','sf','lb','hr','ls'
  unit_material_cost     NUMERIC(12,4) NOT NULL DEFAULT 0,
  unit_labor_hours       NUMERIC(12,4) NOT NULL DEFAULT 0,

  -- Optional crew tag — used ONLY for Copy-to-Workload push (labor $ is single rate)
  labor_crew_type        TEXT          NOT NULL DEFAULT 'sm'
                         CHECK (labor_crew_type IN ('sm','pipe','startup','other','none')),

  -- Equipment-specific fields
  vendor_name            TEXT,
  vendor_quote_ref       TEXT,
  is_firm                BOOLEAN       NOT NULL DEFAULT TRUE,              -- FALSE = budget/placeholder

  -- Wet-tap flag — priced in Piping section, kept separate in Totals
  is_wet_tap             BOOLEAN       NOT NULL DEFAULT FALSE,

  notes                  TEXT,
  sort_order             INTEGER       NOT NULL DEFAULT 0,
  is_optional            BOOLEAN       NOT NULL DEFAULT FALSE,             -- alternate / not in base
  is_alternate           BOOLEAN       NOT NULL DEFAULT FALSE,

  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estimate_lines_est ON estimate_line_items(estimate_id, sort_order);

-- ─── estimate_assemblies — reusable library ────────────────────────────────
CREATE TABLE IF NOT EXISTS estimate_assemblies (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT          NOT NULL,
  category               TEXT          NOT NULL
                         CHECK (category IN (
                           'disconnects','equipment','ductwork','pipework',
                           'equipment_install','air_outlets','services'
                         )),
  description            TEXT,
  quantity_default       NUMERIC(12,4) NOT NULL DEFAULT 1,
  unit                   TEXT,
  unit_material_cost     NUMERIC(12,4) NOT NULL DEFAULT 0,
  unit_labor_hours       NUMERIC(12,4) NOT NULL DEFAULT 0,
  labor_crew_type        TEXT          NOT NULL DEFAULT 'sm',
  vendor_name            TEXT,
  notes                  TEXT,
  is_active              BOOLEAN       NOT NULL DEFAULT TRUE,
  created_by             UUID          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
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
