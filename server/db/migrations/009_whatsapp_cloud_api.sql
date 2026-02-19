CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id BIGSERIAL PRIMARY KEY,
  phone_e164 TEXT NOT NULL UNIQUE,
  last_inbound_at TIMESTAMPTZ,
  last_inbound_text TEXT,
  last_inbound_name TEXT,
  window_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS whatsapp_contacts_window_idx
  ON whatsapp_contacts (window_expires_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_vip_contacts (
  id BIGSERIAL PRIMARY KEY,
  phone_e164 TEXT NOT NULL UNIQUE,
  name TEXT,
  source TEXT DEFAULT 'manual',
  opted_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_send_logs (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  template_name TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  cost_estimate_cents INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS whatsapp_send_logs_created_idx
  ON whatsapp_send_logs (created_at DESC);
