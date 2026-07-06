-- =============================================================================
-- Northern Wolves — Field Orders + Driver Schedule (Phase 8)
-- =============================================================================
-- Run once in Supabase SQL Editor. Idempotent.
--
-- What this installs:
--   1. field_orders table — tech material requests
--   2. RLS policies (everyone reads, techs insert own, managers update)
--   3. Triggers to integrate with existing notifications system
--   4. Jonathan added to global_notification_subscribers
--   5. Updates notifications type CHECK to include field_order_* types
--   6. Helper view for driver schedule (deliveries by day)
-- =============================================================================

-- 1. field_orders table
CREATE TABLE IF NOT EXISTS field_orders (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Requester
  requested_by              UUID REFERENCES profiles(id) ON DELETE SET NULL,
  requested_by_name         TEXT,                            -- snapshot
  requested_at              TIMESTAMPTZ DEFAULT NOW(),

  -- What they need
  items                     TEXT NOT NULL CHECK (length(items) > 0),
  notes                     TEXT,
  photo_urls                TEXT[] DEFAULT '{}',
  priority                  TEXT DEFAULT 'normal'
                            CHECK (priority IN ('urgent', 'normal', 'low')),

  -- Delivery destination (default = project address, can override)
  delivery_address          TEXT,
  needed_by_date            DATE,                            -- when tech needs

  -- Fulfillment
  status                    TEXT DEFAULT 'requested'
                            CHECK (status IN ('requested', 'in_progress', 'delivered', 'cancelled')),
  assigned_to               UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_to_name          TEXT,                            -- snapshot — usually Jonathan

  -- Driver scheduling
  scheduled_delivery_date   DATE,
  scheduled_delivery_start  TIME,
  scheduled_delivery_end    TIME,
  driver_name               TEXT,                            -- 'Roman', 'Vagif', or other
  driver_id                 UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Outcome
  delivered_at              TIMESTAMPTZ,
  delivery_notes            TEXT,

  -- Audit
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_by                UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_field_orders_status        ON field_orders(status);
CREATE INDEX IF NOT EXISTS idx_field_orders_project       ON field_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_field_orders_requester     ON field_orders(requested_by);
CREATE INDEX IF NOT EXISTS idx_field_orders_delivery_date ON field_orders(scheduled_delivery_date);
CREATE INDEX IF NOT EXISTS idx_field_orders_priority      ON field_orders(priority);

-- updated_at auto-bump
DROP TRIGGER IF EXISTS trg_field_orders_touch ON field_orders;
CREATE TRIGGER trg_field_orders_touch BEFORE UPDATE ON field_orders
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 2. RLS
ALTER TABLE field_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "field_orders_read_all"       ON field_orders;
DROP POLICY IF EXISTS "field_orders_insert_self"    ON field_orders;
DROP POLICY IF EXISTS "field_orders_update_anyone"  ON field_orders;
DROP POLICY IF EXISTS "field_orders_delete_admin"   ON field_orders;

-- Everyone authenticated can read (transparency — techs see status of their order, drivers see all deliveries)
CREATE POLICY "field_orders_read_all" ON field_orders
  FOR SELECT TO authenticated USING (true);

-- Techs can insert their own orders
CREATE POLICY "field_orders_insert_self" ON field_orders
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = requested_by);

-- Anyone authenticated can update (we trust the team; admin-only would be too strict for drivers marking delivered)
-- Real protection happens in the UI based on role.
CREATE POLICY "field_orders_update_anyone" ON field_orders
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Only managers/admins can delete
CREATE POLICY "field_orders_delete_admin" ON field_orders
  FOR DELETE TO authenticated USING (is_manager_or_admin());

-- 3. Add field_order_* notification types to existing CHECK
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'entry_created', 'entry_updated', 'comment_added',
    'field_order_requested', 'field_order_status', 'field_order_assigned'
  ));

-- 4. Add Jonathan to global subscribers (he gets ALL field orders + already gets all schedule notifications)
INSERT INTO global_notification_subscribers (user_id)
SELECT id FROM profiles WHERE LOWER(email) = 'jonathan@northernwolvesac.com'
ON CONFLICT (user_id) DO NOTHING;

-- 5. Trigger: notify subscribers on new field order
CREATE OR REPLACE FUNCTION fn_field_order_after_insert() RETURNS TRIGGER AS $$
DECLARE
  v_pm_profile_id  UUID;
  v_project_label  TEXT;
  v_requester_name TEXT;
