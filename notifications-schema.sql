-- =============================================================================
-- Northern Wolves — Phase 7: Notifications + Mini-chat (DB layer)
-- =============================================================================
-- Run once in Supabase SQL Editor. Idempotent.
--
-- What this installs:
--   1. notifications              — feed of events for each PM
--   2. notification_preferences   — per-user email opt-in/out
--   3. entry_subscriptions        — who follows which schedule entry
--   4. updated_by column on schedule_entries (so triggers know the actor)
--   5. SECURITY DEFINER triggers that auto-subscribe creator/foreman/PM and
--      create notification rows on entry insert/update + comment insert
--   6. Realtime publication (so the bell + chat update live)
--   7. Helper RPCs for the front end
--   8. Backfill of subscriptions for existing entries
-- =============================================================================

-- 0. updated_by column (so the UPDATE trigger knows who made the change)
ALTER TABLE schedule_entries ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- =============================================================================
-- 1. NOTIFICATIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_email TEXT,                    -- denormalized so Apps Script webhook can email without a join
  actor_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_name      TEXT,
  entry_id        UUID REFERENCES schedule_entries(id) ON DELETE CASCADE,
  comment_id      UUID REFERENCES schedule_comments(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN (
                    'entry_created', 'entry_updated', 'comment_added'
                  )),
  title           TEXT NOT NULL,
  body            TEXT,
  link_url        TEXT,                    -- e.g. https://app.northernwolvesac.com/schedule.html?entry=<uuid>
  is_read         BOOLEAN DEFAULT FALSE,
  email_sent      BOOLEAN DEFAULT FALSE,   -- flipped by Apps Script after Gmail send
  email_sent_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON notifications(recipient_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_entry ON notifications(entry_id);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif_read_own"   ON notifications;
DROP POLICY IF EXISTS "notif_update_own" ON notifications;
DROP POLICY IF EXISTS "notif_delete_own" ON notifications;
CREATE POLICY "notif_read_own"   ON notifications FOR SELECT TO authenticated USING (recipient_id = auth.uid());
CREATE POLICY "notif_update_own" ON notifications FOR UPDATE TO authenticated USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());
CREATE POLICY "notif_delete_own" ON notifications FOR DELETE TO authenticated USING (recipient_id = auth.uid());
-- INSERTs only happen via SECURITY DEFINER triggers — no INSERT policy needed for end users.

