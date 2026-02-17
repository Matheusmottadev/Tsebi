CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT NOT NULL,
  actor_user_id UUID,
  actor_email TEXT,
  request_ip TEXT,
  user_agent TEXT,
  change_before JSONB,
  change_after JSONB,
  reverse_payload JSONB,
  reverse_result JSONB,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  reversible_until TIMESTAMPTZ NOT NULL,
  reversed_at TIMESTAMPTZ,
  reversed_by_user_id UUID,
  reversed_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx
  ON admin_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_logs_entity_idx
  ON admin_audit_logs (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_idx
  ON admin_audit_logs (actor_email, created_at DESC);
