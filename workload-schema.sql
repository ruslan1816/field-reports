-- ═══════════════════════════════════════════════════════════════════
-- Workload Planner — capacity tracking fields on projects table
-- ═══════════════════════════════════════════════════════════════════
--
-- Purpose: PMs update these weekly. Management uses aggregate view to
-- decide hiring / staff reduction based on upcoming labor demand.
--
-- Apply once via Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS percent_complete       INTEGER CHECK (percent_complete BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS headcount_needed       INTEGER CHECK (headcount_needed >= 0),
  ADD COLUMN IF NOT EXISTS days_remaining         INTEGER CHECK (days_remaining >= 0),
  ADD COLUMN IF NOT EXISTS target_completion_date DATE,
  ADD COLUMN IF NOT EXISTS remaining_tasks        TEXT,
  ADD COLUMN IF NOT EXISTS planned_man_hours      INTEGER CHECK (planned_man_hours >= 0),
  ADD COLUMN IF NOT EXISTS actual_man_hours       INTEGER CHECK (actual_man_hours >= 0),
  ADD COLUMN IF NOT EXISTS workload_notes         TEXT,
  ADD COLUMN IF NOT EXISTS workload_updated_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS workload_updated_by    UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Optional index for filtering active projects by target date
CREATE INDEX IF NOT EXISTS idx_projects_target_completion
  ON projects (target_completion_date)
  WHERE status = 'active';

-- ═══════════════════════════════════════════════════════════════════
-- Verify columns were added
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(column_name, ', ' ORDER BY column_name)
    INTO cols
  FROM information_schema.columns
  WHERE table_name = 'projects'
    AND column_name IN (
      'percent_complete','headcount_needed','days_remaining',
      'target_completion_date','remaining_tasks','planned_man_hours',
      'actual_man_hours','workload_notes','workload_updated_at',
      'workload_updated_by'
    );
  RAISE NOTICE 'Workload columns present on projects: %', COALESCE(cols, 'NONE');
END $$;
