-- Migration 022: Push Notification Subscriptions
-- Stores Web Push Protocol subscriptions per user/device

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL UNIQUE,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sent_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user_id ON push_subscriptions(user_id);
