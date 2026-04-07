CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  nickname TEXT,
  avatar_url TEXT,
  theme TEXT NOT NULL DEFAULT 'system',
  accent TEXT NOT NULL DEFAULT 'emerald',
  role VARCHAR(20) NOT NULL DEFAULT 'admin',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES admins(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (theme IN ('system', 'light', 'dark'))
);

ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS nickname TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS accent TEXT NOT NULL DEFAULT 'emerald',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES admins(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE admins
  ALTER COLUMN email TYPE VARCHAR(255),
  ALTER COLUMN email SET NOT NULL,
  ALTER COLUMN role TYPE VARCHAR(20),
  ALTER COLUMN role SET DEFAULT 'admin';

UPDATE admins
SET role = CASE
  WHEN lower(COALESCE(role, '')) = 'superadmin' THEN 'superadmin'
  WHEN lower(COALESCE(role, '')) = 'director' THEN 'director'
  WHEN lower(COALESCE(role, '')) = 'admin' THEN 'admin'
  WHEN lower(COALESCE(role, '')) = 'owner' THEN 'superadmin'
  ELSE 'admin'
END;

ALTER TABLE admins
  DROP CONSTRAINT IF EXISTS admins_role_check;

ALTER TABLE admins
  ADD CONSTRAINT admins_role_check
  CHECK (role IN ('admin', 'director', 'superadmin'));

CREATE UNIQUE INDEX IF NOT EXISTS admins_email_unique_idx
  ON admins ((lower(email)));

CREATE UNIQUE INDEX IF NOT EXISTS admins_user_id_unique_idx
  ON admins (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS admins_role_active_idx
  ON admins (role, is_active, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  module VARCHAR(50) NOT NULL,
  granted_by UUID NOT NULL REFERENCES admins(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (module IN ('balance', 'orders', 'users', 'products')),
  UNIQUE(admin_id, module)
);

CREATE INDEX IF NOT EXISTS admin_permissions_admin_idx
  ON admin_permissions (admin_id, granted_at DESC);

CREATE TABLE IF NOT EXISTS balance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID NOT NULL REFERENCES admins(id),
  customer_id UUID NOT NULL REFERENCES users(id),
  type VARCHAR(10) NOT NULL CHECK (type IN ('credit', 'debit')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  reason VARCHAR(50) NOT NULL CHECK (reason IN (
    'product_return', 'billing_error', 'courtesy', 'manual_adjustment', 'other'
  )),
  reason_detail TEXT,
  related_order_id UUID REFERENCES orders(id),
  internal_note TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES admins(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS balance_requests_status_idx
  ON balance_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS balance_requests_requester_idx
  ON balance_requests (requested_by, created_at DESC);

CREATE INDEX IF NOT EXISTS balance_requests_customer_idx
  ON balance_requests (customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(60) NOT NULL,
  performed_by UUID NOT NULL REFERENCES admins(id),
  target_type VARCHAR(30),
  target_id UUID,
  before_state JSONB,
  after_state JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_idx
  ON audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_action_idx
  ON audit_logs (action, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_performed_by_idx
  ON audit_logs (performed_by, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_target_idx
  ON audit_logs (target_type, target_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  reference_id UUID,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_notifications_admin_idx
  ON admin_notifications (admin_id, read, created_at DESC);
