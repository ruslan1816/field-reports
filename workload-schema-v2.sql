-- ═══════════════════════════════════════════════════════════════════
-- Workload Planner v2 — per-crew days remaining
-- ═══════════════════════════════════════════════════════════════════
--
-- Adds days-remaining fields per crew category so PMs can say
-- "sheetmetal needs 2 men for 5 more days, piping needs 3 men for 12".
-- Drops the single days_remaining field — replaced by per-crew values.
-- Man-hours calc becomes: SUM over crews of (men × days × 8).
--
-- Apply once via Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE projects
  -- Per-crew days remaining (NW crew)
  ADD COLUMN IF NOT EXISTS sm_days      INTEGER CHECK (sm_days      >= 0),
  ADD COLUMN IF NOT EXISTS pipe_days    INTEGER CHECK (pipe_days    >= 0),
  ADD COLUMN IF NOT EXISTS startup_days INTEGER CHECK (startup_days >= 0),

  -- Per-crew days remaining (subs)
  ADD COLUMN IF NOT EXISTS subs_sm_days      INTEGER CHECK (subs_sm_days      >= 0),
  ADD COLUMN IF NOT EXISTS subs_pipe_days    INTEGER CHECK (subs_pipe_days    >= 0),
  ADD COLUMN IF NOT EXISTS subs_startup_days INTEGER CHECK (subs_startup_days >= 0);

-- Drop the single overall days_remaining — replaced by per-crew fields
ALTER TABLE projects DROP COLUMN IF EXISTS days_remaining;

-- ═══════════════════════════════════════════════════════════════════
-- Verify
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
      'sm_days','pipe_days','startup_days',
      'subs_sm_days','subs_pipe_days','subs_startup_days'
    );
  RAISE NOTICE 'Per-crew days columns present: %', COALESCE(cols, 'NONE');
END $$;
