-- ═══════════════════════════════════════════════════════════════════
-- Bid Board redesign — schema patch
-- Matches Procore Bid Board layout captured 2026-08-09 from Russ's account.
--
-- Adds pipeline stages + invitation tracking + project fields to estimates.
-- Old `status` column stays as-is for backward compat with existing rows.
-- New `bid_stage` becomes the driver for the Bid Board pipeline tabs.
-- ═══════════════════════════════════════════════════════════════════

-- 10 pipeline stages, matching Procore exactly
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS bid_stage          TEXT NOT NULL DEFAULT 'estimating'
     CHECK (bid_stage IN (
       'invitation','to_do','estimating','bid_submitted',
       'accepted','in_progress','complete','delayed','lost','archived'
     )),
  ADD COLUMN IF NOT EXISTS bid_intent         TEXT
     CHECK (bid_intent IN ('undecided','will_bid','no_bid')),
  ADD COLUMN IF NOT EXISTS requester_company  TEXT,
  ADD COLUMN IF NOT EXISTS requester_email    TEXT,
  ADD COLUMN IF NOT EXISTS invitation_date    DATE,
  ADD COLUMN IF NOT EXISTS due_time           TIME,
  ADD COLUMN IF NOT EXISTS office             TEXT,           -- 'NYC','NJ','LI' etc
  ADD COLUMN IF NOT EXISTS square_footage     NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS project_number     TEXT,           -- customer's project #, distinct from our quote_number
  ADD COLUMN IF NOT EXISTS project_description TEXT,
  ADD COLUMN IF NOT EXISTS is_template        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS template_source_id UUID REFERENCES estimates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at        TIMESTAMPTZ;

-- Backfill bid_stage from existing legacy status field
-- (only where the row was defaulted, i.e. it wasn't overridden already)
UPDATE estimates
   SET bid_stage = CASE
     WHEN status = 'draft'   THEN 'estimating'
     WHEN status = 'sent'    THEN 'bid_submitted'
     WHEN status = 'awarded' THEN 'accepted'
     WHEN status = 'lost'    THEN 'lost'
     WHEN status = 'void'    THEN 'archived'
     ELSE 'estimating'
   END
 WHERE bid_stage = 'estimating' AND status <> 'draft';

CREATE INDEX IF NOT EXISTS idx_estimates_bid_stage
  ON estimates(bid_stage) WHERE bid_stage <> 'archived';
CREATE INDEX IF NOT EXISTS idx_estimates_template
  ON estimates(is_template) WHERE is_template = TRUE;

-- ─── Bid-project notes (right-sidebar Notes panel) ──────────────────
CREATE TABLE IF NOT EXISTS bid_project_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id  UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  body         TEXT NOT NULL,
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bid_notes_est ON bid_project_notes(estimate_id, created_at DESC);

-- ─── Bid-project tasks (right-sidebar Tasks panel) ──────────────────
CREATE TABLE IF NOT EXISTS bid_project_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id  UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  assignee_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  due_date     DATE,
  is_done      BOOLEAN NOT NULL DEFAULT FALSE,
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bid_tasks_est ON bid_project_tasks(estimate_id, is_done, due_date);

-- ─── RLS ────────────────────────────────────────────────────────────
ALTER TABLE bid_project_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_project_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bid_notes_read"  ON bid_project_notes;
DROP POLICY IF EXISTS "bid_notes_write" ON bid_project_notes;
CREATE POLICY "bid_notes_read"  ON bid_project_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "bid_notes_write" ON bid_project_notes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                 AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                      AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')));

DROP POLICY IF EXISTS "bid_tasks_read"  ON bid_project_tasks;
DROP POLICY IF EXISTS "bid_tasks_write" ON bid_project_tasks;
CREATE POLICY "bid_tasks_read"  ON bid_project_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "bid_tasks_write" ON bid_project_tasks FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                 AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                      AND profiles.role IN ('admin','manager','lead_pm','project_manager','apm')));

-- ─── Verify ─────────────────────────────────────────────────────────
DO $$
DECLARE stage_count int; note_tbl int; task_tbl int;
BEGIN
  SELECT COUNT(DISTINCT bid_stage) INTO stage_count FROM estimates;
  SELECT COUNT(*) INTO note_tbl FROM information_schema.tables
    WHERE table_name = 'bid_project_notes';
  SELECT COUNT(*) INTO task_tbl FROM information_schema.tables
    WHERE table_name = 'bid_project_tasks';
  RAISE NOTICE 'Distinct bid_stage values in use: %', stage_count;
  RAISE NOTICE 'bid_project_notes table present: %', note_tbl;
  RAISE NOTICE 'bid_project_tasks table present: %', task_tbl;
END $$;