-- =============================================================================
-- 2. NOTIFICATION PREFERENCES (per user)
-- =============================================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id                 UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  email_on_entry_created  BOOLEAN DEFAULT TRUE,
  email_on_entry_updated  BOOLEAN DEFAULT TRUE,
  email_on_comment_added  BOOLEAN DEFAULT TRUE,
  inapp_enabled           BOOLEAN DEFAULT TRUE,
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prefs_rw_own" ON notification_preferences;
CREATE POLICY "prefs_rw_own" ON notification_preferences
  FOR ALL TO authenticated
  USING      (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Auto-create a row of preferences for every new profile (with sane defaults)
CREATE OR REPLACE FUNCTION fn_seed_notification_prefs() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notification_preferences (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_profiles_seed_prefs ON profiles;
CREATE TRIGGER trg_profiles_seed_prefs AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION fn_seed_notification_prefs();

-- Backfill prefs for existing profiles
INSERT INTO notification_preferences (user_id) SELECT id FROM profiles ON CONFLICT DO NOTHING;

-- =============================================================================
-- 3. ENTRY SUBSCRIPTIONS  (who follows which schedule entry)
-- =============================================================================
CREATE TABLE IF NOT EXISTS entry_subscriptions (
  entry_id      UUID NOT NULL REFERENCES schedule_entries(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source        TEXT,            -- 'auto-creator', 'auto-foreman', 'auto-pm', 'auto-commenter', 'manual'
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (entry_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_entry_subs_user ON entry_subscriptions(user_id);

ALTER TABLE entry_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subs_read_all"        ON entry_subscriptions;
DROP POLICY IF EXISTS "subs_insert_self"     ON entry_subscriptions;
DROP POLICY IF EXISTS "subs_delete_own"      ON entry_subscriptions;
CREATE POLICY "subs_read_all"    ON entry_subscriptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "subs_insert_self" ON entry_subscriptions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "subs_delete_own"  ON entry_subscriptions FOR DELETE TO authenticated USING (user_id = auth.uid());

-- =============================================================================
-- 4. HELPER: build a deep link to the schedule entry
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_entry_link_url(p_entry UUID) RETURNS TEXT AS $$
  SELECT 'https://app.northernwolvesac.com/schedule.html?entry=' || p_entry::text;
$$ LANGUAGE SQL IMMUTABLE;

-- =============================================================================
-- 5. TRIGGER: schedule_entries AFTER INSERT
--    - auto-subscribes creator + foreman's profile + project PM
--    - notifies all subscribers except the creator themselves
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_entry_after_insert() RETURNS TRIGGER AS $$
DECLARE
  v_pm_profile_id      UUID;
  v_foreman_profile_id UUID;
  v_project_label      TEXT;
  v_actor_name         TEXT;
  v_actor_email        TEXT;
  v_crew_label         TEXT;
BEGIN
  -- creator
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO entry_subscriptions (entry_id, user_id, source)
    VALUES (NEW.id, NEW.created_by, 'auto-creator')
    ON CONFLICT DO NOTHING;
  END IF;

  -- foreman: schedule_techs.profile_id (only if the foreman is also an app user)
  IF NEW.foreman_id IS NOT NULL THEN
    SELECT profile_id INTO v_foreman_profile_id
      FROM schedule_techs WHERE id = NEW.foreman_id;
    IF v_foreman_profile_id IS NOT NULL THEN
      INSERT INTO entry_subscriptions (entry_id, user_id, source)
      VALUES (NEW.id, v_foreman_profile_id, 'auto-foreman')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- project PM: lookup via projects.pm_email → profiles.email
  IF NEW.project_id IS NOT NULL THEN
    SELECT pf.id INTO v_pm_profile_id
      FROM projects pr
      JOIN profiles pf ON LOWER(pf.email) = LOWER(pr.pm_email)
     WHERE pr.id = NEW.project_id AND pr.pm_email IS NOT NULL
     LIMIT 1;
    IF v_pm_profile_id IS NOT NULL THEN
      INSERT INTO entry_subscriptions (entry_id, user_id, source)
      VALUES (NEW.id, v_pm_profile_id, 'auto-pm')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- Pre-compute display labels
  SELECT COALESCE(pr.short_code, pr.project_name, 'Project')
    INTO v_project_label
    FROM projects pr WHERE pr.id = NEW.project_id;

  SELECT full_name, email INTO v_actor_name, v_actor_email
    FROM profiles WHERE id = NEW.created_by;

  v_crew_label := REPLACE(NEW.crew_type, '-', ' ');

  -- Create notifications for every subscriber except the creator
  INSERT INTO notifications (
    recipient_id, recipient_email, actor_id, actor_name,
    entry_id, type, title, body, link_url
  )
  SELECT
    s.user_id,
    pf.email,
    NEW.created_by,
    v_actor_name,
    NEW.id,
    'entry_created',
    COALESCE(v_actor_name, 'Someone') || ' added ' || v_crew_label || ' on ' || COALESCE(v_project_label, 'a project'),
    COALESCE(NEW.scope_summary, '') ||
      CASE WHEN NEW.scope_summary IS NOT NULL THEN ' — ' ELSE '' END ||
      NEW.start_date::text || ' → ' || NEW.end_date::text ||
      CASE WHEN NEW.manpower_needed IS NOT NULL
           THEN ' (' || NEW.manpower_needed || ' needed)' ELSE '' END,
    fn_entry_link_url(NEW.id)
  FROM entry_subscriptions s
  JOIN profiles pf ON pf.id = s.user_id
  WHERE s.entry_id = NEW.id
    AND (NEW.created_by IS NULL OR s.user_id <> NEW.created_by);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_entry_after_insert ON schedule_entries;
CREATE TRIGGER trg_entry_after_insert AFTER INSERT ON schedule_entries
  FOR EACH ROW EXECUTE FUNCTION fn_entry_after_insert();

-- =============================================================================
-- 6. TRIGGER: schedule_entries AFTER UPDATE
--    - notifies subscribers when material fields change
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_entry_after_update() RETURNS TRIGGER AS $$
DECLARE
  v_changes        TEXT[];
  v_change_summary TEXT;
  v_project_label  TEXT;
  v_actor_name     TEXT;
  v_crew_label     TEXT;
BEGIN
  -- Skip if nothing material changed
  IF  NEW.start_date       =  OLD.start_date
  AND NEW.end_date         =  OLD.end_date
  AND NEW.status           =  OLD.status
  AND NEW.scope_summary   IS NOT DISTINCT FROM OLD.scope_summary
  AND NEW.notes           IS NOT DISTINCT FROM OLD.notes
  AND NEW.assigned_tech_ids =  OLD.assigned_tech_ids
  AND NEW.foreman_id      IS NOT DISTINCT FROM OLD.foreman_id
  AND NEW.priority        IS NOT DISTINCT FROM OLD.priority
  AND NEW.manpower_needed IS NOT DISTINCT FROM OLD.manpower_needed
  THEN
    RETURN NEW;
  END IF;

  v_changes := ARRAY[]::TEXT[];
  IF NEW.start_date <> OLD.start_date OR NEW.end_date <> OLD.end_date THEN
    v_changes := array_append(v_changes, 'dates → ' || NEW.start_date::text || ' / ' || NEW.end_date::text);
  END IF;
  IF NEW.status <> OLD.status THEN
    v_changes := array_append(v_changes, 'status → ' || NEW.status);
  END IF;
  IF NEW.scope_summary IS DISTINCT FROM OLD.scope_summary THEN
    v_changes := array_append(v_changes, 'scope updated');
  END IF;
  IF NEW.assigned_tech_ids <> OLD.assigned_tech_ids THEN
    v_changes := array_append(v_changes, 'crew updated');
  END IF;
  IF NEW.foreman_id IS DISTINCT FROM OLD.foreman_id THEN
    v_changes := array_append(v_changes, 'foreman changed');
  END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    v_changes := array_append(v_changes, 'priority → ' || NEW.priority);
  END IF;
  IF NEW.notes IS DISTINCT FROM OLD.notes THEN
    v_changes := array_append(v_changes, 'notes updated');
  END IF;
  IF NEW.manpower_needed IS DISTINCT FROM OLD.manpower_needed THEN
    v_changes := array_append(v_changes, 'manpower → ' || COALESCE(NEW.manpower_needed::text, 'n/a'));
  END IF;

  v_change_summary := array_to_string(v_changes, ', ');

  SELECT COALESCE(pr.short_code, pr.project_name, 'Project')
    INTO v_project_label
    FROM projects pr WHERE pr.id = NEW.project_id;

  SELECT full_name INTO v_actor_name FROM profiles WHERE id = NEW.updated_by;
  v_crew_label := REPLACE(NEW.crew_type, '-', ' ');

  INSERT INTO notifications (
    recipient_id, recipient_email, actor_id, actor_name,
    entry_id, type, title, body, link_url
  )
  SELECT
    s.user_id,
    pf.email,
    NEW.updated_by,
    v_actor_name,
    NEW.id,
    'entry_updated',
    COALESCE(v_actor_name, 'Someone') || ' updated ' || v_crew_label || ' on ' || COALESCE(v_project_label, 'a project'),
    v_change_summary,
    fn_entry_link_url(NEW.id)
  FROM entry_subscriptions s
  JOIN profiles pf ON pf.id = s.user_id
  WHERE s.entry_id = NEW.id
    AND (NEW.updated_by IS NULL OR s.user_id <> NEW.updated_by);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_entry_after_update ON schedule_entries;
CREATE TRIGGER trg_entry_after_update AFTER UPDATE ON schedule_entries
  FOR EACH ROW EXECUTE FUNCTION fn_entry_after_update();

-- =============================================================================
-- 7. TRIGGER: schedule_comments AFTER INSERT
--    - auto-subscribes the commenter (so they get replies)
--    - notifies all other subscribers
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_comment_after_insert() RETURNS TRIGGER AS $$
DECLARE
  v_project_label TEXT;
  v_actor_name    TEXT;
  v_entry_crew    TEXT;
BEGIN
  -- Auto-subscribe the commenter (so they get replies)
  IF NEW.author_id IS NOT NULL THEN
    INSERT INTO entry_subscriptions (entry_id, user_id, source)
    VALUES (NEW.entry_id, NEW.author_id, 'auto-commenter')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Pre-compute labels
  SELECT COALESCE(pr.short_code, pr.project_name, 'Project'),
         se.crew_type
    INTO v_project_label, v_entry_crew
    FROM schedule_entries se
    LEFT JOIN projects pr ON pr.id = se.project_id
   WHERE se.id = NEW.entry_id;

  v_actor_name := COALESCE(NEW.author_name,
                           (SELECT full_name FROM profiles WHERE id = NEW.author_id),
                           'Someone');

  -- Notify all subscribers except the commenter
  INSERT INTO notifications (
    recipient_id, recipient_email, actor_id, actor_name,
    entry_id, comment_id, type, title, body, link_url
  )
  SELECT
    s.user_id,
    pf.email,
    NEW.author_id,
    v_actor_name,
    NEW.entry_id,
    NEW.id,
    'comment_added',
    v_actor_name || ' commented on ' || COALESCE(v_project_label, 'an entry') ||
      CASE WHEN v_entry_crew IS NOT NULL THEN ' (' || REPLACE(v_entry_crew, '-', ' ') || ')' ELSE '' END,
    LEFT(NEW.body, 240),
    fn_entry_link_url(NEW.entry_id)
  FROM entry_subscriptions s
  JOIN profiles pf ON pf.id = s.user_id
  WHERE s.entry_id = NEW.entry_id
    AND (NEW.author_id IS NULL OR s.user_id <> NEW.author_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_comment_after_insert ON schedule_comments;
CREATE TRIGGER trg_comment_after_insert AFTER INSERT ON schedule_comments
  FOR EACH ROW EXECUTE FUNCTION fn_comment_after_insert();

-- =============================================================================
-- 8. REALTIME PUBLICATION
--    Enable realtime for: notifications, schedule_comments, schedule_entries
-- =============================================================================
DO $$
BEGIN
  -- These ALTERs throw if the table is already in the publication, so wrap.
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  EXCEPTION WHEN duplicate_object OR invalid_parameter_value THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE schedule_comments;
  EXCEPTION WHEN duplicate_object OR invalid_parameter_value THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE schedule_entries;
  EXCEPTION WHEN duplicate_object OR invalid_parameter_value THEN NULL; END;
END $$;

-- =============================================================================
-- 9. RPC: mark_all_notifications_read — convenience for the bell
-- =============================================================================
CREATE OR REPLACE FUNCTION mark_all_notifications_read() RETURNS INT AS $$
DECLARE n INT;
BEGIN
  UPDATE notifications SET is_read = TRUE
   WHERE recipient_id = auth.uid() AND is_read = FALSE;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- =============================================================================
-- 10. BACKFILL: subscribe creator/foreman/PM for existing entries
--     so the first turn of notifications has a valid audience.
-- =============================================================================
DO $$
BEGIN
  -- creators
  INSERT INTO entry_subscriptions (entry_id, user_id, source)
  SELECT id, created_by, 'auto-creator'
    FROM schedule_entries
   WHERE created_by IS NOT NULL
  ON CONFLICT DO NOTHING;

  -- foremen (those linked to a profile)
  INSERT INTO entry_subscriptions (entry_id, user_id, source)
  SELECT se.id, st.profile_id, 'auto-foreman'
    FROM schedule_entries se
    JOIN schedule_techs st ON st.id = se.foreman_id
   WHERE st.profile_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  -- project PMs (matched by pm_email)
  INSERT INTO entry_subscriptions (entry_id, user_id, source)
  SELECT se.id, pf.id, 'auto-pm'
    FROM schedule_entries se
    JOIN projects pr ON pr.id = se.project_id
    JOIN profiles pf ON LOWER(pf.email) = LOWER(pr.pm_email)
   WHERE pr.pm_email IS NOT NULL
  ON CONFLICT DO NOTHING;
END $$;

-- =============================================================================
-- DONE
-- =============================================================================
SELECT 'Notifications + chat schema installed. ' ||
       (SELECT COUNT(*) FROM entry_subscriptions) || ' subscriptions backfilled, ' ||
       (SELECT COUNT(*) FROM notification_preferences) || ' user pref rows.' AS result;
