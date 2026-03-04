-- Normaliza estoque por variante para evitar inconsistencias entre stock_qty
-- e metadata.variantStock (ex.: apenas um tamanho com estoque > 0).
-- Regra aplicada: cada combinacao cor+tamanho recebe quantidade 5.

WITH normalized AS (
  SELECT
    p.id,
    COALESCE(
      (
        SELECT jsonb_object_agg(format('%s__%s', c.color, s.size), to_jsonb(5))
        FROM jsonb_array_elements_text(COALESCE(p.metadata->'colors', '[]'::jsonb)) AS c(color)
        CROSS JOIN jsonb_array_elements_text(COALESCE(p.metadata->'sizes', '[]'::jsonb)) AS s(size)
        WHERE btrim(c.color) <> '' AND btrim(s.size) <> ''
      ),
      (
        SELECT jsonb_object_agg(e.key, to_jsonb(5))
        FROM jsonb_each(COALESCE(p.metadata->'variantStock', '{}'::jsonb)) AS e(key, value)
      ),
      '{}'::jsonb
    ) AS variant_stock
  FROM products p
)
UPDATE products p
SET
  stock_qty = 5,
  metadata = jsonb_set(
    COALESCE(p.metadata, '{}'::jsonb),
    '{variantStock}',
    normalized.variant_stock,
    true
  )
FROM normalized
WHERE p.id = normalized.id;
