WITH variant_matrix AS (
  SELECT
    p.id,
    COALESCE(
      (
        SELECT jsonb_object_agg(format('%s__%s', c.color, s.size), to_jsonb(5))
        FROM jsonb_array_elements_text(COALESCE(p.metadata->'colors', '[]'::jsonb)) AS c(color)
        CROSS JOIN jsonb_array_elements_text(COALESCE(p.metadata->'sizes', '[]'::jsonb)) AS s(size)
      ),
      '{}'::jsonb
    ) AS variant_stock,
    COALESCE(
      (
        SELECT COUNT(*)::int
        FROM jsonb_array_elements_text(COALESCE(p.metadata->'colors', '[]'::jsonb)) AS c(color)
        CROSS JOIN jsonb_array_elements_text(COALESCE(p.metadata->'sizes', '[]'::jsonb)) AS s(size)
      ),
      0
    ) AS variant_count
  FROM products p
)
UPDATE products AS p
SET
  stock_qty = CASE
    WHEN vm.variant_count > 0 THEN vm.variant_count * 5
    ELSE 5
  END,
  metadata = jsonb_set(
    COALESCE(p.metadata, '{}'::jsonb),
    '{variantStock}',
    vm.variant_stock,
    true
  ),
  updated_at = NOW()
FROM variant_matrix AS vm
WHERE p.id = vm.id;
