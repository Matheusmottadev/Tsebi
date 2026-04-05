-- Migration 024: Enhance notification system
-- Adds type, image, deep_link, scheduling, advanced targeting, and order notification support

-- Enhance notification_logs with new fields
ALTER TABLE notification_logs
  ADD COLUMN IF NOT EXISTS notification_type TEXT NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS deep_link TEXT,
  ADD COLUMN IF NOT EXISTS product_sku TEXT,
  ADD COLUMN IF NOT EXISTS collection_name TEXT,
  ADD COLUMN IF NOT EXISTS filter_days_inactive INTEGER,
  ADD COLUMN IF NOT EXISTS filter_city TEXT,
  ADD COLUMN IF NOT EXISTS filter_state TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS sent_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Scheduled notifications queue
CREATE TABLE IF NOT EXISTS scheduled_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT 'all',
  notification_type TEXT NOT NULL DEFAULT 'custom',
  image_url TEXT,
  deep_link TEXT,
  product_sku TEXT,
  collection_name TEXT,
  filter_days_inactive INTEGER,
  filter_city TEXT,
  filter_state TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | cancelled | failed
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  log_id UUID REFERENCES notification_logs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_status_scheduled
  ON scheduled_notifications (status, scheduled_at)
  WHERE status = 'pending';
