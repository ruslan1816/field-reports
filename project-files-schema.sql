-- ═══════════════════════════════════════════════════════════════════
-- Project Files — general document storage per project
--
-- Mirrors Kastriot's per-project folder structure in Drive (Drawings/,
-- Quotes/, RFI/, Specs/, Leveling Sheet/, etc.) but in-app so field
-- techs and PMs can attach docs without opening Drive.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS project_files (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename     TEXT          NOT NULL,
  storage_path TEXT          NOT NULL,
  category     TEXT          NOT NULL DEFAULT 'other'
               CHECK (category IN (
                 'drawings','quotes','rfi','specs','permits','submittals',
                 'leveling_sheet','close_out','photos','contracts','other'
               )),
  size_bytes   BIGINT,
  content_type TEXT,
  notes        TEXT,
  uploaded_by  UUID          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id, category, created_at DESC);

DROP TRIGGER IF EXISTS trg_project_files_touch ON project_files;
CREATE TRIGGER trg_project_files_touch BEFORE UPDATE ON project_files
  FOR EACH ROW EXECUTE FUNCTION fn_estimating_touch();

ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_files_read"  ON project_files;
DROP POLICY IF EXISTS "project_files_write" ON project_files;

-- Everyone authenticated can see project files
CREATE POLICY "project_files_read" ON project_files
  FOR SELECT TO authenticated USING (true);

-- Field techs can also upload files (photos of jobsite, etc.) — write open to all authenticated.
-- If you want to restrict, swap this policy to the management-role EXISTS clause used elsewhere.
CREATE POLICY "project_files_write" ON project_files
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('project-files', 'project-files', false, 104857600)  -- 100 MB
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "project_files_storage_read"   ON storage.objects;
DROP POLICY IF EXISTS "project_files_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "project_files_storage_delete" ON storage.objects;

CREATE POLICY "project_files_storage_read"   ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'project-files');
CREATE POLICY "project_files_storage_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'project-files');
CREATE POLICY "project_files_storage_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'project-files');

DO $$ BEGIN
  RAISE NOTICE 'Project Files ready — table + bucket + policies applied ✅';
END $$;
