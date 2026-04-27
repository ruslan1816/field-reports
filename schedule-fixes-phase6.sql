-- =============================================================================
-- Phase 6 fixes:
--   1. Foremen now count as sheetmetal/ductwork workers (with ★ flag)
--   2. New status 'pending-approval' (= "Required - pending approval")
--   3. Comment RLS: managers/admins can edit/delete any comment
-- =============================================================================
-- Run once in Supabase SQL Editor. Idempotent.
-- =============================================================================

-- 1. Move foremen into sheetmetal primary_skill (they were primary_skill='foreman'
--    which made them invisible in the tech picker). The is_foreman flag stays
--    true so they keep the ★ marker.
UPDATE schedule_techs
   SET primary_skill = 'sheetmetal'
 WHERE is_foreman = TRUE AND primary_skill = 'foreman';

-- 2. Add 'pending-approval' to the schedule_entries.status CHECK constraint
ALTER TABLE schedule_entries DROP CONSTRAINT IF EXISTS schedule_entries_status_check;
ALTER TABLE schedule_entries ADD CONSTRAINT schedule_entries_status_check
  CHECK (status IN (
    'scheduled', 'in-progress', 'completed',
    'cancelled', 'delayed', 'blocked',
    'pending-approval'
  ));

-- 3. Comment RLS: managers/admins can edit/delete any comment, not just their own.
--    Authors keep edit/delete rights on their own comments.
DROP POLICY IF EXISTS "comments_modify_owner" ON schedule_comments;
DROP POLICY IF EXISTS "comments_delete_owner" ON schedule_comments;
DROP POLICY IF EXISTS "comments_modify_any"   ON schedule_comments;
DROP POLICY IF EXISTS "comments_delete_any"   ON schedule_comments;
CREATE POLICY "comments_modify_any" ON schedule_comments FOR UPDATE TO authenticated
  USING      (auth.uid() = author_id OR is_manager_or_admin())
  WITH CHECK (auth.uid() = author_id OR is_manager_or_admin());
CREATE POLICY "comments_delete_any" ON schedule_comments FOR DELETE TO authenticated
  USING      (auth.uid() = author_id OR is_manager_or_admin());

SELECT 'Phase 6 fixes applied. ' ||
       (SELECT COUNT(*) FROM schedule_techs WHERE is_foreman) ||
       ' foremen now visible as sheetmetal workers.' AS result;
