UPDATE products
SET
  stock_qty = 5,
  metadata = CASE
    WHEN COALESCE(jsonb_typeof(metadata->'variantStock'), '') = 'object' THEN jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{variantStock}',
      (
        SELECT COALESCE(jsonb_object_agg(variant.key, to_jsonb(5)), '{}'::jsonb)
        FROM jsonb_each(COALESCE(metadata->'variantStock', '{}'::jsonb)) AS variant(key, value)
      ),
      true
    )
    ELSE metadata
  END,
  updated_at = NOW();
