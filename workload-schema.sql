-- ═══════════════════════════════════════════════════════════════════
-- Workload Planner — capacity tracking fields on projects table
-- ═══════════════════════════════════════════════════════════════════
--
-- Purpose: PMs update these weekly. Management uses aggregate view to
-- decide hiring / staff reduction based on upcoming labor demand.
--
-- Breaks headcount down by crew type (matches schedule_techs skills):
--   • sm_needed        → sheetmetal crew
--   • pipe_needed      → pipe-fitters crew
--   • startup_needed   → wiring / start-up crew
-- Plus optional subcontractor headcount per crew (if include_subs = true).
-- 1 day = 8 man-hours per person (used for planned vs actual comparison).
--
-- Apply once via Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE projects
  -- Progress + timeline
  ADD COLUMN IF NOT EXISTS percent_complete       INTEGER CHECK (percent_complete BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS days_remaining         INTEGER CHECK (days_remaining >= 0),
  ADD COLUMN IF NOT EXISTS target_completion_date DATE,
  ADD COLUMN IF NOT EXISTS remaining_tasks        TEXT,

  -- Headcount by NW crew type
  ADD COLUMN IF NOT EXISTS sm_needed              INTEGER CHECK (sm_needed      >= 0),
  ADD COLUMN IF NOT EXISTS pipe_needed            INTEGER CHECK (pipe_needed    >= 0),
  ADD COLUMN IF NOT EXISTS startup_needed         INTEGER CHECK (startup_needed >= 0),

  -- Subcontractor headcount (optional; enabled per project)
  ADD COLUMN IF NOT EXISTS include_subs           BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS subs_sm_needed         INTEGER CHECK (subs_sm_needed      >= 0),
  ADD COLUMN IF NOT EXISTS subs_pipe_needed       INTEGER CHECK (subs_pipe_needed    >= 0),
  ADD COLUMN IF NOT EXISTS subs_startup_needed    INTEGER CHECK (subs_startup_needed >= 0),

  -- Man-hours budget vs actual (optional, for post-project comparison)
  ADD COLUMN IF NOT EXISTS planned_man_hours      INTEGER CHECK (planned_man_hours >= 0),
  ADD COLUMN IF NOT EXISTS actual_man_hours       INTEGER CHECK (actual_man_hours  >= 0),

  -- Audit
  ADD COLUMN IF NOT EXISTS workload_notes         TEXT,
  ADD COLUMN IF NOT EXISTS workload_updated_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS workload_updated_by    UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Legacy field from earlier v1 draft — drop if present so client code
-- doesn't accidentally read stale headcount_needed values.
ALTER TABLE projects DROP COLUMN IF EXISTS headcount_needed;

-- Index for filtering active projects by target date
CREATE INDEX IF NOT EXISTS idx_projects_target_completion
  ON projects (target_completion_date)
  WHERE status = 'active';

-- ═══════════════════════════════════════════════════════════════════
-- Verify columns
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
      'percent_complete','days_remaining','target_completion_date',
      'remaining_tasks','sm_needed','pipe_needed','startup_needed',
      'include_subs','subs_sm_needed','subs_pipe_needed','subs_startup_needed',
      'planned_man_hours','actual_man_hours','workload_notes',
      'workload_updated_at','workload_updated_by'
    );
  RAISE NOTICE 'Workload columns present on projects: %', COALESCE(cols, 'NONE');
END $$;
