ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS variant_color TEXT,
  ADD COLUMN IF NOT EXISTS variant_size TEXT,
  ADD COLUMN IF NOT EXISTS variant_key TEXT;

CREATE INDEX IF NOT EXISTS order_items_variant_key_idx
  ON order_items (variant_key);
