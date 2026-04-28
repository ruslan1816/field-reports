-- =============================================================================
-- Northern Wolves — Drop "Pending Approval" + "Blocked" statuses
-- =============================================================================
-- Run once in Supabase SQL Editor. Idempotent.
--
-- What this does:
--   1. Migrates existing rows:
--        pending-approval → pending-crew (no crew) or scheduled (has crew)
--        blocked          → delayed
--   2. Updates the CHECK constraint to remove the two statuses
--   3. Updates the BEFORE INSERT/UPDATE trigger so 'pending-approval' is no
--      longer treated as an implicit-pending state
-- =============================================================================

-- 1. Migrate existing rows BEFORE we tighten the CHECK constraint
UPDATE schedule_entries
   SET status = CASE
     WHEN (assigned_tech_ids IS NULL OR array_length(assigned_tech_ids, 1) IS NULL)
          AND (is_subcontractor IS NOT TRUE OR subcontractor_name IS NULL OR subcontractor_name = '')
     THEN 'pending-crew'
     ELSE 'scheduled'
   END
 WHERE status = 'pending-approval';

UPDATE schedule_entries
   SET status = 'delayed'
 WHERE status = 'blocked';

-- 2. Tighten CHECK constraint
ALTER TABLE schedule_entries DROP CONSTRAINT IF EXISTS schedule_entries_status_check;
ALTER TABLE schedule_entries ADD CONSTRAINT schedule_entries_status_check
  CHECK (status IN (
    'scheduled', 'in-progress', 'completed',
    'cancelled', 'delayed', 'pending-crew'
  ));

-- 3. Update trigger so 'pending-approval' is no longer in the implicit list
CREATE OR REPLACE FUNCTION fn_entry_normalize_crew_status() RETURNS TRIGGER AS $$
DECLARE
  v_has_crew BOOLEAN;
BEGIN
  v_has_crew := (NEW.assigned_tech_ids IS NOT NULL
                 AND array_length(NEW.assigned_tech_ids, 1) > 0)
              OR (NEW.is_subcontractor = TRUE
                  AND NEW.subcontractor_name IS NOT NULL
                  AND NEW.subcontractor_name <> '');

  IF NOT v_has_crew THEN
    -- No crew. Auto-flip to pending-crew unless user picked an explicit
    -- terminal/working state (in-progress / completed / cancelled / delayed).
    IF NEW.status IS NULL OR NEW.status = 'scheduled' THEN
      NEW.status := 'pending-crew';
    END IF;
  ELSE
    -- Crew assigned. If status was pending-crew, flip back to scheduled.
    IF NEW.status = 'pending-crew' THEN
      NEW.status := 'scheduled';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- DONE
-- =============================================================================
SELECT 'Cleanup complete. ' ||
       (SELECT COUNT(*) FROM schedule_entries WHERE status = 'pending-crew') || ' pending-crew, ' ||
       (SELECT COUNT(*) FROM schedule_entries WHERE status = 'scheduled')    || ' scheduled, ' ||
       (SELECT COUNT(*) FROM schedule_entries WHERE status = 'in-progress')  || ' in-progress, ' ||
       (SELECT COUNT(*) FROM schedule_entries WHERE status = 'delayed')      || ' delayed, ' ||
       (SELECT COUNT(*) FROM schedule_entries WHERE status = 'completed')    || ' completed, ' ||
       (SELECT COUNT(*) FROM schedule_entries WHERE status = 'cancelled')    || ' cancelled.' AS result;
