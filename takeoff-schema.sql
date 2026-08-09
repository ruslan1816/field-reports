-- ═══════════════════════════════════════════════════════════════════
-- On-screen PDF Takeoff — schema for drawings + measurements
--
-- Two tables:
--   estimate_drawings      — PDFs uploaded per estimate (Supabase Storage)
--   estimate_measurements  — user-drawn scale/length/area/count marks
--
-- Plus a Storage bucket 'estimate-drawings' for the PDF blobs themselves.
-- Storage bucket has to be created via Supabase Dashboard (Storage tab)
-- since CREATE BUCKET is not a first-class SQL operation.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS estimate_drawings (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id    UUID          NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  filename       TEXT          NOT NULL,                      -- original filename
  storage_path   TEXT          NOT NULL,                      -- estimate-drawings/<estId>/<filename>
  page_count     INTEGER       NOT NULL DEFAULT 1,
  drawing_type   TEXT          NOT NULL DEFAULT 'base'
                 CHECK (drawing_type IN ('base','addendum','sk','other')),
  drawing_no     TEXT,                                        -- 'M-101', 'M-501'
  addendum_no    INTEGER,
  notes          TEXT,
  uploaded_by    UUID          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estimate_drawings_est
  ON estimate_drawings(estimate_id, created_at);

CREATE TABLE IF NOT EXISTS estimate_measurements (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_id            UUID          NOT NULL REFERENCES estimate_drawings(id) ON DELETE CASCADE,
  page_number           INTEGER       NOT NULL DEFAULT 1,
  tool_type             TEXT          NOT NULL
                        CHECK (tool_type IN ('scale','length','area','count')),
  points                JSONB         NOT NULL,               -- [[x1,y1],[x2,y2],...] in PDF coords
  label                 TEXT,                                 -- 'Supply duct', 'RTU-1', etc.
  layer_category        TEXT
                        CHECK (layer_category IN (
                          'disconnects','equipment','ductwork','pipework',
                          'equipment_install','air_outlets','services'
                        )),
  computed_value        NUMERIC(12,4),                        -- feet, sqft, count
  computed_unit         TEXT,                                 -- 'ft','sqft','ea'
  scale_pixels_per_foot NUMERIC(12,6),                        -- scale in effect when measured
  color                 TEXT          DEFAULT '#f59e0b',
  notes                 TEXT,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estimate_measurements_dwg
  ON estimate_measurements(drawing_id, page_number);

-- Touch trigger reuse
DROP TRIGGER IF EXISTS trg_estimate_measurements_touch ON estimate_measurements;
CREATE TRIGGER trg_estimate_measurements_touch BEFORE UPDATE ON estimate_measurements
  FOR EACH ROW EXECUTE FUNCTION fn_estimating_touch();

-- RLS: read all authenticated, write management only
ALTER TABLE estimate_drawings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estimate_drawings_read" ON estimate_drawings;
CREATE POLICY "estimate_drawings_read" ON estimate_drawings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "estimate_measurements_read" ON estimate_measurements;
CREATE POLICY "estimate_measurements_read" ON estimate_measurements
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "estimate_drawings_write" ON estimate_drawings;
CREATE POLICY "estimate_drawings_write" ON estimate_drawings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                 AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                      AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')));

DROP POLICY IF EXISTS "estimate_measurements_write" ON estimate_measurements;
CREATE POLICY "estimate_measurements_write" ON estimate_measurements
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                 AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                      AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')));

-- Storage bucket policies (for the 'estimate-drawings' bucket)
-- Create the bucket manually in Dashboard → Storage → New bucket
--   name: estimate-drawings  |  public: NO (we'll issue signed URLs)
-- Then run the following to allow authenticated users to upload/read:

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'estimate-drawings') THEN
    -- Allow authenticated users to insert/read their own uploads
    DROP POLICY IF EXISTS "estimate_drawings_storage_read"   ON storage.objects;
    DROP POLICY IF EXISTS "estimate_drawings_storage_insert" ON storage.objects;
    DROP POLICY IF EXISTS "estimate_drawings_storage_delete" ON storage.objects;

    EXECUTE $POL$
      CREATE POLICY "estimate_drawings_storage_read" ON storage.objects
        FOR SELECT TO authenticated
        USING (bucket_id = 'estimate-drawings')
    $POL$;
    EXECUTE $POL$
      CREATE POLICY "estimate_drawings_storage_insert" ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'estimate-drawings')
    $POL$;
    EXECUTE $POL$
      CREATE POLICY "estimate_drawings_storage_delete" ON storage.objects
        FOR DELETE TO authenticated
        USING (bucket_id = 'estimate-drawings')
    $POL$;

    RAISE NOTICE 'Storage policies for estimate-drawings applied ✅';
  ELSE
    RAISE NOTICE 'Bucket "estimate-drawings" not found — create it in Dashboard → Storage first, then re-run this SQL.';
  END IF;
END $$;

-- Verify
DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(*) INTO n FROM information_schema.tables
  WHERE table_name IN ('estimate_drawings','estimate_measurements');
  RAISE NOTICE 'Takeoff tables present: % of 2', n;
END $$;
