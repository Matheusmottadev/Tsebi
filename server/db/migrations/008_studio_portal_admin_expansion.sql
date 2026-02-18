CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nickname TEXT,
  avatar_url TEXT,
  theme TEXT NOT NULL DEFAULT 'system',
  accent TEXT NOT NULL DEFAULT 'emerald',
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (theme IN ('system', 'light', 'dark')),
  CHECK (length(role) >= 3)
);

CREATE UNIQUE INDEX IF NOT EXISTS admins_email_unique_idx
  ON admins ((lower(email)));

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS login_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_login_disabled_idx
  ON users (login_disabled, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_login_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  success BOOLEAN NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_login_events_created_idx
  ON admin_login_events (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_login_events_admin_idx
  ON admin_login_events (admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_login_events_success_idx
  ON admin_login_events (success, created_at DESC);

ALTER TABLE admin_audit_logs
  ADD COLUMN IF NOT EXISTS actor_admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS changed_fields TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS reversible BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_admin_idx
  ON admin_audit_logs (actor_admin_id, created_at DESC);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tracking_id TEXT,
  ADD COLUMN IF NOT EXISTS tracking_status TEXT,
  ADD COLUMN IF NOT EXISTS shipping_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

UPDATE orders
SET tracking_id = tracking_code
WHERE COALESCE(tracking_id, '') = ''
  AND COALESCE(tracking_code, '') <> '';

UPDATE orders
SET tracking_status = current_status
WHERE COALESCE(tracking_status, '') = ''
  AND COALESCE(current_status, '') <> '';

CREATE INDEX IF NOT EXISTS orders_tracking_id_idx
  ON orders (tracking_id);

CREATE INDEX IF NOT EXISTS orders_tracking_status_idx
  ON orders (tracking_status, updated_at DESC);
