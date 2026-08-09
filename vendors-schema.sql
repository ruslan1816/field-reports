-- ═══════════════════════════════════════════════════════════════════
-- Vendors — schema + seed from Kastriot's /Reference/Vendors/
--
-- Three tables:
--   vendors               — one row per vendor company
--   vendor_contacts       — multiple people per vendor
--   vendor_manufacturers  — many-to-many: vendor reps N manufacturers
--
-- Data sources (Google Drive):
--   Reference/Vendors/HVAC Vendor Contacts.md
--   Reference/Vendors/Manufacturer to Vendor Mapping.md
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vendors (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT          NOT NULL UNIQUE,          -- 'ADE', 'Trane', 'SRS Enterprises'
  quote_email  TEXT,                                    -- primary bid intake email
  extra_emails TEXT,                                    -- additional intake emails, comma-separated
  notes        TEXT,
  is_active    BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendor_contacts (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID          NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name        TEXT          NOT NULL,
  email       TEXT,
  phone       TEXT,
  title       TEXT,                                     -- 'Sales Engineer', 'Bid Coordinator'
  notes       TEXT,
  is_primary  BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vendor_contacts_vendor ON vendor_contacts(vendor_id);

CREATE TABLE IF NOT EXISTS vendor_manufacturers (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id         UUID          NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  manufacturer_name TEXT          NOT NULL,
  notes             TEXT,                               -- e.g. '(NY only)', '(air curtains)'
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (vendor_id, manufacturer_name)
);
CREATE INDEX IF NOT EXISTS idx_vendor_manufacturers_mfr
  ON vendor_manufacturers(LOWER(manufacturer_name));

-- Touch triggers
DROP TRIGGER IF EXISTS trg_vendors_touch ON vendors;
CREATE TRIGGER trg_vendors_touch BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION fn_estimating_touch();
DROP TRIGGER IF EXISTS trg_vendor_contacts_touch ON vendor_contacts;
CREATE TRIGGER trg_vendor_contacts_touch BEFORE UPDATE ON vendor_contacts
  FOR EACH ROW EXECUTE FUNCTION fn_estimating_touch();

-- RLS
ALTER TABLE vendors              ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_contacts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_manufacturers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendors_read"              ON vendors;
DROP POLICY IF EXISTS "vendor_contacts_read"      ON vendor_contacts;
DROP POLICY IF EXISTS "vendor_manufacturers_read" ON vendor_manufacturers;
CREATE POLICY "vendors_read"              ON vendors              FOR SELECT TO authenticated USING (true);
CREATE POLICY "vendor_contacts_read"      ON vendor_contacts      FOR SELECT TO authenticated USING (true);
CREATE POLICY "vendor_manufacturers_read" ON vendor_manufacturers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "vendors_write"              ON vendors;
DROP POLICY IF EXISTS "vendor_contacts_write"      ON vendor_contacts;
DROP POLICY IF EXISTS "vendor_manufacturers_write" ON vendor_manufacturers;

CREATE POLICY "vendors_write" ON vendors
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                 AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                      AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')));
CREATE POLICY "vendor_contacts_write" ON vendor_contacts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                 AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                      AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')));
CREATE POLICY "vendor_manufacturers_write" ON vendor_manufacturers
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                 AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                      AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')));

DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(*) INTO n FROM information_schema.tables
  WHERE table_name IN ('vendors','vendor_contacts','vendor_manufacturers');
  RAISE NOTICE 'Vendor tables present: % of 3', n;
END $$;