BEGIN
  -- Project label
  SELECT COALESCE(pr.short_code, pr.project_name, 'Project') INTO v_project_label
    FROM projects pr WHERE pr.id = NEW.project_id;

  -- Requester name
  v_requester_name := COALESCE(NEW.requested_by_name,
                               (SELECT full_name FROM profiles WHERE id = NEW.requested_by),
                               (SELECT email     FROM profiles WHERE id = NEW.requested_by),
                               'Someone');

  -- Find PM of the project
  IF NEW.project_id IS NOT NULL THEN
    SELECT pf.id INTO v_pm_profile_id
      FROM projects pr
      JOIN profiles pf ON LOWER(pf.email) = LOWER(pr.pm_email)
     WHERE pr.id = NEW.project_id AND pr.pm_email IS NOT NULL
     LIMIT 1;
  END IF;

  -- Notify PM + all global subscribers (Andrei + Jonathan + Russ), excluding the requester
  INSERT INTO notifications (
    recipient_id, recipient_email, actor_id, actor_name, type, title, body, link_url
  )
  SELECT DISTINCT
    p.id,
    p.email,
    NEW.requested_by,
    v_requester_name,
    'field_order_requested',
    '📦 ' || v_requester_name || ' requested materials for ' || v_project_label ||
      CASE WHEN NEW.priority = 'urgent' THEN ' 🚨 URGENT' ELSE '' END,
    LEFT(NEW.items, 240) ||
      CASE WHEN NEW.needed_by_date IS NOT NULL
           THEN E'\nNeeded by: ' || NEW.needed_by_date::text
           ELSE '' END,
    'https://app.northernwolvesac.com/field-orders.html?order=' || NEW.id::text
  FROM profiles p
  WHERE p.id IN (
    SELECT user_id FROM global_notification_subscribers
    UNION
    SELECT v_pm_profile_id WHERE v_pm_profile_id IS NOT NULL
  )
  AND p.id IS NOT NULL
  AND (NEW.requested_by IS NULL OR p.id <> NEW.requested_by);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_field_order_after_insert ON field_orders;
CREATE TRIGGER trg_field_order_after_insert AFTER INSERT ON field_orders
  FOR EACH ROW EXECUTE FUNCTION fn_field_order_after_insert();

-- 6. Trigger: notify requester (and driver) on status / schedule change
CREATE OR REPLACE FUNCTION fn_field_order_after_update() RETURNS TRIGGER AS $$
DECLARE
  v_project_label TEXT;
  v_status_label  TEXT;
  v_actor_name    TEXT;
BEGIN
  -- Skip if nothing material changed
  IF NEW.status                  = OLD.status
 AND NEW.scheduled_delivery_date IS NOT DISTINCT FROM OLD.scheduled_delivery_date
 AND NEW.driver_name             IS NOT DISTINCT FROM OLD.driver_name
 AND NEW.driver_id               IS NOT DISTINCT FROM OLD.driver_id
  THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(pr.short_code, pr.project_name, 'Project') INTO v_project_label
    FROM projects pr WHERE pr.id = NEW.project_id;

  SELECT full_name INTO v_actor_name FROM profiles WHERE id = NEW.updated_by;

  v_status_label := CASE NEW.status
    WHEN 'in_progress' THEN '⏳ Order in progress'
    WHEN 'delivered'   THEN '✅ Materials delivered'
    WHEN 'cancelled'   THEN '❌ Order cancelled'
    WHEN 'requested'   THEN '📦 Order requested'
    ELSE NEW.status
  END;

  -- Notify requester on status change
  IF NEW.requested_by IS NOT NULL AND NEW.status <> OLD.status THEN
    INSERT INTO notifications (
      recipient_id, recipient_email, actor_id, actor_name, type, title, body, link_url
    )
    SELECT
      NEW.requested_by,
      p.email,
      NEW.updated_by,
      v_actor_name,
      'field_order_status',
      v_status_label || ' — ' || v_project_label,
      CASE
        WHEN NEW.status = 'in_progress' AND NEW.scheduled_delivery_date IS NOT NULL
          THEN 'Delivery scheduled for ' || NEW.scheduled_delivery_date::text ||
               COALESCE(' (' || to_char(NEW.scheduled_delivery_start, 'HH24:MI') || '–' ||
                                to_char(NEW.scheduled_delivery_end,   'HH24:MI') || ')', '') ||
               COALESCE(E'\nDriver: ' || NEW.driver_name, '')
        WHEN NEW.status = 'delivered'
          THEN COALESCE(NEW.delivery_notes, 'Materials delivered to project')
        WHEN NEW.status = 'cancelled'
          THEN COALESCE(NEW.delivery_notes, 'Order cancelled')
        ELSE ''
      END,
      'https://app.northernwolvesac.com/field-orders.html?order=' || NEW.id::text
    FROM profiles p
    WHERE p.id = NEW.requested_by
      AND (NEW.updated_by IS NULL OR NEW.updated_by <> NEW.requested_by);
  END IF;

  -- Notify driver if newly assigned (driver_id is a profile, otherwise just driver_name text)
  IF NEW.driver_id IS NOT NULL
     AND (OLD.driver_id IS NULL OR OLD.driver_id <> NEW.driver_id)
  THEN
    INSERT INTO notifications (
      recipient_id, recipient_email, actor_id, actor_name, type, title, body, link_url
    )
    SELECT
      NEW.driver_id,
      p.email,
      NEW.updated_by,
      v_actor_name,
      'field_order_assigned',
      '🚐 New delivery assigned: ' || v_project_label,
      COALESCE('Scheduled for ' || NEW.scheduled_delivery_date::text, 'Schedule TBD') || E'\n' || LEFT(NEW.items, 200),
      'https://app.northernwolvesac.com/driver-schedule.html'
    FROM profiles p WHERE p.id = NEW.driver_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_field_order_after_update ON field_orders;
CREATE TRIGGER trg_field_order_after_update AFTER UPDATE ON field_orders
  FOR EACH ROW EXECUTE FUNCTION fn_field_order_after_update();

-- 7. Realtime publication
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE field_orders;
  EXCEPTION WHEN duplicate_object OR invalid_parameter_value THEN NULL; END;
END $$;

-- =============================================================================
-- DONE
-- =============================================================================
SELECT 'Field orders schema installed. ' ||
       (SELECT COUNT(*) FROM global_notification_subscribers) ||
       ' global subscribers (now including Jonathan).' AS result;
