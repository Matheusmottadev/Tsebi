ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_number TEXT,
  ADD COLUMN IF NOT EXISTS current_status TEXT NOT NULL DEFAULT 'ORDER_PLACED',
  ADD COLUMN IF NOT EXISTS tracking_code TEXT,
  ADD COLUMN IF NOT EXISTS carrier TEXT,
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_tracking_update TIMESTAMPTZ;

UPDATE orders
SET order_number = CONCAT('PED-', UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 10)))
WHERE COALESCE(order_number, '') = '';

ALTER TABLE orders
  ALTER COLUMN order_number SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_order_number_unique'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_order_number_unique UNIQUE (order_number);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orders_track_lookup_idx
  ON orders (order_number, lower(user_email));

CREATE INDEX IF NOT EXISTS orders_tracking_status_idx
  ON orders (current_status, last_tracking_update DESC);

CREATE INDEX IF NOT EXISTS orders_tracking_code_idx
  ON orders (tracking_code);

CREATE TABLE IF NOT EXISTS tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  raw_status TEXT,
  description TEXT NOT NULL,
  location TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS tracking_events_dedupe_idx
  ON tracking_events (
    order_id,
    occurred_at,
    COALESCE(raw_status, ''),
    COALESCE(description, ''),
    COALESCE(location, '')
  );

CREATE INDEX IF NOT EXISTS tracking_events_order_time_idx
  ON tracking_events (order_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS melhorenvio_tokens (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (id = 1)
);
