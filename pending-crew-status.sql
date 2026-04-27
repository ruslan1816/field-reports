-- =============================================================================
-- Northern Wolves — Add "pending-crew" status + auto-flip trigger
-- =============================================================================
-- Run once in Supabase SQL Editor. Idempotent.
--
-- What this does:
--   1. Adds 'pending-crew' to the schedule_entries.status CHECK constraint
--   2. Installs a BEFORE INSERT/UPDATE trigger that auto-flips the status:
--        - No internal crew + no subcontractor  → 'pending-crew'
--        - Crew gets assigned                    → flips back to 'scheduled'
--      (Never overrides explicit terminal states: completed / cancelled /
--       blocked / delayed / in-progress.)
--   3. Backfills existing entries that are missing a crew assignment.
-- =============================================================================

-- 1. Update CHECK constraint
ALTER TABLE schedule_entries DROP CONSTRAINT IF EXISTS schedule_entries_status_check;
ALTER TABLE schedule_entries ADD CONSTRAINT schedule_entries_status_check
  CHECK (status IN (
    'scheduled', 'in-progress', 'completed',
    'cancelled', 'delayed', 'blocked',
    'pending-approval', 'pending-crew'
  ));

-- 2. BEFORE INSERT/UPDATE trigger — auto-flip status
CREATE OR REPLACE FUNCTION fn_entry_normalize_crew_status() RETURNS TRIGGER AS $$
DECLARE
  v_has_crew BOOLEAN;
BEGIN
  -- "Has crew" = at least one tech OR a subcontractor name
  v_has_crew := (NEW.assigned_tech_ids IS NOT NULL
                 AND array_length(NEW.assigned_tech_ids, 1) > 0)
              OR (NEW.is_subcontractor = TRUE
                  AND NEW.subcontractor_name IS NOT NULL
                  AND NEW.subcontractor_name <> '');

  -- Crew is missing
  IF NOT v_has_crew THEN
    -- Only auto-flip if status is in a "ready to work" state
    IF NEW.status IS NULL
       OR NEW.status IN ('scheduled', 'pending-approval') THEN
      NEW.status := 'pending-crew';
    END IF;
  ELSE
    -- Crew is now assigned. If status was pending-crew, flip back to scheduled.
    IF NEW.status = 'pending-crew' THEN
      NEW.status := 'scheduled';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_entry_normalize_crew_status ON schedule_entries;
CREATE TRIGGER trg_entry_normalize_crew_status
  BEFORE INSERT OR UPDATE ON schedule_entries
  FOR EACH ROW EXECUTE FUNCTION fn_entry_normalize_crew_status();

-- 3. Backfill: any existing scheduled/pending-approval entry with no crew → pending-crew
UPDATE schedule_entries
   SET status = 'pending-crew'
 WHERE (assigned_tech_ids IS NULL OR array_length(assigned_tech_ids, 1) IS NULL)
   AND (is_subcontractor IS NOT TRUE OR subcontractor_name IS NULL OR subcontractor_name = '')
   AND status IN ('scheduled', 'pending-approval');

-- =============================================================================
-- DONE
-- =============================================================================
SELECT 'Pending-crew status installed. ' ||
       (SELECT COUNT(*) FROM schedule_entries WHERE status = 'pending-crew') ||
       ' entries currently flagged as Pending Crew Assignment.' AS result;
