-- ═══════════════════════════════════════════════════════════════════
-- Bid Board v2 — schema patch
-- Covers:
--   1. Documents fix — project_files can attach to an estimate directly
--   2. Phase C — Estimate versions (E1/E2/E3 alternate estimates)
--   3. Phase E — Proposal WYSIWYG HTML column
-- (Phase D templates already covered in v1 via is_template + template_source_id)
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. project_files: optional estimate_id, exclusive with project_id ─
ALTER TABLE project_files
  ADD COLUMN IF NOT EXISTS estimate_id UUID REFERENCES estimates(id) ON DELETE CASCADE;

-- Make project_id nullable so an estimate-only file can exist
ALTER TABLE project_files ALTER COLUMN project_id DROP NOT NULL;

-- Exactly one owner (project OR estimate) — but only when both cols are populated
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'project_files_owner_xor'
  ) THEN
    ALTER TABLE project_files
      ADD CONSTRAINT project_files_owner_xor
      CHECK (
        (project_id IS NOT NULL AND estimate_id IS NULL) OR
        (project_id IS NULL     AND estimate_id IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_files_estimate
  ON project_files(estimate_id, category, created_at DESC)
  WHERE estimate_id IS NOT NULL;

-- ─── 2. estimates: alternate versions (E1/E2/E3) ────────────────────
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS parent_estimate_id  UUID REFERENCES estimates(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS version_label       TEXT NOT NULL DEFAULT 'Original Estimate',
  ADD COLUMN IF NOT EXISTS version_number      INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_estimates_parent
  ON estimates(parent_estimate_id) WHERE parent_estimate_id IS NOT NULL;

-- Convenience view: primary estimate rows only (what the Bid Board shows)
CREATE OR REPLACE VIEW v_bid_projects AS
  SELECT * FROM estimates WHERE parent_estimate_id IS NULL;

-- ─── 3. Proposal WYSIWYG (Phase E) ──────────────────────────────────
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS proposal_html TEXT;

-- ─── Verify ─────────────────────────────────────────────────────────
DO $$
DECLARE
  pf_estimate_col int; est_parent_col int; est_proposal_col int; est_ver_col int;
BEGIN
  SELECT COUNT(*) INTO pf_estimate_col FROM information_schema.columns
   WHERE table_name='project_files' AND column_name='estimate_id';
  SELECT COUNT(*) INTO est_parent_col FROM information_schema.columns
   WHERE table_name='estimates' AND column_name='parent_estimate_id';
  SELECT COUNT(*) INTO est_ver_col FROM information_schema.columns
   WHERE table_name='estimates' AND column_name='version_number';
  SELECT COUNT(*) INTO est_proposal_col FROM information_schema.columns
   WHERE table_name='estimates' AND column_name='proposal_html';
  RAISE NOTICE 'project_files.estimate_id present:    %', pf_estimate_col;
  RAISE NOTICE 'estimates.parent_estimate_id present: %', est_parent_col;
  RAISE NOTICE 'estimates.version_number present:     %', est_ver_col;
  RAISE NOTICE 'estimates.proposal_html present:      %', est_proposal_col;
END $$;
