ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_selected_provider TEXT,
  ADD COLUMN IF NOT EXISTS shipping_selected_service TEXT,
  ADD COLUMN IF NOT EXISTS shipping_selected_service_code TEXT,
  ADD COLUMN IF NOT EXISTS shipping_selected_carrier_name TEXT,
  ADD COLUMN IF NOT EXISTS shipping_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (shipping_price_cents >= 0),
  ADD COLUMN IF NOT EXISTS shipping_deadline_days INTEGER,
  ADD COLUMN IF NOT EXISTS shipping_destination_zip VARCHAR(8);

UPDATE orders
SET shipping_price_cents = COALESCE(shipping_cents, 0)
WHERE shipping_price_cents = 0 AND COALESCE(shipping_cents, 0) > 0;

CREATE TABLE IF NOT EXISTS shipping_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  service_code TEXT NOT NULL,
  service_name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  deadline_days INTEGER,
  carrier_name TEXT,
  destination_zip VARCHAR(8) NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shipping_quotes_order_idx
  ON shipping_quotes (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS shipping_quotes_user_zip_idx
  ON shipping_quotes (user_id, destination_zip, created_at DESC);

CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  service_code TEXT,
  label_external_id TEXT,
  tracking_code TEXT,
  status TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  deadline_days INTEGER,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shipments_tracking_idx
  ON shipments (tracking_code);

CREATE INDEX IF NOT EXISTS shipments_status_idx
  ON shipments (status, updated_at DESC);
